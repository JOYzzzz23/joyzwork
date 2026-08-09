-- ============================================================
-- JOYZWORK 推送通知 — Supabase 数据库配置
-- 在 Supabase Dashboard > SQL Editor 中执行此文件
-- ============================================================

-- 1. 创建推送订阅表
create table if not exists push_subscriptions (
  id text primary key,           -- 设备ID（与 joyzwork_data 中的 id 对应）
  device_name text,
  subscription jsonb not null,   -- PushSubscription 对象
  updated_at timestamptz default now()
);

-- 启用行级安全策略
alter table push_subscriptions enable row level security;

-- 允许所有操作（个人使用，简化配置）
drop policy if exists "allow_all_push" on push_subscriptions;
create policy "allow_all_push" on push_subscriptions
  for all using (true) with check (true);

-- 2. 启用 pg_net 扩展（用于定时调用 Edge Function）
create extension if not exists pg_net;

-- 3. 启用 pg_cron 扩展（用于定时任务）
create extension if not exists pg_cron;

-- 4. 设置定时任务：每分钟调用 Edge Function 检查提醒
--    请将下面的 URL 和 KEY 替换为你的实际值
--    URL 格式: https://你的项目ref.supabase.co/functions/v1/check-reminders
--    KEY: 你的 Supabase Anon Key
select cron.schedule(
  'joyzwork-check-reminders',
  '* * * * *',  -- 每分钟执行
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-reminders',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 5. 验证：查看已创建的定时任务
select jobname, schedule, active from cron.job;

-- ============================================================
-- 使用说明：
-- 1. 将上面 SQL 中的 YOUR_PROJECT_REF 替换为你的 Supabase 项目 URL 中的 ref
--    （例如 https://abcdefgh.supabase.co 中的 abcdefgh）
-- 2. 将 YOUR_ANON_KEY 替换为你的 Supabase Anon Key
-- 3. 执行此 SQL
-- 4. 然后部署 Edge Function（见 check-reminders/index.ts）
-- ============================================================
