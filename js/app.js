/* ============================================================
   JOYZWORK - 主应用逻辑 & 全部模块渲染
   ============================================================ */

/* ---------- DOM 辅助 ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => node.dataset[dk] = dv);
    else node.setAttribute(k, v);
  });
  children.flat().forEach(c => {
    if (c == null) return;
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  });
  return node;
};
const svg = (path, size = 16) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.innerHTML = path;
  return s;
};

/* ---------- 当前状态 ---------- */
const state = {
  leftTab: 'schedule',
  rightTab: 'intel',
  bottomTab: 'worklib',
  currentDate: new Date(),
  selectedMaterialCat: 'all',
  aiPrompt: '',
  scheduleView: 'timeline',  // 'timeline' | 'month'
  calendarDate: new Date(),  // 月历当前显示的月份
  syncingAccount: null,      // 正在同步的公众号ID
};

/* ---------- Tab 管理 ---------- */
function switchTab(panel, tab) {
  state[panel + 'Tab'] = tab;
  const panelEl = panel === 'left' ? '.left-panel' : panel === 'right' ? '.right-panel' : '.bottom-panel';
  $$(panelEl + ' .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  renderPanel(panel);
}

function switchTabLeft(tab) { switchTab('left', tab); }
function switchTabRight(tab) { switchTab('right', tab); }
function switchTabBottom(tab) { switchTab('bottom', tab); }

/* ---------- 全局渲染 ---------- */
function renderAll() {
  renderTopBar();
  renderPanel('left');
  renderPanel('right');
  renderPanel('bottom');
}

function renderPanel(panel) {
  const tab = state[panel + 'Tab'];
  const container = panel === 'left' ? '#leftContent' : panel === 'right' ? '#rightContent' : '#bottomContent';
  const target = $(container);
  if (!target) return;
  target.innerHTML = '';

  const renderers = {
    left: { schedule: renderSchedule, tasks: renderTasks, study: renderStudy },
    right: { intel: renderIntel, ai: renderAI, studyLib: renderStudyLib },
    bottom: { worklib: renderWorklib, review: renderReview, notes: renderNotes },
  };

  const fn = renderers[panel]?.[tab];
  if (fn) fn(target);
}

/* ============================================================
   顶部全局总览
   ============================================================ */
function renderTopBar() {
  const stats = Store.getTodayStats();
  const row = $('#statsRow');
  row.innerHTML = '';

  const cards = [
    { num: stats.pendingTasks, label: '待办任务', cls: stats.pendingTasks > 0 ? 'warning' : '' },
    { num: stats.pendingStudy, label: '未完成打卡', cls: stats.pendingStudy > 0 ? 'warning' : '' },
    { num: stats.todayMeetings, label: '今日会议', cls: '' },
    { num: stats.overdue, label: '逾期事项', cls: stats.overdue > 0 ? 'danger' : 'success' },
  ];

  cards.forEach(c => {
    row.appendChild(el('div', { class: `stat-card ${c.cls}` },
      el('span', { class: 'stat-num', text: String(c.num) }),
      el('span', { class: 'stat-label', text: c.label })
    ));
  });

  // 通知角标
  const unread = Store.getUnreadNotifCount();
  const badge = $('#notifBadge');
  if (unread > 0) {
    badge.style.display = 'flex';
    badge.textContent = String(unread);
  } else {
    badge.style.display = 'none';
  }
}

/* ---------- 通知面板 ---------- */
function renderNotifPanel() {
  const panel = $('#notifPanel');
  panel.innerHTML = '';

  // 顶部：系统通知状态横幅
  const notifPermission = ('Notification' in window) ? Notification.permission : 'unsupported';
  const notifSupported = ('serviceWorker' in navigator) && ('PushManager' in window);

  const banner = el('div', { style: { padding: '10px 12px', borderBottom: '1px solid var(--c-border)' } });

  if (!notifSupported) {
    banner.style.background = '#fef2f2';
    banner.appendChild(el('div', { style: { fontSize: '11px', color: '#991b1b', fontWeight: '600' }, text: '⚠️ 当前浏览器不支持系统推送' }));
  } else if (notifPermission === 'granted') {
    banner.style.background = '#ecfdf5';
    banner.appendChild(el('div', {
      style: { fontSize: '11px', color: '#065f46', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' },
      onclick: () => { $('#notifPanel').classList.remove('show'); openPushSettingsModal(); }
    }, '✅ 系统通知已开启 — 点击管理推送设置'));
  } else if (notifPermission === 'denied') {
    banner.style.background = '#fef2f2';
    banner.appendChild(el('div', { style: { fontSize: '11px', color: '#991b1b', fontWeight: '600' }, text: '❌ 通知被拒绝 — 请在浏览器设置中开启' }));
  } else {
    // 未开启 — 显示醒目的开启按钮
    banner.style.background = '#fffbeb';
    const openBtn = el('button', {
      style: { width: '100%', padding: '8px', fontSize: '12px', fontWeight: '700', border: '1px solid #f59e0b', borderRadius: '6px', background: '#f59e0b', color: '#fff', cursor: 'pointer' },
      onclick: (e) => { e.stopPropagation(); requestNotificationPermission(); }
    }, '🔔 开启系统通知（弹窗到桌面/手机通知栏）');
    banner.appendChild(openBtn);
    banner.appendChild(el('div', { style: { fontSize: '10px', color: '#92400e', marginTop: '4px' }, text: '点击后浏览器会询问是否允许通知' }));
  }
  panel.appendChild(banner);

  // 通知列表
  if (Store.data.notifications.length === 0) {
    panel.appendChild(el('div', { class: 'empty-state', style: { padding: '20px' } },
      el('div', { class: 'empty-text', text: '暂无通知' })
    ));
  } else {
    Store.data.notifications.slice(0, 10).forEach(n => {
      const colors = { meeting: '#3b82f6', deadline: '#ef4444', study: '#f59e0b', hotspot: '#10b981' };
      panel.appendChild(el('div', { class: `notif-item ${n.read ? 'read' : 'unread'}`, onclick: () => Store.markNotifRead(n.id) },
        el('div', { class: 'notif-dot', style: { background: n.read ? 'var(--c-text-muted)' : colors[n.type] || 'var(--c-primary)' } }),
        el('div', { class: 'notif-content' },
          el('div', { class: 'notif-title', text: n.title }),
          el('div', { class: 'notif-desc', text: n.desc }),
          el('div', { class: 'notif-time', text: timeAgo(n.time) })
        )
      ));
    });

    if (Store.data.notifications.some(n => !n.read)) {
      const clearBtn = el('div', {
        style: { padding: '10px', textAlign: 'center', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: 'var(--c-primary)', borderTop: '1px solid var(--c-border)' },
        onclick: () => Store.markAllNotifsRead()
      }, '全部标记已读');
      panel.appendChild(clearBtn);
    }
  }

  // 底部：推送设置入口（始终显示）
  const pushIcon = notifPermission === 'granted' ? '⚙️' : '⏳';
  panel.appendChild(el('div', {
    style: { padding: '10px', textAlign: 'center', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: 'var(--c-text-secondary)', borderTop: '1px solid var(--c-border)' },
    onclick: () => { $('#notifPanel').classList.remove('show'); openPushSettingsModal(); }
  }, pushIcon + ' 通知 & 推送设置'));
}

/* ---------- 搜索 ---------- */
function renderSearchResults(query) {
  const box = $('#searchResults');
  if (!query || query.trim().length < 1) {
    box.classList.remove('show');
    return;
  }
  const results = Store.search(query);
  box.innerHTML = '';

  if (results.length === 0) {
    box.appendChild(el('div', { class: 'search-result-item', text: '未找到相关结果' }));
  } else {
    results.slice(0, 10).forEach(r => {
      box.appendChild(el('div', {
        class: 'search-result-item',
        onclick: () => {
          // 切换到对应面板和标签
          if (r.panel && r.tab) switchTab(r.panel, r.tab);
          // 滚动到对应面板区域
          setTimeout(() => {
            const panelSel = r.panel === 'left' ? '.left-panel' : r.panel === 'right' ? '.right-panel' : '.bottom-panel';
            const panelEl = $(panelSel);
            if (panelEl) panelEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
          box.classList.remove('show');
          $('#globalSearch').value = '';
        }
      },
        el('div', { class: 'search-result-type', text: r.type }),
        el('div', { class: 'search-result-title', text: r.title }),
        el('div', { class: 'search-result-meta', text: r.meta })
      ));
    });
  }
  box.classList.add('show');
}

/* ============================================================
   左侧：智能日程
   ============================================================ */
function renderSchedule(container) {
  // 视图切换栏
  const viewToggle = el('div', { class: 'schedule-view-toggle' },
    el('button', {
      class: `view-btn ${state.scheduleView === 'timeline' ? 'active' : ''}`,
      onclick: () => { state.scheduleView = 'timeline'; renderPanel('left'); }
    }, '时间轴'),
    el('button', {
      class: `view-btn ${state.scheduleView === 'month' ? 'active' : ''}`,
      onclick: () => { state.scheduleView = 'month'; renderPanel('left'); }
    }, '月历视图')
  );
  container.appendChild(viewToggle);

  if (state.scheduleView === 'month') {
    renderMonthCalendar(container);
    return;
  }

  const date = state.currentDate;
  const dateStr = formatDate(date);

  // 日期栏
  const dateBar = el('div', { class: 'schedule-date-bar' },
    el('div', { class: 'schedule-date' },
      formatDateLabel(dateStr),
      el('span', { class: 'weekday', text: '' })
    ),
    el('div', { style: { display: 'flex', gap: '4px' } },
      el('button', { class: 'btn-icon', title: '前一天', onclick: () => { state.currentDate = addDays(date, -1); renderPanel('left'); } },
        svg('<path d="m15 18-6-6 6-6"/>')),
      el('button', { class: 'btn-icon', title: '今天', onclick: () => { state.currentDate = new Date(); renderPanel('left'); } },
        svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>')),
      el('button', { class: 'btn-icon', title: '后一天', onclick: () => { state.currentDate = addDays(date, 1); renderPanel('left'); } },
        svg('<path d="m9 18 6-6-6-6"/>'))
    )
  );
  container.appendChild(dateBar);

  const { slots, overload, remainingTasks } = Scheduler.generateDayPlan(date);

  // 过载预警
  if (overload) {
    container.appendChild(el('div', { class: 'overload-warning' },
      svg('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>', 16),
      el('span', { text: `任务过载，${remainingTasks.length} 项任务建议顺延至次日` })
    ));
  }

  if (slots.length === 0) {
    container.appendChild(el('div', { class: 'empty-state' },
      svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', 48),
      el('div', { class: 'empty-text', text: '今日暂无日程安排' }),
      el('div', { class: 'empty-hint', text: '点击右上角 + 录入事项' })
    ));
    return;
  }

  // 时间轴
  const timeline = el('div', { class: 'timeline' });
  slots.forEach(slot => {
    const startH = Math.floor(slot.startTime / 60);
    const startM = slot.startTime % 60;
    const endH = Math.floor(slot.endTime / 60);
    const endM = slot.endTime % 60;
    const timeStr = `${String(startH).padStart(2,'0')}:${String(startM).padStart(2,'0')}`;

    const slotEl = el('div', { class: `timeline-slot ${slot.slotType} ${slot.status === 'done' ? '' : ''}` });
    slotEl.appendChild(el('div', { class: 'slot-time', text: timeStr }));

    const header = el('div', { class: 'slot-header' });
    header.appendChild(el('div', { class: 'slot-title', text: slot.title }));

    const tagText = slot.courseId ? '课程' : slot.slotType === 'hard' ? (slot.type === 'external_meeting' ? '外部会议' : '内部会议') : slot.slotType === 'study' ? '学习打卡' : slot.slotType === 'recurring' ? '周期' : '弹性';
    header.appendChild(el('span', { class: `slot-tag ${slot.courseId ? 'course' : slot.slotType}`, text: tagText }));

    // 课程讲次显示进度
    if (slot.courseId) {
      const course = Store.data.courses.find(c => c.id === slot.courseId);
      if (course) {
        header.appendChild(el('span', { class: 'recurring-cycle-desc', text: `${course.completedLessons}/${course.totalLessons}讲` }));
      }
    }

    // 周期任务显示周期描述
    if (slot.slotType === 'recurring' && slot.recurringId) {
      const rt = Store.data.recurringTasks.find(t => t.id === slot.recurringId);
      if (rt) {
        header.appendChild(el('span', { class: 'recurring-cycle-desc', text: Store.getCycleDescription(rt) }));
      }
    }

    // 学习打卡项显示跳转链接
    if (slot.slotType === 'study' && slot.studyLink) {
      header.appendChild(el('a', {
        class: 'btn-study-link',
        href: slot.studyLink,
        target: '_blank',
        rel: 'noopener',
        style: { fontSize: '11px', padding: '2px 8px' }
      }, svg('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', 10), '前往'));
    }

    // 学习打卡项可标记完成
    if (slot.slotType === 'study' && slot.studyItemId) {
      const isDone = Store.getTodayCheckins().items[slot.studyItemId]?.status === 'done';
      header.appendChild(el('button', {
        class: `btn-study-done ${isDone ? 'completed' : ''}`,
        style: { fontSize: '11px', padding: '2px 8px' },
        onclick: (e) => { e.stopPropagation(); Store.toggleStudyDone(slot.studyItemId); }
      }, isDone ? '✓ 已完成' : '打卡'));
    }

    // 状态
    const statusMap = { done: '已完成', progress: '进行中', pending: '未开始', overdue: '逾期' };
    header.appendChild(el('span', { class: `slot-status status-${slot.status}`, text: statusMap[slot.status] || '未开始' }));

    // 操作按钮（学习打卡项不显示任务操作）
    const actions = el('div', { class: 'slot-actions' });
    if (slot.slotType === 'recurring' && slot.recurringId) {
      // 周期任务：打卡 / 编辑 / 删除
      const todayStr = formatDate(state.currentDate);
      const isDone = slot.status === 'done';
      if (!isDone) {
        actions.appendChild(el('button', { title: '标记今日完成', onclick: (e) => { e.stopPropagation(); Store.toggleRecurringCompletion(slot.recurringId, todayStr); showToast('周期任务今日已打卡', 'success'); } },
          svg('<path d="M20 6 9 17l-5-5"/>', 14)));
      } else {
        actions.appendChild(el('button', { title: '撤销今日完成', onclick: (e) => { e.stopPropagation(); Store.toggleRecurringCompletion(slot.recurringId, todayStr); } },
          svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>', 14)));
      }
      actions.appendChild(el('button', { title: '编辑周期任务', onclick: (e) => { e.stopPropagation(); openEditRecurringModal(slot.recurringId); } },
        svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', 14)));
    } else if (slot.slotType !== 'study') {
      if (slot.status !== 'done') {
        actions.appendChild(el('button', { title: '标记完成', onclick: (e) => {
          e.stopPropagation();
          if (slot.courseId) {
            const result = Store.completeCourseLesson(slot.courseId);
            if (result?.courseCompleted) {
              showToast('🎉 课程全部完成！', 'success');
            } else if (result?.nextTask) {
              showToast(`已完成第${slot.lessonNumber}讲，已自动排第${slot.lessonNumber + 1}讲`, 'success');
            }
          } else {
            Store.updateTask(slot.id, { status: 'done' });
          }
        }},
          svg('<path d="M20 6 9 17l-5-5"/>', 14)));
      } else {
        actions.appendChild(el('button', { title: '撤销完成', onclick: (e) => { e.stopPropagation(); Store.updateTask(slot.id, { status: 'pending' }); } },
          svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>', 14)));
      }
      actions.appendChild(el('button', { title: '编辑', onclick: (e) => { e.stopPropagation(); openEditTaskModal(slot.id); } },
        svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', 14)));
      actions.appendChild(el('button', { title: '删除', onclick: (e) => { e.stopPropagation(); Store.deleteTask(slot.id); showToast('已删除', 'info'); } },
        svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 14)));
    }
    header.appendChild(actions);

    slotEl.appendChild(header);

    // 元信息
    const meta = el('div', { class: 'slot-meta' });
    meta.appendChild(el('span', { class: `task-priority-badge ${slot.priority || 'medium'}` },
      el('span', { class: `priority-dot priority-${slot.priority || 'medium'}` }),
      slot.priority === 'high' ? '高优先级' : slot.priority === 'medium' ? '中优先级' : '低优先级'
    ));
    const isMeeting = slot.type === 'internal_meeting' || slot.type === 'external_meeting';
    // 长期任务显示开始时间
    if (slot.startDate && slot.deadline && slot.startDate.slice(0, 10) !== slot.deadline.slice(0, 10)) {
      meta.appendChild(el('span', { style: { color: '#92400e', fontSize: '11px' }, text: `📋 ${formatDateLabel(slot.startDate)} →` }));
    }
    if (isMeeting) {
      // 会议类型显示：开始时间 + 时长
      meta.appendChild(el('span', { text: `📅 ${timeStr} 开始 · ${slot.estTime || 60}分钟` }));
    } else {
      meta.appendChild(el('span', { text: `预估 ${slot.estTime || 60} 分钟` }));
      meta.appendChild(el('span', { text: `至 ${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}` }));
    }
    slotEl.appendChild(meta);

    timeline.appendChild(slotEl);
  });

  // 空闲时间提示
  if (slots.length > 0) {
    const lastEnd = slots[slots.length - 1].endTime;
    const workEnd = 18 * 60;
    if (lastEnd < workEnd) {
      timeline.appendChild(el('div', { class: 'timeline-slot empty' },
        el('div', { class: 'slot-time', text: `${String(Math.floor(lastEnd/60)).padStart(2,'0')}:${String(lastEnd%60).padStart(2,'0')}` }),
        el('div', { class: 'slot-header' },
          el('div', { class: 'slot-title', text: '空闲时段 — 可安排弹性任务或学习' })
        )
      ));
    }
  }

  container.appendChild(timeline);
}

/* ---------- 月历视图 ---------- */
function renderMonthCalendar(container) {
  const calDate = state.calendarDate;
  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  const today = new Date();
  const todayStr = formatDate(today);

  // 月份导航
  const monthBar = el('div', { class: 'schedule-date-bar' },
    el('div', { class: 'schedule-date', text: `${year}年${month + 1}月` }),
    el('div', { style: { display: 'flex', gap: '4px' } },
      el('button', { class: 'btn-icon', title: '上月', onclick: () => { state.calendarDate = new Date(year, month - 1, 1); renderPanel('left'); } },
        svg('<path d="m15 18-6-6 6-6"/>')),
      el('button', { class: 'btn-icon', title: '今天', onclick: () => { state.calendarDate = new Date(); renderPanel('left'); } },
        svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>')),
      el('button', { class: 'btn-icon', title: '下月', onclick: () => { state.calendarDate = new Date(year, month + 1, 1); renderPanel('left'); } },
        svg('<path d="m9 18 6-6-6-6"/>'))
    )
  );
  container.appendChild(monthBar);

  // 获取当月所有任务
  const allTasks = Store.data.tasks;
  const monthTasks = {};
  const monthPrefix = formatDate(calDate).slice(0, 7); // YYYY-MM
  const longTermTasks = []; // 长期任务单独收集
  allTasks.forEach(t => {
    if (!t.deadline) return;
    const taskDeadlineDate = t.deadline.slice(0, 10);
    const taskStartDate = t.startDate ? t.startDate.slice(0, 10) : null;

    // 长期任务：开始日期与截止日期不同天 → 收集到独立区域，不挤占日格
    if (taskStartDate && taskStartDate !== taskDeadlineDate) {
      // 仅当任务日期范围与本月有交集时收集
      const startD = new Date(taskStartDate);
      const endD = new Date(taskDeadlineDate);
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      if (endD >= monthStart && startD <= monthEnd) {
        longTermTasks.push(t);
      }
    } else {
      // 普通任务，只在截止日期显示
      if (taskDeadlineDate.startsWith(monthPrefix)) {
        if (!monthTasks[taskDeadlineDate]) monthTasks[taskDeadlineDate] = [];
        monthTasks[taskDeadlineDate].push(t);
      }
    }
  });

  // 添加周期任务到月历（遍历当月每天，检查哪些周期任务到期）
  const daysInMonthVal = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonthVal; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const recurringDue = Store.getRecurringTasksForDate(dateStr);
    recurringDue.forEach(rt => {
      if (!monthTasks[dateStr]) monthTasks[dateStr] = [];
      if (!monthTasks[dateStr].some(x => x.id === rt.id)) {
        monthTasks[dateStr].push({ ...rt, _isRecurring: true });
      }
    });
  }

  // 日历主体
  const calWrap = el('div', { class: 'month-calendar' });

  // 星期表头
  const weekHeaders = ['一', '二', '三', '四', '五', '六', '日'];
  weekHeaders.forEach(w => {
    calWrap.appendChild(el('div', { class: 'cal-week-header', text: w }));
  });

  // 计算月初是星期几（周一=0）
  const firstDay = new Date(year, month, 1);
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6; // 周日

  // 当月天数
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // 前置空白
  for (let i = 0; i < startOffset; i++) {
    calWrap.appendChild(el('div', { class: 'cal-day empty' }));
  }

  // 日期格
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const dateStr = formatDate(dateObj);
    const isToday = dateStr === todayStr;
    const tasks = monthTasks[dateStr] || [];
    const hasOverdue = tasks.some(t => t.status !== 'done' && t.deadline && new Date(t.deadline) < today && !t._isRecurring);
    const hasHigh = tasks.some(t => t.priority === 'high' && t.status !== 'done' && !t._isRecurring);
    const allDone = tasks.length > 0 && tasks.every(t => {
      if (t._isRecurring) {
        return t.completions && t.completions[dateStr];
      }
      return t.status === 'done';
    });

    const dayCell = el('div', {
      class: `cal-day ${isToday ? 'today' : ''} ${tasks.length > 0 ? 'has-tasks' : ''} ${hasOverdue ? 'has-overdue' : ''} ${allDone ? 'all-done' : ''}`,
      onclick: () => {
        state.currentDate = dateObj;
        state.scheduleView = 'timeline';
        renderPanel('left');
      }
    });

    dayCell.appendChild(el('div', { class: 'cal-day-num', text: String(d) }));

    if (tasks.length > 0) {
      const taskList = el('div', { class: 'cal-task-list' });
      tasks.slice(0, 3).forEach(t => {
        const priorityCls = t.priority === 'high' ? 'cal-task-high' : t.priority === 'medium' ? 'cal-task-med' : 'cal-task-low';
        const recurringCls = t._isRecurring ? 'cal-task-recurring' : '';
        const isRecurringDone = t._isRecurring && t.completions && t.completions[dateStr];
        const doneCls = (t.status === 'done' || isRecurringDone) ? 'done' : '';
        const recurringMark = t._isRecurring ? '🔄 ' : '';
        const displayTitle = (recurringMark + t.title).length > 10 ? recurringMark + t.title.slice(0, 8) + '…' : recurringMark + t.title;
        taskList.appendChild(el('div', {
          class: `cal-task ${priorityCls} ${doneCls} ${recurringCls}`,
          title: t._isRecurring
            ? `${t.title}（周期任务：${Store.getCycleDescription(t)}）`
            : t.title,
          onclick: (e) => {
            e.stopPropagation();
            if (t._isRecurring) openEditRecurringModal(t.id);
            else openEditTaskModal(t.id);
          }
        }, displayTitle));
      });
      if (tasks.length > 3) {
        taskList.appendChild(el('div', { class: 'cal-task-more', text: `+${tasks.length - 3} 项` }));
      }
      dayCell.appendChild(taskList);
    }

    // DDL 标记
    if (tasks.length > 0 && !allDone) {
      dayCell.appendChild(el('div', { class: 'cal-ddl-marker' }, 'DDL'));
    }

    calWrap.appendChild(dayCell);
  }

  container.appendChild(calWrap);

  // ===== 长期任务独立区域 =====
  if (longTermTasks.length > 0) {
    const ltSection = el('div', { class: 'cal-longterm-section' });
    ltSection.appendChild(el('div', { class: 'cal-longterm-title', text: '📋 长期任务' }));
    longTermTasks.forEach(t => {
      const isDone = t.status === 'done';
      const startStr = t.startDate ? t.startDate.slice(0, 10) : '';
      const endStr = t.deadline ? t.deadline.slice(0, 10) : '';
      const isOverdue = !isDone && t.deadline && new Date(t.deadline) < today;
      const item = el('div', {
        class: `cal-longterm-item ${isDone ? 'done' : ''} ${isOverdue ? 'overdue' : ''}`,
        onclick: (e) => { e.stopPropagation(); openEditTaskModal(t.id); }
      });
      item.appendChild(el('div', { class: 'cal-longterm-name', text: t.title }));
      item.appendChild(el('div', { class: 'cal-longterm-range', text: `${startStr} → ${endStr}` }));
      if (isDone) {
        item.appendChild(el('span', { class: 'cal-longterm-badge done', text: '已完成' }));
      } else if (isOverdue) {
        item.appendChild(el('span', { class: 'cal-longterm-badge overdue', text: '逾期' }));
      } else {
        item.appendChild(el('span', { class: 'cal-longterm-badge active', text: '进行中' }));
      }
      ltSection.appendChild(item);
    });
    container.appendChild(ltSection);
  }

  // 月度统计（去重，长期任务不重复计数）
  const monthTaskIds = new Set();
  Object.values(monthTasks).forEach(arr => arr.forEach(t => monthTaskIds.add(t.id)));
  longTermTasks.forEach(t => monthTaskIds.add(t.id));
  const monthTaskCount = monthTaskIds.size;
  const monthDoneCount = Store.data.tasks.filter(t => 
    monthTaskIds.has(t.id) && t.status === 'done'
  ).length;
  const monthOverdueCount = Store.data.tasks.filter(t => 
    monthTaskIds.has(t.id) && t.status !== 'done' && t.deadline && new Date(t.deadline) < today
  ).length;

  container.appendChild(el('div', { class: 'month-stats' },
    el('div', { class: 'month-stat-item' },
      el('span', { class: 'month-stat-num', text: String(monthTaskCount) }),
      el('span', { class: 'month-stat-label', text: '总任务' })
    ),
    el('div', { class: 'month-stat-item success' },
      el('span', { class: 'month-stat-num', text: String(monthDoneCount) }),
      el('span', { class: 'month-stat-label', text: '已完成' })
    ),
    el('div', { class: 'month-stat-item danger' },
      el('span', { class: 'month-stat-num', text: String(monthOverdueCount) }),
      el('span', { class: 'month-stat-label', text: '逾期' })
    ),
    el('div', { class: 'month-stat-hint', text: '点击日期查看当日时间轴详情' })
  ));
}

/* ============================================================
   左侧：每日任务
   ============================================================ */
function renderTasks(container) {
  const today = formatDate(new Date());
  let tasks = Store.data.tasks;

  // 按状态分组
  const overdue = tasks.filter(t => t.status !== 'done' && t.deadline && new Date(t.deadline) < new Date() && !t.deadline.startsWith(today));
  const todayTasks = tasks.filter(t => {
    if (!t.deadline) return false;
    // 截止日期是今天
    if (t.deadline.startsWith(today)) return true;
    // 长期任务：今天在开始-截止范围内
    if (t.startDate) {
      const startStr = t.startDate.slice(0, 10);
      const endStr = t.deadline.slice(0, 10);
      if (startStr !== endStr && today >= startStr && today <= endStr) return true;
    }
    return false;
  });
  const noDeadline = tasks.filter(t => !t.deadline);

  if (tasks.length === 0 && Store.data.recurringTasks.length === 0) {
    container.appendChild(emptyState('暂无任务', '点击右上角 + 创建任务'));
    return;
  }

  const list = el('div', { class: 'task-list' });

  if (overdue.length > 0) {
    list.appendChild(sectionLabel('逾期事项', overdue.length, 'danger'));
    overdue.forEach(t => list.appendChild(taskItem(t)));
  }

  // 今日到期的周期任务
  const recurringDue = Store.getRecurringTasksForDate(today);
  if (recurringDue.length > 0) {
    list.appendChild(sectionLabel('🔄 周期任务', recurringDue.length));
    recurringDue.forEach(rt => list.appendChild(recurringTaskListItem(rt, today)));
  }

  if (todayTasks.length > 0) {
    list.appendChild(sectionLabel('今日任务', todayTasks.length));
    todayTasks.forEach(t => list.appendChild(taskItem(t)));
  }

  if (noDeadline.length > 0) {
    list.appendChild(sectionLabel('待安排', noDeadline.length));
    noDeadline.forEach(t => list.appendChild(taskItem(t)));
  }

  container.appendChild(list);

  // 底部操作按钮
  const bottomBar = el('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } });
  bottomBar.appendChild(el('button', {
    class: 'btn-submit',
    style: { flex: '1', padding: '8px', fontSize: '13px' },
    onclick: () => openQuickAddModal()
  }, '+ 新建任务'));
  bottomBar.appendChild(el('button', {
    class: 'btn-cancel',
    style: { flex: '1', padding: '8px', fontSize: '13px' },
    onclick: () => openRecurringTaskModal()
  }, '🔄 管理周期任务'));
  container.appendChild(bottomBar);
}

function taskItem(t) {
  const isOverdue = t.status !== 'done' && t.deadline && new Date(t.deadline) < new Date();
  const isLongTerm = t.startDate && t.deadline && t.startDate.slice(0, 10) !== t.deadline.slice(0, 10);
  const item = el('div', { class: `task-item ${t.status === 'done' ? 'done' : ''} ${isOverdue ? 'overdue' : ''} ${isLongTerm ? 'long-term' : ''}` });

  item.appendChild(el('div', {
    class: 'task-checkbox',
    onclick: () => Store.updateTask(t.id, { status: t.status === 'done' ? 'pending' : 'done' })
  }));

  const content = el('div', { class: 'task-content' });
  content.appendChild(el('div', { class: 'task-title', text: t.title }));

  const meta = el('div', { class: 'task-meta' });
  const typeLabels = { work: '工作任务', internal_meeting: '内部会议', external_meeting: '外部会议', personal_study: '个人学习', social: '社交娱乐' };
  meta.appendChild(el('span', { class: 'task-tag', style: { background: 'var(--c-primary-bg)', color: 'var(--c-primary)' }, text: typeLabels[t.type] || '其他' }));

  if (isLongTerm) {
    meta.appendChild(el('span', { class: 'task-tag', style: { background: '#fef3c7', color: '#92400e' }, text: '📋 长期' }));
  }

  const prioLabel = t.priority === 'high' ? '高优先级' : t.priority === 'medium' ? '中优先级' : '低优先级';
  meta.appendChild(el('span', { class: `task-priority-badge ${t.priority || 'medium'}` },
    el('span', { class: `priority-dot priority-${t.priority || 'medium'}` }),
    prioLabel
  ));

  if (isLongTerm && t.startDate) {
    meta.appendChild(el('span', { class: 'task-deadline', text: `${formatDateLabel(t.startDate)} → ${formatDateLabel(t.deadline)} ${t.deadline.includes('T') ? formatTime(t.deadline) : ''}` }));
  } else if (t.deadline) {
    const isMeeting = t.type === 'internal_meeting' || t.type === 'external_meeting';
    const urgent = isOverdue && !isMeeting;
    const timeLabel = isMeeting
      ? `📅 ${formatDateLabel(t.deadline)} ${t.deadline.includes('T') ? formatTime(t.deadline) : ''}`
      : `截止: ${formatDateLabel(t.deadline)} ${t.deadline.includes('T') ? formatTime(t.deadline) : ''}`;
    meta.appendChild(el('span', { class: `task-deadline ${urgent ? 'urgent' : ''}`, text: timeLabel }));
  }

  const statusMap = { done: '已完成', progress: '进行中', pending: '未开始', overdue: '逾期' };
  meta.appendChild(el('span', { class: `slot-status status-${t.status}`, text: statusMap[t.status] || '未开始' }));

  content.appendChild(meta);

  // 编辑/删除按钮
  const taskActions = el('div', { style: { display: 'flex', gap: '4px', marginLeft: 'auto', flexShrink: '0' } });
  taskActions.appendChild(el('button', {
    class: 'btn-icon-sm',
    title: '编辑',
    onclick: (e) => { e.stopPropagation(); openEditTaskModal(t.id); }
  }, svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', 12)));
  taskActions.appendChild(el('button', {
    class: 'btn-icon-sm',
    title: '删除',
    style: { color: 'var(--c-danger)' },
    onclick: (e) => {
      e.stopPropagation();
      if (confirm('确定删除"' + t.title + '"吗？')) {
        Store.deleteTask(t.id);
        showToast('已删除', 'info');
      }
    }
  }, svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 12)));
  content.appendChild(taskActions);

  item.appendChild(content);

  return item;
}

/* ---------- 周期任务列表项（每日任务tab中） ---------- */
function recurringTaskListItem(rt, todayStr) {
  const isDone = rt.completions && rt.completions[todayStr];
  const cycleDesc = Store.getCycleDescription(rt);
  const item = el('div', { class: `task-item ${isDone ? 'done' : ''} recurring-list-item` });

  // 完成打卡checkbox
  item.appendChild(el('div', {
    class: `task-checkbox ${isDone ? 'checked' : ''}`,
    onclick: () => Store.toggleRecurringCompletion(rt.id, todayStr)
  }));

  const content = el('div', { class: 'task-content' });
  content.appendChild(el('div', { class: 'task-title', text: rt.title }));

  const meta = el('div', { class: 'task-meta' });
  meta.appendChild(el('span', { class: 'task-tag', style: { background: '#ede9fe', color: '#6d28d9' }, text: `🔄 ${cycleDesc}` }));
  meta.appendChild(el('span', { text: `⏰ ${rt.preferredTime || '14:00'}` }));

  const prioLabel = rt.priority === 'high' ? '高优先级' : rt.priority === 'medium' ? '中优先级' : '低优先级';
  meta.appendChild(el('span', { class: `task-priority-badge ${rt.priority || 'medium'}` },
    el('span', { class: `priority-dot priority-${rt.priority || 'medium'}` }),
    prioLabel
  ));

  meta.appendChild(el('span', { class: `slot-status status-${isDone ? 'done' : 'pending'}`, text: isDone ? '今日已完成' : '今日待完成' }));

  // 编辑/删除按钮
  const editBtn = el('button', {
    class: 'btn-icon-sm',
    style: { marginLeft: 'auto', opacity: '0.5' },
    title: '编辑周期任务',
    onclick: (e) => { e.stopPropagation(); openEditRecurringModal(rt.id); }
  }, svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', 12));
  meta.appendChild(editBtn);
  const delBtn = el('button', {
    class: 'btn-icon-sm',
    style: { opacity: '0.5', color: 'var(--c-danger)' },
    title: '删除周期任务',
    onclick: (e) => {
      e.stopPropagation();
      if (confirm('确定删除周期任务"' + rt.title + '"吗？')) {
        Store.deleteRecurringTask(rt.id);
        showToast('周期任务已删除', 'info');
      }
    }
  }, svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 12));
  meta.appendChild(delBtn);

  content.appendChild(meta);
  item.appendChild(content);

  return item;
}

function sectionLabel(text, count, cls = '') {
  return el('div', {
    style: { fontSize: '11px', fontWeight: '700', color: cls === 'danger' ? 'var(--c-danger)' : 'var(--c-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '8px 0 4px', display: 'flex', alignItems: 'center', gap: '6px' }
  }, text, el('span', { style: { background: cls === 'danger' ? 'var(--c-danger-bg)' : 'var(--c-surface-hover)', color: cls === 'danger' ? 'var(--c-danger)' : 'var(--c-text-muted)', padding: '1px 8px', borderRadius: '10px', fontSize: '10px' }, text: String(count) }));
}

function emptyState(text, hint) {
  return el('div', { class: 'empty-state' },
    svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>', 48),
    el('div', { class: 'empty-text', text }),
    el('div', { class: 'empty-hint', text: hint })
  );
}

/* ============================================================
   左侧：学习打卡
   ============================================================ */
function renderStudy(container) {
  const todayCheckin = Store.getTodayCheckins();

  // 固定打卡卡片
  const grid = el('div', { class: 'study-grid' });

  Store.data.studyItems.forEach(item => {
    const record = todayCheckin.items[item.id] || { status: 'pending', note: '' };
    const isDone = record.status === 'done';

    const card = el('div', { class: `study-card ${isDone ? 'done' : 'pending'}` });

    // 头部
    const header = el('div', { class: 'study-card-header' });
    header.appendChild(el('div', { class: 'study-card-title' },
      el('div', { class: 'study-card-icon', style: { background: item.color + '20', color: item.color }, text: item.icon }),
      el('span', { text: item.name })
    ));

    const actions = el('div', { class: 'study-card-actions' });
    if (item.link) {
      actions.appendChild(el('a', {
        class: 'btn-study-link', href: item.link, target: '_blank', rel: 'noopener'
      },
        svg('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', 12),
        '前往学习'
      ));
    }
    actions.appendChild(el('button', {
      class: `btn-study-done ${isDone ? 'completed' : ''}`,
      onclick: () => Store.toggleStudyDone(item.id)
    }, isDone ? '✓ 已完成' : '标记完成'));
    actions.appendChild(el('button', {
      class: 'btn-study-delete',
      title: '删除打卡项',
      onclick: () => {
        if (confirm(`确定删除"${item.name}"吗？\n相关打卡记录也将被清除。`)) {
          Store.deleteStudyItem(item.id);
          showToast('已删除', 'success');
        }
      }
    }, svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 12)));
    header.appendChild(actions);
    card.appendChild(header);

    // 偏好时段
    const timeRow = el('div', { class: 'study-time-row' });
    timeRow.appendChild(el('span', { class: 'study-time-label', text: '偏好时段' }));
    const timeInput = el('input', {
      type: 'time',
      class: 'study-time-input',
      value: item.preferredTime || '12:30',
    });
    timeInput.addEventListener('change', () => {
      Store.updateStudyItem(item.id, { preferredTime: timeInput.value });
      showToast(item.name + ' 偏好时段已更新为 ' + timeInput.value, 'success');
    });
    timeRow.appendChild(timeInput);
    card.appendChild(timeRow);

    // 笔记区
    const note = el('textarea', {
      class: 'study-note',
      placeholder: '记录精读摘抄 / 生词 / 口语感悟...',
    });
    note.value = record.note || '';
    note.addEventListener('input', () => Store.setStudyNote(item.id, note.value));
    card.appendChild(note);

    grid.appendChild(card);
  });

  // 自定义打卡项（含链接输入）
  const addBox = el('div', { class: 'add-study-item-box' });
  addBox.appendChild(el('div', { class: 'form-label', text: '添加自定义学习打卡项' }));
  const nameInput = el('input', { type: 'text', class: 'form-input', placeholder: '打卡项名称（如：每日英语听力）', style: { marginBottom: '6px' } });
  const linkInput = el('input', { type: 'text', class: 'form-input', placeholder: '跳转链接（可选，如 https://...）', style: { marginBottom: '6px' } });
  addBox.appendChild(nameInput);
  addBox.appendChild(linkInput);
  addBox.appendChild(el('button', {
    class: 'btn-submit',
    style: { width: '100%', padding: '7px', fontSize: '12px' },
    onclick: () => {
      const name = nameInput.value.trim();
      if (!name) { showToast('请输入打卡项名称', 'warning'); return; }
      const link = linkInput.value.trim();
      Store.addStudyItem({ name, icon: name.charAt(0).toUpperCase(), color: '#6366f1', link: link, preferredTime: '12:30' });
      showToast('已添加打卡项' + (link ? '（含跳转链接）' : ''), 'success');
      nameInput.value = '';
      linkInput.value = '';
    }
  }, '添加'));
  grid.appendChild(addBox);

  container.appendChild(grid);

  // ===== 课程任务区域 =====
  const courseSection = el('div', { class: 'course-section' });
  courseSection.appendChild(el('div', { class: 'course-section-title' },
    el('span', { text: '课程任务' }),
    el('span', { class: 'course-section-hint', text: '打卡后自动排下一讲' })
  ));

  const activeCourses = Store.data.courses.filter(c => !c.archived);
  activeCourses.forEach(course => {
    const progress = course.totalLessons > 0 ? Math.round(course.completedLessons / course.totalLessons * 100) : 0;
    const pendingTask = Store.getCoursePendingTask(course.id);
    const todayStr = formatDate(new Date());

    // 计算截止日期倒计时
    const deadlineDate = new Date(course.deadline + 'T23:59');
    const now = new Date();
    const daysLeft = Math.ceil((deadlineDate - now) / 86400000);
    const deadlineText = daysLeft > 0 ? `剩${daysLeft}天` : daysLeft === 0 ? '今天截止' : '已逾期';
    const deadlineCls = daysLeft < 0 ? 'overdue' : daysLeft <= 7 ? 'urgent' : '';

    // 下一讲信息
    let nextLessonText = '';
    if (course.completedLessons >= course.totalLessons) {
      nextLessonText = '✅ 已全部完成';
    } else if (pendingTask) {
      const taskDate = pendingTask.deadline?.slice(0, 10) || '';
      const taskTime = pendingTask.deadline?.slice(11, 16) || '';
      const dateLabel = taskDate === todayStr ? '今天' : taskDate === formatDate(addDays(now, 1)) ? '明天' : formatDateLabel(taskDate);
      nextLessonText = `第${pendingTask.lessonNumber}讲 · ${dateLabel} ${taskTime}`;
    } else {
      nextLessonText = `第${course.completedLessons + 1}讲 · 待排期`;
    }

    const card = el('div', { class: 'course-card' });

    // 头部：课程名 + 操作
    const cardHeader = el('div', { class: 'course-card-header' });
    cardHeader.appendChild(el('div', { class: 'course-card-title' },
      el('div', { class: 'course-card-icon', text: '📚' }),
      el('span', { text: course.name }),
      course.link ? el('a', { href: course.link, target: '_blank', rel: 'noopener', class: 'course-link-btn', title: '前往课程' },
        svg('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', 12)) : null
    ));
    const cardActions = el('div', { class: 'course-card-actions' });
    cardActions.appendChild(el('button', {
      class: 'btn-study-delete',
      title: '删除课程',
      onclick: () => {
        if (confirm(`确定删除课程"${course.name}"吗？\n关联的讲次任务也将被清除。`)) {
          Store.deleteCourse(course.id);
          showToast('课程已删除', 'info');
        }
      }
    }, svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 12)));
    cardHeader.appendChild(cardActions);
    card.appendChild(cardHeader);

    // 进度条
    const progressRow = el('div', { class: 'course-progress-row' });
    progressRow.appendChild(el('div', { class: 'course-progress-bar' },
      el('div', { class: `course-progress-fill ${progress === 100 ? 'complete' : ''}`, style: { width: progress + '%' } })
    ));
    progressRow.appendChild(el('span', { class: 'course-progress-text', text: `${course.completedLessons}/${course.totalLessons}讲` }));
    card.appendChild(progressRow);

    // 信息行：截止日期 + 下一讲
    const infoRow = el('div', { class: 'course-info-row' });
    infoRow.appendChild(el('span', { class: `course-deadline ${deadlineCls}`, text: `⏰ ${deadlineText}` }));
    infoRow.appendChild(el('span', { class: 'course-next-lesson', text: `▶ ${nextLessonText}` }));
    card.appendChild(infoRow);

    // 完成按钮
    if (course.completedLessons < course.totalLessons) {
      const btnRow = el('div', { class: 'course-btn-row' });
      btnRow.appendChild(el('button', {
        class: 'btn-course-done',
        onclick: () => {
          const result = Store.completeCourseLesson(course.id);
          if (result?.courseCompleted) {
            showToast(`🎉 ${course.name} 全部完成！`, 'success');
          } else if (result?.nextTask) {
            const nextDate = result.nextTask.deadline?.slice(0, 10) || '';
            const nextTime = result.nextTask.deadline?.slice(11, 16) || '';
            const dateLabel = nextDate === todayStr ? '今天' : nextDate === formatDate(addDays(now, 1)) ? '明天' : formatDateLabel(nextDate);
            showToast(`已完成第${course.completedLessons}讲 → 第${result.nextTask.lessonNumber}讲已排到 ${dateLabel} ${nextTime}`, 'success', 4000);
          }
        }
      }, `完成第${course.completedLessons + 1}讲`));
      card.appendChild(btnRow);
    }

    courseSection.appendChild(card);
  });

  // 添加课程表单
  const addCourseBox = el('div', { class: 'add-course-box' });
  addCourseBox.appendChild(el('div', { class: 'form-label', text: '添加课程任务' }));
  const courseNameInput = el('input', { type: 'text', class: 'form-input', placeholder: '课程名称（如：Python数据分析）', style: { marginBottom: '6px' } });
  const courseRow1 = el('div', { class: 'course-form-row' });
  const courseTotalInput = el('input', { type: 'number', class: 'form-input', placeholder: '总讲数', min: '1', style: { flex: '1' } });
  const courseDurationInput = el('input', { type: 'number', class: 'form-input', placeholder: '每讲时长(分钟)', min: '10', style: { flex: '1' } });
  courseRow1.appendChild(courseTotalInput);
  courseRow1.appendChild(courseDurationInput);
  const courseRow2 = el('div', { class: 'course-form-row' });
  const courseDeadlineInput = el('input', { type: 'date', class: 'form-input', style: { flex: '1' } });
  const courseTimeInput = el('input', { type: 'time', class: 'form-input', value: '20:00', style: { flex: '1' } });
  courseRow2.appendChild(courseDeadlineInput);
  courseRow2.appendChild(courseTimeInput);
  const courseLinkInput = el('input', { type: 'text', class: 'form-input', placeholder: '课程链接（可选）', style: { marginBottom: '6px' } });
  addCourseBox.appendChild(courseNameInput);
  addCourseBox.appendChild(courseRow1);
  addCourseBox.appendChild(courseRow2);
  addCourseBox.appendChild(courseLinkInput);
  addCourseBox.appendChild(el('button', {
    class: 'btn-submit',
    style: { width: '100%', padding: '7px', fontSize: '12px' },
    onclick: () => {
      const name = courseNameInput.value.trim();
      const total = parseInt(courseTotalInput.value);
      if (!name) { showToast('请输入课程名称', 'warning'); return; }
      if (!total || total < 1) { showToast('请输入总讲数', 'warning'); return; }
      const deadline = courseDeadlineInput.value || formatDate(addDays(new Date(), 30));
      const lessonDuration = parseInt(courseDurationInput.value) || 45;
      const preferredTime = courseTimeInput.value || '20:00';
      const link = courseLinkInput.value.trim();
      Store.addCourse({ name, totalLessons: total, deadline, lessonDuration, preferredTime, link });
      showToast(`课程已添加，第1讲已自动排期`, 'success');
      courseNameInput.value = '';
      courseTotalInput.value = '';
      courseDurationInput.value = '';
      courseDeadlineInput.value = '';
      courseLinkInput.value = '';
    }
  }, '添加课程'));
  courseSection.appendChild(addCourseBox);

  container.appendChild(courseSection);

  // 历史台账
  const history = Store.getStudyHistory(7);
  const histSection = el('div', { class: 'study-history' });
  histSection.appendChild(el('div', { class: 'study-history-title', text: '近7日打卡台账' }));

  history.forEach(h => {
    const rate = h.total > 0 ? Math.round(h.completed / h.total * 100) : 0;
    histSection.appendChild(el('div', { class: 'history-row' },
      el('span', { class: 'history-date', text: h.date }),
      el('div', { style: { flex: '1', height: '6px', background: 'var(--c-border-light)', borderRadius: '3px', overflow: 'hidden' } },
        el('div', { style: { height: '100%', width: rate + '%', background: rate === 100 ? 'var(--c-success)' : rate > 0 ? 'var(--c-primary)' : 'var(--c-border)', borderRadius: '3px', transition: 'width .3s' } })
      ),
      el('span', { class: `history-status ${rate === 100 ? 'done' : rate > 0 ? 'pending' : ''}`, text: `${h.completed}/${h.total}` })
    ));
  });

  container.appendChild(histSection);
}

/* ============================================================
   右侧：宣传情报
   ============================================================ */
function renderIntel(container) {
  // 公众号追踪
  const trackSection = el('div', { class: 'intel-section' });
  trackSection.appendChild(el('div', { class: 'intel-section-title' },
    '公众号追踪',
    el('span', { class: 'count', text: String(Store.data.trackedAccounts.length) })
  ));

  // 说明信息
  trackSection.appendChild(el('div', { class: 'wechat-info-banner' },
    el('div', { class: 'wechat-info-icon', text: '💡' }),
    el('div', { class: 'wechat-info-text' },
      el('div', { style: { fontWeight: '600', marginBottom: '2px' }, text: '关于微信公众号自动追踪' }),
      el('div', { style: { fontSize: '11px', lineHeight: '1.5' }, text: '微信公众号无官方公开API，无法全自动抓取。当前方案：①点击"同步"尝试通过RSSHub半自动获取（成功率取决于网络和服务可用性）；②点击"搜索"跳转搜狗微信搜索；③点击"手动"直接粘贴文章链接和标题。三种方式配合使用效果最佳。' })
    )
  ));

  Store.data.trackedAccounts.forEach(acc => {
    trackSection.appendChild(renderAccountCard(acc));
  });

  // 添加公众号
  const addAccBox = el('div', { class: 'add-account-box' });
  const accInput = el('input', { type: 'text', class: 'form-input', placeholder: '输入公众号名称添加追踪...' });
  addAccBox.appendChild(accInput);
  addAccBox.appendChild(el('button', {
    class: 'btn-submit',
    style: { whiteSpace: 'nowrap', padding: '7px 14px', fontSize: '12px' },
    onclick: () => {
      const name = accInput.value.trim();
      if (!name) return;
      Store.addTrackedAccount({
        name,
        keyword: name,
        rssUrl: 'https://rsshub.app/wechat/search/' + encodeURIComponent(name),
        searchUrl: 'https://weixin.sogou.com/weixin?type=1&query=' + encodeURIComponent(name),
        officialUrl: 'https://mp.weixin.qq.com',
      });
      showToast('已添加公众号追踪：' + name, 'success');
    }
  }, '添加'));
  trackSection.appendChild(addAccBox);
  container.appendChild(trackSection);

  // 热点聚合
  const hotspotSection = el('div', { class: 'intel-section' });
  const allHotspots = Store.getAllHotspots();
  const autoCount = Store.data.autoHotspots.length;
  const manualCount = Store.data.manualHotspots.length;
  hotspotSection.appendChild(el('div', { class: 'intel-section-title' },
    '热点聚合',
    el('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } },
      el('span', { class: 'count', text: String(allHotspots.length) }),
      el('button', {
        class: 'btn-icon',
        style: { width: '24px', height: '24px' },
        title: '数据源配置',
        onclick: () => openHotspotSourceModal()
      }, svg('<path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l8.59-8.59a1 1 0 0 0 0-1.41L12 2zM5.5 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>', 12)),
      el('button', {
        class: 'btn-icon',
        style: { width: '24px', height: '24px' },
        title: '立即抓取最新热点',
        onclick: async () => {
          showToast('正在从各数据源抓取热点...', 'info');
          const ok = await Store.fetchDailyHotspots();
          if (ok) {
            showToast('热点已更新！共抓取 ' + Store.data.autoHotspots.length + ' 条', 'success');
          } else {
            showToast('部分数据源抓取失败，已显示可用结果', 'warning');
          }
        }
      }, svg('<path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>', 12)),
      el('button', {
        class: 'btn-icon',
        style: { width: '24px', height: '24px' },
        title: '手动添加热点',
        onclick: () => openAddHotspotModal()
      }, svg('<path d="M12 5v14M5 12h14"/>', 14))
    )
  ));

  // 上次更新时间 + 每日自动说明
  const lastUpdate = Store.data.lastHotspotUpdate || 0;
  const updateAgo = lastUpdate > 0 ? timeAgo(lastUpdate) : '尚未抓取';
  hotspotSection.appendChild(el('div', {
    style: { fontSize: '10px', color: 'var(--c-text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }
  },
    el('span', { text: '📡 每日自动整理' }),
    el('span', { text: '· 上次抓取：' + updateAgo }),
    autoCount > 0 ? el('span', { style: { color: 'var(--c-primary)' }, text: '· 自动 ' + autoCount + ' 条' }) : null,
    manualCount > 0 ? el('span', { style: { color: 'var(--c-success)' }, text: '· 手动 ' + manualCount + ' 条' }) : null
  ));

  // AI 检索窗口
  const aiSearchBox = el('div', { class: 'hotspot-ai-search' });
  aiSearchBox.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }
  },
    el('span', { style: { fontSize: '12px', fontWeight: '700', color: 'var(--c-primary)' }, text: '🔍 AI热点检索' }),
    el('span', { style: { fontSize: '10px', color: 'var(--c-text-muted)' }, text: '输入方向，自动全网检索' })
  ));
  const aiSearchInputRow = el('div', { style: { display: 'flex', gap: '6px' } });
  const aiSearchInput = el('input', {
    type: 'text',
    class: 'form-input',
    placeholder: '如：党建最新动态、科技突破、网络热梗...',
    style: { flex: '1', fontSize: '12px', padding: '6px 10px' }
  });
  aiSearchInputRow.appendChild(aiSearchInput);
  aiSearchInputRow.appendChild(el('button', {
    class: 'btn-submit',
    style: { padding: '6px 14px', fontSize: '12px', whiteSpace: 'nowrap' },
    onclick: () => {
      const q = aiSearchInput.value.trim();
      if (!q) { showToast('请输入检索方向', 'warning'); return; }
      openHotspotAISearchModal(q);
    }
  }, '检索'));
  aiSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = aiSearchInput.value.trim();
      if (q) openHotspotAISearchModal(q);
    }
  });
  aiSearchBox.appendChild(aiSearchInputRow);

  // 快捷检索方向
  const quickDirs = ['党建', '科技', '网络热梗', '核聚变', '文化', '政策解读'];
  const quickRow = el('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' } });
  quickDirs.forEach(dir => {
    quickRow.appendChild(el('button', {
      class: 'prompt-chip',
      style: { fontSize: '10px', padding: '2px 8px' },
      onclick: () => { aiSearchInput.value = dir; openHotspotAISearchModal(dir); }
    }, dir));
  });
  aiSearchBox.appendChild(quickRow);
  hotspotSection.appendChild(aiSearchBox);

  const hotspotList = el('div', { class: 'hotspot-list' });

  // 先显示自动抓取的热点
  if (Store.data.autoHotspots.length > 0) {
    hotspotList.appendChild(el('div', {
      style: { fontSize: '11px', fontWeight: '700', color: 'var(--c-primary)', margin: '4px 0 6px', display: 'flex', alignItems: 'center', gap: '4px' }
    }, '📡 今日自动整理'));
  }
  Store.data.autoHotspots.forEach(h => {
    hotspotList.appendChild(buildHotspotItem(h));
  });

  // 再显示手动添加的热点
  if (Store.data.manualHotspots.length > 0) {
    hotspotList.appendChild(el('div', {
      style: { fontSize: '11px', fontWeight: '700', color: 'var(--c-success)', margin: '10px 0 6px', display: 'flex', alignItems: 'center', gap: '4px' }
    }, '✋ 手动添加'));
  }
  Store.data.manualHotspots.forEach(h => {
    hotspotList.appendChild(buildHotspotItem(h));
  });

  // 空状态
  if (allHotspots.length === 0) {
    hotspotList.appendChild(el('div', {
      class: 'empty-state',
      style: { padding: '16px', textAlign: 'center' }
    },
      el('div', { class: 'empty-text', text: '暂无热点' }),
      el('div', { style: { fontSize: '11px', color: 'var(--c-text-muted)', marginTop: '4px' }, text: '点击刷新按钮抓取，或手动添加' })
    ));
  }
  hotspotSection.appendChild(hotspotList);
  container.appendChild(hotspotSection);

  // 文章列表
  const articleSection = el('div', { class: 'intel-section' });
  articleSection.appendChild(el('div', { class: 'intel-section-title' },
    '公众号素材 · AI智能评估',
    el('span', { class: 'count', text: String(Store.data.intelArticles.length) })
  ));

  if (Store.data.intelArticles.length === 0) {
    articleSection.appendChild(emptyState('暂无情报素材', '点击右上角 + 或通过公众号追踪录入文章'));
  } else {
    Store.data.intelArticles.forEach(a => {
      articleSection.appendChild(articleCard(a));
    });
  }

  container.appendChild(articleSection);
}

/* ---------- 热点卡片构建 ---------- */
function buildHotspotItem(h) {
  const item = el('div', { class: 'hotspot-item' + (h.auto ? ' auto' : '') });

  // 标签行
  const tagRow = el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } });
  tagRow.appendChild(el('span', { class: 'hotspot-tag', style: { background: h.tagColor + '20', color: h.tagColor }, text: h.tag }));
  if (h.source) {
    tagRow.appendChild(el('span', { class: 'hotspot-source', text: h.source }));
  }
  if (h.auto) {
    tagRow.appendChild(el('span', { style: { fontSize: '9px', color: 'var(--c-primary)', marginLeft: '2px' }, text: '自动' }));
  }
  // 收藏到素材库按钮
  const collected = Store.isHotspotCollected(h.id);
  if (collected) {
    tagRow.appendChild(el('span', { style: { fontSize: '9px', color: '#f59e0b', marginLeft: '2px', fontWeight: '700' }, text: '已收藏' }));
  }
  tagRow.appendChild(el('button', {
    class: 'btn-icon',
    style: { width: '18px', height: '18px', marginLeft: 'auto', opacity: collected ? '0.8' : '0.5', color: collected ? '#f59e0b' : 'inherit' },
    title: collected ? '已收藏到素材库' : '收藏到学习素材库',
    onclick: (e) => { e.stopPropagation(); if (!collected) openHotspotCollectModal(h); else showToast('已收藏过此热点', 'info'); }
  }, svg(collected ? '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>' : '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>', 10)));
  tagRow.appendChild(el('button', {
    class: 'btn-icon',
    style: { width: '18px', height: '18px', opacity: '0.5' },
    title: '删除',
    onclick: (e) => { e.stopPropagation(); Store.deleteHotspot(h.id); showToast('已删除', 'info'); }
  }, svg('<path d="M18 6 6 18M6 6l12 12"/>', 10)));
  item.appendChild(tagRow);

  item.appendChild(el('div', { class: 'hotspot-title', text: h.title }));
  if (h.summary && h.summary !== h.title) {
    item.appendChild(el('div', { class: 'hotspot-summary', text: h.summary }));
  }

  // 原文链接
  if (h.link) {
    item.appendChild(el('a', {
      class: 'hotspot-link',
      href: h.link,
      target: '_blank',
      rel: 'noopener',
      onclick: (e) => e.stopPropagation()
    }, svg('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', 10), '查看原文考证'));
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => window.open(h.link, '_blank'));
  }

  return item;
}

/* ---------- 热点数据源配置弹窗 ---------- */
function openHotspotSourceModal() {
  const body = $('#modalBody');
  body.innerHTML = '';

  body.appendChild(el('div', {
    style: { fontSize: '12px', color: 'var(--c-text-secondary)', marginBottom: '12px', lineHeight: '1.5' }
  },
    '为每个板块配置数据源链接。系统每天自动从这些链接抓取热点内容。可粘贴微博热搜、小红书搜索、人民网频道等页面链接。'
  ));

  const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });

  Store.data.hotspotSources.forEach(src => {
    const card = el('div', {
      style: { border: '1px solid var(--c-border-light)', borderRadius: 'var(--radius-md)', padding: '12px' }
    });

    // 标签 + 开关
    const header = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } });
    header.appendChild(el('span', {
      class: 'hotspot-tag',
      style: { background: src.tagColor + '20', color: src.tagColor },
      text: src.tag
    }));
    header.appendChild(el('span', { style: { fontWeight: '600', fontSize: '13px' }, text: src.name }));
    header.appendChild(el('label', {
      style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }
    },
      (() => {
        const cb = el('input', { type: 'checkbox' });
        cb.checked = src.enabled;
        cb.addEventListener('change', () => Store.updateHotspotSource(src.id, { enabled: cb.checked }));
        return cb;
      })(),
      '启用'
    ));
    card.appendChild(header);

    // URL 输入
    const urlInput = el('input', {
      class: 'form-input',
      style: { fontSize: '12px', marginBottom: '6px' },
      placeholder: '粘贴数据源页面链接...'
    });
    urlInput.value = src.url || '';
    urlInput.addEventListener('blur', () => Store.updateHotspotSource(src.id, { url: urlInput.value.trim() }));
    card.appendChild(urlInput);

    // 类型选择
    const typeRow = el('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } });
    const typeState = { value: src.type || 'generic' };
    const types = [
      { id: 'people', label: '人民网系' },
      { id: 'weibo', label: '微博热搜' },
      { id: 'bili', label: 'B站热门' },
      { id: 'zhihu', label: '知乎热榜' },
      { id: 'generic', label: '通用' },
    ];
    types.forEach(t => {
      const btn = el('div', {
        class: `type-option ${typeState.value === t.id ? 'active' : ''}`,
        style: { fontSize: '11px', padding: '3px 8px' },
        onclick: () => {
          typeRow.querySelectorAll('.type-option').forEach(o => o.classList.remove('active'));
          btn.classList.add('active');
          typeState.value = t.id;
          Store.updateHotspotSource(src.id, { type: t.id });
        }
      }, t.label);
      typeRow.appendChild(btn);
    });
    card.appendChild(typeRow);

    // 删除按钮
    card.appendChild(el('button', {
      class: 'btn-delete-sm',
      style: { marginTop: '8px', fontSize: '11px', color: 'var(--c-danger)', background: 'none', border: 'none', cursor: 'pointer' },
      onclick: () => {
        if (confirm('确定删除「' + src.name + '」数据源？')) {
          Store.deleteHotspotSource(src.id);
          showToast('已删除', 'info');
        }
      }
    }, '🗑 删除此数据源'));

    list.appendChild(card);
  });

  body.appendChild(list);

  // 添加新数据源
  body.appendChild(el('div', { style: { borderTop: '1px solid var(--c-border-light)', marginTop: '12px', paddingTop: '12px' } },
    el('div', { style: { fontWeight: '600', fontSize: '13px', marginBottom: '8px' }, text: '添加新数据源' }),
    (() => {
      const newName = el('input', { class: 'form-input', placeholder: '板块名称（如：财经热点）', style: { fontSize: '12px', marginBottom: '6px' } });
      const newTag = el('input', { class: 'form-input', placeholder: '标签（如：财经）', style: { fontSize: '12px', marginBottom: '6px' } });
      const newUrl = el('input', { class: 'form-input', placeholder: '数据源链接...', style: { fontSize: '12px', marginBottom: '6px' } });
      const addBtn = el('button', {
        class: 'btn-submit',
        style: { width: '100%', fontSize: '12px', padding: '8px' },
        onclick: () => {
          const name = newName.value.trim();
          const tag = newTag.value.trim();
          const url = newUrl.value.trim();
          if (!name || !tag || !url) { showToast('请填写完整', 'warning'); return; }
          const colors = ['#dc2626', '#2563eb', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#0891b2'];
          Store.addHotspotSource({
            name, tag, url, type: 'generic', enabled: true,
            tagColor: colors[Store.data.hotspotSources.length % colors.length]
          });
          showToast('数据源已添加', 'success');
          newName.value = ''; newTag.value = ''; newUrl.value = '';
        }
      }, '添加数据源');
      const wrap = el('div', {});
      wrap.appendChild(newName);
      wrap.appendChild(newTag);
      wrap.appendChild(newUrl);
      wrap.appendChild(addBtn);
      return wrap;
    })()
  ));

  body.appendChild(el('div', { class: 'form-actions', style: { marginTop: '12px' } },
    el('button', { class: 'btn-submit', onclick: closeModal }, '完成')
  ));

  openModal('热点数据源配置', true);
}

/* ---------- 公众号追踪卡片 ---------- */
function renderAccountCard(acc) {
  const card = el('div', { class: 'account-card' });

  // 头部
  const header = el('div', { class: 'account-card-header' });
  header.appendChild(el('div', { class: 'account-info' },
    el('div', { class: 'account-name', text: acc.name }),
    el('div', { class: 'account-sync-time', text: acc.lastSync ? '上次同步：' + timeAgo(acc.lastSync) : '尚未同步' })
  ));

  const actions = el('div', { class: 'account-actions' });

  // 同步按钮
  const syncBtn = el('button', {
    class: `account-sync-btn ${state.syncingAccount === acc.id ? 'syncing' : ''}`,
    onclick: async () => {
      if (state.syncingAccount) return;
      state.syncingAccount = acc.id;
      syncBtn.classList.add('syncing');
      syncBtn.textContent = '同步中...';
      showToast('正在获取「' + acc.name + '」最新文章...', 'info');

      const result = await Store.fetchAccountRSS(acc);
      state.syncingAccount = null;
      syncBtn.classList.remove('syncing');
      syncBtn.textContent = '同步';

      if (result.success && result.articles.length > 0) {
        let added = 0;
        result.articles.forEach(article => {
          const existing = acc.articles.find(a => a.title === article.title);
          if (!existing) {
            const evalResult = Store.evaluateArticle(article);
            article.aiScore = evalResult.score;
            article.aiReason = evalResult.reason;
            Store.addTrackedArticle(acc.id, article);
            added++;
          }
        });
        showToast(`「${acc.name}」同步成功，新增 ${added} 篇文章`, 'success');
        renderPanel('right');
      } else {
        showToast('RSS同步失败，请使用手动添加或搜索获取', 'warning');
        // 显示手动添加区域
        card.querySelector('.account-manual').style.display = 'block';
      }
    }
  }, '同步');
  actions.appendChild(syncBtn);

  // 搜索按钮
  actions.appendChild(el('button', {
    class: 'account-search-btn',
    onclick: () => window.open(acc.searchUrl, '_blank')
  }, '搜索'));

  // 手动添加按钮
  actions.appendChild(el('button', {
    class: 'account-manual-btn',
    onclick: () => {
      const manual = card.querySelector('.account-manual');
      manual.style.display = manual.style.display === 'none' ? 'block' : 'none';
    }
  }, '手动'));

  // 删除公众号按钮
  actions.appendChild(el('button', {
    class: 'account-delete-btn',
    title: '删除此公众号',
    onclick: () => {
      if (confirm(`确定删除「${acc.name}」？\n该公众号下 ${acc.articles.length} 篇文章将一并删除。`)) {
        Store.removeTrackedAccount(acc.id);
        showToast(`已删除「${acc.name}」`, 'success');
      }
    }
  }, '🗑'));
  header.appendChild(actions);
  card.appendChild(header);

  // 文章列表
  if (acc.articles && acc.articles.length > 0) {
    const articleList = el('div', { class: 'account-article-list' });
    acc.articles.slice(0, 5).forEach(art => {
      const scoreLabels = {
        priority: { label: '优先转发', cls: 'priority' },
        reference: { label: '备选参考', cls: 'reference' },
        collect: { label: '仅收藏', cls: 'collect' },
        skip: { label: '无需关注', cls: 'skip' },
        '': { label: '待评估', cls: 'collect' },
      };
      const score = scoreLabels[art.aiScore] || scoreLabels[''];

      const artEl = el('div', { class: 'tracked-article-item' });
      artEl.appendChild(el('div', { class: 'tracked-article-title', text: art.title }));
      if (art.summary) {
        artEl.appendChild(el('div', { class: 'tracked-article-summary', text: art.summary.slice(0, 80) + '...' }));
      }
      artEl.appendChild(el('div', { class: `ai-score ${score.cls}`, style: { marginTop: '4px', padding: '4px 8px' } },
        el('span', { class: 'ai-score-badge', text: score.label }),
        el('span', { text: art.aiReason || '' })
      ));

      const artActions = el('div', { class: 'tracked-article-actions' });
      if (art.url) {
        artActions.appendChild(el('button', { onclick: () => window.open(art.url, '_blank') }, '原文'));
      }
      artActions.appendChild(el('button', {
        onclick: () => {
          // 加入情报素材库
          Store.addIntelArticle({
            title: art.title,
            source: acc.name,
            url: art.url || '',
            content: art.summary || '',
            aiScore: art.aiScore || 'reference',
            aiReason: art.aiReason || '待AI评估',
          });
          showToast('已加入情报素材库', 'success');
        }
      }, '入库'));
      artActions.appendChild(el('button', {
        onclick: () => {
          switchTab('right', 'ai');
          const aiInput = $('.ai-input');
          if (aiInput) {
            aiInput.value = `请分析以下文章的写作亮点和宣传角度：\n标题：${art.title}\n来源：${acc.name}\n摘要：${art.summary || ''}`;
            showToast('已投喂到AI面板', 'info');
          }
        }
      }, '投喂AI'));
      artActions.appendChild(el('button', {
        onclick: () => Store.deleteTrackedArticle(acc.id, art.id)
      }, '删除'));
      artEl.appendChild(artActions);
      articleList.appendChild(artEl);
    });

    if (acc.articles.length > 5) {
      articleList.appendChild(el('div', {
        style: { textAlign: 'center', fontSize: '11px', color: 'var(--c-text-muted)', padding: '6px' },
        text: `共 ${acc.articles.length} 篇，显示前 5 篇`
      }));
    }
    card.appendChild(articleList);
  } else {
    card.appendChild(el('div', {
      class: 'empty-state',
      style: { padding: '16px' }
    },
      el('div', { class: 'empty-text', text: '暂无文章，点击「同步」或「手动」添加' })
    ));
  }

  // 手动添加区域（默认隐藏）
  const manualArea = el('div', { class: 'account-manual', style: { display: 'none' } });
  manualArea.appendChild(el('div', { class: 'form-label', text: '手动粘贴文章信息' }));
  const titleInput = el('input', { class: 'form-input', placeholder: '文章标题（输入链接后自动填充，也可手动修改）', style: { marginBottom: '6px' } });
  const urlInput = el('input', { class: 'form-input', placeholder: '文章链接（粘贴后自动抓取标题）', style: { marginBottom: '4px' } });
  const fetchStatus = el('div', { style: { fontSize: '11px', marginTop: '0', marginBottom: '6px', display: 'none' } });
  const summaryInput = el('textarea', { class: 'form-textarea', placeholder: '文章摘要 (可选)', style: { minHeight: '60px', marginBottom: '6px' } });

  // URL 自动抓取标题
  urlInput.addEventListener('blur', () => {
    const url = urlInput.value.trim();
    if (url && url.startsWith('http') && !titleInput.value.trim()) {
      fetchArticleTitle(url, titleInput, fetchStatus);
    }
  });
  urlInput.addEventListener('paste', () => {
    setTimeout(() => {
      const url = urlInput.value.trim();
      if (url && url.startsWith('http') && !titleInput.value.trim()) {
        fetchArticleTitle(url, titleInput, fetchStatus);
      }
    }, 100);
  });
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const url = urlInput.value.trim();
      if (url && url.startsWith('http') && !titleInput.value.trim()) {
        fetchArticleTitle(url, titleInput, fetchStatus);
      }
    }
  });

  manualArea.appendChild(urlInput);
  manualArea.appendChild(fetchStatus);
  manualArea.appendChild(titleInput);
  manualArea.appendChild(summaryInput);
  manualArea.appendChild(el('button', {
    class: 'btn-submit',
    style: { width: '100%', padding: '7px', fontSize: '12px' },
    onclick: () => {
      if (!titleInput.value.trim()) { showToast('请输入文章标题', 'warning'); return; }
      const article = {
        title: titleInput.value.trim(),
        url: urlInput.value.trim(),
        summary: summaryInput.value.trim(),
        pubDate: Date.now(),
      };
      const evalResult = Store.evaluateArticle(article);
      article.aiScore = evalResult.score;
      article.aiReason = evalResult.reason;
      Store.addTrackedArticle(acc.id, article);
      showToast('文章已添加', 'success');
      titleInput.value = '';
      urlInput.value = '';
      summaryInput.value = '';
    }
  }, '添加文章'));
  card.appendChild(manualArea);

  return card;
}

function articleCard(a) {
  const card = el('div', { class: 'article-card' });

  const scoreLabels = {
    priority: { label: '优先转发', cls: 'priority' },
    reference: { label: '备选参考', cls: 'reference' },
    collect: { label: '仅收藏', cls: 'collect' },
    skip: { label: '无需关注', cls: 'skip' },
  };
  const score = scoreLabels[a.aiScore] || scoreLabels.collect;

  card.appendChild(el('div', { class: 'article-card-header' },
    el('div', { class: 'article-title', text: a.title }),
    el('div', { class: 'article-source', text: a.source })
  ));

  card.appendChild(el('div', { class: `ai-score ${score.cls}` },
    el('span', { class: 'ai-score-badge', text: score.label }),
    el('span', { text: a.aiReason || '' })
  ));

  const actions = el('div', { class: 'article-actions' });
  actions.appendChild(el('button', {
    class: a.collected ? 'collected' : '',
    onclick: () => Store.toggleCollectArticle(a.id)
  }, a.collected ? '✓ 已收藏' : '收藏'));

  if (a.url) {
    actions.appendChild(el('button', { onclick: () => window.open(a.url, '_blank') }, '查看原文'));
  }

  actions.appendChild(el('button', {
    onclick: () => {
      // 投喂到AI
      switchTab('right', 'ai');
      const aiInput = $('.ai-input');
      if (aiInput) {
        aiInput.value = `请分析以下文章的写作亮点和宣传角度：\n标题：${a.title}\n来源：${a.source}`;
        showToast('已投喂到AI面板', 'info');
      }
    }
  }, '投喂AI'));

  actions.appendChild(el('button', { onclick: () => Store.deleteIntelArticle(a.id) }, '删除'));
  card.appendChild(actions);

  return card;
}

/* ============================================================
   热点收藏到学习素材库
   ============================================================ */
function openHotspotCollectModal(hotspot) {
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });

  // 预览热点信息
  const preview = el('div', { style: { padding: '12px', background: 'var(--c-bg-2)', borderRadius: 'var(--radius-md)', fontSize: '13px' } });
  preview.appendChild(el('div', { style: { fontWeight: '700', marginBottom: '4px' }, text: hotspot.title }));
  if (hotspot.summary && hotspot.summary !== hotspot.title) {
    preview.appendChild(el('div', { style: { color: 'var(--c-text-secondary)', fontSize: '12px' }, text: hotspot.summary }));
  }
  if (hotspot.link) {
    preview.appendChild(el('div', { style: { color: 'var(--c-primary)', fontSize: '11px', marginTop: '4px', wordBreak: 'break-all' }, text: '🔗 ' + hotspot.link }));
  }
  body.appendChild(preview);

  // 分类选择
  const cats = getStudyCategories().filter(c => c.id !== 'all');
  body.appendChild(el('label', { class: 'form-label', text: '选择分类' }));
  const catSelect = el('select', { class: 'form-input', style: { marginBottom: '8px' } });
  cats.forEach(c => {
    catSelect.appendChild(el('option', { value: c.id, text: c.name }));
  });
  body.appendChild(catSelect);

  // 笔记
  body.appendChild(el('label', { class: 'form-label', text: '补充笔记（可选）' }));
  const noteInput = el('textarea', {
    class: 'form-input',
    style: { minHeight: '60px', resize: 'vertical' },
    placeholder: '添加你的学习笔记或思考...'
  });
  body.appendChild(noteInput);

  // 确认按钮
  body.appendChild(el('button', {
    class: 'btn btn-primary',
    style: { marginTop: '4px' },
    onclick: () => {
      Store.collectHotspot(hotspot, catSelect.value, noteInput.value.trim());
      showToast('已收藏到学习素材库', 'success');
      closeModal();
    }
  }, '⭐ 确认收藏'));

  openModal('收藏到学习素材库');
  $('#modalBody').innerHTML = '';
  $('#modalBody').appendChild(body);
}

/* ============================================================
   动态分类管理
   ============================================================ */
const DEFAULT_TASK_TYPES = [
  { id: 'work', label: '工作任务' },
  { id: 'internal_meeting', label: '内部会议' },
  { id: 'external_meeting', label: '外部会议' },
  { id: 'personal_study', label: '个人学习' },
  { id: 'social', label: '社交娱乐' },
];

const DEFAULT_STUDY_CATEGORIES = [
  { id: 'writing', name: '宣传文稿写作' },
  { id: 'policy', name: '政企政策' },
  { id: 'english', name: '英语学习' },
  { id: 'culture', name: '文化建设案例' },
  { id: 'party', name: '党建素材' },
];

const DEFAULT_HOTSPOT_TAGS = [
  { label: '党建', color: '#dc2626' },
  { label: '科技', color: '#2563eb' },
  { label: '核聚变', color: '#0891b2' },
  { label: '文化', color: '#f59e0b' },
  { label: '政策', color: '#7c3aed' },
  { label: '其他', color: '#64748b' },
];

function getTaskTypes() {
  return [...DEFAULT_TASK_TYPES, ...(Store.data.customTaskTypes || [])];
}

function getStudyCategories() {
  return [
    { id: 'all', name: '全部' },
    ...DEFAULT_STUDY_CATEGORIES,
    ...(Store.data.customStudyCategories || [])
  ];
}

function getHotspotTags() {
  return [...DEFAULT_HOTSPOT_TAGS, ...(Store.data.customHotspotTags || [])];
}

/* ---------- 分类管理弹窗 ---------- */
function openCategoryManageModal() {
  const body = $('#modalBody');
  body.innerHTML = '';

  // 学习素材分类
  body.appendChild(el('div', { class: 'form-label', style: { marginTop: '8px' }, text: '学习素材分类' }));
  const studyCatWrap = el('div', { class: 'category-manage-bar' });
  getStudyCategories().filter(c => c.id !== 'all').forEach(c => {
    const isCustom = c.id.startsWith('custom_');
    const chip = el('div', { class: 'category-chip active' },
      c.name,
      isCustom ? el('span', {
        class: 'chip-delete',
        onclick: (e) => {
          e.stopPropagation();
          if (confirm('确定删除分类「' + c.name + '」？')) {
            Store.deleteStudyCategory(c.id);
            openCategoryManageModal();
          }
        }
      }, '×') : null
    );
    studyCatWrap.appendChild(chip);
  });
  const addStudyBtn = el('div', { class: 'category-add-btn', onclick: () => {
    const name = prompt('请输入新分类名称：');
    if (name && name.trim()) {
      Store.addStudyCategory(name.trim());
      openCategoryManageModal();
    }
  } }, '+ 添加分类');
  studyCatWrap.appendChild(addStudyBtn);
  body.appendChild(studyCatWrap);

  // 事项类型
  body.appendChild(el('div', { class: 'form-label', style: { marginTop: '16px' }, text: '事项类型' }));
  const taskTypeWrap = el('div', { class: 'category-manage-bar' });
  getTaskTypes().forEach(t => {
    const isCustom = t.id.startsWith('custom_');
    const chip = el('div', { class: 'category-chip active' },
      t.label,
      isCustom ? el('span', {
        class: 'chip-delete',
        onclick: (e) => {
          e.stopPropagation();
          if (confirm('确定删除类型「' + t.label + '」？')) {
            Store.deleteTaskType(t.id);
            openCategoryManageModal();
          }
        }
      }, '×') : null
    );
    taskTypeWrap.appendChild(chip);
  });
  const addTypeBtn = el('div', { class: 'category-add-btn', onclick: () => {
    const label = prompt('请输入新类型名称：');
    if (label && label.trim()) {
      Store.addTaskType(label.trim());
      openCategoryManageModal();
    }
  } }, '+ 添加类型');
  taskTypeWrap.appendChild(addTypeBtn);
  body.appendChild(taskTypeWrap);

  // 热点标签
  body.appendChild(el('div', { class: 'form-label', style: { marginTop: '16px' }, text: '热点标签' }));
  const hotspotWrap = el('div', { class: 'category-manage-bar' });
  getHotspotTags().forEach(t => {
    const isCustom = !DEFAULT_HOTSPOT_TAGS.some(d => d.label === t.label);
    const chip = el('div', { class: 'category-chip active', style: { background: t.color, color: '#fff', borderColor: t.color } },
      t.label,
      isCustom ? el('span', {
        class: 'chip-delete',
        style: { background: 'rgba(255,255,255,.3)' },
        onclick: (e) => {
          e.stopPropagation();
          if (confirm('确定删除标签「' + t.label + '」？')) {
            Store.deleteHotspotTag(t.label);
            openCategoryManageModal();
          }
        }
      }, '×') : null
    );
    hotspotWrap.appendChild(chip);
  });
  const addTagBtn = el('div', { class: 'category-add-btn', onclick: () => {
    const label = prompt('请输入新标签名称：');
    if (label && label.trim()) {
      const colors = ['#dc2626', '#2563eb', '#0891b2', '#f59e0b', '#7c3aed', '#64748b', '#059669', '#db2777'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      Store.addHotspotTag(label.trim(), color);
      openCategoryManageModal();
    }
  } }, '+ 添加标签');
  hotspotWrap.appendChild(addTagBtn);
  body.appendChild(hotspotWrap);

  body.appendChild(el('div', { class: 'form-actions', style: { marginTop: '16px' } },
    el('button', { class: 'btn-submit', onclick: closeModal }, '完成')
  ));

  openModal('分类管理');
}

/* ============================================================
   右侧：AI 控制面板
   ============================================================ */
const AI_MODELS = [
  { id: 'gpt4', name: 'GPT-4o' },
  { id: 'claude', name: 'Claude 3.5' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'qwen', name: '通义千问' },
];

const PROMPT_TEMPLATES = [
  { id: 'polish', name: '文稿润色', prompt: '请对以下宣传文稿进行润色，提升文采和规范性，保持原意不变，使语言更加精炼有力：\n\n' },
  { id: 'rewrite', name: '改写精简', prompt: '请将以下内容改写为更加精简的版本，保留核心信息，删除冗余表述：\n\n' },
  { id: 'wechat', name: '推文优化', prompt: '请优化以下公众号推文内容，提炼亮点，增强吸引力，适合移动端阅读：\n\n' },
  { id: 'hotspot', name: '热点解读', prompt: '请从宣传角度解读以下热点事件，挖掘可用的宣传角度和文化建设亮点：\n\n' },
  { id: 'photo', name: '照片配文', prompt: '请为以下活动照片创作宣传配文，要求简洁有力，突出活动主题和意义：\n\n' },
  { id: 'summary', name: '摘要提炼', prompt: '请提炼以下长篇材料的核心要点，生成简洁的摘要和重点汇总：\n\n' },
];

function renderAI(container) {
  const panel = el('div', { class: 'ai-panel' });
  const allTools = Store.data.aiTools || [];
  const aiTools = allTools.filter(t => t.type === 'ai');
  const webLinks = allTools.filter(t => t.type === 'web');

  // 说明 + 管理按钮
  const headerRow = el('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '14px' } });
  headerRow.appendChild(el('div', {
    style: { padding: '10px 12px', background: 'var(--c-primary-bg)', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--c-text-secondary)', lineHeight: '1.6', flex: '1' }
  },
    el('div', { style: { fontWeight: '700', color: 'var(--c-primary)', marginBottom: '4px' }, text: '🤖 AI 助手 & 快捷入口' }),
    '点击卡片快速跳转。支持网页地址和本地APP协议（如 feishu://、wemeet://）。'
  ));
  headerRow.appendChild(el('button', {
    class: 'btn-icon',
    style: { flexShrink: '0', marginTop: '4px' },
    title: '管理工具和网址',
    onclick: openAIToolManageModal
  }, svg('<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 16)));
  panel.appendChild(headerRow);

  // AI 工具卡片
  if (aiTools.length > 0) {
    panel.appendChild(el('div', {
      style: { fontSize: '11px', fontWeight: '700', color: 'var(--c-text-secondary)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }
    }, 'AI 助手'));
    const grid = el('div', { class: 'ai-platform-grid' });
    aiTools.forEach(p => grid.appendChild(aiToolCard(p)));
    panel.appendChild(grid);
  }

  // 常用网址
  if (webLinks.length > 0) {
    panel.appendChild(el('div', {
      style: { fontSize: '11px', fontWeight: '700', color: 'var(--c-text-secondary)', margin: '14px 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }
    }, '🔗 常用网址'));
    const webGrid = el('div', { class: 'ai-platform-grid' });
    webLinks.forEach(p => webGrid.appendChild(aiToolCard(p)));
    panel.appendChild(webGrid);
  }

  if (allTools.length === 0) {
    panel.appendChild(emptyState('暂无工具', '点击右上角 ⚙ 添加 AI 工具或常用网址'));
  }

  // 快速输入区 — 复制到剪贴板后跳转
  panel.appendChild(el('div', {
    style: { fontSize: '11px', fontWeight: '700', color: 'var(--c-text-secondary)', margin: '14px 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }
  }, '快速发送到 AI'));

  const inputWrap = el('div', { class: 'ai-input-wrap' });
  const input = el('textarea', {
    class: 'ai-input',
    placeholder: '输入要发给 AI 的内容（翻译、润色、改写等）...\n点击下方按钮会自动复制内容并打开 AI 网站',
  });
  inputWrap.appendChild(input);

  // AI 平台快速发送按钮（取前4个AI工具）
  const sendBar = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' } });
  aiTools.slice(0, 4).forEach(p => {
    sendBar.appendChild(el('button', {
      style: { padding: '5px 12px', fontSize: '12px', fontWeight: '600', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text-secondary)', transition: 'all .15s' },
      onmouseover: (e) => { e.target.style.borderColor = p.color; e.target.style.color = p.color; },
      onmouseout: (e) => { e.target.style.borderColor = 'var(--c-border)'; e.target.style.color = 'var(--c-text-secondary)'; },
      onclick: () => {
        const content = input.value.trim();
        if (content) {
          navigator.clipboard?.writeText(content).then(() => {
            showToast('内容已复制，正在打开 ' + p.name + '...', 'success');
          }).catch(() => {});
        }
        openToolUrl(p.url);
      }
    }, p.name));
  });
  inputWrap.appendChild(sendBar);
  panel.appendChild(inputWrap);

  // 历史记录
  if (Store.data.aiHistory.length > 0) {
    const histTitle = el('div', {
      style: { fontSize: '11px', fontWeight: '700', color: 'var(--c-text-secondary)', margin: '12px 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }
    }, '生成记录');
    panel.appendChild(histTitle);

    Store.data.aiHistory.slice(0, 5).forEach(h => {
      panel.appendChild(el('div', {
        style: { padding: '8px 10px', background: 'var(--c-surface-hover)', borderRadius: 'var(--radius-sm)', marginBottom: '4px', fontSize: '12px', cursor: 'pointer', border: '1px solid var(--c-border)' },
        onclick: () => {
          input.value = h.prompt;
        }
      },
        el('div', { style: { fontWeight: '600', marginBottom: '2px' }, text: h.prompt.slice(0, 40) + (h.prompt.length > 40 ? '...' : '') }),
        el('div', { style: { color: 'var(--c-text-muted)', fontSize: '11px' }, text: timeAgo(h.time) })
      ));
    });
  }

  container.appendChild(panel);
}

/* ---------- AI工具卡片 ---------- */
function aiToolCard(p) {
  const isProtocol = p.url && !p.url.startsWith('http');
  const card = el(isProtocol ? 'div' : 'a', {
    class: 'ai-platform-card',
    ...(isProtocol ? {} : { href: p.url, target: '_blank', rel: 'noopener noreferrer' }),
    onclick: isProtocol ? (e) => { e.preventDefault(); openToolUrl(p.url); } : undefined,
    style: { cursor: 'pointer' }
  },
    el('div', {
      class: 'ai-platform-icon',
      style: { background: p.color }
    }, p.icon),
    el('div', { class: 'ai-platform-name', text: p.name }),
    el('div', { class: 'ai-platform-desc', text: p.desc || (isProtocol ? '本地APP' : '网址') })
  );
  return card;
}

/* ---------- 打开工具URL（支持协议和网页） ---------- */
function openToolUrl(url) {
  if (!url) return;
  if (url.startsWith('http')) {
    window.open(url, '_blank');
  } else {
    // 本地APP协议（如 feishu://）
    window.location.href = url;
  }
}

/* ---------- AI工具管理弹窗 ---------- */
function openAIToolManageModal() {
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });

  body.appendChild(el('div', {
    style: { fontSize: '12px', color: 'var(--c-text-secondary)', lineHeight: '1.5' }
  },
    '添加、删除或编辑 AI 工具和常用网址。URL 可填网页地址（https://...）或本地APP协议（如 feishu://、wemeet://、dingtalk://）。'
  ));

  // 工具列表
  const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });

  function renderToolList() {
    list.innerHTML = '';
    const tools = Store.data.aiTools || [];
    if (tools.length === 0) {
      list.appendChild(el('div', { style: { textAlign: 'center', color: 'var(--c-text-muted)', padding: '20px', fontSize: '13px' }, text: '暂无工具，点击下方添加' }));
      return;
    }
    tools.forEach(t => {
      const item = el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', border: '1px solid var(--c-border-light)', borderRadius: 'var(--radius-md)' }
      });
      item.appendChild(el('div', {
        style: { width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', color: '#fff', fontSize: '14px', background: t.color, flexShrink: '0' },
        text: t.icon
      }));
      const info = el('div', { style: { flex: '1', minWidth: '0' } });
      info.appendChild(el('div', { style: { fontWeight: '600', fontSize: '13px' }, text: t.name + (t.type === 'ai' ? '' : ' 🔗') }));
      info.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--c-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: t.url }));
      item.appendChild(info);
      // 编辑
      item.appendChild(el('button', {
        class: 'btn-icon', title: '编辑',
        onclick: () => openAIToolEditModal(t)
      }, svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', 14)));
      // 删除
      item.appendChild(el('button', {
        class: 'btn-icon', title: '删除', style: { color: 'var(--c-danger)' },
        onclick: () => {
          if (confirm('确定删除「' + t.name + '」？')) {
            Store.deleteAITool(t.id);
            showToast('已删除', 'info');
            renderToolList();
          }
        }
      }, svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 14)));
      list.appendChild(item);
    });
  }
  renderToolList();
  body.appendChild(list);

  // 添加按钮
  body.appendChild(el('button', {
    class: 'btn btn-primary',
    style: { marginTop: '4px' },
    onclick: () => openAIToolEditModal(null, () => renderToolList())
  }, '+ 添加工具 / 网址'));

  body.appendChild(el('div', { class: 'form-actions', style: { marginTop: '8px' } },
    el('button', { class: 'btn-submit', onclick: closeModal }, '完成')
  ));

  openModal('管理 AI 工具 & 常用网址');
  $('#modalBody').innerHTML = '';
  $('#modalBody').appendChild(body);
}

/* ---------- AI工具编辑弹窗 ---------- */
function openAIToolEditModal(tool, onDone) {
  const isEdit = !!tool;
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });

  // 类型选择
  body.appendChild(el('label', { class: 'form-label', text: '类型' }));
  const typeSelect = el('select', { class: 'form-input' });
  typeSelect.appendChild(el('option', { value: 'ai', text: 'AI 助手' }));
  typeSelect.appendChild(el('option', { value: 'web', text: '常用网址' }));
  if (tool) typeSelect.value = tool.type || 'web';
  body.appendChild(typeSelect);

  // 名称
  body.appendChild(el('label', { class: 'form-label', text: '名称' }));
  const nameInput = el('input', { class: 'form-input', placeholder: '如：即梦、飞书、腾讯文档...', value: tool?.name || '' });
  body.appendChild(nameInput);

  // 描述
  body.appendChild(el('label', { class: 'form-label', text: '描述（可选）' }));
  const descInput = el('input', { class: 'form-input', placeholder: '简短描述', value: tool?.desc || '' });
  body.appendChild(descInput);

  // URL
  body.appendChild(el('label', { class: 'form-label', text: 'URL（网页地址或本地APP协议）' }));
  const urlInput = el('input', { class: 'form-input', placeholder: 'https://... 或 feishu://、wemeet://', value: tool?.url || '' });
  body.appendChild(urlInput);
  body.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--c-text-muted)', marginTop: '-4px' }, text: '常见协议：飞书 feishu:// | 企业微信 wxwork:// | 钉钉 dingtalk:// | 腾讯会议 wemeet://' }));

  // 图标文字
  body.appendChild(el('label', { class: 'form-label', text: '图标文字（1-2个字符）' }));
  const iconInput = el('input', { class: 'form-input', placeholder: '如：梦、飞、G', value: tool?.icon || '', maxlength: '2' });
  body.appendChild(iconInput);

  // 颜色
  body.appendChild(el('label', { class: 'form-label', text: '颜色' }));
  const colorInput = el('input', { type: 'color', class: 'form-input', style: { height: '40px', padding: '2px' }, value: tool?.color || '#6366f1' });
  body.appendChild(colorInput);

  // 保存按钮
  body.appendChild(el('button', {
    class: 'btn btn-primary',
    style: { marginTop: '8px' },
    onclick: () => {
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();
      if (!name || !url) {
        showToast('请填写名称和URL', 'warning');
        return;
      }
      const data = {
        name,
        desc: descInput.value.trim(),
        url,
        icon: iconInput.value.trim() || name.charAt(0).toUpperCase(),
        color: colorInput.value,
        type: typeSelect.value,
      };
      if (isEdit) {
        Store.updateAITool(tool.id, data);
        showToast('已更新', 'success');
      } else {
        Store.addAITool(data);
        showToast('已添加', 'success');
      }
      closeModal();
      if (onDone) onDone();
    }
  }, isEdit ? '保存修改' : '添加'));

  openModal(isEdit ? '编辑工具' : '添加工具 / 网址');
  $('#modalBody').innerHTML = '';
  $('#modalBody').appendChild(body);
}

/* ============================================================
   右侧：学习素材库
   ============================================================ */
const STUDY_CATEGORIES = DEFAULT_STUDY_CATEGORIES;

function renderStudyLib(container) {
  // 分类筛选 — 使用动态分类
  const catBar = el('div', { class: 'material-cat-bar' });
  const allCats = getStudyCategories();
  allCats.forEach(c => {
    catBar.appendChild(el('div', {
      class: `cat-chip ${state.selectedMaterialCat === c.id ? 'active' : ''}`,
      onclick: () => { state.selectedMaterialCat = c.id; renderPanel('right'); }
    }, c.name));
  });
  // 分类管理按钮
  catBar.appendChild(el('div', {
    class: 'cat-chip',
    style: { background: 'var(--c-surface-hover)', border: '1px dashed var(--c-border)', color: 'var(--c-text-muted)' },
    onclick: openCategoryManageModal
  }, '⚙ 管理分类'));
  container.appendChild(catBar);

  // 素材列表
  let materials = Store.data.studyMaterials;
  if (state.selectedMaterialCat !== 'all') {
    materials = materials.filter(m => m.category === state.selectedMaterialCat);
  }

  if (materials.length === 0) {
    container.appendChild(emptyState('暂无素材', '点击右上角 + 添加学习素材'));
    return;
  }

  materials.forEach(m => {
    const iconMap = { link: '🔗', file: '📄', note: '📝', doc: '📄' };
    const statusMap = { pending: { label: '待学习', cls: 'pending' }, done: { label: '已学完', cls: 'done' }, star: { label: '重点收藏', cls: 'star' } };
    const status = statusMap[m.status] || statusMap.pending;

    const item = el('div', { class: 'material-item' });
    item.appendChild(el('div', { class: `material-icon ${m.type || 'link'}`, text: iconMap[m.type] || '🔗' }));

    const info = el('div', { class: 'material-info' });
    info.appendChild(el('div', { class: 'material-title', text: m.title }));

    const metaParts = [
      el('span', { class: `material-status ${status.cls}`, text: status.label }),
      el('span', { text: formatDateLabel(new Date(m.createdAt).toISOString()) }),
    ];
    // 文件类型显示文件大小
    if (m.type === 'file' && m.fileName) {
      const sizeStr = m.fileSize > 1024 * 1024 ? `${(m.fileSize / 1024 / 1024).toFixed(1)} MB` : `${(m.fileSize / 1024).toFixed(0)} KB`;
      metaParts.push(el('span', { style: { color: 'var(--c-text-muted)' }, text: `📎 ${m.fileName} (${sizeStr})` }));
    }
    info.appendChild(el('div', { class: 'material-meta' }, ...metaParts));

    if (m.note) {
      info.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--c-text-secondary)', marginTop: '4px' }, text: '📝 ' + m.note }));
    }

    item.appendChild(info);

    // 操作
    const actions = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } });
    if (m.url) {
      actions.appendChild(el('button', {
        class: 'btn-icon', title: '打开链接',
        onclick: () => window.open(m.url, '_blank')
      }, svg('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', 14)));
    }
    // 本地文件下载/预览
    if (m.type === 'file' && m.dataUrl) {
      actions.appendChild(el('button', {
        class: 'btn-icon', title: '下载文件',
        onclick: () => {
          const a = document.createElement('a');
          a.href = m.dataUrl;
          a.download = m.fileName || m.title;
          a.click();
        }
      }, svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>', 14)));
    }
    // 文字笔记查看
    if (m.type === 'note' && m.note) {
      actions.appendChild(el('button', {
        class: 'btn-icon', title: '查看笔记',
        onclick: () => {
          alert(`${m.title}\n\n${m.note}`);
        }
      }, svg('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>', 14)));
    }
    // 切换状态
    const nextStatus = m.status === 'pending' ? 'done' : m.status === 'done' ? 'star' : 'pending';
    actions.appendChild(el('button', {
      class: 'btn-icon', title: '切换状态',
      onclick: () => Store.updateStudyMaterial(m.id, { status: nextStatus })
    }, svg('<path d="M20 6 9 17l-5-5"/>', 14)));
    actions.appendChild(el('button', {
      class: 'btn-icon', title: '删除',
      onclick: () => Store.deleteStudyMaterial(m.id)
    }, svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 14)));

    item.appendChild(actions);
    container.appendChild(item);
  });
}

/* ============================================================
   底部：工作素材库
   ============================================================ */
function renderWorklib(container) {
  const grid = el('div', { class: 'worklib-grid' });

  // 文稿方案库
  const docs = Store.data.workMaterials.documents;
  grid.appendChild(worklibCard('文稿方案库', '📄', docs, 'documents', [
    { label: '进行中', count: docs.filter(d => d.status === 'editing').length },
    { label: '已归档', count: docs.filter(d => d.status === 'archived').length },
  ]));

  // 照片素材库
  const photos = Store.data.workMaterials.photos;
  grid.appendChild(worklibCard('照片素材库', '📷', photos, 'photos', [
    { label: '待筛选', count: photos.filter(p => p.status === 'pending').length },
    { label: '已整理', count: photos.filter(p => p.status === 'organized').length },
  ]));

  // 临时素材区
  const temp = Store.data.workMaterials.temp;
  grid.appendChild(worklibCard('临时素材区', '📎', temp, 'temp', [
    { label: '待处理', count: temp.filter(t => t.status === 'new').length },
  ]));

  // 本地文件夹链接
  const folders = Store.data.workMaterials.localFolders || [];
  const folderCard = el('div', { class: 'worklib-card local-folder-card' });
  folderCard.appendChild(el('div', { class: 'worklib-card-header' },
    el('span', { class: 'worklib-card-icon', text: '📁' }),
    el('span', { class: 'worklib-card-title', text: '本地文件夹' }),
    el('button', {
      class: 'btn-icon',
      style: { width: '22px', height: '22px', marginLeft: 'auto' },
      title: '添加文件夹',
      onclick: (e) => { e.stopPropagation(); openAddFolderModal(); }
    }, svg('<path d="M12 5v14M5 12h14"/>', 14))
  ));
  folderCard.appendChild(el('div', { class: 'worklib-card-count', text: `共 ${folders.length} 个文件夹` }));

  if (folders.length > 0) {
    const folderList = el('div', { class: 'folder-list' });
    folders.forEach(f => {
      const item = el('div', { class: 'folder-item' });
      item.appendChild(el('span', { class: 'folder-icon', text: '📂' }));
      item.appendChild(el('div', { class: 'folder-info' },
        el('div', { class: 'folder-name', text: f.name }),
        el('div', { class: 'folder-path', text: f.path })
      ));
      item.appendChild(el('div', { class: 'folder-actions' },
        el('button', {
          class: 'btn-icon',
          title: '打开文件夹',
          onclick: (e) => { e.stopPropagation(); openLocalFolder(f.path); }
        }, svg('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', 12)),
        el('button', {
          class: 'btn-icon',
          title: '浏览文件',
          onclick: (e) => { e.stopPropagation(); browseLocalFolder(); }
        }, svg('<path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/>', 12)),
        el('button', {
          class: 'btn-icon',
          title: '删除',
          onclick: (e) => { e.stopPropagation(); Store.deleteLocalFolder(f.id); }
        }, svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 12))
      ));
      folderList.appendChild(item);
    });
    folderCard.appendChild(folderList);
  } else {
    folderCard.appendChild(el('div', {
      class: 'empty-state',
      style: { padding: '12px' }
    }, el('div', { class: 'empty-hint', text: '点击 + 添加本地文件夹路径' })));
  }

  grid.appendChild(folderCard);

  // 本地文件链接
  const files = Store.data.workMaterials.localFiles || [];
  const fileCard = el('div', { class: 'worklib-card local-folder-card' });
  fileCard.appendChild(el('div', { class: 'worklib-card-header' },
    el('span', { class: 'worklib-card-icon', text: '📄' }),
    el('span', { class: 'worklib-card-title', text: '本地文件' }),
    el('button', {
      class: 'btn-icon',
      style: { width: '22px', height: '22px', marginLeft: 'auto' },
      title: '添加文件',
      onclick: (e) => { e.stopPropagation(); openAddLocalFileModal(); }
    }, svg('<path d="M12 5v14M5 12h14"/>', 14))
  ));
  fileCard.appendChild(el('div', { class: 'worklib-card-count', text: `共 ${files.length} 个文件` }));

  if (files.length > 0) {
    const fileList = el('div', { class: 'folder-list' });
    files.forEach(f => {
      const item = el('div', { class: 'folder-item' });
      item.appendChild(el('span', { class: 'folder-icon', text: '📋' }));
      item.appendChild(el('div', { class: 'folder-info' },
        el('div', { class: 'folder-name', text: f.name }),
        el('div', { class: 'folder-path', text: f.path })
      ));
      item.appendChild(el('div', { class: 'folder-actions' },
        el('button', {
          class: 'btn-icon',
          title: '打开文件',
          onclick: (e) => { e.stopPropagation(); openLocalFile(f.path); }
        }, svg('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', 12)),
        el('button', {
          class: 'btn-icon',
          title: '删除',
          onclick: (e) => { e.stopPropagation(); Store.deleteLocalFile(f.id); }
        }, svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 12))
      ));
      fileList.appendChild(item);
    });
    fileCard.appendChild(fileList);
  } else {
    fileCard.appendChild(el('div', {
      class: 'empty-state',
      style: { padding: '12px' }
    }, el('div', { class: 'empty-hint', text: '点击 + 添加本地文件路径' })));
  }

  grid.appendChild(fileCard);
  container.appendChild(grid);
}

/* ---------- 本地文件操作 ---------- */
function openLocalFile(path) {
  const fileUrl = 'file:///' + path.replace(/\\/g, '/');
  try {
    window.open(fileUrl, '_blank');
  } catch (e) {
    showToast('无法直接打开文件，路径已复制', 'info');
  }
  navigator.clipboard?.writeText(path).then(() => {
    showToast('文件路径已复制：' + path, 'info');
  }).catch(() => {});
}

function openAddLocalFileModal() {
  const body = $('#modalBody');
  body.innerHTML = '';

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '文件名称' }),
    el('input', { class: 'form-input', id: 'localFileName', placeholder: '如：三季度工作总结.docx' })
  ));

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '文件完整路径' }),
    el('input', { class: 'form-input', id: 'localFilePath', placeholder: '如：D:\\Work\\Documents\\三季度工作总结.docx' })
  ));

  body.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--c-text-muted)', padding: '8px 10px', background: 'var(--c-surface-hover)', borderRadius: 'var(--radius-sm)', marginBottom: '12px' } },
    '💡 提示：输入文件的完整路径（如 D:\\Work\\file.docx），点击"打开"按钮会尝试通过浏览器打开。如被拦截，路径会自动复制到剪贴板，粘贴到资源管理器地址栏即可打开。'
  ));

  body.appendChild(el('div', { class: 'form-actions' },
    el('button', { class: 'btn-cancel', onclick: closeModal }, '取消'),
    el('button', {
      class: 'btn-submit',
      onclick: () => {
        const name = $('#localFileName').value.trim();
        const path = $('#localFilePath').value.trim();
        if (!name || !path) { showToast('请填写名称和路径', 'warning'); return; }
        Store.addLocalFile({ name, path });
        closeModal();
        showToast('文件已添加', 'success');
      }
    }, '添加')
  ));

  openModal('添加本地文件');
}
function openLocalFolder(path) {
  // 尝试通过 file:// 协议打开
  const fileUrl = 'file:///' + path.replace(/\\/g, '/');
  try {
    window.open(fileUrl, '_blank');
  } catch (e) {
    showToast('无法直接打开文件夹，请复制路径到资源管理器：' + path, 'info');
  }
  // 同时复制路径到剪贴板
  navigator.clipboard?.writeText(path).then(() => {
    showToast('文件夹路径已复制：' + path, 'info');
  }).catch(() => {});
}

async function browseLocalFolder() {
  // 使用 File System Access API（Chrome/Edge 支持）
  if (window.showDirectoryPicker) {
    try {
      const dirHandle = await window.showDirectoryPicker();
      showToast('已选择文件夹：' + dirHandle.name, 'success');
      // 列出文件
      const files = [];
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          files.push(entry.name);
        }
      }
      if (files.length > 0) {
        showToast(`文件夹中有 ${files.length} 个文件`, 'success');
        // 在弹窗中显示文件列表
        openFolderBrowseModal(dirHandle.name, files);
      } else {
        showToast('文件夹为空', 'info');
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        showToast('浏览文件夹失败：' + e.message, 'warning');
      }
    }
  } else {
    showToast('当前浏览器不支持文件浏览，请使用 Chrome 或 Edge 浏览器', 'warning');
  }
}

function openFolderBrowseModal(folderName, files) {
  const body = $('#modalBody');
  body.innerHTML = '';
  body.appendChild(el('div', { class: 'form-label', text: `📁 ${folderName}（${files.length} 个文件）` }));
  const list = el('div', { class: 'folder-browse-list' });
  files.slice(0, 50).forEach(f => {
    list.appendChild(el('div', { class: 'folder-browse-item', text: f }));
  });
  if (files.length > 50) {
    list.appendChild(el('div', { style: { textAlign: 'center', padding: '8px', color: 'var(--c-text-muted)', fontSize: '12px' }, text: `...还有 ${files.length - 50} 个文件` }));
  }
  body.appendChild(list);
  body.appendChild(el('div', { class: 'form-actions' },
    el('button', { class: 'btn-cancel', onclick: closeModal }, '关闭')
  ));
  openModal('浏览文件 - ' + folderName);
}

function openAddFolderModal() {
  const body = $('#modalBody');
  body.innerHTML = '';

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '文件夹名称' }),
    el('input', { class: 'form-input', id: 'folderName', placeholder: '如：文稿方案文件夹' })
  ));

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '文件夹路径' }),
    el('input', { class: 'form-input', id: 'folderPath', placeholder: '如：D:\\Work\\Documents' })
  ));

  body.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--c-text-muted)', padding: '8px 10px', background: 'var(--c-surface-hover)', borderRadius: 'var(--radius-sm)', marginBottom: '12px' } },
    '💡 提示：点击文件夹的"打开"按钮会尝试通过浏览器打开（file://协议）。如被浏览器拦截，路径会自动复制到剪贴板，粘贴到资源管理器地址栏即可打开。Chrome/Edge 用户可点击"浏览"按钮直接选择文件夹查看文件列表。'
  ));

  body.appendChild(el('div', { class: 'form-actions' },
    el('button', { class: 'btn-cancel', onclick: closeModal }, '取消'),
    el('button', {
      class: 'btn-submit',
      onclick: () => {
        const name = $('#folderName').value.trim();
        const path = $('#folderPath').value.trim();
        if (!name || !path) { showToast('请填写名称和路径', 'warning'); return; }
        Store.addLocalFolder({ name, path });
        closeModal();
        showToast('文件夹已添加', 'success');
      }
    }, '添加')
  ));

  openModal('添加本地文件夹');
}

function openAddCloudUrlModal(category, itemId, libTitle) {
  const body = $('#modalBody');
  body.innerHTML = '';

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '网盘链接' }),
    el('input', { class: 'form-input', id: 'cloudUrlInput', placeholder: '如：https://pan.baidu.com/s/xxxxx' })
  ));

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '备注（可选）' }),
    el('input', { class: 'form-input', id: 'cloudNoteInput', placeholder: '如：提取码: abcd' })
  ));

  body.appendChild(el('div', { class: 'form-actions' },
    el('button', { class: 'btn-cancel', onclick: () => openWorklibModal(category, libTitle) }, '返回'),
    el('button', {
      class: 'btn-submit',
      onclick: () => {
        const url = $('#cloudUrlInput').value.trim();
        if (!url) { showToast('请输入链接', 'warning'); return; }
        const note = $('#cloudNoteInput').value.trim();
        const item = Store.data.workMaterials[category].find(m => m.id === itemId);
        if (item) {
          item.cloudUrl = url;
          if (note) item.note = note;
          Store.save();
          Store.emit();
        }
        openWorklibModal(category, libTitle);
        showToast('链接已添加', 'success');
      }
    }, '保存')
  ));

  openModal('添加网盘链接');
}

function worklibCard(title, icon, items, category, stats) {
  const card = el('div', { class: 'worklib-card', onclick: () => openWorklibModal(category, title) });
  card.appendChild(el('div', { class: 'worklib-card-header' },
    el('span', { class: 'worklib-card-icon', text: icon }),
    el('span', { class: 'worklib-card-title', text: title })
  ));
  card.appendChild(el('div', { class: 'worklib-card-count', text: `共 ${items.length} 项` }));

  // 统计
  const statsRow = el('div', { style: { display: 'flex', gap: '8px', marginTop: '6px' } });
  stats.forEach(s => {
    statsRow.appendChild(el('span', {
      style: { fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'var(--c-surface-hover)', color: 'var(--c-text-secondary)' }
    }, `${s.label}: ${s.count}`));
  });
  card.appendChild(statsRow);

  // 预览
  if (items.length > 0) {
    const preview = el('div', { class: 'worklib-items-preview' });
    items.slice(0, 3).forEach(item => {
      const icons = [];
      if (item.cloudUrl) icons.push('☁');
      if (item.dataUrl) icons.push('📎');
      const previewText = '• ' + item.title + (icons.length ? ' ' + icons.join('') : '');
      preview.appendChild(el('div', { class: 'worklib-item-preview', text: previewText }));
    });
    if (items.length > 3) {
      preview.appendChild(el('div', { class: 'worklib-item-preview', text: `...还有 ${items.length - 3} 项`, style: { color: 'var(--c-text-muted)' } }));
    }
    card.appendChild(preview);
  } else {
    card.appendChild(el('div', { class: 'worklib-items-preview' },
      el('div', { class: 'worklib-item-preview', style: { color: 'var(--c-text-muted)', fontStyle: 'italic' }, text: '点击进入添加素材' })
    ));
  }

  return card;
}

function openWorklibModal(category, title) {
  const items = Store.data.workMaterials[category] || [];
  const body = $('#modalBody');
  body.innerHTML = '';

  // 新增素材区
  const addSection = el('div', { style: { borderBottom: '2px solid var(--c-border)', paddingBottom: '16px', marginBottom: '16px' } });
  addSection.appendChild(el('div', { class: 'form-label', style: { fontSize: '14px', fontWeight: '700', color: 'var(--c-text)' }, text: '➕ 新增素材' }));

  addSection.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '素材名称 *' }),
    el('input', { class: 'form-input', id: 'wlName', placeholder: '输入素材名称...' })
  ));

  // 照片素材额外支持日期
  if (category === 'photos') {
    addSection.appendChild(el('div', { class: 'form-group' },
      el('label', { class: 'form-label', text: '日期' }),
      (() => { const i = el('input', { class: 'form-input', type: 'date', id: 'wlDate' }); i.value = formatDate(new Date()); return i; })()
    ));
  }

  // 网盘链接
  addSection.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '网盘链接（百度网盘、阿里云盘等）' }),
    el('input', { class: 'form-input', id: 'wlCloudUrl', placeholder: '如：https://pan.baidu.com/s/xxxxx' })
  ));

  // 本地文件上传
  addSection.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '上传本地文件（可选，≤2MB）' }),
    (() => {
      const wrap = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } });
      const fileInput = el('input', { type: 'file', id: 'wlFile', style: { fontSize: '12px', flex: '1' } });
      const fileNameSpan = el('span', { id: 'wlFileName', style: { fontSize: '11px', color: 'var(--c-text-muted)' } });
      fileInput.addEventListener('change', () => {
        const f = fileInput.files[0];
        if (f) {
          if (f.size > 2 * 1024 * 1024) {
            showToast('文件超过2MB，建议使用网盘链接', 'warning');
            fileInput.value = '';
            fileNameSpan.textContent = '';
            return;
          }
          fileNameSpan.textContent = `📎 ${f.name} (${(f.size / 1024).toFixed(0)}KB)`;
        }
      });
      wrap.appendChild(fileInput);
      wrap.appendChild(fileNameSpan);
      return wrap;
    })()
  ));

  // 备注
  addSection.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '备注（可选）' }),
    el('input', { class: 'form-input', id: 'wlNote', placeholder: '如：提取码: abcd' })
  ));

  addSection.appendChild(el('div', { class: 'form-actions' },
    el('button', { class: 'btn-cancel', onclick: closeModal }, '取消'),
    el('button', {
      class: 'btn-submit',
      onclick: () => {
        const name = $('#wlName').value.trim();
        if (!name) { showToast('请输入素材名称', 'warning'); return; }
        const cloudUrl = $('#wlCloudUrl') ? $('#wlCloudUrl').value.trim() : '';
        const note = $('#wlNote') ? $('#wlNote').value.trim() : '';
        const date = $('#wlDate') ? $('#wlDate').value : '';
        const statusOptions = { documents: 'editing', photos: 'pending', temp: 'new' };
        const material = {
          title: name,
          status: statusOptions[category],
          type: category === 'photos' ? 'photo' : 'document',
          cloudUrl,
          note,
        };
        if (date) material.date = date;

        // 处理文件上传
        const fileInput = $('#wlFile');
        if (fileInput && fileInput.files[0]) {
          const f = fileInput.files[0];
          const reader = new FileReader();
          reader.onload = () => {
            material.fileName = f.name;
            material.fileSize = f.size;
            material.dataUrl = reader.result;
            Store.addWorkMaterial(category, material);
            openWorklibModal(category, title);
            showToast('素材已添加（含文件）', 'success');
          };
          reader.readAsDataURL(f);
        } else {
          Store.addWorkMaterial(category, material);
          openWorklibModal(category, title);
          showToast('已添加', 'success');
        }
      }
    }, '添加')
  ));

  body.appendChild(addSection);

  // 已有素材列表
  const listSection = el('div', {});
  listSection.appendChild(el('div', { class: 'form-label', style: { fontSize: '14px', fontWeight: '700', color: 'var(--c-text)', marginBottom: '10px' }, text: `📋 已有素材 (${items.length})` }));

  if (items.length === 0) {
    listSection.appendChild(el('div', { class: 'empty-state', style: { padding: '20px' } },
      el('div', { class: 'empty-text', text: '暂无素材，请在上方添加' })
    ));
  }

  items.forEach(item => {
    const statusLabels = { editing: '进行中', archived: '已归档', pending: '待筛选', organized: '已整理', new: '待处理' };
    const itemDiv = el('div', {
      style: { padding: '12px', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-md)', marginBottom: '8px', background: 'var(--c-surface-hover)' }
    });

    // 标题行
    const titleRow = el('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' } });

    const titleInfo = el('div', { style: { flex: '1', minWidth: '0' } },
      el('div', { style: { fontSize: '14px', fontWeight: '600', color: 'var(--c-text)' }, text: item.title }),
      el('div', { style: { fontSize: '11px', color: 'var(--c-text-muted)', marginTop: '3px' } },
        `${statusLabels[item.status] || item.status} · ${item.date ? formatDateLabel(item.date) : formatDateLabel(new Date(item.createdAt).toISOString())}`
      )
    );

    const actionBtns = el('div', { style: { display: 'flex', gap: '6px', flexShrink: '0' } });

    // 网盘链接按钮
    if (item.cloudUrl) {
      actionBtns.appendChild(el('a', {
        class: 'btn-icon',
        href: item.cloudUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: '打开网盘链接',
        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }
      }, el('span', { style: { fontSize: '11px', fontWeight: '600' }, text: '☁ 网盘' })));
    }
    // 本地文件下载
    if (item.dataUrl) {
      actionBtns.appendChild(el('button', {
        class: 'btn-icon', title: '下载文件',
        onclick: () => {
          const a = document.createElement('a');
          a.href = item.dataUrl;
          a.download = item.fileName || item.title;
          a.click();
        }
      }, el('span', { style: { fontSize: '11px' }, text: '📥 下载' })));
    }
    // 添加网盘链接（如果还没有）
    if (!item.cloudUrl) {
      actionBtns.appendChild(el('button', {
        class: 'btn-icon', title: '添加网盘链接',
        onclick: () => openAddCloudUrlModal(category, item.id, title)
      }, el('span', { style: { fontSize: '11px' }, text: '🔗 添加链接' })));
    }
    // 切换状态
    actionBtns.appendChild(el('button', {
      class: 'btn-icon', title: '切换状态',
      onclick: () => {
        const statuses = category === 'documents' ? ['editing', 'archived'] : category === 'photos' ? ['pending', 'organized'] : ['new', 'archived'];
        const idx = statuses.indexOf(item.status);
        const next = statuses[(idx + 1) % statuses.length];
        Store.data.workMaterials[category].find(m => m.id === item.id).status = next;
        Store.save();
        Store.emit();
        openWorklibModal(category, title);
      }
    }, svg('<path d="M20 6 9 17l-5-5"/>', 14)));
    // 删除
    actionBtns.appendChild(el('button', {
      class: 'btn-icon', title: '删除',
      onclick: () => { Store.deleteWorkMaterial(category, item.id); openWorklibModal(category, title); }
    }, svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 14)));

    titleRow.appendChild(titleInfo);
    titleRow.appendChild(actionBtns);
    itemDiv.appendChild(titleRow);

    // 网盘链接显示
    if (item.cloudUrl) {
      itemDiv.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--c-primary)', marginTop: '6px', wordBreak: 'break-all' }, text: '☁ ' + item.cloudUrl }));
    }
    // 文件信息
    if (item.fileName) {
      const sizeStr = item.fileSize > 1024 * 1024 ? `${(item.fileSize / 1024 / 1024).toFixed(1)}MB` : `${(item.fileSize / 1024).toFixed(0)}KB`;
      itemDiv.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--c-text-muted)', marginTop: '4px' }, text: `📎 ${item.fileName} (${sizeStr})` }));
    }
    // 备注
    if (item.note) {
      itemDiv.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--c-text-secondary)', marginTop: '6px', padding: '4px 8px', background: 'var(--c-surface)', borderRadius: 'var(--radius-sm)' }, text: '📝 ' + item.note }));
    }

    listSection.appendChild(itemDiv);
  });

  body.appendChild(listSection);

  // 使用大弹窗
  openModal(title, true);
}

/* ============================================================
   底部：每日复盘
   ============================================================ */
function renderReview(container) {
  const today = formatDate(new Date());
  let review = Store.getReview(today);

  const wrap = el('div', { class: 'review-container' });

  // 头部
  const header = el('div', { class: 'review-header' });
  header.appendChild(el('div', { class: 'review-date', text: formatDateLabel(today) + ' 复盘' }));

  const headerActions = el('div', { style: { display: 'flex', gap: '6px' } });
  headerActions.appendChild(el('button', {
    style: { padding: '5px 12px', fontSize: '12px', fontWeight: '600', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', color: 'var(--c-text-secondary)' },
    onclick: () => {
      const content = Store.generateReview(today);
      Store.saveReview(today, content, true);
      renderPanel('bottom');
      showToast('已重新生成', 'info');
    }
  }, '重新生成'));
  header.appendChild(headerActions);
  wrap.appendChild(header);

  if (!review) {
    review = { content: Store.generateReview(today), auto: true, edited: false };
    Store.saveReview(today, review.content, true);
  }

  // 解析并渲染复盘内容
  const sections = review.content.split(/^## /m).filter(s => s.trim());
  sections.forEach(section => {
    const lines = section.trim().split('\n');
    const title = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();

    const sec = el('div', { class: 'review-section' });
    sec.appendChild(el('div', { class: 'review-section-title', text: title }));

    const content = el('div', { class: 'review-section-content' });
    // 简单渲染列表
    const items = body.split('\n').filter(l => l.trim());
    if (items.some(i => i.startsWith('- '))) {
      const ul = el('ul');
      items.forEach(i => {
        if (i.startsWith('- ')) ul.appendChild(el('li', { text: i.slice(2) }));
        else if (i.trim()) ul.appendChild(el('li', { text: i.trim() }));
      });
      content.appendChild(ul);
    } else {
      items.forEach(i => {
        if (i.trim()) content.appendChild(el('div', { style: { marginBottom: '4px' }, text: i }));
      });
    }
    sec.appendChild(content);
    wrap.appendChild(sec);
  });

  // 操作按钮
  const actions = el('div', { class: 'review-actions' });
  actions.appendChild(el('button', {
    class: 'primary',
    onclick: () => {
      navigator.clipboard.writeText(review.content).then(() => showToast('已复制复盘内容，可粘贴为工作日报', 'success'));
    }
  }, '复制为日报'));
  actions.appendChild(el('button', {
    onclick: () => openEditReviewModal(today, review.content)
  }, '编辑内容'));
  wrap.appendChild(actions);

  container.appendChild(wrap);
}

function openEditReviewModal(date, content) {
  const body = $('#modalBody');
  body.innerHTML = '';

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '编辑复盘内容' }),
    (() => {
      const ta = el('textarea', { class: 'form-textarea', style: { minHeight: '300px', fontFamily: 'var(--font)', fontSize: '13px', lineHeight: '1.6' } });
      ta.value = content;
      return ta;
    })()
  ));

  body.appendChild(el('div', { class: 'form-actions' },
    el('button', { class: 'btn-cancel', onclick: closeModal }, '取消'),
    el('button', {
      class: 'btn-submit',
      onclick: () => {
        const ta = body.querySelector('textarea');
        Store.saveReview(date, ta.value, false);
        closeModal();
        renderPanel('bottom');
        showToast('复盘已保存', 'success');
      }
    }, '保存')
  ));

  openModal('编辑复盘 - ' + formatDateLabel(date));
}

/* ============================================================
   弹窗系统
   ============================================================ */
function openModal(title, large) {
  $('#modalTitle').textContent = title;
  const modal = document.querySelector('.modal');
  if (modal) {
    if (large) modal.classList.add('modal-lg');
    else modal.classList.remove('modal-lg');
  }
  $('#modalOverlay').classList.add('show');
}

function closeModal() {
  $('#modalOverlay').classList.remove('show');
}

/* ---------- 快捷录入弹窗 ---------- */

/* 智能解析粘贴文本 — 本地AI规则引擎 */
function parseSmartInput(text) {
  const result = {
    title: '',
    type: 'work',
    priority: 'medium',
    deadline: '',
    startDate: '',
    reminderMinutes: [],
    material: '',
    rawText: text,
  };

  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length === 0) return result;

  // 提取标题：取第一行有意义的文字
  result.title = lines[0].trim().slice(0, 60);

  const fullText = text.toLowerCase();

  // ===== 类型识别 =====
  if (/外部|合作|来访|交流|对接|拜访|视频会议|电话会议/.test(fullText)) {
    result.type = 'external_meeting';
  } else if (/会议|开会|座谈|讨论|例会|碰头|汇报会|推进会|部署会/.test(fullText)) {
    result.type = 'internal_meeting';
  } else if (/学习|阅读|精读|打卡|背单词|听力|口语/.test(fullText)) {
    result.type = 'personal_study';
  } else if (/聚餐|娱乐|看电影|运动|健身|聚会|约会/.test(fullText)) {
    result.type = 'social';
  } else {
    result.type = 'work';
  }

  // ===== 优先级识别 =====
  if (/紧急|加急|尽快|马上|立即|重要|务必|领导交办|抓紧/.test(fullText)) {
    result.priority = 'high';
  } else if (/一般|普通|有空|方便时|不急/.test(fullText)) {
    result.priority = 'low';
  } else {
    result.priority = 'medium';
  }

  // ===== 截止时间识别 =====
  const now = new Date();
  let targetDate = new Date(now);
  let timeStr = '18:00';
  let foundDate = false;

  // 相对日期
  if (/今天|今日|today/.test(fullText)) {
    foundDate = true;
  } else if (/明天|明日|tomorrow/.test(fullText)) {
    targetDate = addDays(now, 1);
    foundDate = true;
  } else if (/后天/.test(fullText)) {
    targetDate = addDays(now, 2);
    foundDate = true;
  } else if (/大后天/.test(fullText)) {
    targetDate = addDays(now, 3);
    foundDate = true;
  } else if (/下周[一二三四五六日天]/.test(fullText)) {
    const dayMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
    const match = fullText.match(/下周([一二三四五六日天])/);
    if (match) {
      const targetDay = dayMap[match[1]];
      const currentDay = now.getDay() || 7;
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      targetDate = addDays(now, diff);
      foundDate = true;
    }
  } else if (/本周[一二三四五六日天]/.test(fullText)) {
    const dayMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
    const match = fullText.match(/本周([一二三四五六日天])/);
    if (match) {
      const targetDay = dayMap[match[1]];
      const currentDay = now.getDay() || 7;
      let diff = targetDay - currentDay;
      if (diff < 0) diff += 7;
      targetDate = addDays(now, diff);
      foundDate = true;
    }
  }

  // 绝对日期：X月X日 / X月X号
  const dateMatch = text.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1]) - 1;
    const day = parseInt(dateMatch[2]);
    targetDate = new Date(now.getFullYear(), month, day);
    if (targetDate < now) targetDate.setFullYear(now.getFullYear() + 1);
    foundDate = true;
  }

  // 时间识别：X点 / X:XX / 上午X点 / 下午X点
  const timeMatch = text.match(/(上午|下午)?\s*(\d{1,2})[:点](\d{0,2})/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[2]);
    const minute = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
    if (timeMatch[1] === '下午' && hour < 12) hour += 12;
    if (!timeMatch[1] && hour < 8) hour += 12; // 默认下午
    timeStr = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  } else if (/上午|早上|早晨/.test(fullText)) {
    timeStr = '09:00';
  } else if (/下午/.test(fullText)) {
    timeStr = '14:00';
  } else if (/下班前|下班/.test(fullText)) {
    timeStr = '17:30';
  }

  if (foundDate || dateMatch) {
    result.deadline = formatDate(targetDate) + 'T' + timeStr;
  } else {
    // 默认今天
    result.deadline = formatDate(now) + 'T' + timeStr;
  }

  // ===== 开始时间识别（长期任务）=====
  // 识别 "从X开始" "X起" "X开始" 等表述
  let startDate = new Date(now);
  let startTimeStr = '09:00';
  let foundStartDate = false;

  // "从今天/明天/后天/下周X开始" "从X月X日开始"
  const startMatch1 = fullText.match(/从(今天|今日|明天|明日|后天|大后天|下周[一二三四五六日天]|本周[一二三四五六日天])/);
  if (startMatch1) {
    const startWord = startMatch1[1];
    if (/今天|今日/.test(startWord)) {
      foundStartDate = true;
    } else if (/明天|明日/.test(startWord)) {
      startDate = addDays(now, 1);
      foundStartDate = true;
    } else if (/后天/.test(startWord)) {
      startDate = addDays(now, 2);
      foundStartDate = true;
    } else if (/大后天/.test(startWord)) {
      startDate = addDays(now, 3);
      foundStartDate = true;
    } else if (/下周[一二三四五六日天]/.test(startWord)) {
      const dayMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
      const m = startWord.match(/下周([一二三四五六日天])/);
      if (m) {
        const targetDay = dayMap[m[1]];
        const currentDay = now.getDay() || 7;
        let diff = targetDay - currentDay;
        if (diff <= 0) diff += 7;
        startDate = addDays(now, diff);
        foundStartDate = true;
      }
    } else if (/本周[一二三四五六日天]/.test(startWord)) {
      const dayMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
      const m = startWord.match(/本周([一二三四五六日天])/);
      if (m) {
        const targetDay = dayMap[m[1]];
        const currentDay = now.getDay() || 7;
        let diff = targetDay - currentDay;
        if (diff < 0) diff += 7;
        startDate = addDays(now, diff);
        foundStartDate = true;
      }
    }
  }

  // "从X月X日开始" / "X月X日起"
  const startMatch2 = text.match(/从?(\d{1,2})月(\d{1,2})[日号](开始|起)/);
  if (startMatch2) {
    const month = parseInt(startMatch2[1]) - 1;
    const day = parseInt(startMatch2[2]);
    startDate = new Date(now.getFullYear(), month, day);
    if (startDate < now && startDate < targetDate) startDate.setFullYear(now.getFullYear() + 1);
    foundStartDate = true;
  }

  // 如果有开始日期，且开始日期与截止日期不同天，则记录为长期任务
  if (foundStartDate) {
    result.startDate = formatDate(startDate) + 'T' + startTimeStr;
  }

  // ===== URL提取 =====
  const urlMatch = text.match(/https?:\/\/[^\s，。、]+/);
  if (urlMatch) {
    result.material = urlMatch[0];
  }

  return result;
}

function openQuickAddModal() {
  const body = $('#modalBody');
  body.innerHTML = '';

  // 模式切换：手动录入 / 智能粘贴
  const modeState = { value: 'smart' };
  const modeToggle = el('div', { class: 'schedule-view-toggle', style: { marginBottom: '14px' } },
    el('button', {
      class: `view-btn ${modeState.value === 'smart' ? 'active' : ''}`,
      onclick: () => {
        modeState.value = 'smart';
        modeToggle.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        modeToggle.children[0].classList.add('active');
        smartPanel.style.display = 'block';
        manualPanel.style.display = 'none';
      }
    }, '🤖 智能粘贴'),
    el('button', {
      class: `view-btn ${modeState.value === 'manual' ? 'active' : ''}`,
      onclick: () => {
        modeState.value = 'manual';
        modeToggle.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        modeToggle.children[1].classList.add('active');
        smartPanel.style.display = 'none';
        manualPanel.style.display = 'block';
      }
    }, '✍️ 手动录入')
  );
  body.appendChild(modeToggle);

  // ===== 智能粘贴面板 =====
  const smartPanel = el('div', {});

  smartPanel.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '粘贴文字（微信消息、通知、任务描述等）' }),
    el('textarea', {
      class: 'form-textarea',
      id: 'smartInput',
      placeholder: '直接把别人发给你的消息粘贴到这里...\n\n例如：\n"明天下午2点开部门例会，记得带上上周的工作总结，比较紧急"\n"后天上午10点和合作单位视频会议"\n"下周五前交三季度宣传工作报告"',
      style: { minHeight: '120px' }
    })
  ));

  // 解析结果预览区
  const previewArea = el('div', { id: 'smartPreview', style: { display: 'none' } });
  smartPanel.appendChild(previewArea);

  smartPanel.appendChild(el('div', { class: 'form-actions' },
    el('button', {
      class: 'btn-submit',
      style: { flex: '1' },
      onclick: () => {
        const text = $('#smartInput').value.trim();
        if (!text) { showToast('请先粘贴文字内容', 'warning'); return; }

        const parsed = parseSmartInput(text);
        // 渲染可编辑的确认表单
        previewArea.innerHTML = '';
        previewArea.style.display = 'block';

        previewArea.appendChild(el('div', {
          style: { padding: '10px 12px', background: 'var(--c-primary-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--c-primary-light)', marginBottom: '12px' }
        },
          el('div', { style: { fontWeight: '700', fontSize: '13px', color: 'var(--c-primary)' }, text: '✨ AI智能解析完成 — 请确认或修改后录入' })
        ));

        // 可编辑标题
        previewArea.appendChild(el('div', { class: 'form-group' },
          el('label', { class: 'form-label', text: '事项标题（可修改）' }),
          (() => { const i = el('input', { class: 'form-input', id: 'smartTitle' }); i.value = parsed.title; return i; })()
        ));

        // 可编辑类型
        const smartTypeState = { value: parsed.type };
        previewArea.appendChild(el('div', { class: 'form-group' },
          el('label', { class: 'form-label', text: '事项类型（可修改）' }),
          (() => {
            const wrap = el('div', { class: 'type-selector' });
            const allTypes = getTaskTypes();
            allTypes.forEach(t => {
              const btn = el('div', {
                class: `type-option ${t.id === parsed.type ? 'active' : ''}`,
                onclick: () => {
                  wrap.querySelectorAll('.type-option').forEach(o => o.classList.remove('active'));
                  btn.classList.add('active');
                  smartTypeState.value = t.id;
                  const meeting = t.id === 'internal_meeting' || t.id === 'external_meeting';
                  const sdl = $('#smartDdlLabel');
                  const sel = $('#smartEstLabel');
                  if (sdl) sdl.textContent = meeting ? '会议时间（可修改）' : '截止时间（可修改）';
                  if (sel) sel.textContent = meeting ? '会议时长（分钟）' : '预估耗时（分钟）';
                }
              }, t.label);
              wrap.appendChild(btn);
            });
            return wrap;
          })()
        ));

        // 可编辑开始时间（长期任务）
        if (parsed.startDate) {
          previewArea.appendChild(el('div', { class: 'form-group' },
            el('label', { class: 'form-label', text: '开始时间（长期任务，可修改）' }),
            (() => { const i = el('input', { class: 'form-input', type: 'datetime-local', id: 'smartStartDate' }); i.value = parsed.startDate; return i; })()
          ));
        }

        // 可编辑优先级 + 截止时间
        const smartPrioState = { value: parsed.priority };
        const smartRow = el('div', { class: 'form-row' });
        smartRow.appendChild(el('div', { class: 'form-group' },
          el('label', { class: 'form-label', id: 'smartDdlLabel', text: (parsed.type === 'internal_meeting' || parsed.type === 'external_meeting') ? '会议时间（可修改）' : '截止时间（可修改）' }),
          (() => { const i = el('input', { class: 'form-input', type: 'datetime-local', id: 'smartDeadline' }); i.value = parsed.deadline; return i; })()
        ));
        smartRow.appendChild(el('div', { class: 'form-group' },
          el('label', { class: 'form-label', text: '优先级（可修改）' }),
          (() => {
            const prioSelector = el('div', { class: 'priority-selector' });
            [
              { id: 'high', label: '高', cls: 'high' },
              { id: 'medium', label: '中', cls: 'medium' },
              { id: 'low', label: '低', cls: 'low' },
            ].forEach(p => {
              const opt = el('div', {
                class: `priority-option ${parsed.priority === p.id ? 'active ' + p.cls : ''}`,
                onclick: () => {
                  prioSelector.querySelectorAll('.priority-option').forEach(o => o.classList.remove('active', 'high', 'medium', 'low'));
                  opt.classList.add('active', p.cls);
                  smartPrioState.value = p.id;
                }
              }, p.label);
              prioSelector.appendChild(opt);
            });
            return prioSelector;
          })()
        ));
        previewArea.appendChild(smartRow);

        // 可编辑时长
        const isSmartMeeting = parsed.type === 'internal_meeting' || parsed.type === 'external_meeting';
        previewArea.appendChild(el('div', { class: 'form-group' },
          el('label', { class: 'form-label', id: 'smartEstLabel', text: isSmartMeeting ? '会议时长（分钟）' : '预估耗时（分钟）' }),
          (() => { const i = el('input', { class: 'form-input', type: 'number', id: 'smartEstTime' }); i.value = 60; return i; })()
        ));

        // 可编辑提醒时间
        const smartReminderState = { values: parsed.type === 'internal_meeting' || parsed.type === 'external_meeting' ? [10] : [30, 10] };
        previewArea.appendChild(el('div', { class: 'form-group' },
          el('label', { class: 'form-label', text: '提醒时间（可多选）' }),
          (() => {
            const wrap = el('div', { class: 'reminder-selector' });
            const options = [
              { value: 5, label: '提前5分钟' },
              { value: 10, label: '提前10分钟' },
              { value: 15, label: '提前15分钟' },
              { value: 30, label: '提前30分钟' },
              { value: 60, label: '提前1小时' },
            ];
            options.forEach(o => {
              const btn = el('div', {
                class: `reminder-option ${smartReminderState.values.includes(o.value) ? 'active' : ''}`,
                onclick: () => {
                  const idx = smartReminderState.values.indexOf(o.value);
                  if (idx >= 0) {
                    smartReminderState.values.splice(idx, 1);
                    btn.classList.remove('active');
                  } else {
                    smartReminderState.values.push(o.value);
                    btn.classList.add('active');
                  }
                }
              }, o.label);
              wrap.appendChild(btn);
            });
            return wrap;
          })()
        ));

        // 关联链接
        if (parsed.material) {
          previewArea.appendChild(el('div', { class: 'form-group' },
            el('label', { class: 'form-label', text: '关联链接' }),
            (() => { const i = el('input', { class: 'form-input', id: 'smartMaterial' }); i.value = parsed.material; return i; })()
          ));
        }

        // 确认按钮
        previewArea.appendChild(el('div', { class: 'form-actions' },
          el('button', { class: 'btn-cancel', onclick: () => { previewArea.style.display = 'none'; } }, '重新解析'),
          el('button', {
            class: 'btn-submit',
            onclick: () => {
              const title = $('#smartTitle').value.trim() || parsed.title;
              const deadline = $('#smartDeadline').value || parsed.deadline;
              const startDateEl = $('#smartStartDate');
              const startDate = startDateEl ? startDateEl.value : '';
              const materialEl = $('#smartMaterial');
              const material = materialEl ? materialEl.value.trim() : (parsed.material || '');
              closeModal();
              Store.addTask({
                title,
                type: smartTypeState.value,
                priority: smartPrioState.value,
                deadline,
                startDate: startDate || '',
                estTime: (() => {
                  const estEl = $('#smartEstTime');
                  return estEl ? parseInt(estEl.value) || 60 : 60;
                })(),
                status: 'pending',
                linkedMaterials: material ? [material] : [],
                reminderMinutes: smartReminderState.values.sort((a, b) => b - a),
              });
              showToast('AI解析完成，事项已添加到日程', 'success');
            }
          }, '✓ 确认录入')
        ));
      }
    }, '🔍 AI智能解析')
  ));

  body.appendChild(smartPanel);

  // ===== 手动录入面板 =====
  const manualPanel = el('div', { style: { display: 'none' } });

  // 类型选择
  const typeState = { value: 'work' };
  const estTimeState = { value: 60 };

  function isMeetingType(type) {
    return type === 'internal_meeting' || type === 'external_meeting';
  }

  // 动态更新标签的辅助函数
  function updateFormLabels() {
    const meeting = isMeetingType(typeState.value);
    const ddlLabel = $('#ddlLabel');
    const estLabel = $('#estLabel');
    const startGroup = $('#qaStartGroup');
    if (ddlLabel) ddlLabel.textContent = meeting ? '会议时间' : '截止时间 (DDL)';
    if (estLabel) estLabel.textContent = meeting ? '会议时长' : '预估耗时（分钟）';
    if (startGroup) startGroup.style.display = meeting ? 'none' : '';
    // 会议预设按钮
    const estPresets = $('#estPresets');
    if (estPresets) {
      estPresets.innerHTML = '';
      const presets = meeting
        ? [{ label: '30分钟', val: 30 }, { label: '1小时', val: 60 }, { label: '1.5小时', val: 90 }, { label: '2小时', val: 120 }]
        : [{ label: '30分钟', val: 30 }, { label: '1小时', val: 60 }, { label: '2小时', val: 120 }, { label: '半天', val: 240 }];
      presets.forEach(p => {
        const b = el('button', {
          class: `ddl-preset-btn ${estTimeState.value === p.val ? 'active' : ''}`,
          type: 'button',
          onclick: (e) => {
            e.preventDefault();
            estTimeState.value = p.val;
            const inp = $('#qaEstTime');
            if (inp) inp.value = p.val;
            estPresets.querySelectorAll('.ddl-preset-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
          }
        }, p.label);
        estPresets.appendChild(b);
      });
    }
  }

  manualPanel.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '事项类型' }),
    (() => {
      const wrap = el('div', { class: 'type-selector' });
      const types = getTaskTypes();
      types.forEach(t => {
        const btn = el('div', {
          class: `type-option ${t.id === 'work' ? 'active' : ''}`,
          onclick: () => {
            wrap.querySelectorAll('.type-option').forEach(o => o.classList.remove('active'));
            btn.classList.add('active');
            typeState.value = t.id;
            updateFormLabels();
          }
        }, t.label);
        wrap.appendChild(btn);
      });
      return wrap;
    })()
  ));

  // 内容
  manualPanel.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '事项内容' }),
    el('input', { class: 'form-input', id: 'qaContent', placeholder: '简要描述事项内容...' })
  ));

  // 开始时间（长期任务，可选 — 会议类型隐藏）
  manualPanel.appendChild(el('div', { class: 'form-group', id: 'qaStartGroup' },
    el('label', { class: 'form-label', text: '开始时间（长期任务选填，留空则当天开始）' }),
    (() => { const i = el('input', { class: 'form-input', type: 'datetime-local', id: 'qaStartDate' }); return i; })()
  ));

  // 截止/会议时间 & 优先级
  const row = el('div', { class: 'form-row' });
  row.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', id: 'ddlLabel', text: '截止时间 (DDL)' }),
    (() => {
      const inp = el('input', { class: 'form-input', type: 'datetime-local', id: 'qaDeadline', value: formatDate(new Date()) + 'T18:00' });
      const presetWrap = el('div', { class: 'ddl-presets' });
      const presets = [
        { label: '今天下班', getValue: () => { const d = new Date(); return formatDate(d) + 'T18:00'; } },
        { label: '明天中午', getValue: () => formatDate(addDays(new Date(), 1)) + 'T12:00' },
        { label: '后天', getValue: () => formatDate(addDays(new Date(), 2)) + 'T18:00' },
        { label: '本周五', getValue: () => { const d = new Date(); const day = d.getDay(); const fri = day <= 5 ? 5 - day : 7 - day + 5; return formatDate(addDays(d, fri)) + 'T18:00'; } },
        { label: '下周一', getValue: () => { const d = new Date(); const day = d.getDay(); const mon = day === 0 ? 1 : 8 - day; return formatDate(addDays(d, mon)) + 'T09:00'; } },
      ];
      presets.forEach(p => {
        presetWrap.appendChild(el('button', {
          class: 'ddl-preset-btn',
          type: 'button',
          onclick: (e) => {
            e.preventDefault();
            inp.value = p.getValue();
            presetWrap.querySelectorAll('.ddl-preset-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            showToast('时间已设为：' + p.label, 'info');
          }
        }, p.label));
      });
      const group = el('div', {});
      group.appendChild(presetWrap);
      group.appendChild(inp);
      return group;
    })()
  ));

  const prioState = { value: 'medium' };
  const prioWrap = el('div', { class: 'form-group' });
  prioWrap.appendChild(el('label', { class: 'form-label', text: '优先级' }));
  const prioSelector = el('div', { class: 'priority-selector' });
  const priorities = [
    { id: 'high', label: '高', cls: 'high' },
    { id: 'medium', label: '中', cls: 'medium' },
    { id: 'low', label: '低', cls: 'low' },
  ];
  priorities.forEach(p => {
    const opt = el('div', {
      class: `priority-option ${p.id === 'medium' ? 'active ' + p.cls : ''}`,
      onclick: () => {
        prioSelector.querySelectorAll('.priority-option').forEach(o => o.classList.remove('active', 'high', 'medium', 'low'));
        opt.classList.add('active', p.cls);
        prioState.value = p.id;
      }
    }, p.label);
    prioSelector.appendChild(opt);
  });
  prioWrap.appendChild(prioSelector);
  row.appendChild(prioWrap);
  manualPanel.appendChild(row);

  // 时长/预估耗时
  manualPanel.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', id: 'estLabel', text: '预估耗时（分钟）' }),
    (() => {
      const group = el('div', {});
      const presetWrap = el('div', { class: 'ddl-presets', id: 'estPresets' });
      group.appendChild(presetWrap);
      const inp = el('input', { class: 'form-input', type: 'number', id: 'qaEstTime' });
      inp.value = 60;
      inp.addEventListener('input', () => { estTimeState.value = parseInt(inp.value) || 60; });
      group.appendChild(inp);
      // 初始化预设按钮
      setTimeout(updateFormLabels, 0);
      return group;
    })()
  ));

  // 提醒时间 — 多选
  const reminderState = { values: [15] };
  manualPanel.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '提醒时间（可多选）' }),
    (() => {
      const wrap = el('div', { class: 'reminder-selector' });
      const options = [
        { value: 5, label: '提前5分钟' },
        { value: 10, label: '提前10分钟' },
        { value: 15, label: '提前15分钟' },
        { value: 30, label: '提前30分钟' },
        { value: 60, label: '提前1小时' },
      ];
      options.forEach(o => {
        const btn = el('div', {
          class: `reminder-option ${reminderState.values.includes(o.value) ? 'active' : ''}`,
          onclick: () => {
            const idx = reminderState.values.indexOf(o.value);
            if (idx >= 0) {
              reminderState.values.splice(idx, 1);
              btn.classList.remove('active');
            } else {
              reminderState.values.push(o.value);
              btn.classList.add('active');
            }
          }
        }, o.label);
        wrap.appendChild(btn);
      });
      // 不提醒选项
      const noRemindBtn = el('div', {
        class: 'reminder-option',
        onclick: () => {
          reminderState.values = [];
          wrap.querySelectorAll('.reminder-option').forEach(r => r.classList.remove('active'));
          noRemindBtn.classList.add('active');
        }
      }, '不提醒');
      wrap.appendChild(noRemindBtn);
      return wrap;
    })()
  ));

  manualPanel.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '关联素材（可选）' }),
    el('input', { class: 'form-input', id: 'qaMaterial', placeholder: '输入素材链接或名称...' })
  ));

  // 按钮
  manualPanel.appendChild(el('div', { class: 'form-actions' },
    el('button', { class: 'btn-cancel', onclick: closeModal }, '取消'),
    el('button', {
      class: 'btn-submit',
      onclick: () => {
        const content = $('#qaContent').value.trim();
        if (!content) { showToast('请输入事项内容', 'warning'); return; }
        const deadline = $('#qaDeadline').value;
        const startDateEl = $('#qaStartDate');
        const startDate = startDateEl ? startDateEl.value : '';
        const material = $('#qaMaterial') ? $('#qaMaterial').value.trim() : '';

        closeModal();
        Store.addTask({
          title: content,
          type: typeState.value,
          priority: prioState.value,
          deadline: deadline,
          startDate: startDate || '',
          estTime: estTimeState.value,
          status: 'pending',
          linkedMaterials: material ? [material] : [],
          reminderMinutes: reminderState.values.sort((a, b) => b - a),
        });
        showToast('事项已添加，日程已自动重排', 'success');
      }
    }, '确认录入')
  ));

  body.appendChild(manualPanel);

  openModal('快捷录入');
}

/* ---------- 编辑任务弹窗 ---------- */
function openEditTaskModal(taskId) {
  const task = Store.data.tasks.find(t => t.id === taskId);
  if (!task) return;

  const body = $('#modalBody');
  body.innerHTML = '';

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '事项名称' }),
    (() => { const i = el('input', { class: 'form-input', id: 'editTitle' }); i.value = task.title; return i; })()
  ));

  // 类型
  const typeState = { value: task.type || 'work' };
  const isEditMeeting = () => typeState.value === 'internal_meeting' || typeState.value === 'external_meeting';
  function updateEditLabels() {
    const meeting = isEditMeeting();
    const dl = $('#editDdlLabel');
    const el2 = $('#editEstLabel');
    const sg = $('#editStartGroup');
    if (dl) dl.textContent = meeting ? '会议时间' : '截止时间';
    if (el2) el2.textContent = meeting ? '会议时长（分钟）' : '预估耗时（分钟）';
    if (sg) sg.style.display = meeting ? 'none' : '';
  }
  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '类型' }),
    (() => {
      const wrap = el('div', { class: 'type-selector' });
      const types = getTaskTypes();
      types.forEach(t => {
        const btn = el('div', {
          class: `type-option ${t.id === typeState.value ? 'active' : ''}`,
          onclick: () => {
            wrap.querySelectorAll('.type-option').forEach(o => o.classList.remove('active'));
            btn.classList.add('active');
            typeState.value = t.id;
            updateEditLabels();
          }
        }, t.label);
        wrap.appendChild(btn);
      });
      return wrap;
    })()
  ));

  // 开始时间（长期任务 — 会议类型隐藏）
  body.appendChild(el('div', { class: 'form-group', id: 'editStartGroup' },
    el('label', { class: 'form-label', text: '开始时间（长期任务选填）' }),
    (() => {
      const i = el('input', { class: 'form-input', type: 'datetime-local', id: 'editStartDate' });
      if (task.startDate) i.value = task.startDate;
      return i;
    })()
  ));

  // 截止/会议时间
  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', id: 'editDdlLabel', text: isEditMeeting() ? '会议时间' : '截止时间' }),
    (() => {
      const i = el('input', { class: 'form-input', type: 'datetime-local', id: 'editDeadline' });
      if (task.deadline) i.value = task.deadline;
      return i;
    })()
  ));

  // 优先级
  const prioState = { value: task.priority || 'medium' };
  const prioWrap = el('div', { class: 'form-group' });
  prioWrap.appendChild(el('label', { class: 'form-label', text: '优先级' }));
  const prioSelector = el('div', { class: 'priority-selector' });
  [
    { id: 'high', label: '高', cls: 'high' },
    { id: 'medium', label: '中', cls: 'medium' },
    { id: 'low', label: '低', cls: 'low' },
  ].forEach(p => {
    const opt = el('div', {
      class: `priority-option ${prioState.value === p.id ? 'active ' + p.cls : ''}`,
      onclick: () => {
        prioSelector.querySelectorAll('.priority-option').forEach(o => o.classList.remove('active', 'high', 'medium', 'low'));
        opt.classList.add('active', p.cls);
        prioState.value = p.id;
      }
    }, p.label);
    prioSelector.appendChild(opt);
  });
  prioWrap.appendChild(prioSelector);
  body.appendChild(prioWrap);

  // 预估时间/会议时长
  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', id: 'editEstLabel', text: isEditMeeting() ? '会议时长（分钟）' : '预估耗时（分钟）' }),
    (() => { const i = el('input', { class: 'form-input', type: 'number', id: 'editEstTime' }); i.value = task.estTime || 60; return i; })()
  ));

  // 提醒时间 — 多选
  const editReminderState = { values: Array.isArray(task.reminderMinutes) ? [...task.reminderMinutes] : (task.reminderMinutes ? [task.reminderMinutes] : []) };
  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '提醒时间（可多选）' }),
    (() => {
      const wrap = el('div', { class: 'reminder-selector' });
      const options = [
        { value: 5, label: '提前5分钟' },
        { value: 10, label: '提前10分钟' },
        { value: 15, label: '提前15分钟' },
        { value: 30, label: '提前30分钟' },
        { value: 60, label: '提前1小时' },
      ];
      options.forEach(o => {
        const btn = el('div', {
          class: `reminder-option ${editReminderState.values.includes(o.value) ? 'active' : ''}`,
          onclick: () => {
            const idx = editReminderState.values.indexOf(o.value);
            if (idx >= 0) {
              editReminderState.values.splice(idx, 1);
              btn.classList.remove('active');
            } else {
              editReminderState.values.push(o.value);
              btn.classList.add('active');
            }
          }
        }, o.label);
        wrap.appendChild(btn);
      });
      const noRemindBtn = el('div', {
        class: `reminder-option ${editReminderState.values.length === 0 ? 'active' : ''}`,
        onclick: () => {
          editReminderState.values = [];
          wrap.querySelectorAll('.reminder-option').forEach(r => r.classList.remove('active'));
          noRemindBtn.classList.add('active');
        }
      }, '不提醒');
      wrap.appendChild(noRemindBtn);
      return wrap;
    })()
  ));

  // 按钮区：删除 + 取消 + 保存
  body.appendChild(el('div', { class: 'form-actions' },
    el('button', {
      class: 'btn-delete',
      style: { marginRight: 'auto', background: 'var(--c-danger-bg)', color: 'var(--c-danger)', border: '1px solid var(--c-danger-light)' },
      onclick: () => {
        if (confirm(`确定删除"${task.title}"吗？此操作不可撤销。`)) {
          Store.deleteTask(taskId);
          closeModal();
          showToast('已删除', 'info');
        }
      }
    }, '🗑 删除'),
    el('button', { class: 'btn-cancel', onclick: closeModal }, '取消'),
    el('button', {
      class: 'btn-submit',
      onclick: () => {
        closeModal();
        Store.updateTask(taskId, {
          title: $('#editTitle').value.trim() || task.title,
          type: typeState.value,
          startDate: $('#editStartDate').value || '',
          deadline: $('#editDeadline').value || task.deadline,
          priority: prioState.value,
          estTime: parseInt($('#editEstTime').value) || 60,
          reminderMinutes: editReminderState.values.sort((a, b) => b - a),
        });
        showToast('已更新，日程已重排', 'success');
      }
    }, '保存')
  ));

  openModal('编辑事项');
  setTimeout(updateEditLabels, 0);
}

/* ============================================================
   周期性任务管理
   ============================================================ */

/* ---------- 周期任务列表管理弹窗 ---------- */
function openRecurringTaskModal() {
  const body = $('#modalBody');
  body.innerHTML = '';

  // 标题区
  body.appendChild(el('div', {
    style: { padding: '10px 12px', background: 'var(--c-primary-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--c-primary-light)', marginBottom: '14px' }
  },
    el('div', { style: { fontWeight: '700', fontSize: '13px', color: 'var(--c-primary)' }, text: '🔄 周期任务管理' }),
    el('div', { style: { fontSize: '12px', color: 'var(--c-text-secondary)', marginTop: '4px' }, text: '设置每日/每N天/每周/每月循环的工作，系统自动插入日程时间轴' })
  ));

  // 今日到期摘要
  const todayStr = formatDate(new Date());
  const todayDue = Store.getRecurringTasksForDate(todayStr);
  if (todayDue.length > 0) {
    const todayDone = todayDue.filter(rt => rt.completions && rt.completions[todayStr]).length;
    body.appendChild(el('div', {
      style: { fontSize: '12px', color: 'var(--c-text-secondary)', marginBottom: '12px', padding: '6px 10px', background: 'var(--c-surface-hover)', borderRadius: '6px' }
    }, `今日到期 ${todayDue.length} 项，已完成 ${todayDone} 项`));
  }

  // 周期任务列表
  const listWrap = el('div', { class: 'recurring-task-list' });

  if (Store.data.recurringTasks.length === 0) {
    listWrap.appendChild(el('div', { class: 'empty-state', style: { padding: '30px 0' } },
      el('div', { class: 'empty-text', text: '暂无周期任务' }),
      el('div', { class: 'empty-hint', text: '点击下方按钮添加周期性工作' })
    ));
  }

  Store.data.recurringTasks.forEach(rt => {
    const isDueToday = Store.isRecurringDueOnDate(rt, todayStr);
    const isDoneToday = isDueToday && rt.completions && rt.completions[todayStr];
    const cycleDesc = Store.getCycleDescription(rt);

    const item = el('div', { class: `recurring-item ${!rt.enabled ? 'disabled' : ''} ${isDoneToday ? 'completed' : ''}` });

    // 左侧状态圆点
    item.appendChild(el('div', { class: `recurring-status-dot ${rt.enabled ? (isDoneToday ? 'done' : (isDueToday ? 'due' : 'idle')) : 'off'}` }));

    // 中间内容
    const content = el('div', { class: 'recurring-item-content' });
    content.appendChild(el('div', { class: 'recurring-item-title', text: rt.title }));

    const meta = el('div', { class: 'recurring-item-meta' });
    meta.appendChild(el('span', { class: 'recurring-cycle-tag', text: `🔄 ${cycleDesc}` }));
    meta.appendChild(el('span', { text: `⏰ ${rt.preferredTime || '14:00'}` }));
    meta.appendChild(el('span', { text: `📊 ${rt.estTime || 60}分钟` }));
    const prioLabel = rt.priority === 'high' ? '🔴 高' : rt.priority === 'medium' ? '🟡 中' : '🟢 低';
    meta.appendChild(el('span', { text: prioLabel }));
    if (isDueToday) {
      meta.appendChild(el('span', { class: `recurring-today-badge ${isDoneToday ? 'done' : 'pending'}`, text: isDoneToday ? '✓ 今日已完成' : '今日待完成' }));
    }
    content.appendChild(meta);

    // 右侧操作
    const ops = el('div', { class: 'recurring-item-ops' });
    // 启用/禁用开关
    ops.appendChild(el('button', {
      class: `btn-toggle-recurring ${rt.enabled ? 'on' : 'off'}`,
      title: rt.enabled ? '点击暂停' : '点击启用',
      onclick: (e) => { e.stopPropagation(); Store.updateRecurringTask(rt.id, { enabled: !rt.enabled }); }
    }, rt.enabled ? '启用中' : '已暂停'));

    if (isDueToday && !isDoneToday) {
      ops.appendChild(el('button', {
        class: 'btn-recurring-check',
        title: '标记今日完成',
        onclick: (e) => { e.stopPropagation(); Store.toggleRecurringCompletion(rt.id, todayStr); showToast('今日已打卡', 'success'); }
      }, '打卡'));
    } else if (isDueToday && isDoneToday) {
      ops.appendChild(el('button', {
        class: 'btn-recurring-uncheck',
        title: '撤销今日完成',
        onclick: (e) => { e.stopPropagation(); Store.toggleRecurringCompletion(rt.id, todayStr); }
      }, '撤销'));
    }

    ops.appendChild(el('button', {
      class: 'btn-icon-sm',
      title: '编辑',
      onclick: (e) => { e.stopPropagation(); openEditRecurringModal(rt.id); }
    }, svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', 14)));

    ops.appendChild(el('button', {
      class: 'btn-icon-sm danger',
      title: '删除',
      onclick: (e) => {
        e.stopPropagation();
        if (confirm(`确定删除周期任务"${rt.title}"吗？`)) {
          Store.deleteRecurringTask(rt.id);
          showToast('周期任务已删除', 'info');
        }
      }
    }, svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 14)));

    item.appendChild(content);
    item.appendChild(ops);
    listWrap.appendChild(item);
  });

  body.appendChild(listWrap);

  // 添加按钮
  body.appendChild(el('div', { class: 'form-actions', style: { marginTop: '14px' } },
    el('button', { class: 'btn-cancel', onclick: closeModal }, '关闭'),
    el('button', {
      class: 'btn-submit',
      onclick: () => openEditRecurringModal(null)
    }, '+ 新增周期任务')
  ));

  openModal('周期任务管理', true);
}

/* ---------- 周期任务编辑/新增弹窗 ---------- */
function openEditRecurringModal(taskId) {
  const isEdit = !!taskId;
  const task = isEdit ? Store.data.recurringTasks.find(t => t.id === taskId) : null;
  const body = $('#modalBody');
  body.innerHTML = '';

  // 标题
  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '任务名称' }),
    (() => { const i = el('input', { class: 'form-input', id: 'rtTitle', placeholder: '如：更新公众号推文、更新英文网站...' }); if (task) i.value = task.title; return i; })()
  ));

  // 类型
  const typeState = { value: task ? task.type : 'work' };
  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '事项类型' }),
    (() => {
      const wrap = el('div', { class: 'type-selector' });
      getTaskTypes().forEach(t => {
        const btn = el('div', {
          class: `type-option ${t.id === typeState.value ? 'active' : ''}`,
          onclick: () => {
            wrap.querySelectorAll('.type-option').forEach(o => o.classList.remove('active'));
            btn.classList.add('active');
            typeState.value = t.id;
          }
        }, t.label);
        wrap.appendChild(btn);
      });
      return wrap;
    })()
  ));

  // 优先级
  const prioState = { value: task ? task.priority : 'medium' };
  const prioWrap = el('div', { class: 'form-group' });
  prioWrap.appendChild(el('label', { class: 'form-label', text: '优先级' }));
  const prioSelector = el('div', { class: 'priority-selector' });
  [
    { id: 'high', label: '高', cls: 'high' },
    { id: 'medium', label: '中', cls: 'medium' },
    { id: 'low', label: '低', cls: 'low' },
  ].forEach(p => {
    const opt = el('div', {
      class: `priority-option ${prioState.value === p.id ? 'active ' + p.cls : ''}`,
      onclick: () => {
        prioSelector.querySelectorAll('.priority-option').forEach(o => o.classList.remove('active', 'high', 'medium', 'low'));
        opt.classList.add('active', p.cls);
        prioState.value = p.id;
      }
    }, p.label);
    prioSelector.appendChild(opt);
  });
  prioWrap.appendChild(prioSelector);
  body.appendChild(prioWrap);

  // 周期类型选择
  const cycleState = { value: task ? task.cycleType : 'daily', cycleDays: task ? task.cycleDays : 1, cycleWeekdays: task ? [...task.cycleWeekdays] : [], cycleMonthDay: task ? task.cycleMonthDay : 1 };
  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '循环周期' }),
    (() => {
      const wrap = el('div', { class: 'type-selector' });
      const cycles = [
        { id: 'daily', label: '每日' },
        { id: 'every-n-days', label: '每N天' },
        { id: 'weekly', label: '每周' },
        { id: 'monthly', label: '每月' },
      ];
      cycles.forEach(c => {
        const btn = el('div', {
          class: `type-option ${c.id === cycleState.value ? 'active' : ''}`,
          onclick: () => {
            cycleState.value = c.id;
            wrap.querySelectorAll('.type-option').forEach(o => o.classList.remove('active'));
            btn.classList.add('active');
            // 切换显示对应的周期配置
            cycleConfigArea.querySelector('.cycle-config-n').style.display = c.id === 'every-n-days' ? 'block' : 'none';
            cycleConfigArea.querySelector('.cycle-config-weekly').style.display = c.id === 'weekly' ? 'block' : 'none';
            cycleConfigArea.querySelector('.cycle-config-monthly').style.display = c.id === 'monthly' ? 'block' : 'none';
          }
        }, c.label);
        wrap.appendChild(btn);
      });
      return wrap;
    })()
  ));

  // 周期配置区域（根据类型动态显示）
  const cycleConfigArea = el('div', {});

  // 每N天配置
  const nConfig = el('div', { class: 'cycle-config-n', style: { display: cycleState.value === 'every-n-days' ? 'block' : 'none', marginTop: '8px' } });
  nConfig.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '每几天执行一次' }),
    (() => { const i = el('input', { class: 'form-input', type: 'number', id: 'rtCycleDays', min: '1', max: '365', style: { width: '100px' } }); i.value = cycleState.cycleDays; return i; })()
  ));
  cycleConfigArea.appendChild(nConfig);

  // 每周配置
  const weeklyConfig = el('div', { class: 'cycle-config-weekly', style: { display: cycleState.value === 'weekly' ? 'block' : 'none', marginTop: '8px' } });
  weeklyConfig.appendChild(el('label', { class: 'form-label', text: '每周哪几天' }));
  const weekdayWrap = el('div', { class: 'weekday-selector' });
  const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];
  weekdayLabels.forEach((label, idx) => {
    const isOn = cycleState.cycleWeekdays.includes(idx);
    const btn = el('div', {
      class: `weekday-option ${isOn ? 'active' : ''}`,
      onclick: () => {
        const i = cycleState.cycleWeekdays.indexOf(idx);
        if (i >= 0) { cycleState.cycleWeekdays.splice(i, 1); btn.classList.remove('active'); }
        else { cycleState.cycleWeekdays.push(idx); btn.classList.add('active'); }
      }
    }, label);
    weekdayWrap.appendChild(btn);
  });
  weeklyConfig.appendChild(weekdayWrap);
  cycleConfigArea.appendChild(weeklyConfig);

  // 每月配置
  const monthlyConfig = el('div', { class: 'cycle-config-monthly', style: { display: cycleState.value === 'monthly' ? 'block' : 'none', marginTop: '8px' } });
  monthlyConfig.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '每月几号' }),
    (() => { const i = el('input', { class: 'form-input', type: 'number', id: 'rtCycleMonthDay', min: '1', max: '31', style: { width: '100px' } }); i.value = cycleState.cycleMonthDay; return i; })()
  ));
  cycleConfigArea.appendChild(monthlyConfig);

  body.appendChild(cycleConfigArea);

  // 偏好时间 + 预估时间
  const timeRow = el('div', { class: 'form-row' });
  timeRow.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '偏好时间段' }),
    (() => { const i = el('input', { class: 'form-input', type: 'time', id: 'rtPreferredTime' }); i.value = task ? (task.preferredTime || '14:00') : '14:00'; return i; })()
  ));
  timeRow.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '预估耗时（分钟）' }),
    (() => { const i = el('input', { class: 'form-input', type: 'number', id: 'rtEstTime', min: '5', step: '5' }); i.value = task ? (task.estTime || 60) : 60; return i; })()
  ));
  body.appendChild(timeRow);

  // 开始日期
  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '生效起始日期' }),
    (() => { const i = el('input', { class: 'form-input', type: 'date', id: 'rtStartDate' }); i.value = task ? (task.startDate || formatDate(new Date())) : formatDate(new Date()); return i; })()
  ));

  // 按钮区
  const btnRow = el('div', { class: 'form-actions' });
  if (isEdit) {
    btnRow.appendChild(el('button', {
      class: 'btn-delete',
      style: { marginRight: 'auto', background: 'var(--c-danger-bg)', color: 'var(--c-danger)', border: '1px solid var(--c-danger-light)' },
      onclick: () => {
        if (confirm(`确定删除周期任务"${task.title}"吗？`)) {
          Store.deleteRecurringTask(taskId);
          closeModal();
          showToast('周期任务已删除', 'info');
        }
      }
    }, '🗑 删除'));
  }
  btnRow.appendChild(el('button', { class: 'btn-cancel', onclick: () => openRecurringTaskModal() }, isEdit ? '返回列表' : '取消'));
  btnRow.appendChild(el('button', {
    class: 'btn-submit',
    onclick: () => {
      const title = $('#rtTitle').value.trim();
      if (!title) { showToast('请输入任务名称', 'warning'); return; }

      // 验证周期配置
      if (cycleState.value === 'every-n-days') {
        const n = parseInt($('#rtCycleDays').value);
        if (!n || n < 1) { showToast('请输入有效的天数', 'warning'); return; }
        cycleState.cycleDays = n;
      }
      if (cycleState.value === 'weekly' && cycleState.cycleWeekdays.length === 0) {
        showToast('请至少选择一个工作日', 'warning'); return;
      }
      if (cycleState.value === 'monthly') {
        const d = parseInt($('#rtCycleMonthDay').value);
        if (!d || d < 1 || d > 31) { showToast('请输入有效的日期（1-31）', 'warning'); return; }
        cycleState.cycleMonthDay = d;
      }

      const data = {
        title,
        type: typeState.value,
        priority: prioState.value,
        cycleType: cycleState.value,
        cycleDays: cycleState.cycleDays,
        cycleWeekdays: cycleState.cycleWeekdays,
        cycleMonthDay: cycleState.cycleMonthDay,
        preferredTime: $('#rtPreferredTime').value || '14:00',
        estTime: parseInt($('#rtEstTime').value) || 60,
        startDate: $('#rtStartDate').value || formatDate(new Date()),
      };

      if (isEdit) {
        Store.updateRecurringTask(taskId, data);
        showToast('周期任务已更新', 'success');
      } else {
        Store.addRecurringTask(data);
        showToast('周期任务已添加，将自动插入日程', 'success');
      }
      // 返回列表
      openRecurringTaskModal();
    }
  }, isEdit ? '保存' : '添加'));
  body.appendChild(btnRow);

  openModal(isEdit ? '编辑周期任务' : '新增周期任务', true);
}

/* ---------- 宣传情报：添加文章链接/语录 ---------- */
function openIntelAddModal() {
  const body = $('#modalBody');
  body.innerHTML = '';

  const typeState = { value: 'article' };
  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '录入类型' }),
    (() => {
      const wrap = el('div', { class: 'type-selector' });
      const types = [
        { id: 'article', label: '文章链接' },
        { id: 'quote', label: '语录/金句' },
        { id: 'hotspot', label: '热点' },
      ];
      types.forEach(t => {
        const btn = el('div', {
          class: `type-option ${t.id === 'article' ? 'active' : ''}`,
          onclick: () => {
            wrap.querySelectorAll('.type-option').forEach(o => o.classList.remove('active'));
            btn.classList.add('active');
            typeState.value = t.id;
            // 切换显示对应表单
            body.querySelector('.intel-form-article').style.display = t.id === 'article' ? 'block' : 'none';
            body.querySelector('.intel-form-quote').style.display = t.id === 'quote' ? 'block' : 'none';
            body.querySelector('.intel-form-hotspot').style.display = t.id === 'hotspot' ? 'block' : 'none';
          }
        }, t.label);
        wrap.appendChild(btn);
      });
      return wrap;
    })()
  ));

  // 文章链接表单
  const articleForm = el('div', { class: 'intel-form-article' });
  articleForm.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '文章链接' }),
    (() => {
      const urlInput = el('input', { class: 'form-input', id: 'intelUrl', placeholder: '粘贴文章链接，自动抓取标题...' });
      const statusEl = el('div', { class: 'fetch-status', style: { fontSize: '11px', marginTop: '4px', display: 'none' } });
      const titleInput = el('input', { class: 'form-input', id: 'intelTitle', placeholder: '文章标题（输入链接后自动填充，也可手动修改）' });

      // 失焦时自动抓取
      urlInput.addEventListener('blur', () => {
        const url = urlInput.value.trim();
        if (url && url.startsWith('http') && !titleInput.value.trim()) {
          fetchArticleTitle(url, titleInput, statusEl);
        }
      });

      // 粘贴时自动抓取
      urlInput.addEventListener('paste', () => {
        setTimeout(() => {
          const url = urlInput.value.trim();
          if (url && url.startsWith('http') && !titleInput.value.trim()) {
            fetchArticleTitle(url, titleInput, statusEl);
          }
        }, 100);
      });

      // 回车时自动抓取
      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const url = urlInput.value.trim();
          if (url && url.startsWith('http') && !titleInput.value.trim()) {
            fetchArticleTitle(url, titleInput, statusEl);
          }
        }
      });

      const wrap = el('div', {});
      wrap.appendChild(urlInput);
      wrap.appendChild(statusEl);
      wrap.appendChild(el('div', { style: { marginTop: '6px' } },
        el('label', { class: 'form-label', text: '文章标题' }),
        titleInput
      ));
      return wrap;
    })()
  ));
  articleForm.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '来源' }),
    el('input', { class: 'form-input', id: 'intelSource', placeholder: '如：人民日报、中核集团公众号...' })
  ));
  articleForm.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '摘要（可选）' }),
    el('textarea', { class: 'form-textarea', id: 'intelSummary', placeholder: '简要描述文章内容...' })
  ));
  articleForm.appendChild(el('div', { class: 'form-actions' },
    el('button', { class: 'btn-cancel', onclick: closeModal }, '取消'),
    el('button', {
      class: 'btn-submit',
      onclick: () => {
        const title = $('#intelTitle').value.trim();
        if (!title) { showToast('请输入文章标题', 'warning'); return; }
        const article = {
          title,
          source: $('#intelSource').value.trim() || '手动录入',
          url: $('#intelUrl').value.trim(),
          content: $('#intelSummary').value.trim(),
        };
        const evalResult = Store.evaluateArticle(article);
        article.aiScore = evalResult.score;
        article.aiReason = evalResult.reason;
        Store.addIntelArticle(article);
        closeModal();
        showToast('文章已添加，AI已自动评估', 'success');
      }
    }, '添加文章')
  ));
  body.appendChild(articleForm);

  // 语录表单
  const quoteForm = el('div', { class: 'intel-form-quote', style: { display: 'none' } });
  quoteForm.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '语录/金句内容' }),
    el('textarea', { class: 'form-textarea', id: 'quoteContent', placeholder: '输入要收藏的语录或金句...', style: { minHeight: '100px' } })
  ));
  quoteForm.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '出处（可选）' }),
    el('input', { class: 'form-input', id: 'quoteSource', placeholder: '如：某领导讲话、某文件...' })
  ));
  quoteForm.appendChild(el('div', { class: 'form-actions' },
    el('button', { class: 'btn-cancel', onclick: closeModal }, '取消'),
    el('button', {
      class: 'btn-submit',
      onclick: () => {
        const content = $('#quoteContent').value.trim();
        if (!content) { showToast('请输入内容', 'warning'); return; }
        const source = $('#quoteSource').value.trim() || '语录收藏';
        Store.addIntelArticle({
          title: content,
          source,
          url: '',
          content: content,
          aiScore: 'collect',
          aiReason: '语录金句，建议收藏用于文稿引用',
        });
        closeModal();
        showToast('语录已收藏', 'success');
      }
    }, '收藏语录')
  ));
  body.appendChild(quoteForm);

  // 热点表单
  const hotspotForm = el('div', { class: 'intel-form-hotspot', style: { display: 'none' } });
  hotspotForm.appendChild(el('button', {
    class: 'btn-submit',
    style: { width: '100%' },
    onclick: () => { closeModal(); setTimeout(openAddHotspotModal, 100); }
  }, '打开热点添加面板'));
  body.appendChild(hotspotForm);

  openModal('添加宣传素材');
}

/* ---------- 学习素材库：添加素材（链接 + 本地上传） ---------- */
function openStudyMaterialAddModal() {
  const body = $('#modalBody');
  body.innerHTML = '';

  const typeState = { value: 'link' };
  const catState = { value: 'writing' };
  const uploadedFile = { data: null };

  // 类型选择
  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '添加方式' }),
    (() => {
      const wrap = el('div', { class: 'type-selector' });
      const types = [
        { id: 'link', label: '🔗 网页链接' },
        { id: 'file', label: '📄 本地文件' },
        { id: 'note', label: '📝 文字笔记' },
      ];
      types.forEach(t => {
        const btn = el('div', {
          class: `type-option ${t.id === 'link' ? 'active' : ''}`,
          onclick: () => {
            wrap.querySelectorAll('.type-option').forEach(o => o.classList.remove('active'));
            btn.classList.add('active');
            typeState.value = t.id;
            body.querySelector('.sm-form-link').style.display = t.id === 'link' ? 'block' : 'none';
            body.querySelector('.sm-form-file').style.display = t.id === 'file' ? 'block' : 'none';
            body.querySelector('.sm-form-note').style.display = t.id === 'note' ? 'block' : 'none';
          }
        }, t.label);
        wrap.appendChild(btn);
      });
      return wrap;
    })()
  ));

  // 分类选择
  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '分类' }),
    (() => {
      const wrap = el('div', { class: 'type-selector' });
      getStudyCategories().filter(c => c.id !== 'all').forEach(c => {
        const btn = el('div', {
          class: `type-option ${c.id === 'writing' ? 'active' : ''}`,
          onclick: () => {
            wrap.querySelectorAll('.type-option').forEach(o => o.classList.remove('active'));
            btn.classList.add('active');
            catState.value = c.id;
          }
        }, c.name);
        wrap.appendChild(btn);
      });
      return wrap;
    })()
  ));

  // 链接表单
  const linkForm = el('div', { class: 'sm-form-link' });
  linkForm.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '素材标题' }),
    el('input', { class: 'form-input', id: 'smLinkTitle', placeholder: '如：宣传文稿写作技巧指南' })
  ));
  linkForm.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '网页链接' }),
    el('input', { class: 'form-input', id: 'smLinkUrl', placeholder: 'https://...' })
  ));
  linkForm.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '备注（可选）' }),
    el('input', { class: 'form-input', id: 'smLinkNote', placeholder: '简单描述...' })
  ));
  body.appendChild(linkForm);

  // 文件上传表单
  const fileForm = el('div', { class: 'sm-form-file', style: { display: 'none' } });
  fileForm.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '素材标题' }),
    el('input', { class: 'form-input', id: 'smFileTitle', placeholder: '如：三季度工作总结.docx' })
  ));
  const fileLabel = el('label', {
    class: 'file-upload-area',
    style: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px', border: '2px dashed var(--c-border)', borderRadius: 'var(--radius-md)',
      cursor: 'pointer', transition: 'all .2s', background: 'var(--c-surface-hover)',
    }
  },
    el('div', { style: { fontSize: '32px', marginBottom: '8px' }, text: '📤' }),
    el('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--c-text-secondary)' }, text: '点击选择文件或拖拽到此处' }),
    el('div', { style: { fontSize: '11px', color: 'var(--c-text-muted)', marginTop: '4px' }, text: '支持 Word、PDF、PPT、图片等格式' })
  );
  const fileInput = el('input', {
    type: 'file', style: { display: 'none' },
    onchange: (e) => {
      const file = e.target.files[0];
      if (!file) return;
      uploadedFile.data = file;
      const titleInput = $('#smFileTitle');
      if (!titleInput.value.trim()) titleInput.value = file.name;
      fileLabel.innerHTML = '';
      fileLabel.appendChild(el('div', { style: { fontSize: '32px', marginBottom: '8px' }, text: '✅' }));
      fileLabel.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--c-success)' }, text: file.name }));
      fileLabel.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--c-text-muted)', marginTop: '4px' }, text: `${(file.size / 1024).toFixed(1)} KB · 点击重新选择` }));
    }
  });
  fileLabel.appendChild(fileInput);
  fileForm.appendChild(fileLabel);
  fileForm.appendChild(el('div', { class: 'form-group', style: { marginTop: '10px' } },
    el('label', { class: 'form-label', text: '备注（可选）' }),
    el('input', { class: 'form-input', id: 'smFileNote', placeholder: '简单描述...' })
  ));
  body.appendChild(fileForm);

  // 文字笔记表单
  const noteForm = el('div', { class: 'sm-form-note', style: { display: 'none' } });
  noteForm.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '笔记标题' }),
    el('input', { class: 'form-input', id: 'smNoteTitle', placeholder: '如：写作要点摘抄' })
  ));
  noteForm.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '笔记内容' }),
    el('textarea', { class: 'form-textarea', id: 'smNoteContent', placeholder: '输入笔记内容...', style: { minHeight: '120px' } })
  ));
  body.appendChild(noteForm);

  // 提交按钮
  body.appendChild(el('div', { class: 'form-actions' },
    el('button', { class: 'btn-cancel', onclick: closeModal }, '取消'),
    el('button', {
      class: 'btn-submit',
      onclick: () => {
        if (typeState.value === 'link') {
          const title = $('#smLinkTitle').value.trim();
          if (!title) { showToast('请输入素材标题', 'warning'); return; }
          const url = $('#smLinkUrl').value.trim();
          const note = $('#smLinkNote').value.trim();
          Store.addStudyMaterial({ title, category: catState.value, type: 'link', url, status: 'pending', note });
          closeModal();
          showToast('学习素材已添加', 'success');
        } else if (typeState.value === 'file') {
          const title = $('#smFileTitle').value.trim();
          if (!title) { showToast('请输入素材标题', 'warning'); return; }
          if (!uploadedFile.data) { showToast('请选择文件', 'warning'); return; }
          const file = uploadedFile.data;
          const note = $('#smFileNote').value.trim();
          // 小文件（<2MB）存储为 data URL，大文件只存元数据
          if (file.size < 2 * 1024 * 1024) {
            const reader = new FileReader();
            reader.onload = () => {
              Store.addStudyMaterial({
                title, category: catState.value, type: 'file', url: '',
                status: 'pending', note,
                fileName: file.name, fileSize: file.size, fileType: file.type,
                dataUrl: reader.result
              });
              closeModal();
              showToast('文件已上传并添加', 'success');
            };
            reader.onerror = () => {
              Store.addStudyMaterial({
                title, category: catState.value, type: 'file', url: '',
                status: 'pending', note,
                fileName: file.name, fileSize: file.size, fileType: file.type
              });
              closeModal();
              showToast('文件信息已记录（内容读取失败）', 'success');
            };
            reader.readAsDataURL(file);
          } else {
            Store.addStudyMaterial({
              title, category: catState.value, type: 'file', url: '',
              status: 'pending', note,
              fileName: file.name, fileSize: file.size, fileType: file.type
            });
            closeModal();
            showToast('文件已添加（大文件仅记录信息）', 'success');
          }
        } else {
          const title = $('#smNoteTitle').value.trim();
          if (!title) { showToast('请输入笔记标题', 'warning'); return; }
          const content = $('#smNoteContent').value.trim();
          Store.addStudyMaterial({ title, category: catState.value, type: 'note', url: '', status: 'pending', note: content });
          closeModal();
          showToast('笔记已添加', 'success');
        }
      }
    }, '添加')
  ));

  openModal('添加学习素材');
}

/* ---------- 工作素材库：添加素材 ---------- */
function openMaterialAddModal() {
  const body = $('#modalBody');
  body.innerHTML = '';

  const typeState = { value: 'document' };
  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '素材类型' }),
    (() => {
      const wrap = el('div', { class: 'type-selector' });
      const types = [
        { id: 'document', label: '📄 文稿方案' },
        { id: 'photo', label: '📷 照片素材' },
        { id: 'temp', label: '📎 临时素材' },
        { id: 'folder', label: '📁 本地文件夹' },
        { id: 'file', label: '📋 本地文件' },
      ];
      types.forEach(t => {
        const btn = el('div', {
          class: `type-option ${t.id === 'document' ? 'active' : ''}`,
          onclick: () => {
            wrap.querySelectorAll('.type-option').forEach(o => o.classList.remove('active'));
            btn.classList.add('active');
            typeState.value = t.id;
          }
        }, t.label);
        wrap.appendChild(btn);
      });
      return wrap;
    })()
  ));

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '素材名称' }),
    el('input', { class: 'form-input', id: 'materialName', placeholder: '输入素材名称...' })
  ));

  // 照片素材支持日期选择
  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '日期（可选）' }),
    (() => { const i = el('input', { class: 'form-input', type: 'date', id: 'materialDate' }); i.value = formatDate(new Date()); return i; })()
  ));

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '网盘链接（百度网盘、阿里云盘等）' }),
    el('input', { class: 'form-input', id: 'materialCloudUrl', placeholder: '如：https://pan.baidu.com/s/xxxxx' })
  ));

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '本地路径或文档链接（可选）' }),
    el('input', { class: 'form-input', id: 'materialUrl', placeholder: '本地路径或文档链接...' })
  ));

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '备注（如提取码等，可选）' }),
    el('input', { class: 'form-input', id: 'materialNote', placeholder: '如：提取码 abcd' })
  ));

  body.appendChild(el('div', { class: 'form-actions' },
    el('button', { class: 'btn-cancel', onclick: closeModal }, '取消'),
    el('button', {
      class: 'btn-submit',
      onclick: () => {
        const name = $('#materialName').value.trim();
        if (!name) { showToast('请输入素材名称', 'warning'); return; }
        const url = $('#materialUrl').value.trim();
        const cloudUrl = $('#materialCloudUrl') ? $('#materialCloudUrl').value.trim() : '';
        const note = $('#materialNote') ? $('#materialNote').value.trim() : '';
        const date = $('#materialDate') ? $('#materialDate').value : '';
        if (typeState.value === 'folder') {
          Store.addLocalFolder({ name, path: url || name });
          showToast('文件夹已添加', 'success');
        } else if (typeState.value === 'file') {
          Store.addLocalFile({ name, path: url || name });
          showToast('文件已添加', 'success');
        } else {
          const statusMap = { document: 'editing', photo: 'pending', temp: 'new' };
          const material = { title: name, status: statusMap[typeState.value], type: typeState.value, url, cloudUrl, note };
          if (date) material.date = date;
          Store.addWorkMaterial(typeState.value, material);
          showToast('素材已添加', 'success');
        }
        closeModal();
      }
    }, '添加')
  ));

  openModal('添加工作素材');
}

/* ============================================================
   添加热点弹窗
   ============================================================ */
function openAddHotspotModal() {
  const body = $('#modalBody');
  body.innerHTML = '';

  const tagState = { value: '党建', color: '#dc2626' };
  const tags = getHotspotTags();

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '热点标签' }),
    (() => {
      const wrap = el('div', { class: 'type-selector' });
      tags.forEach(t => {
        const btn = el('div', {
          class: `type-option ${t.label === '党建' ? 'active' : ''}`,
          style: t.label === '党建' ? { background: t.color, color: '#fff', borderColor: t.color } : {},
          onclick: () => {
            wrap.querySelectorAll('.type-option').forEach(o => { o.classList.remove('active'); o.style.background = ''; o.style.color = ''; o.style.borderColor = ''; });
            btn.classList.add('active');
            btn.style.background = t.color;
            btn.style.color = '#fff';
            btn.style.borderColor = t.color;
            tagState.value = t.label;
            tagState.color = t.color;
          }
        }, t.label);
        wrap.appendChild(btn);
      });
      return wrap;
    })()
  ));

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '热点标题' }),
    el('input', { class: 'form-input', id: 'hotspotTitle', placeholder: '输入热点标题...' })
  ));

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '内容摘要' }),
    el('textarea', { class: 'form-textarea', id: 'hotspotSummary', placeholder: '简要描述热点内容...' })
  ));

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '来源' }),
    el('input', { class: 'form-input', id: 'hotspotSource', placeholder: '如：人民网、求是网、新华社...' })
  ));

  body.appendChild(el('div', { class: 'form-group' },
    el('label', { class: 'form-label', text: '原文链接（必填，用于考证）' }),
    el('input', { class: 'form-input', id: 'hotspotLink', placeholder: 'http://...' })
  ));

  body.appendChild(el('div', { class: 'form-actions' },
    el('button', { class: 'btn-cancel', onclick: closeModal }, '取消'),
    el('button', {
      class: 'btn-submit',
      onclick: () => {
        const title = $('#hotspotTitle').value.trim();
        const link = $('#hotspotLink').value.trim();
        if (!title) { showToast('请输入热点标题', 'warning'); return; }
        if (!link) { showToast('请输入原文链接（用于考证）', 'warning'); return; }
        Store.addHotspot({
          tag: tagState.value,
          tagColor: tagState.color,
          title,
          summary: $('#hotspotSummary').value.trim(),
          source: $('#hotspotSource').value.trim() || '手动录入',
          link,
        });
        closeModal();
        showToast('热点已添加', 'success');
      }
    }, '添加')
  ));

  openModal('添加热点');
}

/* ============================================================
   AI热点检索弹窗
   ============================================================ */
function openHotspotAISearchModal(query) {
  const body = $('#modalBody');
  body.innerHTML = '';

  // 检索方向显示
  body.appendChild(el('div', {
    style: { marginBottom: '16px', padding: '12px 16px', background: 'var(--c-primary-bg)', borderRadius: 'var(--c-radius-md)', display: 'flex', alignItems: 'center', gap: '8px' }
  },
    el('span', { style: { fontSize: '20px' }, text: '🔍' }),
    el('div', {},
      el('div', { style: { fontSize: '13px', fontWeight: '700', color: 'var(--c-primary)' }, text: '检索方向：' + query }),
      el('div', { style: { fontSize: '11px', color: 'var(--c-text-secondary)', marginTop: '2px' }, text: 'AI已从多个权威源自动检索，请查看以下结果' })
    )
  ));

  // 多源检索链接 - 一键打开多个搜索源
  body.appendChild(el('div', { class: 'form-label', text: '一键多源检索（点击打开）' }));
  const sourceLinks = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' } });
  const sources = [
    { name: '人民网搜索', url: 'http://search.people.cn/s/?keyword=' + encodeURIComponent(query), color: '#dc2626' },
    { name: '求是网搜索', url: 'http://www.qstheory.cn/search/?q=' + encodeURIComponent(query), color: '#dc2626' },
    { name: '百度新闻', url: 'https://www.baidu.com/s?wd=' + encodeURIComponent(query) + '&tn=news', color: '#2563eb' },
    { name: '微博热搜', url: 'https://s.weibo.com/weibo?q=' + encodeURIComponent(query), color: '#e11d48' },
    { name: '知乎讨论', url: 'https://www.zhihu.com/search?q=' + encodeURIComponent(query) + '&type=content', color: '#0084ff' },
  ];
  sources.forEach(s => {
    sourceLinks.appendChild(el('a', {
      href: s.url,
      target: '_blank',
      rel: 'noopener',
      class: 'hotspot-link',
      style: { background: s.color + '15', color: s.color, borderColor: s.color + '30' }
    }, s.name));
  });
  body.appendChild(sourceLinks);

  // 全网检索按钮 - 一次性打开所有搜索源
  body.appendChild(el('button', {
    class: 'btn-submit',
    style: { width: '100%', marginBottom: '16px', padding: '10px', fontSize: '13px' },
    onclick: () => {
      sources.forEach((s, i) => {
        setTimeout(() => window.open(s.url, '_blank'), i * 300);
      });
      showToast('已打开' + sources.length + '个检索源', 'success');
    }
  }, '🚀 一键打开全部检索源'));

  // AI推荐热点 - 基于检索方向生成相关推荐
  body.appendChild(el('div', { class: 'form-label', text: 'AI推荐热点（基于检索方向，可一键添加）' }));

  const recommendations = generateHotspotRecommendations(query);
  const recList = el('div', { class: 'hotspot-list', style: { maxHeight: '350px', overflowY: 'auto' } });

  recommendations.forEach(rec => {
    const item = el('div', { class: 'hotspot-item', style: { position: 'relative' } });

    // 标签行
    const tagRow = el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } });
    tagRow.appendChild(el('span', {
      class: 'hotspot-tag',
      style: { background: rec.tagColor + '20', color: rec.tagColor },
      text: rec.tag
    }));
    tagRow.appendChild(el('span', { class: 'hotspot-source', text: rec.source }));
    item.appendChild(tagRow);

    item.appendChild(el('div', { class: 'hotspot-title', text: rec.title, style: { marginTop: '4px' } }));
    item.appendChild(el('div', { class: 'hotspot-summary', text: rec.summary }));

    // 操作行
    const actionRow = el('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } });
    actionRow.appendChild(el('a', {
      class: 'hotspot-link',
      href: rec.link,
      target: '_blank',
      rel: 'noopener',
      onclick: (e) => e.stopPropagation()
    }, svg('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', 10), '查看原文'));
    actionRow.appendChild(el('button', {
      class: 'btn-submit',
      style: { padding: '3px 12px', fontSize: '11px', marginLeft: 'auto' },
      onclick: () => {
        Store.addHotspot({
          tag: rec.tag,
          tagColor: rec.tagColor,
          title: rec.title,
          summary: rec.summary,
          link: rec.link,
          source: rec.source,
        });
        showToast('已添加到热点列表', 'success');
        item.style.opacity = '0.5';
        item.style.pointerEvents = 'none';
      }
    }, '添加'));
    item.appendChild(actionRow);

    recList.appendChild(item);
  });
  body.appendChild(recList);

  // 自定义添加
  body.appendChild(el('div', {
    style: { marginTop: '16px', padding: '12px', background: 'var(--c-surface-hover)', borderRadius: 'var(--c-radius-md)' }
  },
    el('div', { class: 'form-label', text: '未找到合适的热点？手动添加' }),
    el('button', {
      class: 'btn-cancel',
      style: { fontSize: '12px' },
      onclick: () => { closeModal(); setTimeout(() => openAddHotspotModal(), 200); }
    }, '手动添加热点')
  ));

  openModal('AI热点检索', true);
}

/* ---------- 生成热点推荐（基于检索方向） ---------- */
function generateHotspotRecommendations(query) {
  const q = query.toLowerCase();
  const recs = [];

  // 党建方向
  if (q.includes('党建') || q.includes('党') || q.includes('政治')) {
    recs.push(
      { tag: '党建', tagColor: '#dc2626', title: '深入学习贯彻党的二十届三中全会精神', summary: '全会《决定》擘画了进一步全面深化改革的蓝图，各级党组织持续推动学习走深走实。', link: 'http://politics.people.com.cn/', source: '人民网-中国共产党新闻网' },
      { tag: '党建', tagColor: '#dc2626', title: '以高质量党建引领高质量发展', summary: '坚持和加强党的全面领导，以党建引领各项事业高质量发展。', link: 'http://www.qstheory.cn/', source: '求是网' },
      { tag: '党建', tagColor: '#dc2626', title: '党纪学习教育常态化长效化', summary: '巩固深化党纪学习教育成果，推动全面从严治党向纵深发展。', link: 'http://politics.people.com.cn/', source: '人民网' },
    );
  }

  // 科技方向
  if (q.includes('科技') || q.includes('技术') || q.includes('创新') || q.includes('ai') || q.includes('人工智能')) {
    recs.push(
      { tag: '科技', tagColor: '#2563eb', title: '加快实现高水平科技自立自强', summary: '关键核心技术攻关取得新突破，人工智能、量子计算等前沿领域持续发力。', link: 'http://scitech.people.com.cn/', source: '人民网-科技频道' },
      { tag: '科技', tagColor: '#2563eb', title: '人工智能赋能千行百业', summary: 'AI大模型加速落地应用，赋能制造业、医疗、教育等领域。', link: 'http://it.people.com.cn/', source: '人民网-IT频道' },
      { tag: '科技', tagColor: '#2563eb', title: '量子科技发展进入新阶段', summary: '我国在量子通信、量子计算等领域取得系列突破。', link: 'http://scitech.people.com.cn/', source: '人民网-科技频道' },
    );
  }

  // 网络热梗方向
  if (q.includes('网络') || q.includes('热梗') || q.includes('热词') || q.includes('热搜')) {
    recs.push(
      { tag: '网络热梗', tagColor: '#8b5cf6', title: '本周网络热词盘点', summary: '网络流行语不断更新，反映社会心态和时代特征。关注正能量传播。', link: 'https://www.baidu.com/s?wd=本周网络热词', source: '百度热搜' },
      { tag: '网络热梗', tagColor: '#8b5cf6', title: '短视频传播正能量成为新趋势', summary: '正能量短视频获广泛关注，主流媒体创新传播方式。', link: 'https://www.baidu.com/s?wd=正能量短视频', source: '百度热搜' },
      { tag: '网络热梗', tagColor: '#8b5cf6', title: '网络文明建设新成效', summary: '网络空间日益清朗，营造风清气正的网络环境。', link: 'https://www.baidu.com/s?wd=网络文明建设', source: '百度热搜' },
    );
  }

  // 核聚变/核能方向
  if (q.includes('核') || q.includes('聚变') || q.includes('核能')) {
    recs.push(
      { tag: '核聚变', tagColor: '#0891b2', title: '可控核聚变研究持续推进', summary: '"中国环流三号"取得新进展，核能"三步走"战略稳步实施。', link: 'http://scitech.people.com.cn/', source: '人民网-科技频道' },
      { tag: '核聚变', tagColor: '#0891b2', title: '核能技术创新助力"双碳"目标', summary: '核电安全稳定运行，核能为实现碳达峰碳中和目标贡献力量。', link: 'http://energy.people.com.cn/', source: '人民网-能源频道' },
      { tag: '核聚变', tagColor: '#0891b2', title: '小型模块化反应堆技术进展', summary: 'SMR技术研发稳步推进，为核能多元化应用开辟新路径。', link: 'http://energy.people.com.cn/', source: '人民网-能源频道' },
    );
  }

  // 文化方向
  if (q.includes('文化') || q.includes('文明') || q.includes('精神')) {
    recs.push(
      { tag: '文化', tagColor: '#f59e0b', title: '新时代精神文明建设深入推进', summary: '新时代文明实践中心建设取得成效，以文化人、成风化俗。', link: 'http://opinion.people.com.cn/', source: '人民网-观点频道' },
      { tag: '文化', tagColor: '#f59e0b', title: '中华优秀传统文化创造性转化', summary: '推动中华优秀传统文化创造性转化、创新性发展。', link: 'http://culture.people.com.cn/', source: '人民网-文化频道' },
      { tag: '文化', tagColor: '#f59e0b', title: '红色文化传承与创新发展', summary: '用好红色资源、传承红色基因，让红色文化焕发新光芒。', link: 'http://culture.people.com.cn/', source: '人民网-文化频道' },
    );
  }

  // 如果没有匹配到特定方向，返回通用推荐
  if (recs.length === 0) {
    recs.push(
      { tag: '综合', tagColor: '#6366f1', title: '搜索：' + query, summary: '点击下方链接查看"' + query + '"相关的最新报道和分析。', link: 'https://www.baidu.com/s?wd=' + encodeURIComponent(query), source: '百度搜索' },
      { tag: '综合', tagColor: '#6366f1', title: '人民网检索：' + query, summary: '在人民网搜索"' + query + '"相关新闻和评论文章。', link: 'http://search.people.cn/s/?keyword=' + encodeURIComponent(query), source: '人民网搜索' },
      { tag: '综合', tagColor: '#6366f1', title: '求是网检索：' + query, summary: '在求是网搜索"' + query + '"相关理论文章和政策解读。', link: 'http://www.qstheory.cn/search/?q=' + encodeURIComponent(query), source: '求是网搜索' },
    );
  }

  return recs;
}

/* ============================================================
   随手记
   ============================================================ */
function renderNotes(container) {
  const wrap = el('div', { class: 'notes-container' });

  // 快速输入区
  const inputArea = el('div', { class: 'notes-input-area' });
  const textarea = el('textarea', {
    class: 'form-textarea notes-quick-input',
    placeholder: '随手记下灵感、想法、待办提醒...\n（Ctrl+Enter 快速保存）',
    style: { minHeight: '60px', marginBottom: '8px' }
  });
  inputArea.appendChild(textarea);

  const saveNote = () => {
    const content = textarea.value.trim();
    if (!content) { showToast('请输入内容', 'warning'); return; }
    Store.addQuickNote(content);
    showToast('已记录', 'success');
  };

  // Ctrl+Enter 快速保存
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveNote();
    }
  });

  inputArea.appendChild(el('button', {
    class: 'btn-submit',
    style: { padding: '6px 20px', fontSize: '12px' },
    onclick: saveNote
  }, '记录'));
  wrap.appendChild(inputArea);

  // 笔记列表
  if (Store.data.quickNotes.length === 0) {
    wrap.appendChild(el('div', { class: 'empty-state', style: { padding: '30px' } },
      el('div', { class: 'empty-text', text: '暂无随手记' }),
      el('div', { class: 'empty-hint', text: '在上方输入框快速记录想法' })
    ));
  } else {
    const list = el('div', { class: 'notes-list' });
    Store.data.quickNotes.forEach(note => {
      const item = el('div', { class: 'note-item' });
      item.appendChild(el('div', { class: 'note-content', text: note.content }));
      item.appendChild(el('div', { class: 'note-footer' },
        el('span', { class: 'note-time', text: timeAgo(note.createdAt) }),
        el('div', { class: 'note-actions' },
          el('button', {
            class: 'btn-icon',
            title: '复制',
            onclick: () => { navigator.clipboard.writeText(note.content); showToast('已复制', 'success'); }
          }, svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 12)),
          el('button', {
            class: 'btn-icon',
            title: '删除',
            onclick: () => Store.deleteQuickNote(note.id)
          }, svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 12))
        )
      ));
      list.appendChild(item);
    });
    wrap.appendChild(list);
  }

  container.appendChild(wrap);
}

/* ============================================================
   周视图
   ============================================================ */
function openWeekView() {
  const body = $('#weekBody');
  body.innerHTML = '';

  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1); // 周一

  const grid = el('div', { class: 'week-grid' });

  // 表头
  grid.appendChild(el('div', { class: 'week-head', text: '' }));
  const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const isToday = formatDate(d) === formatDate(today);
    grid.appendChild(el('div', { class: `week-head ${isToday ? 'today' : ''}`, text: `${weekdays[i]} ${d.getMonth()+1}/${d.getDate()}` }));
  }

  // 时间行
  const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  hours.forEach(h => {
    grid.appendChild(el('div', { class: 'week-time', text: `${h}:00` }));
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const dateStr = formatDate(d);
      const tasks = Store.data.tasks.filter(t => t.deadline && t.deadline.startsWith(dateStr) && t.deadline.includes('T') && new Date(t.deadline).getHours() === h);
      const cell = el('div', { class: `week-cell ${tasks.length > 0 ? 'has-task' : ''}` });
      tasks.forEach(t => cell.appendChild(el('div', { class: 'week-task', text: t.title })));
      grid.appendChild(cell);
    }
  });

  body.appendChild(grid);

  // 本周统计
  const weekTasks = Store.data.tasks.filter(t => {
    if (!t.deadline) return false;
    const d = new Date(t.deadline);
    return d >= weekStart && d < addDays(weekStart, 7);
  });
  const doneCount = weekTasks.filter(t => t.status === 'done').length;

  body.appendChild(el('div', {
    style: { marginTop: '16px', padding: '12px 16px', background: 'var(--c-surface-hover)', borderRadius: 'var(--radius-md)', fontSize: '13px' }
  },
    el('strong', { text: '本周任务负载：' }),
    `共 ${weekTasks.length} 项，已完成 ${doneCount} 项，完成率 ${weekTasks.length > 0 ? Math.round(doneCount/weekTasks.length*100) : 0}%`
  ));

  $('#weekOverlay').style.display = 'flex';
  setTimeout(() => $('#weekOverlay').classList.add('show'), 10);
}

/* ============================================================
   Toast 通知
   ============================================================ */
function showToast(message, type = 'info', duration = 3500) {
  const container = $('#toastContainer');
  const t = el('div', { class: `toast ${type}` });

  const icons = {
    success: '✓',
    warning: '!',
    danger: '×',
    info: 'i',
  };
  t.appendChild(el('span', {
    style: {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '20px', height: '20px', borderRadius: '50%',
      background: type === 'success' ? 'var(--c-success)' : type === 'warning' ? 'var(--c-warning)' : type === 'danger' ? 'var(--c-danger)' : 'var(--c-info)',
      color: '#fff', fontSize: '12px', fontWeight: '700', flexShrink: '0'
    },
    text: icons[type] || 'i'
  }));
  t.appendChild(el('span', { text: message, style: { whiteSpace: 'pre-line' } }));

  container.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(100%)';
    t.style.transition = 'all .3s';
    setTimeout(() => t.remove(), 300);
  }, duration);
}

/* ============================================================
   自动抓取文章标题
   ============================================================ */
async function fetchArticleTitle(url, titleInput, statusEl) {
  if (!url || !url.startsWith('http')) return;

  if (statusEl) {
    statusEl.textContent = '正在抓取标题...';
    statusEl.style.display = 'block';
  }

  const corsProxy = 'https://api.allorigins.win/raw?url=';
  try {
    const resp = await fetch(corsProxy + encodeURIComponent(url), { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const html = await resp.text();

    // 提取 <title> 标签内容
    let title = '';
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }

    // 如果 title 标签没有，尝试 og:title
    if (!title) {
      const ogMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
      if (ogMatch) title = ogMatch[1].trim();
    }

    // 清理标题中的多余空白和特殊字符
    title = title.replace(/\s+/g, ' ').replace(/["']/g, '').trim();

    if (title && title.length > 2) {
      if (titleInput) {
        titleInput.value = title;
        titleInput.style.borderColor = 'var(--c-success)';
        setTimeout(() => { if (titleInput) titleInput.style.borderColor = ''; }, 2000);
      }
      if (statusEl) {
        statusEl.textContent = '✓ 已自动获取标题';
        statusEl.style.color = 'var(--c-success)';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      }
      return title;
    } else {
      throw new Error('未找到标题');
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = '⚠ 自动抓取失败，请手动输入标题';
      statusEl.style.color = 'var(--c-warning)';
      setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
    }
    return null;
  }
}

/* ============================================================
   系统级通知（Web Notifications API + Web Push）
   ============================================================ */

// VAPID 公钥（用于推送订阅，私钥保存在 Supabase Edge Function 中）
const VAPID_PUBLIC_KEY = 'BHrpA66ckvRrahDM--9Vd7UqKtCqguIg3YbufFIKThXycebFLK1x78p60-RxXe8Df9O_Ih7CxA9S6n7BIpWbXO4';

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('当前浏览器不支持系统通知', 'warning');
    return false;
  }

  // 已授权 → 直接订阅推送
  if (Notification.permission === 'granted') {
    await subscribeToPush();
    return true;
  }

  // 已被拒绝 → 引导用户去浏览器设置
  if (Notification.permission === 'denied') {
    showToast('通知权限已被拒绝。请点击地址栏左侧 🔒 图标 → 网站设置 → 通知 → 允许，然后刷新页面', 'warning', 8000);
    return false;
  }

  // 默认状态 → 请求权限
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      showToast('系统通知已开启', 'success');
      // 等待浏览器内部完成权限状态更新，再尝试订阅
      await new Promise(r => setTimeout(r, 800));
      await subscribeToPush();
      return true;
    } else {
      showToast('通知权限被拒绝。如需开启：地址栏左侧 🔒 → 通知 → 允许', 'warning', 8000);
      return false;
    }
  } catch (err) {
    console.error('[Notif] requestPermission error:', err);
    showToast('请求通知权限失败：' + err.message, 'danger');
    return false;
  }
}

function showSystemNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }
  try {
    const notification = new Notification('JOYZWORK - ' + title, {
      body: body,
      icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"%3E%3Crect width="192" height="192" rx="40" fill="%236366f1"/%3E%3Ctext x="96" y="130" font-size="100" font-weight="800" fill="white" text-anchor="middle" font-family="sans-serif"%3EJ%3C/text%3E%3C/svg%3E',
      tag: 'joyzwork-' + Date.now(),
      requireInteraction: false,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    setTimeout(() => notification.close(), 10000);
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- Web Push 订阅 ---------- */
async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('当前浏览器不支持推送通知', 'warning');
    return;
  }

  // VAPID 公钥格式校验
  if (VAPID_PUBLIC_KEY.length < 80) {
    console.error('[Push] VAPID key too short:', VAPID_PUBLIC_KEY.length);
    showToast('VAPID 公钥格式异常，请联系管理员', 'danger');
    return;
  }

  // 通知权限检查
  if (Notification.permission === 'denied') {
    showToast('通知权限被拒绝。请点击地址栏左侧 🔒 → 网站设置 → 通知 → 允许，然后刷新', 'warning', 8000);
    return;
  }
  // 如果是 default，主动请求一次
  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      showToast('通知权限未授权，无法订阅推送', 'warning');
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    console.log('[Push] SW ready, scope:', registration.scope);

    // 先清理旧订阅（防止残留订阅导致冲突）
    let existingSub = await registration.pushManager.getSubscription();
    if (existingSub) {
      console.log('[Push] Found old subscription, unsubscribing first...');
      await existingSub.unsubscribe();
      // 同步删除 Supabase 中的旧记录
      try { await SupabaseSync._request('DELETE', 'push_subscriptions?id=eq.' + SupabaseSync.getDeviceId()); } catch (e) {}
    }

    // 转换 VAPID 公钥
    const convertedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    console.log('[Push] VAPID key converted, byte length:', convertedKey.length, '| first byte:', convertedKey[0]);

    // 订阅推送
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey,
    });
    console.log('[Push] 订阅成功! endpoint:', subscription.endpoint);
    showToast('推送订阅成功！', 'success');

    // 保存到 Supabase
    await savePushSubscriptionToSupabase(subscription);
  } catch (err) {
    console.error('[Push] 订阅失败:', err.name, '|', err.message, '|', err.stack);
    let errorMsg = err.message;
    let guidance = '';

    if (err.name === 'NotAllowedError') {
      errorMsg = '浏览器拒绝了推送注册（权限被拒绝）';
      guidance = '\n\n请逐项检查：\n1️⃣ 浏览器地址栏左侧 🔒 → 网站设置 → 通知 → 允许\n2️⃣ Windows: 设置 → 系统 → 通知 → 开启"获取通知"\n3️⃣ 关闭专注助手/勿扰模式\n4️⃣ 清除浏览器数据后重新打开网站';
    } else if (err.name === 'AbortError') {
      errorMsg = '推送服务器连接超时（FCM被墙）';
      guidance = '\n\nChrome/Edge 在国内无法使用后台推送（Google FCM 被墙）。\n已自动启用本地提醒模式 — APP 打开时仍可收到系统通知弹窗。\n\n如需后台推送：请使用 Firefox 浏览器（Mozilla推送服务在国内可用）。';
      // 自动启用本地提醒模式
      localStorage.setItem('joyzwork_push_mode', 'local');
      startLocalReminderCheck();
    } else if (err.name === 'InvalidStateError') {
      errorMsg = 'Service Worker 状态异常，请刷新页面后重试';
    } else if (err.message.includes('applicationServerKey') || err.message.includes('key')) {
      errorMsg = 'VAPID 公钥格式错误';
    } else if (err.message.includes('registration failed')) {
      errorMsg = '推送服务注册失败';
      guidance = '\n可能原因：浏览器不支持 / VAPID密钥无效 / 网络问题';
    }

    showToast('推送订阅失败：' + errorMsg + guidance, 'danger', 12000);

    // 清理可能的半成品订阅
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    } catch (e) {}
  }
}

/* ---------- 本地提醒轮询（FCM 被墙的后备方案） ---------- */
let _localReminderTimer = null;
let _lastNotifiedTaskIds = new Set(); // 防止重复通知

function startLocalReminderCheck() {
  if (_localReminderTimer) return; // 已启动
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  console.log('[Remind] 本地提醒轮询已启动（每60秒检查到期任务）');
  localStorage.setItem('joyzwork_push_mode', 'local');

  // 立即检查一次
  checkAndNotifyDueTasks();

  // 每 60 秒检查
  _localReminderTimer = setInterval(checkAndNotifyDueTasks, 60000);
}

function stopLocalReminderCheck() {
  if (_localReminderTimer) {
    clearInterval(_localReminderTimer);
    _localReminderTimer = null;
    console.log('[Remind] 本地提醒轮询已停止');
  }
}

function checkAndNotifyDueTasks() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

  // 检查今日任务的提醒时间
  Store.data.tasks.forEach(task => {
    if (task.status === 'done' || task.status === 'cancelled') return;
    if (!task.reminderTime) return;

    // 已过提醒时间且未通知过
    const notifyKey = task.id + '_' + today;
    if (_lastNotifiedTaskIds.has(notifyKey)) return;

    if (currentTime >= task.reminderTime) {
      // 检查是否在提醒时间前后 30 分钟内（避免补通知太久之前的）
      const [rh, rm] = task.reminderTime.split(':').map(Number);
      const reminderMinutes = rh * 60 + rm;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (nowMinutes - reminderMinutes <= 30) {
        _lastNotifiedTaskIds.add(notifyKey);
        showSystemNotification('任务提醒', '📋 ' + task.title + '\n⏰ 提醒时间：' + task.reminderTime);
      }
    }
  });

  // 检查今日到期的周期任务
  Store.data.recurringTasks.forEach(task => {
    if (!task.enabled) return;
    if (!Store.isRecurringDueOnDate(task, today)) return;
    if (!task.preferredTime) return;

    const notifyKey = 'recurring_' + task.id + '_' + today;
    if (_lastNotifiedTaskIds.has(notifyKey)) return;

    if (currentTime >= task.preferredTime) {
      const [rh, rm] = task.preferredTime.split(':').map(Number);
      const reminderMinutes = rh * 60 + rm;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (nowMinutes - reminderMinutes <= 30) {
        _lastNotifiedTaskIds.add(notifyKey);
        showSystemNotification('周期任务提醒', '🔄 ' + task.title + '\n⏰ ' + Store.getCycleDescription(task));
      }
    }
  });

  // 检查会议提醒（硬时间在前 10 分钟）
  Store.data.tasks.filter(t => t.type === 'meeting' && t.status === 'pending').forEach(task => {
    if (!task.startTime) return;
    const notifyKey = 'meeting_' + task.id + '_' + today;
    if (_lastNotifiedTaskIds.has(notifyKey)) return;

    const [th, tm] = task.startTime.split(':').map(Number);
    const taskMinutes = th * 60 + tm;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const diff = taskMinutes - nowMinutes;

    if (diff >= 0 && diff <= 10) {
      _lastNotifiedTaskIds.add(notifyKey);
      showSystemNotification('会议即将开始', '📅 ' + task.title + '\n⏰ ' + task.startTime + (diff === 0 ? '（现在开始）' : `（${diff}分钟后）`));
    }
  });

  // 每天清理过期通知记录
  if (now.getHours() === 0 && now.getMinutes() < 5) {
    _lastNotifiedTaskIds.clear();
  }
}

/* ---------- 保存推送订阅到 Supabase ---------- */
async function savePushSubscriptionToSupabase(subscription) {
  if (!SupabaseSync.isConfigured()) {
    showToast('未配置 Supabase，推送订阅仅本地生效（APP需保持打开）', 'info');
    return;
  }
  try {
    const deviceId = SupabaseSync.getDeviceId();
    const subscriptionJson = subscription.toJSON();
    const payload = {
      id: deviceId,
      device_name: navigator.userAgent.includes('Mobile') ? '手机端' : '电脑端',
      subscription: subscriptionJson,
      updated_at: new Date().toISOString(),
    };
    await SupabaseSync._request('POST', 'push_subscriptions', payload);
    showToast('推送已注册到云端，关闭APP也能收到提醒！', 'success');
  } catch (err) {
    console.warn('Save push subscription failed:', err.message);
    showToast('推送订阅保存失败，请确保已在 Supabase 中创建 push_subscriptions 表', 'warning');
  }
}

/* ---------- VAPID 公钥转换工具 ---------- */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/* ---------- 打开推送设置弹窗 ---------- */
function openPushSettingsModal() {
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });

  const permission = ('Notification' in window) ? Notification.permission : 'unsupported';
  const supported = ('serviceWorker' in navigator) && ('PushManager' in window);

  // 状态显示
  const statusBox = el('div', { style: { padding: '14px', borderRadius: 'var(--radius-md)', fontSize: '13px', lineHeight: '1.6' } });
  if (!supported) {
    statusBox.style.background = '#fef2f2';
    statusBox.style.border = '1px solid #ef4444';
    statusBox.appendChild(el('div', { style: { fontWeight: '700', color: '#991b1b', marginBottom: '6px' }, text: '⚠️ 当前浏览器不支持推送通知' }));
    statusBox.appendChild(el('div', { style: { color: '#991b1b' }, text: '请使用 Chrome、Edge 或 Firefox 浏览器的最新版本。iOS 需 16.4 以上版本并安装为 PWA。' }));
  } else if (permission === 'granted') {
    statusBox.style.background = '#ecfdf5';
    statusBox.style.border = '1px solid #10b981';
    statusBox.appendChild(el('div', { style: { fontWeight: '700', color: '#065f46', marginBottom: '6px' }, text: '✅ 系统通知已开启' }));
    statusBox.appendChild(el('div', { style: { color: '#065f46' }, text: '提醒将同时显示在应用内和电脑/手机系统通知栏。' }));
  } else if (permission === 'denied') {
    statusBox.style.background = '#fef2f2';
    statusBox.style.border = '1px solid #ef4444';
    statusBox.appendChild(el('div', { style: { fontWeight: '700', color: '#991b1b', marginBottom: '6px' }, text: '❌ 通知权限被拒绝' }));
    statusBox.appendChild(el('div', { style: { color: '#991b1b' }, text: '请在浏览器设置中手动开启通知权限，然后刷新页面。' }));
  } else {
    statusBox.style.background = '#fefce8';
    statusBox.style.border = '1px solid #f59e0b';
    statusBox.appendChild(el('div', { style: { fontWeight: '700', color: '#92400e', marginBottom: '6px' }, text: '⏳ 通知权限未开启' }));
    statusBox.appendChild(el('div', { style: { color: '#92400e' }, text: '点击下方按钮开启系统通知权限。' }));
  }
  body.appendChild(statusBox);

  // 推送状态
  if (supported && permission === 'granted') {
    const pushMode = localStorage.getItem('joyzwork_push_mode') || 'unknown';
    const pushStatus = el('div', { style: { padding: '12px', background: 'var(--c-bg-2)', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--c-text-secondary)' } });
    pushStatus.appendChild(el('div', { style: { fontWeight: '700', marginBottom: '4px' }, text: '📡 推送模式' }));

    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        if (sub) {
          pushStatus.appendChild(el('div', { text: '✅ 已订阅 Web Push — 关闭浏览器后仍可收到提醒' }));
          if (SupabaseSync.isConfigured()) {
            pushStatus.appendChild(el('div', { style: { marginTop: '4px', color: '#10b981' }, text: '✅ 云端推送已激活' }));
          }
        } else if (pushMode === 'local') {
          pushStatus.appendChild(el('div', { style: { color: '#f59e0b', fontWeight: '600' }, text: '📱 本地提醒模式（FCM被墙）' }));
          pushStatus.appendChild(el('div', { style: { marginTop: '4px' }, text: 'Chrome/Edge 无法连接 Google 推送服务器，已自动切换为本地提醒。' }));
          pushStatus.appendChild(el('div', { style: { marginTop: '4px', color: '#10b981' }, text: '✅ APP 打开时：到期任务/会议提醒自动弹系统通知' }));
          pushStatus.appendChild(el('div', { style: { marginTop: '2px', color: '#ef4444' }, text: '❌ APP 关闭后：无法收到推送' }));
          pushStatus.appendChild(el('div', { style: { marginTop: '4px', fontSize: '11px', color: 'var(--c-text-muted)' }, text: '💡 如需后台推送，请使用 Firefox 浏览器' }));
        } else {
          pushStatus.appendChild(el('div', { text: '⏳ 尚未订阅推送服务，点击下方按钮订阅' }));
        }
      });
    });
    body.appendChild(pushStatus);
  }

  // 操作按钮
  const btnRow = el('div', { style: { display: 'flex', gap: '8px' } });
  if (supported && permission !== 'granted') {
    btnRow.appendChild(el('button', {
      class: 'btn btn-primary', style: { flex: '1' },
      onclick: async () => { await requestNotificationPermission(); setTimeout(() => openPushSettingsModal(), 2000); }
    }, '🔔 开启系统通知'));
  }
  if (supported && permission === 'granted') {
    btnRow.appendChild(el('button', {
      class: 'btn btn-primary', style: { flex: '1' },
      onclick: async () => { await subscribeToPush(); setTimeout(() => openPushSettingsModal(), 1500); }
    }, '📡 订阅/刷新推送'));
  }
  if (btnRow.children.length > 0) body.appendChild(btnRow);

  // 说明
  body.appendChild(el('div', {
    style: { padding: '10px', background: 'var(--c-primary-bg)', borderRadius: 'var(--radius-sm)', fontSize: '11px', color: 'var(--c-text-secondary)', lineHeight: '1.5' }
  },
    el('div', { style: { fontWeight: '700', marginBottom: '4px' }, text: '使用说明' }),
    el('div', { style: { marginBottom: '3px' }, text: '1. 点击「开启系统通知」授权通知权限' }),
    el('div', { style: { marginBottom: '3px' }, text: '2. 点击「订阅推送」尝试注册后台推送' }),
    el('div', { style: { marginBottom: '3px', color: '#ef4444' }, text: '⚠️ Chrome/Edge 国内无法后台推送（Google FCM 被墙）' }),
    el('div', { style: { marginBottom: '3px', color: '#10b981' }, text: '✅ 自动回退为本地提醒模式：APP打开时到期任务弹系统通知' }),
    el('div', { style: { marginBottom: '3px' }, text: '4. Firefox 浏览器可使用完整后台推送（Mozilla推送服务国内可用）' }),
    el('div', { text: '5. 手机端需安装为 PWA（添加到桌面）才能锁屏接收' })
  ));

  body.appendChild(el('div', { class: 'form-actions', style: { marginTop: '8px' } },
    el('button', { class: 'btn-submit', onclick: closeModal }, '关闭')
  ));

  openModal('通知 & 推送设置');
  $('#modalBody').innerHTML = '';
  $('#modalBody').appendChild(body);
}

/* ============================================================
   定时检查 & 提醒
   ============================================================ */
function checkReminders() {
  const now = new Date();
  const todayStr = formatDate(now);
  const tasks = Store.data.tasks.filter(t => t.deadline && t.deadline.startsWith(todayStr) && t.status !== 'done');

  tasks.forEach(t => {
    const deadline = new Date(t.deadline);
    const diff = deadline - now;

    // 使用任务自定义提醒时间（数组，多选）
    const reminders = Array.isArray(t.reminderMinutes) ? t.reminderMinutes : (t.reminderMinutes ? [t.reminderMinutes] : []);
    reminders.forEach(reminderMin => {
      if (reminderMin && reminderMin > 0 && diff > 0) {
        const reminderMs = reminderMin * 60 * 1000;
        // 在提醒时间点附近触发（1分钟窗口）
        if (diff <= reminderMs && diff > reminderMs - 60 * 1000) {
          const typeLabel = t.type === 'internal_meeting' || t.type === 'external_meeting' ? '会议' : '任务';
          const notifBody = `${typeLabel}将在约${reminderMin}分钟后开始，请做好准备`;
          Store.addNotification({
            type: t.type === 'internal_meeting' || t.type === 'external_meeting' ? 'meeting' : 'deadline',
            title: t.title,
            desc: notifBody,
          });
          showToast(`⏰ ${typeLabel}提醒：${t.title}（${reminderMin}分钟后）`, 'warning');
          // 系统级通知
          showSystemNotification(typeLabel + '提醒', `${t.title}\n${notifBody}`);
        }
      }
    });

    // 逾期提醒
    if (diff < 0 && diff > -60 * 1000) {
      Store.updateTask(t.id, { status: 'overdue' });
      Store.addNotification({
        type: 'deadline',
        title: t.title,
        desc: '任务已逾期，请尽快处理',
      });
      showToast(`⚠️ 任务已逾期：${t.title}`, 'danger');
      showSystemNotification('任务逾期', `${t.title}\n任务已逾期，请尽快处理`);
    }
  });

  // 晚间学习打卡提醒
  const hour = now.getHours();
  if (hour === 20 && now.getMinutes() < 1) {
    const checkin = Store.getTodayCheckins();
    const pending = Store.data.studyItems.filter(item => checkin.items[item.id]?.status !== 'done');
    if (pending.length > 0) {
      const notifBody = `还有 ${pending.length} 项未完成：${pending.map(s => s.name).join('、')}`;
      Store.addNotification({
        type: 'study',
        title: '今日学习打卡未完成',
        desc: notifBody,
      });
      showToast(`📚 今日学习打卡还有 ${pending.length} 项未完成`, 'warning');
      showSystemNotification('学习打卡提醒', notifBody);
    }
  }
}

/* ============================================================
   移动端导航
   ============================================================ */
function switchMobileSection(section) {
  // 移动端导航高亮
  $$('.mobile-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === section);
  });

  // 隐藏所有面板
  $$('.left-panel, .right-panel, .bottom-panel').forEach(p => p.classList.remove('mobile-active'));

  // section → panel + tab 映射
  const map = {
    schedule: { panel: 'left', tab: 'schedule' },
    tasks: { panel: 'left', tab: 'tasks' },
    study: { panel: 'left', tab: 'study' },
    intel: { panel: 'right', tab: 'intel' },
    ai: { panel: 'right', tab: 'ai' },
    review: { panel: 'bottom', tab: 'review' },
    notes: { panel: 'bottom', tab: 'notes' },
  };

  const target = map[section];
  if (!target) return;

  // 切换 tab
  if (target.panel === 'left') switchTabLeft(target.tab);
  else if (target.panel === 'right') switchTabRight(target.tab);
  else switchTabBottom(target.tab);

  // 显示对应面板
  const panelEl = target.panel === 'left' ? '.left-panel' : target.panel === 'right' ? '.right-panel' : '.bottom-panel';
  $(panelEl).classList.add('mobile-active');
}

/* ============================================================
   事件绑定 & 初始化
   ============================================================ */
function initEvents() {
  // Tab 切换
  $$('.left-panel .tab').forEach(t => t.addEventListener('click', () => switchTabLeft(t.dataset.tab)));
  $$('.right-panel .tab').forEach(t => t.addEventListener('click', () => switchTabRight(t.dataset.tab)));
  $$('.bottom-panel .tab').forEach(t => t.addEventListener('click', () => switchTabBottom(t.dataset.tab)));

  // 侧边导航栏 — 快速跳转
  $$('.side-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.target;
      // 高亮当前
      $$('.side-nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      // 切换到对应面板
      const panelMap = {
        schedule: 'left', tasks: 'left', study: 'left',
        intel: 'right', ai: 'right', studyLib: 'right',
        worklib: 'bottom', review: 'bottom', notes: 'bottom',
      };
      const panel = panelMap[target];
      if (panel) switchTab(panel, target);
      // 滚动到对应面板
      const sectionId = panel === 'left' ? 'section-schedule' : panel === 'right' ? 'section-intel' : 'section-worklib';
      const sectionEl = document.getElementById(sectionId);
      if (sectionEl) sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // 移动端底部导航
  $$('.mobile-nav-item').forEach(item => {
    item.addEventListener('click', () => switchMobileSection(item.dataset.section));
  });

  // 快捷录入
  $('#btnQuickAdd').addEventListener('click', openQuickAddModal);
  $('#btnAddTask').addEventListener('click', openQuickAddModal);
  // 周期任务管理
  const btnRecurring = $('#btnRecurringTask');
  if (btnRecurring) btnRecurring.addEventListener('click', openRecurringTaskModal);
  $('#btnAddIntel').addEventListener('click', () => {
    if (state.rightTab === 'studyLib') openStudyMaterialAddModal();
    else openIntelAddModal();
  });
  $('#btnAddMaterial').addEventListener('click', openMaterialAddModal);

  // 周视图
  $('#btnWeekView').addEventListener('click', openWeekView);
  $('#weekClose').addEventListener('click', () => {
    $('#weekOverlay').classList.remove('show');
    setTimeout(() => $('#weekOverlay').style.display = 'none', 200);
  });

  // 安装引导
  $('#btnInstall').addEventListener('click', openInstallGuideModal);

  // 云同步
  $('#btnCloudSync').addEventListener('click', openCloudSyncModal);

  // 安全设置
  $('#btnSecurity')?.addEventListener('click', openSecurityModal);
  updateSecurityLabel();

  // 弹窗关闭
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalOverlay').addEventListener('click', (e) => {
    if (e.target === $('#modalOverlay')) closeModal();
  });

  // 搜索
  let searchTimer;
  $('#globalSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderSearchResults(e.target.value), 200);
  });
  $('#globalSearch').addEventListener('focus', (e) => {
    if (e.target.value) renderSearchResults(e.target.value);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) $('#searchResults').classList.remove('show');
  });

  // 通知
  $('#btnNotif').addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = $('#notifPanel');
    panel.classList.toggle('show');
    if (panel.classList.contains('show')) renderNotifPanel();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.notif-wrap')) $('#notifPanel').classList.remove('show');
  });
  // 推送设置按钮（长按通知按钮 or 单独按钮）
  $('#btnPushSettings')?.addEventListener('click', openPushSettingsModal);

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      $('#weekOverlay').classList.remove('show');
      $('#searchResults').classList.remove('show');
    }
    // Ctrl/Cmd + K 聚焦搜索
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      $('#globalSearch').focus();
    }
    // Ctrl/Cmd + N 快捷录入
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      openQuickAddModal();
    }
  });
}

/* ---------- 每日一句 ---------- */
function initDailyQuote() {
  const quoteEl = $('#quoteText');
  if (quoteEl) quoteEl.textContent = Store.getDailyQuote();
}

/* ============================================================
   PWA 安装 & 桌面快捷方式
   ============================================================ */
let deferredInstallPrompt = null;

function initPWAInstall() {
  // 捕获 beforeinstallprompt 事件
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });

  // 监听安装完成
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    showToast('JOYZWORK 已安装到桌面！', 'success');
  });
}

function openInstallGuideModal() {
  const body = $('#modalBody');
  body.innerHTML = '';

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (isStandalone) {
    body.appendChild(el('div', {
      style: { textAlign: 'center', padding: '30px 20px' }
    },
      el('div', { style: { fontSize: '48px', marginBottom: '12px' }, text: '✅' }),
      el('div', { style: { fontSize: '16px', fontWeight: '700', marginBottom: '6px' }, text: '已在应用模式运行' }),
      el('div', { style: { fontSize: '13px', color: 'var(--c-text-secondary)' }, text: 'JOYZWORK 已安装为独立应用，享受原生应用体验' })
    ));
    openModal('安装 & 快捷方式');
    return;
  }

  // 安装方式选择
  body.appendChild(el('div', {
    style: { marginBottom: '20px', padding: '16px', background: 'var(--c-primary-bg)', borderRadius: 'var(--c-radius-md)', textAlign: 'center' }
  },
    el('div', { style: { fontSize: '32px', marginBottom: '8px' }, text: '📱' }),
    el('div', { style: { fontSize: '15px', fontWeight: '700', color: 'var(--c-primary)' }, text: '将 JOYZWORK 安装到设备' }),
    el('div', { style: { fontSize: '12px', color: 'var(--c-text-secondary)', marginTop: '4px' }, text: '安装后可像原生APP一样使用，支持离线、桌面快捷方式、全屏模式' })
  ));

  // 方式一：PWA一键安装（如果浏览器支持）
  const pwaSection = el('div', { style: { marginBottom: '20px' } });
  pwaSection.appendChild(el('div', { class: 'form-label', text: '方式一：一键安装（推荐）' }));
  if (deferredInstallPrompt) {
    pwaSection.appendChild(el('button', {
      class: 'btn-submit',
      style: { width: '100%', padding: '12px', fontSize: '14px' },
      onclick: async () => {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('正在安装...', 'success');
        }
        deferredInstallPrompt = null;
        closeModal();
      }
    }, '🚀 一键安装到桌面'));
  } else {
    pwaSection.appendChild(el('div', {
      style: { padding: '12px', background: 'var(--c-surface-hover)', borderRadius: 'var(--c-radius-md)', fontSize: '12px', color: 'var(--c-text-secondary)', lineHeight: '1.6' }
    },
      el('div', { style: { fontWeight: '600', marginBottom: '4px', color: 'var(--c-text)' }, text: '浏览器安装指引：' }),
      el('div', { style: { marginTop: '6px' }, text: 'Chrome/Edge：点击地址栏右侧的安装图标 ⊕，或菜单 → 安装此应用' }),
      el('div', { text: 'Safari：点击分享按钮 → 添加到主屏幕' }),
      el('div', { text: '手机Chrome：菜单 → 添加到主屏幕 → 安装应用' })
    ));
  }
  body.appendChild(pwaSection);

  // 方式二：创建桌面快捷方式
  const shortcutSection = el('div', { style: { marginBottom: '20px' } });
  shortcutSection.appendChild(el('div', { class: 'form-label', text: '方式二：创建桌面快捷方式' }));

  // 生成快捷方式文件（.url 格式，Windows 可用）
  const currentUrl = window.location.href;
  const urlContent = '[InternetShortcut]\r\nURL=' + currentUrl + '\r\nIconIndex=0\r\n';

  shortcutSection.appendChild(el('div', {
    style: { padding: '12px', background: 'var(--c-surface-hover)', borderRadius: 'var(--c-radius-md)', fontSize: '12px', lineHeight: '1.8' }
  },
    el('div', { style: { fontWeight: '600', marginBottom: '6px' }, text: 'Windows 桌面快捷方式：' }),
    el('div', { text: '1. 点击下方"下载快捷方式"按钮' }),
    el('div', { text: '2. 将下载的文件拖到桌面即可使用' }),
    el('div', { text: '3. 双击快捷方式即可快速打开 JOYZWORK' }),
    el('div', { style: { marginTop: '8px', fontWeight: '600', marginBottom: '6px' }, text: 'Mac 桌面快捷方式：' }),
    el('div', { text: '1. 在浏览器中拖动地址栏图标到桌面' }),
    el('div', { text: '2. 或使用 Safari → 文件 → 添加到阅读列表/书签' })
  ));

  shortcutSection.appendChild(el('a', {
    href: 'data:text/plain;charset=utf-8,' + encodeURIComponent(urlContent),
    download: 'JOYZWORK.url',
    class: 'btn-submit',
    style: { display: 'flex', justifyContent: 'center', width: '100%', padding: '10px', fontSize: '13px', marginTop: '8px', textDecoration: 'none' }
  }, '💾 下载桌面快捷方式（.url）'));
  body.appendChild(shortcutSection);

  // 方式三：手机APP安装
  const mobileSection = el('div', { style: { marginBottom: '10px' } });
  mobileSection.appendChild(el('div', { class: 'form-label', text: '方式三：手机安装为APP' }));
  mobileSection.appendChild(el('div', {
    style: { padding: '12px', background: 'var(--c-surface-hover)', borderRadius: 'var(--c-radius-md)', fontSize: '12px', lineHeight: '1.8' }
  },
    el('div', { style: { fontWeight: '600', marginBottom: '6px' }, text: 'Android 手机：' }),
    el('div', { text: '1. 用 Chrome 打开本页面' }),
    el('div', { text: '2. 菜单 → 添加到主屏幕 → 安装应用' }),
    el('div', { text: '3. 安装后可在桌面看到 JOYZWORK 图标' }),
    el('div', { style: { marginTop: '8px', fontWeight: '600', marginBottom: '6px' }, text: 'iPhone / iPad：' }),
    el('div', { text: '1. 用 Safari 打开本页面' }),
    el('div', { text: '2. 点击底部分享按钮' }),
    el('div', { text: '3. 选择"添加到主屏幕"' }),
    el('div', { text: '4. 点击"添加"完成安装' })
  ));
  body.appendChild(mobileSection);

  // 当前访问地址
  body.appendChild(el('div', {
    style: { marginTop: '16px', padding: '10px 12px', background: 'var(--c-info-bg)', borderRadius: 'var(--c-radius-md)', fontSize: '11px', color: 'var(--c-text-secondary)' }
  },
    el('div', { style: { fontWeight: '600', marginBottom: '4px' }, text: '当前访问地址（可分享给其他设备）：' }),
    el('div', { style: { wordBreak: 'break-all', color: 'var(--c-info)' }, text: currentUrl })
  ));

  openModal('安装 & 快捷方式', true);
}

/* ============================================================
   安全门 — 访问控制（密码门 + Supabase Auth）
   ============================================================ */

// 访问密码哈希（SHA-256，修改密码请重新计算哈希）
const ACCESS_CODE_HASH = '8bf6637d0ed42fc8550435d1d2f842c89430ab68bbe6262a209e340911b59239';
const ACCESS_CODE_SESSION_KEY = 'joyzwork_access_session';
const ACCESS_CODE_SESSION_HOURS = 24;

// SHA-256 哈希（Web Crypto API）
async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hasAccessCodeSession() {
  try {
    const raw = localStorage.getItem(ACCESS_CODE_SESSION_KEY);
    if (!raw) return false;
    const session = JSON.parse(raw);
    return (Date.now() - session.timestamp) < ACCESS_CODE_SESSION_HOURS * 60 * 60 * 1000;
  } catch { return false; }
}

function isAuthed() {
  return SupabaseSync.isAuthenticated() || hasAccessCodeSession();
}

function checkAuthAndInit() {
  if (isAuthed()) {
    hideAuthGate();
    init();
  } else {
    showAuthGate();
  }
}

function showAuthGate() {
  const gate = document.getElementById('authGate');
  if (!gate) return;
  gate.style.display = 'flex';
  renderAuthGateContent();
}

function hideAuthGate() {
  const gate = document.getElementById('authGate');
  if (gate) gate.style.display = 'none';
}

function renderAuthGateContent() {
  const content = document.getElementById('authGateContent');
  if (!content) return;
  const supabaseOn = SupabaseSync.isConfigured();

  let html = `
    <div style="font-size:42px;font-weight:800;letter-spacing:-1px;margin-bottom:6px;">JOYZWORK</div>
    <div style="font-size:13px;opacity:0.5;margin-bottom:28px;">专属秘书工作台</div>
  `;

  if (supabaseOn) {
    html += `
      <div style="background:rgba(255,255,255,0.08);border-radius:16px;padding:24px;width:320px;backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);">
        <div style="font-size:14px;font-weight:600;margin-bottom:16px;opacity:0.9;">🔐 账号登录</div>
        <input type="email" id="authEmail" placeholder="邮箱地址" autocomplete="email"
          style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#fff;font-size:14px;margin-bottom:10px;box-sizing:border-box;outline:none;transition:border-color 0.2s;"
          onfocus="this.style.borderColor='rgba(99,102,241,0.8)'"
          onblur="this.style.borderColor='rgba(255,255,255,0.15)'" />
        <input type="password" id="authPassword" placeholder="密码" autocomplete="current-password"
          style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#fff;font-size:14px;margin-bottom:16px;box-sizing:border-box;outline:none;transition:border-color 0.2s;"
          onfocus="this.style.borderColor='rgba(99,102,241,0.8)'"
          onblur="this.style.borderColor='rgba(255,255,255,0.15)'"
          onkeydown="if(event.key==='Enter')document.getElementById('btnAuthLogin').click()" />
        <button id="btnAuthLogin"
          style="width:100%;padding:12px;border-radius:10px;border:none;background:#6366f1;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.2s;">
          登 录
        </button>
        <div id="authError" style="color:#fca5a5;font-size:12px;margin-top:10px;min-height:16px;"></div>
      </div>

      <div style="margin:20px 0;font-size:11px;opacity:0.3;display:flex;align-items:center;gap:8px;width:320px;">
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.15);"></div>
        <span>或使用访问密码</span>
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.15);"></div>
      </div>

      <div style="width:320px;">
        <input type="password" id="accessCodeInput" placeholder="访问密码"
          style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#fff;font-size:14px;box-sizing:border-box;outline:none;text-align:center;transition:border-color 0.2s;"
          onfocus="this.style.borderColor='rgba(255,255,255,0.4)'"
          onblur="this.style.borderColor='rgba(255,255,255,0.15)'"
          onkeydown="if(event.key==='Enter')document.getElementById('btnAccessCode').click()" />
        <button id="btnAccessCode"
          style="width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#fff;font-size:14px;font-weight:500;cursor:pointer;margin-top:10px;transition:background 0.2s;">
          快速进入
        </button>
      </div>
    `;
  } else {
    html += `
      <div style="background:rgba(255,255,255,0.08);border-radius:16px;padding:24px;width:320px;backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);">
        <div style="font-size:14px;font-weight:600;margin-bottom:16px;opacity:0.9;">🔐 请输入访问密码</div>
        <input type="password" id="accessCodeInput" placeholder="访问密码"
          style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#fff;font-size:14px;margin-bottom:16px;box-sizing:border-box;outline:none;text-align:center;transition:border-color 0.2s;"
          onfocus="this.style.borderColor='rgba(99,102,241,0.8)'"
          onblur="this.style.borderColor='rgba(255,255,255,0.15)'"
          onkeydown="if(event.key==='Enter')document.getElementById('btnAccessCode').click()" />
        <button id="btnAccessCode"
          style="width:100%;padding:12px;border-radius:10px;border:none;background:#6366f1;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.2s;">
          进 入
        </button>
        <div id="authError" style="color:#fca5a5;font-size:12px;margin-top:10px;min-height:16px;"></div>
      </div>
      <div style="margin-top:20px;font-size:11px;opacity:0.3;max-width:300px;line-height:1.5;text-align:center;">
        提示：配置 Supabase 云同步后可启用账号认证，进一步保护数据安全
      </div>
    `;
  }

  content.innerHTML = html;

  const btnAuthLogin = document.getElementById('btnAuthLogin');
  if (btnAuthLogin) btnAuthLogin.addEventListener('click', handleAuthLogin);
  const btnAccessCode = document.getElementById('btnAccessCode');
  if (btnAccessCode) btnAccessCode.addEventListener('click', handleAccessCodeLogin);

  const firstInput = document.getElementById('authEmail') || document.getElementById('accessCodeInput');
  if (firstInput) firstInput.focus();
}

async function handleAuthLogin() {
  const email = document.getElementById('authEmail')?.value.trim();
  const password = document.getElementById('authPassword')?.value;
  const errorEl = document.getElementById('authError');
  const btn = document.getElementById('btnAuthLogin');

  if (!email || !password) {
    if (errorEl) errorEl.textContent = '请输入邮箱和密码';
    return;
  }

  if (btn) { btn.textContent = '登录中...'; btn.disabled = true; }
  if (errorEl) errorEl.textContent = '';

  try {
    await SupabaseSync.signInWithEmail(email, password);
    localStorage.setItem(ACCESS_CODE_SESSION_KEY, JSON.stringify({ timestamp: Date.now() }));
    hideAuthGate();
    init();
  } catch (err) {
    if (errorEl) errorEl.textContent = err.message || '登录失败，请检查邮箱和密码';
    if (btn) { btn.textContent = '登 录'; btn.disabled = false; }
  }
}

async function handleAccessCodeLogin() {
  const input = document.getElementById('accessCodeInput');
  const code = input?.value;
  const errorEl = document.getElementById('authError');

  if (!code) {
    if (errorEl) errorEl.textContent = '请输入访问密码';
    return;
  }

  const hash = await sha256(code);
  if (hash === ACCESS_CODE_HASH) {
    localStorage.setItem(ACCESS_CODE_SESSION_KEY, JSON.stringify({ timestamp: Date.now() }));
    hideAuthGate();
    init();
  } else {
    if (errorEl) errorEl.textContent = '访问密码错误';
    if (input) { input.value = ''; input.focus(); }
  }
}

function logout() {
  SupabaseSync.clearAuthSession();
  localStorage.removeItem(ACCESS_CODE_SESSION_KEY);
  showAuthGate();
}

/* ---------- 安全状态标签 ---------- */
function updateSecurityLabel() {
  const label = document.getElementById('securityLabel');
  if (!label) return;
  if (SupabaseSync.isAuthenticated()) {
    label.textContent = '已认证';
    label.style.color = '#10b981';
  } else if (hasAccessCodeSession()) {
    label.textContent = '密码门';
    label.style.color = '#f59e0b';
  } else {
    label.textContent = '安全';
    label.style.color = 'var(--c-text-secondary)';
  }
}

/* ---------- 安全设置弹窗 ---------- */
function openSecurityModal() {
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });

  const supabaseOn = SupabaseSync.isConfigured();
  const authed = SupabaseSync.isAuthenticated();
  const codeSession = hasAccessCodeSession();

  // 状态总览
  const statusBox = el('div', { style: { padding: '16px', borderRadius: 'var(--c-radius-md)', fontSize: '13px', lineHeight: '1.7' } });
  if (authed) {
    const session = SupabaseSync.getAuthSession();
    const email = session?.user?.email || '未知';
    statusBox.style.background = '#ecfdf5';
    statusBox.style.border = '1px solid #10b981';
    statusBox.appendChild(el('div', { style: { fontWeight: '700', color: '#065f46', marginBottom: '6px' }, text: '✅ Supabase 账号认证已激活' }));
    statusBox.appendChild(el('div', { style: { color: '#065f46' }, text: '登录账号：' + email }));
    statusBox.appendChild(el('div', { style: { color: '#065f46', fontSize: '11px', marginTop: '4px' }, text: '数据层受 RLS 策略保护，仅认证用户可读写' }));
  } else if (codeSession) {
    statusBox.style.background = '#fefce8';
    statusBox.style.border = '1px solid #f59e0b';
    statusBox.appendChild(el('div', { style: { fontWeight: '700', color: '#92400e', marginBottom: '6px' }, text: '⚠️ 仅密码门保护' }));
    if (supabaseOn) {
      statusBox.appendChild(el('div', { style: { color: '#92400e' }, text: '已配置 Supabase 但未登录账号，数据层未受保护。' }));
      statusBox.appendChild(el('div', { style: { color: '#92400e', fontSize: '11px', marginTop: '4px' }, text: '建议在下方创建 Supabase 账号以启用完整保护。' }));
    } else {
      statusBox.appendChild(el('div', { style: { color: '#92400e' }, text: '前端密码门已启用，数据存储在本地 localStorage。' }));
      statusBox.appendChild(el('div', { style: { color: '#92400e', fontSize: '11px', marginTop: '4px' }, text: '配置 Supabase 云同步后可启用账号认证，进一步保护数据。' }));
    }
  }
  body.appendChild(statusBox);

  // 操作按钮
  const btnRow = el('div', { style: { display: 'flex', gap: '8px' } });

  if (authed) {
    btnRow.appendChild(el('button', {
      class: 'btn btn-danger', style: { flex: '1' },
      onclick: () => {
        if (confirm('确定退出登录吗？退出后需要重新输入密码才能访问。')) {
          logout();
          closeModal();
        }
      }
    }, '🚪 退出登录'));
  } else if (supabaseOn) {
    btnRow.appendChild(el('button', {
      class: 'btn btn-primary', style: { flex: '1' },
      onclick: () => {
        closeModal();
        logout();
      }
    }, '🔐 前往登录'));
  }
  if (btnRow.children.length > 0) body.appendChild(btnRow);

  // Supabase Auth 设置指引
  if (supabaseOn && !authed) {
    const guideBox = el('div', {
      style: { padding: '14px', background: 'var(--c-primary-bg)', borderRadius: 'var(--c-radius-md)', fontSize: '12px', color: 'var(--c-text-secondary)', lineHeight: '1.6' }
    });
    guideBox.appendChild(el('div', { style: { fontWeight: '700', marginBottom: '8px', color: 'var(--c-text)' }, text: '📋 启用账号认证（3步）' }));
    guideBox.appendChild(el('div', { style: { marginBottom: '4px' }, text: '1. 登录 Supabase Dashboard' }));
    guideBox.appendChild(el('div', { style: { marginBottom: '4px' }, text: '2. 进入 Authentication → Users → Add user' }));
    guideBox.appendChild(el('div', { style: { marginBottom: '4px' }, text: '3. 填入你的邮箱和密码，创建唯一账号' }));
    guideBox.appendChild(el('div', { style: { marginTop: '8px', color: 'var(--c-primary)' }, text: '创建后在此页面登录，数据将受双重保护。' }));
    body.appendChild(guideBox);
  }

  // 访问密码信息
  const codeBox = el('div', {
    style: { padding: '14px', background: 'var(--c-bg-2)', borderRadius: 'var(--c-radius-md)', fontSize: '12px', color: 'var(--c-text-secondary)', lineHeight: '1.6' }
  });
  codeBox.appendChild(el('div', { style: { fontWeight: '700', marginBottom: '6px', color: 'var(--c-text)' }, text: '🔑 访问密码（前端门禁）' }));
  codeBox.appendChild(el('div', { style: { marginBottom: '4px' }, text: '密码已设置为强密码（仅你自己知晓）' }));
  codeBox.appendChild(el('div', { style: { marginBottom: '4px' }, text: '会话有效期：24 小时（期间免重复输入）' }));
  codeBox.appendChild(el('div', { style: { marginTop: '6px', fontSize: '11px' }, text: '修改密码：编辑 app.js 中 ACCESS_CODE_HASH 常量（SHA-256 哈希值）' }));
  body.appendChild(codeBox);

  // 安全层级说明
  body.appendChild(el('div', {
    style: { padding: '12px', borderRadius: 'var(--c-radius-sm)', fontSize: '11px', color: 'var(--c-text-secondary)', lineHeight: '1.6', background: 'var(--c-surface)' }
  },
    el('div', { style: { fontWeight: '700', marginBottom: '6px' }, text: '🛡️ 安全架构' }),
    el('div', { style: { marginBottom: '3px' }, text: '第1层：前端密码门 — 拦截非授权访问' }),
    el('div', { style: { marginBottom: '3px' }, text: '第2层：Supabase Auth — 账号密码认证' }),
    el('div', { text: '第3层：RLS 策略 — 数据库级读写权限控制' })
  ));

  openModal('安全设置', true);
  $('#modalBody').innerHTML = '';
  $('#modalBody').appendChild(body);
}

/* ---------- 启动 ---------- */
function init() {
  try {
    Store.init();
    Store.subscribe(() => renderAll());
    initEvents();
    renderAll();
    initDailyQuote();
    initPanelResize();

    // PWA 安装引导
    initPWAInstall();

    // 系统通知：已授权时延迟自动订阅推送（等待 SW 完全激活）
    if ('Notification' in window && Notification.permission === 'granted') {
      // 如果之前推送失败过（本地模式），直接启动本地提醒
      const pushMode = localStorage.getItem('joyzwork_push_mode');
      if (pushMode === 'local') {
        setTimeout(() => startLocalReminderCheck(), 2000);
      } else {
        // 尝试 Web Push 订阅，失败则自动回退到本地提醒
        setTimeout(() => {
          subscribeToPush().catch(e => {
            console.warn('[Push] auto-subscribe failed:', e.message);
            startLocalReminderCheck();
          });
        }, 3000);
      }
    }

    // 热点每日自动抓取
    Store.checkDailyHotspotUpdate().then(ok => {
      if (ok) {
        setTimeout(() => showToast('已自动抓取今日热点 ' + Store.data.autoHotspots.length + ' 条', 'info'), 1500);
      }
    });

    // 移动端默认显示日程面板
    if (window.innerWidth <= 768) {
      switchMobileSection('schedule');
    }

    // 窗口尺寸变化时重新适配
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (window.innerWidth <= 768) {
          const active = $('.mobile-nav-item.active');
          if (!active) switchMobileSection('schedule');
        } else {
          $$('.left-panel, .right-panel, .bottom-panel').forEach(p => p.classList.remove('mobile-active'));
        }
      }, 150);
    });

    // 定时检查提醒（每分钟）
    setInterval(checkReminders, 60000);
    checkReminders();

    // 云端自动拉取同步（页面加载时拉取 + 每60秒定时拉取）
    if (typeof initAutoPullSync === 'function') {
      initAutoPullSync();
    }

    // 标记App已初始化
    window._appInitialized = true;

    // 欢迎提示
    setTimeout(() => {
      showToast('JOYZWORK 已就绪，开始高效工作吧！', 'success');
    }, 500);
  } catch (err) {
    console.error('JOYZWORK init error:', err);
    document.body.insertAdjacentHTML('beforeend',
      `<div style="position:fixed;bottom:20px;left:20px;right:20px;padding:16px;background:#fef2f2;border:1px solid #ef4444;border-radius:10px;font-size:13px;color:#991b1b;z-index:9999;">初始化错误: ${err.message}<br>请清除浏览器缓存后刷新（Ctrl+Shift+R）</div>`);
  }
}

// 全局事件委托 — 确保 "+" 按钮始终可用（即使 initEvents 出错）
document.addEventListener('click', (e) => {
  const target = e.target.closest('#btnQuickAdd, #btnAddTask, #btnAddIntel, #btnAddMaterial');
  if (!target) return;
  e.preventDefault();
  e.stopPropagation();
  if (target.id === 'btnAddIntel') {
    if (state.rightTab === 'studyLib' && typeof openStudyMaterialAddModal === 'function') openStudyMaterialAddModal();
    else if (typeof openIntelAddModal === 'function') openIntelAddModal();
    else openQuickAddModal();
  } else if (target.id === 'btnAddMaterial') {
    if (typeof openMaterialAddModal === 'function') openMaterialAddModal();
    else openQuickAddModal();
  } else {
    openQuickAddModal();
  }
});

/* ---------- 面板拖拽调大小 ---------- */
function initPanelResize() {
  // 加载保存的尺寸
  const saved = localStorage.getItem('joyzwork_panel_sizes');
  if (saved) {
    try {
      const sizes = JSON.parse(saved);
      if (sizes.rightW) document.documentElement.style.setProperty('--right-w', sizes.rightW);
      if (sizes.bottomH) document.documentElement.style.setProperty('--bottom-h', sizes.bottomH);
    } catch (e) {}
  }

  function savePanelSizes() {
    const styles = getComputedStyle(document.documentElement);
    const rightW = styles.getPropertyValue('--right-w').trim();
    const bottomH = styles.getPropertyValue('--bottom-h').trim();
    localStorage.setItem('joyzwork_panel_sizes', JSON.stringify({ rightW, bottomH }));
  }

  // ----- 左右拖拽 -----
  const resizeV = $('#resizeV');
  let isResizingV = false;

  function startResizeV(e) {
    if (window.innerWidth <= 768) return;
    isResizingV = true;
    resizeV.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.style.pointerEvents = 'none';
    e.preventDefault();
  }

  function doResizeV(e) {
    if (!isResizingV) return;
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX);
    if (clientX === undefined) return;
    const mainArea = $('.main-area');
    if (!mainArea) return;
    const rect = mainArea.getBoundingClientRect();
    const rightW = rect.right - clientX;
    if (rightW >= 280 && rightW <= rect.width - 350) {
      document.documentElement.style.setProperty('--right-w', rightW + 'px');
    }
  }

  function endResizeV() {
    if (!isResizingV) return;
    isResizingV = false;
    resizeV.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.body.style.pointerEvents = '';
    savePanelSizes();
  }

  if (resizeV) {
    resizeV.addEventListener('mousedown', startResizeV);
    document.addEventListener('mousemove', doResizeV);
    document.addEventListener('mouseup', endResizeV);
    resizeV.addEventListener('touchstart', startResizeV, { passive: false });
    document.addEventListener('touchmove', doResizeV, { passive: false });
    document.addEventListener('touchend', endResizeV);
  }

  // ----- 上下拖拽 -----
  const resizeH = $('#resizeH');
  let isResizingH = false;

  function startResizeH(e) {
    if (window.innerWidth <= 768) return;
    isResizingH = true;
    resizeH.classList.add('dragging');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.body.style.pointerEvents = 'none';
    e.preventDefault();
  }

  function doResizeH(e) {
    if (!isResizingH) return;
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] && e.touches[0].clientY);
    if (clientY === undefined) return;
    const appMain = $('.app-main');
    if (!appMain) return;
    const rect = appMain.getBoundingClientRect();
    const bottomH = rect.bottom - clientY - 50; // 减去 daily-quote 的大致高度
    if (bottomH >= 100 && bottomH <= rect.height - 200) {
      document.documentElement.style.setProperty('--bottom-h', bottomH + 'px');
    }
  }

  function endResizeH() {
    if (!isResizingH) return;
    isResizingH = false;
    resizeH.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.body.style.pointerEvents = '';
    savePanelSizes();
  }

  if (resizeH) {
    resizeH.addEventListener('mousedown', startResizeH);
    document.addEventListener('mousemove', doResizeH);
    document.addEventListener('mouseup', endResizeH);
    resizeH.addEventListener('touchstart', startResizeH, { passive: false });
    document.addEventListener('touchmove', doResizeH, { passive: false });
    document.addEventListener('touchend', endResizeH);
  }
}

document.addEventListener('DOMContentLoaded', checkAuthAndInit);
