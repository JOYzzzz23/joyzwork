// ============================================================
// JOYZWORK 推送通知 — Edge Function: check-reminders
// 部署方式：Supabase Dashboard > Edge Functions > New Function
// 将此文件内容粘贴进去，函数名设为 check-reminders
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

// VAPID 密钥（与前端 app.js 中的 VAPID_PUBLIC_KEY 配对）
const VAPID_PUBLIC_KEY = "BHrpA66ckvRrahDM--9Vd7UqKtCqguIg3YbufFIKThXycebFLK1x78p60-RxXe8Df9O_Ih7CxA9S6n7BIpWbXO4";
const VAPID_PRIVATE_KEY = "cebFLK1x78p60-RxXe8Df9O_Ih7CxA9S6n7BIpWbXO4";

webpush.setVapidDetails(
  "mailto:joyzwork@user.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// 时区偏移：UTC+8（中国时间）
const TZ_OFFSET_HOURS = 8;

Deno.serve(async (_req) => {
  try {
    const result = { checked: 0, sent: 0, errors: 0 };

    // 获取当前 UTC+8 时间
    const nowUtc = new Date();
    const now = new Date(nowUtc.getTime() + TZ_OFFSET_HOURS * 60 * 60 * 1000);
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // 1. 读取所有设备的数据
    const { data: dataRecords, error: dataError } = await supabase
      .from("joyzwork_data")
      .select("id, data");

    if (dataError) {
      console.error("Failed to read data:", dataError);
      return new Response(JSON.stringify({ error: dataError.message }), { status: 500 });
    }

    if (!dataRecords || dataRecords.length === 0) {
      return new Response(JSON.stringify({ ...result, message: "No data records" }), { status: 200 });
    }

    // 2. 读取所有推送订阅
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("id, subscription");

    if (subError) {
      console.error("Failed to read subscriptions:", subError);
      return new Response(JSON.stringify({ error: subError.message }), { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ ...result, message: "No subscriptions" }), { status: 200 });
    }

    // 3. 检查每个设备的任务提醒
    for (const record of dataRecords) {
      const deviceId = record.id;
      const appData = record.data;

      if (!appData || !appData.tasks) continue;
      result.checked++;

      // 找到该设备的推送订阅
      const subRecord = subscriptions.find(s => s.id === deviceId);
      if (!subRecord || !subRecord.subscription) continue;

      const pushSubscription = subRecord.subscription;

      // 检查今日到期任务
      const todayTasks = appData.tasks.filter(t =>
        t.deadline &&
        t.deadline.startsWith(todayStr) &&
        t.status !== 'done'
      );

      for (const task of todayTasks) {
        // 构建完整的 deadline 时间（UTC+8 格式）
        const deadlineStr = task.deadline.includes('T') ? task.deadline : todayStr + 'T' + task.deadline;
        const deadline = new Date(deadlineStr);
        // 转为 UTC 比较需要减去时区偏移
        const deadlineUtc = new Date(deadline.getTime() - TZ_OFFSET_HOURS * 60 * 60 * 1000);
        const diff = deadlineUtc.getTime() - nowUtc.getTime();

        const reminders = Array.isArray(task.reminderMinutes) ? task.reminderMinutes : [];
        for (const reminderMin of reminders) {
          if (reminderMin && reminderMin > 0 && diff > 0) {
            const reminderMs = reminderMin * 60 * 1000;
            // 2分钟窗口（比客户端的1分钟稍宽，避免漏发）
            if (diff <= reminderMs && diff > reminderMs - 120 * 1000) {
              const typeLabel = task.type === 'internal_meeting' || task.type === 'external_meeting' ? '会议' : '任务';
              const body = `${typeLabel}将在约${reminderMin}分钟后开始\n${task.title}`;
              await sendPush(pushSubscription, {
                title: `JOYZWORK - ${typeLabel}提醒`,
                body: body,
                tag: `reminder-${task.id}-${reminderMin}`,
                requireInteraction: true,
              });
              result.sent++;
            }
          }
        }

        // 刚逾期（2分钟窗口）
        if (diff < 0 && diff > -120 * 1000) {
          const body = `任务已逾期，请尽快处理\n${task.title}`;
          await sendPush(pushSubscription, {
            title: 'JOYZWORK - 任务逾期',
            body: body,
            tag: `overdue-${task.id}`,
            requireInteraction: true,
          });
          result.sent++;
        }
      }

      // 检查周期任务
      if (appData.recurringTasks) {
        for (const rTask of appData.recurringTasks) {
          if (!rTask.enabled) continue;
          if (isRecurringDueToday(rTask, now)) {
            // 检查是否已完成
            const completions = rTask.completions || {};
            if (completions[todayStr]) continue;

            // 检查偏好时间是否到了（2分钟窗口）
            if (rTask.preferredTime) {
              const [h, m] = rTask.preferredTime.split(':').map(Number);
              const preferredTime = new Date(now);
              preferredTime.setHours(h, m, 0, 0);
              const preferredUtc = new Date(preferredTime.getTime() - TZ_OFFSET_HOURS * 60 * 60 * 1000);
              const timeDiff = nowUtc.getTime() - preferredUtc.getTime();

              // 在偏好时间前2分钟到后10分钟之间提醒
              if (timeDiff > -120 * 1000 && timeDiff < 10 * 60 * 1000) {
                const cycleDesc = getCycleDesc(rTask);
                const body = `周期任务提醒\n${rTask.title}（${cycleDesc}）`;
                await sendPush(pushSubscription, {
                  title: 'JOYZWORK - 周期任务',
                  body: body,
                  tag: `recurring-${rTask.id}-${todayStr}`,
                  requireInteraction: false,
                });
                result.sent++;
              }
            }
          }
        }
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

// 发送推送通知
async function sendPush(subscription, payload) {
  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify(payload)
    );
  } catch (err) {
    console.error("Push send failed:", err.message);
  }
}

// 判断周期任务是否在今天到期
function isRecurringDueToday(task, now) {
  const startDate = task.startDate ? new Date(task.startDate) : new Date();
  const today = now;
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

  if (todayDate < start) return false;

  const diffDays = Math.floor((todayDate - start) / (24 * 60 * 60 * 1000));

  switch (task.cycleType) {
    case 'daily':
      return true;
    case 'every-n-days':
      const n = task.cycleDays || 1;
      return diffDays % n === 0;
    case 'weekly':
      const weekday = today.getDay();
      return (task.cycleWeekdays || []).includes(weekday);
    case 'monthly':
      return today.getDate() === (task.cycleMonthDay || 1);
    default:
      return false;
  }
}

// 获取周期描述
function getCycleDesc(task) {
  switch (task.cycleType) {
    case 'daily': return '每日';
    case 'every-n-days': return `每${task.cycleDays || 1}天`;
    case 'weekly':
      const days = ['日', '一', '二', '三', '四', '五', '六'];
      return '每周' + (task.cycleWeekdays || []).map(d => days[d]).join('、');
    case 'monthly': return `每月${task.cycleMonthDay || 1}号`;
    default: return '';
  }
}
