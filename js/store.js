/* ============================================================
   JOYZWORK - 数据存储层 & 状态管理
   ============================================================ */

const STORAGE_KEY = 'joyzwork_data_v5';

/* ---------- 数据结构定义 ---------- */
function getDefaultData() {
  const today = new Date();
  const todayStr = formatDate(today);

  return {
    // 任务/日程列表
    // 类型: work(工作任务) / internal_meeting(内部会议) / external_meeting(外部会议) / personal_study(个人学习) / social(社交娱乐)
    // reminderMinutes: 数组，如 [10, 30] 表示提前10分钟和30分钟各提醒一次
    // startDate: 任务开始时间（可选，用于长期任务），格式同 deadline: "YYYY-MM-DDTHH:MM"
    tasks: [
      { id: uid(), title: '部门周例会', type: 'internal_meeting', priority: 'high', deadline: todayStr + 'T10:00', startDate: '', estTime: 60, status: 'done', createdAt: Date.now(), linkedMaterials: [], reminderMinutes: [10] },
      { id: uid(), title: '撰写三季度宣传工作报告', type: 'work', priority: 'high', deadline: todayStr + 'T18:00', startDate: formatDate(addDays(today, -2)) + 'T09:00', estTime: 120, status: 'progress', createdAt: Date.now(), linkedMaterials: [], reminderMinutes: [30, 10] },
      { id: uid(), title: '整理党建活动照片', type: 'work', priority: 'medium', deadline: todayStr + 'T17:00', startDate: '', estTime: 45, status: 'pending', createdAt: Date.now(), linkedMaterials: [], reminderMinutes: [15] },
      { id: uid(), title: '领导交办：准备下周座谈会材料', type: 'work', priority: 'high', deadline: formatDate(addDays(today, 1)) + 'T12:00', startDate: todayStr + 'T09:00', estTime: 90, status: 'pending', createdAt: Date.now(), linkedMaterials: [], reminderMinutes: [60, 30] },
      { id: uid(), title: '公众号推文审核与发布', type: 'work', priority: 'medium', deadline: todayStr + 'T16:00', startDate: '', estTime: 30, status: 'pending', createdAt: Date.now(), linkedMaterials: [], reminderMinutes: [15] },
      { id: uid(), title: '与合作单位视频会议', type: 'external_meeting', priority: 'high', deadline: todayStr + 'T14:00', startDate: '', estTime: 45, status: 'pending', createdAt: Date.now(), linkedMaterials: [], reminderMinutes: [10] },
      { id: uid(), title: 'AI办公实战课 - 第4讲', type: 'personal_study', priority: 'medium', deadline: todayStr + 'T20:00', startDate: '', estTime: 45, status: 'pending', createdAt: Date.now(), linkedMaterials: [], reminderMinutes: [], courseId: 'course_demo_1', lessonNumber: 4 },
    ],

    // 学习打卡记录 { date: { items: { itemId: { status, note } } } }
    studyCheckins: {},

    // 固定打卡项
    studyItems: [
      { id: 'rmrb', name: '人民日报精读', icon: 'R', color: '#dc2626', link: 'http://paper.people.com.cn/', preferredTime: '08:30' },
      { id: 'chinadaily', name: 'ChinaDaily 外文阅读', icon: 'C', color: '#2563eb', link: 'https://www.chinadaily.com.cn/', preferredTime: '12:30' },
      { id: 'oral', name: '英语口语训练', icon: 'S', color: '#16a34a', link: 'https://www.bbc.co.uk/learningenglish/english/features/english-at-work', preferredTime: '19:00' },
    ],

    // 公众号追踪配置
    trackedAccounts: [
      {
        id: 'acc_cnnpc',
        name: '中核集团',
        keyword: '中核集团',
        rssUrl: 'https://rsshub.app/wechat/search/%E4%B8%AD%E6%A0%B8%E9%9B%86%E5%9B%A2',
        searchUrl: 'https://weixin.sogou.com/weixin?type=1&query=%E4%B8%AD%E6%A0%B8%E9%9B%86%E5%9B%A2',
        officialUrl: 'https://mp.weixin.qq.com',
        lastSync: 0,
        articles: [],
      },
      {
        id: 'acc_cnpe',
        name: '中国核电工程有限公司',
        keyword: '中国核电工程有限公司',
        rssUrl: 'https://rsshub.app/wechat/search/%E4%B8%AD%E5%9B%BD%E6%A0%B8%E7%94%B5%E5%B7%A5%E7%A8%8B%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8',
        searchUrl: 'https://weixin.sogou.com/weixin?type=1&query=%E4%B8%AD%E5%9B%BD%E6%A0%B8%E7%94%B5%E5%B7%A5%E7%A8%8B%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8',
        officialUrl: 'https://mp.weixin.qq.com',
        lastSync: 0,
        articles: [],
      },
    ],

    // 宣传情报文章
    intelArticles: [
      { id: uid(), title: '深入学习贯彻党的二十届三中全会精神', source: '人民日报', url: '', content: '', aiScore: 'priority', aiReason: '涉及重大会议精神，宣传价值极高，建议优先转发并结合本单位实际撰写解读稿件', collected: false, createdAt: Date.now() - 3600000 },
      { id: uid(), title: '关于加强新时代廉洁文化建设的意见', source: '新华社', url: '', content: '', aiScore: 'reference', aiReason: '政策性文件，可作为文稿撰写参考依据，建议收藏备查', collected: false, createdAt: Date.now() - 7200000 },
      { id: uid(), title: '某地创新基层治理模式经验报道', source: '党建网', url: '', content: '', aiScore: 'collect', aiReason: '基层治理案例，文化建设角度有参考价值，暂无直接转发需求', collected: true, createdAt: Date.now() - 10800000 },
    ],

    // 热点聚合 - 每日自动抓取 + 手动添加
    // autoHotspots: 每日自动从配置的数据源抓取的热点
    // manualHotspots: 用户手动添加的热点
    // hotspotSources: 可配置的数据源列表
    hotspots: [],
    autoHotspots: [],
    manualHotspots: [],
    lastHotspotUpdate: 0,
    hotspotSources: [
      { id: 'src_party', name: '党建时政', tag: '党建', tagColor: '#dc2626', url: 'http://politics.people.com.cn/', type: 'people', enabled: true },
      { id: 'src_tech', name: '科技前沿', tag: '科技', tagColor: '#2563eb', url: 'http://scitech.people.com.cn/', type: 'people', enabled: true },
      { id: 'src_meme', name: '网络热梗/热词', tag: '网络热梗', tagColor: '#8b5cf6', url: 'https://s.weibo.com/top/summary', type: 'weibo', enabled: true },
      { id: 'src_video', name: '短视频/话题', tag: '短视频', tagColor: '#ec4899', url: 'https://www.bilibili.com/v/popular/rank/all', type: 'bili', enabled: true },
    ],

    // 已收藏到素材库的热点ID
    collectedHotspotIds: [],

    // 学习素材库
    studyMaterials: [
      { id: uid(), title: '宣传文稿写作技巧指南', category: 'writing', type: 'link', url: '', status: 'pending', note: '', createdAt: Date.now() },
      { id: uid(), title: '2024年党建工作要点汇编', category: 'policy', type: 'link', url: '', status: 'done', note: '已整理要点，可用于文稿引用', createdAt: Date.now() - 86400000 },
      { id: uid(), title: 'BBC Learning English - Workplace Expressions', category: 'english', type: 'link', url: 'https://www.bbc.co.uk/learningenglish', status: 'pending', note: '', createdAt: Date.now() - 172800000 },
    ],

    // 工作素材库
    workMaterials: {
      documents: [
        { id: uid(), title: '三季度宣传工作总结（初稿）', status: 'editing', type: 'document', createdAt: Date.now(), url: '' },
        { id: uid(), title: '党建活动推文定稿', status: 'archived', type: 'document', createdAt: Date.now() - 86400000, url: '' },
        { id: uid(), title: '座谈会方案（待修改）', status: 'editing', type: 'document', createdAt: Date.now() - 43200000, url: '' },
      ],
      photos: [
        { id: uid(), title: '七一建党活动照片', status: 'organized', count: 45, createdAt: Date.now() - 86400000 * 3 },
        { id: uid(), title: '志愿服务活动照片', status: 'pending', count: 28, createdAt: Date.now() - 86400000 },
      ],
      temp: [
        { id: uid(), title: '上级通知：关于做好年底考核工作', status: 'new', type: 'notice', createdAt: Date.now() - 3600000 },
        { id: uid(), title: '兄弟单位宣传案例参考', status: 'new', type: 'reference', createdAt: Date.now() - 7200000 },
      ],
      // 本地文件夹链接配置
      localFolders: [
        { id: uid(), name: '文稿方案文件夹', path: 'D:\\Work\\Documents', createdAt: Date.now() },
        { id: uid(), name: '活动照片文件夹', path: 'D:\\Work\\Photos', createdAt: Date.now() },
      ],
      // 本地文件链接配置（单个文件）
      localFiles: [
        { id: uid(), name: '三季度工作总结.docx', path: 'D:\\Work\\Documents\\三季度工作总结.docx', createdAt: Date.now() },
      ],
    },

    // 随手记
    quickNotes: [
      { id: uid(), content: '下周宣传重点：结合三中全会精神，策划系列推文', createdAt: Date.now() - 3600000 },
      { id: uid(), content: '座谈会需要准备的材料清单：领导讲话稿、会议方案、参会名单、宣传通稿', createdAt: Date.now() - 7200000 },
    ],

    // AI 对话记录
    aiHistory: [],

    // 复盘日志 { date: { content, auto, edited } }
    reviews: {},

    // 通知列表
    notifications: [
      { id: uid(), type: 'meeting', title: '部门周例会', desc: '会议将于10分钟后开始', time: Date.now() - 3600000, read: false },
      { id: uid(), type: 'deadline', title: '三季度宣传工作报告', desc: '任务截止时间临近，剩余2小时', time: Date.now() - 7200000, read: false },
      { id: uid(), type: 'study', title: '今日学习打卡未完成', desc: '人民日报精读、英语口语训练尚未完成', time: Date.now() - 1800000, read: false },
    ],

    // 设置
    settings: {
      aiModel: 'gpt4',
      studyReminderTime: '20:00',
      autoReschedule: true,
      defaultReminderMinutes: 15,  // 默认提前15分钟提醒
    },

    // 自定义分类（用户可增删）
    customStudyCategories: [],   // [{ id, name }]
    customTaskTypes: [],         // [{ id, label }]
    customHotspotTags: [],       // [{ label, color }]

    // AI 工具 & 常用网址（可增删改）
    // type: 'ai' | 'web'   url 可为 https:// 或本地协议如 feishu://
    aiTools: [
      { id: 'chatgpt', name: 'ChatGPT', desc: 'OpenAI 旗舰模型', icon: 'G', color: '#10a37f', url: 'https://chat.openai.com', type: 'ai' },
      { id: 'claude', name: 'Claude', desc: 'Anthropic AI 助手', icon: 'C', color: '#d97706', url: 'https://claude.ai', type: 'ai' },
      { id: 'deepseek', name: 'DeepSeek', desc: '深度求索 AI', icon: 'D', color: '#4f46e5', url: 'https://chat.deepseek.com', type: 'ai' },
      { id: 'qwen', name: '通义千问', desc: '阿里云大模型', icon: '通', color: '#6366f1', url: 'https://tongyi.aliyun.com', type: 'ai' },
      { id: 'kimi', name: 'Kimi', desc: '月之暗面 AI', icon: 'K', color: '#1e293b', url: 'https://kimi.moonshot.cn', type: 'ai' },
      { id: 'doubao', name: '豆包', desc: '字节跳动 AI', icon: '豆', color: '#3b82f6', url: 'https://www.doubao.com', type: 'ai' },
      { id: 'jimeng', name: '即梦', desc: '字节 AI 创作', icon: '梦', color: '#f59e0b', url: 'https://jimeng.jianying.com', type: 'ai' },
      { id: 'gemini', name: 'Gemini', desc: 'Google AI', icon: '✦', color: '#4285f4', url: 'https://gemini.google.com', type: 'ai' },
    ],

    // 周期性任务（循环工作）
    // cycleType: 'daily' | 'every-n-days' | 'weekly' | 'monthly'
    // cycleDays: 每N天（cycleType='every-n-days'时有效）
    // cycleWeekdays: [0-6] 每周哪几天（cycleType='weekly'时有效，0=周日）
    // cycleMonthDay: 每月几号（cycleType='monthly'时有效）
    // preferredTime: 偏好时间段 "HH:MM"
    // completions: { 'YYYY-MM-DD': true } 完成记录
    recurringTasks: [
      { id: uid(), title: '更新公众号推文', type: 'work', priority: 'high', cycleType: 'daily', cycleDays: 1, cycleWeekdays: [], cycleMonthDay: 1, estTime: 45, preferredTime: '10:00', startDate: todayStr, enabled: true, completions: {}, createdAt: Date.now() },
      { id: uid(), title: '更新公司英文网站', type: 'work', priority: 'medium', cycleType: 'every-n-days', cycleDays: 2, cycleWeekdays: [], cycleMonthDay: 1, estTime: 60, preferredTime: '14:00', startDate: todayStr, enabled: true, completions: {}, createdAt: Date.now() },
      { id: uid(), title: '整理本周宣传素材归档', type: 'work', priority: 'low', cycleType: 'weekly', cycleDays: 1, cycleWeekdays: [5], cycleMonthDay: 1, estTime: 30, preferredTime: '16:00', startDate: todayStr, enabled: true, completions: {}, createdAt: Date.now() },
    ],

    // 课程任务（v19）
    // 每个课程有总讲数、已完成讲数、截止日期，打卡后自动排下一讲
    // 课程讲次会自动生成对应的 task（带 courseId + lessonNumber 字段）插入 tasks 数组
    courses: [
      { id: 'course_demo_1', name: 'AI办公实战课', totalLessons: 20, completedLessons: 3, deadline: formatDate(addDays(today, 25)), lessonDuration: 45, preferredTime: '20:00', startDate: formatDate(addDays(today, -10)), link: '', createdAt: Date.now() - 864000000, archived: false },
    ],

    // 热点聚合 - 上次自动更新时间戳
    lastHotspotUpdate: Date.now(),

    // 每日一句（底部装饰）
    dailyQuotes: [
      '不积跬步，无以至千里；不积小流，无以成江海。 — 荀子',
      '天下难事，必作于易；天下大事，必作于细。 — 老子',
      '路虽远，行则将至；事虽难，做则必成。 — 《荀子》',
      '星光不问赶路人，时光不负有心人。',
      '日日行，不怕千万里；常常做，不怕千万事。',
      '志之所趋，无远弗届；穷山距海，不能限也。 — 《格言联璧》',
      '看似寻常最奇崛，成如容易却艰辛。 — 王安石',
      '千淘万漉虽辛苦，吹尽狂沙始到金。 — 刘禹锡',
      '纸上得来终觉浅，绝知此事要躬行。 — 陆游',
      '博观而约取，厚积而薄发。 — 苏轼',
      '业精于勤，荒于嬉；行成于思，毁于随。 — 韩愈',
      '长风破浪会有时，直挂云帆济沧海。 — 李白',
      '宝剑锋从磨砺出，梅花香自苦寒来。',
      '不谋全局者，不足谋一域；不谋万世者，不足谋一时。 — 陈澹然',
      '功不唐捐，玉汝于成。',
      '道阻且长，行则将至。行而不辍，未来可期。 — 《荀子》',
      '千里之行，始于足下。 — 《道德经》',
      '锲而舍之，朽木不折；锲而不舍，金石可镂。 — 荀子',
      '天行健，君子以自强不息。 — 《周易》',
      '地势坤，君子以厚德载物。 — 《周易》',
      '穷则独善其身，达则兼善天下。 — 《孟子》',
      '先天下之忧而忧，后天下之乐而乐。 — 范仲淹',
      '天下兴亡，匹夫有责。 — 顾炎武',
      '苟利国家生死以，岂因祸福避趋之。 — 林则徐',
      '海纳百川，有容乃大；壁立千仞，无欲则刚。 — 林则徐',
    ],
  };
}

/* ---------- 工具函数 ---------- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getWeekday(date) {
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return weekdays[new Date(date).getDay()];
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${getWeekday(d)}`;
}

function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return Math.floor(diff / 86400000) + '天前';
}

/* ---------- 存储核心 ---------- */
let _data = null;
let _listeners = [];

const Store = {
  init() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        _data = JSON.parse(raw);
        // 合并默认字段（兼容旧数据）
        const defaults = getDefaultData();
        for (const key in defaults) {
          if (!(key in _data)) _data[key] = defaults[key];
        }
        // 确保 workMaterials 子字段存在
        if (!_data.workMaterials.localFolders) _data.workMaterials.localFolders = [];
        if (!_data.workMaterials.localFiles) _data.workMaterials.localFiles = [];
        if (!_data.quickNotes) _data.quickNotes = [];
        // 确保任务有 reminderMinutes 字段，且为数组
        if (_data.tasks) {
          _data.tasks.forEach(t => {
            if (t.reminderMinutes === undefined || t.reminderMinutes === null) {
              t.reminderMinutes = [];
            } else if (!Array.isArray(t.reminderMinutes)) {
              // 迁移旧的单值格式到数组
              t.reminderMinutes = [t.reminderMinutes];
            }
            // v6: 确保任务有 startDate 字段（长期任务开始时间）
            if (t.startDate === undefined) t.startDate = '';
          });
        }
        // v5 新增字段
        if (!_data.customStudyCategories) _data.customStudyCategories = [];
        if (!_data.customTaskTypes) _data.customTaskTypes = [];
        if (!_data.customHotspotTags) _data.customHotspotTags = [];
        // v12: 周期性任务
        if (!_data.recurringTasks) _data.recurringTasks = getDefaultData().recurringTasks;
        // v19: 课程任务
        if (!_data.courses) _data.courses = getDefaultData().courses;
        if (!_data.dailyQuotes) _data.dailyQuotes = getDefaultData().dailyQuotes;
        if (!_data.lastHotspotUpdate) _data.lastHotspotUpdate = Date.now();
        // v10 热点聚合重构：新增 autoHotspots, manualHotspots, hotspotSources
        if (!_data.autoHotspots) _data.autoHotspots = [];
        if (!_data.manualHotspots) _data.manualHotspots = _data.manualHotspots || [];
        if (!_data.hotspotSources) _data.hotspotSources = getDefaultData().hotspotSources;
        // 迁移旧 hotspots 到 manualHotspots（保留用户手动添加的）
        if (_data.hotspots && _data.hotspots.length > 0 && _data.manualHotspots.length === 0 && _data.autoHotspots.length === 0) {
          _data.manualHotspots = _data.hotspots.filter(h => h.id && h.title);
        }
        _data.hotspots = []; // 清空旧的合并数组，改用 autoHotspots + manualHotspots
        // v13: 热点收藏 + AI工具可配置
        if (!_data.collectedHotspotIds) _data.collectedHotspotIds = [];
        if (!_data.aiTools) _data.aiTools = getDefaultData().aiTools;
      } catch (e) {
        _data = getDefaultData();
      }
    } else {
      _data = getDefaultData();
      this.save();
    }
  },

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
    // 触发 Supabase 自动同步（如果已配置且已开启）
    if (typeof triggerAutoSync === 'function') triggerAutoSync();
  },

  // 从 localStorage 重新加载数据（用于云端同步后刷新）
  _load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        _data = JSON.parse(raw);
        const defaults = getDefaultData();
        for (const key in defaults) {
          if (!(key in _data)) _data[key] = defaults[key];
        }
      } catch (e) {
        // 保持现有数据
      }
    }
  },

  get data() { return _data; },

  /* ---------- 通用 CRUD ---------- */
  add(collection, item) {
    if (!Array.isArray(_data[collection])) return;
    _data[collection].unshift(item);
    this.save();
    this.emit();
  },

  update(collection, id, updates) {
    if (!Array.isArray(_data[collection])) return;
    const item = _data[collection].find(i => i.id === id);
    if (item) { Object.assign(item, updates); this.save(); this.emit(); }
  },

  remove(collection, id) {
    if (!Array.isArray(_data[collection])) return;
    _data[collection] = _data[collection].filter(i => i.id !== id);
    this.save();
    this.emit();
  },

  /* ---------- 任务操作 ---------- */
  addTask(task) {
    task.id = uid();
    task.createdAt = Date.now();
    task.status = task.status || 'pending';
    _data.tasks.push(task);
    this.save();
    this.emit();
    return task;
  },

  updateTask(id, updates) {
    const task = _data.tasks.find(t => t.id === id);
    if (task) { Object.assign(task, updates); this.save(); this.emit(); }
  },

  deleteTask(id) {
    _data.tasks = _data.tasks.filter(t => t.id !== id);
    this.save();
    this.emit();
  },

  /* ---------- 学习打卡 ---------- */
  getTodayCheckins() {
    const today = formatDate(new Date());
    return _data.studyCheckins[today] || { items: {} };
  },

  toggleStudyDone(itemId) {
    const today = formatDate(new Date());
    if (!_data.studyCheckins[today]) _data.studyCheckins[today] = { items: {} };
    const record = _data.studyCheckins[today].items[itemId] || { status: 'pending', note: '' };
    record.status = record.status === 'done' ? 'pending' : 'done';
    _data.studyCheckins[today].items[itemId] = record;
    this.save();
    this.emit();
  },

  setStudyNote(itemId, note) {
    const today = formatDate(new Date());
    if (!_data.studyCheckins[today]) _data.studyCheckins[today] = { items: {} };
    if (!_data.studyCheckins[today].items[itemId]) _data.studyCheckins[today].items[itemId] = { status: 'pending', note: '' };
    _data.studyCheckins[today].items[itemId].note = note;
    this.save();
  },

  addStudyItem(item) {
    item.id = uid();
    if (!item.preferredTime) item.preferredTime = '12:30';
    _data.studyItems.push(item);
    this.save();
    this.emit();
  },

  updateStudyItem(id, updates) {
    const item = _data.studyItems.find(i => i.id === id);
    if (item) {
      Object.assign(item, updates);
      this.save();
      this.emit();
    }
  },

  deleteStudyItem(id) {
    _data.studyItems = _data.studyItems.filter(i => i.id !== id);
    // 清理该打卡项的历史记录
    Object.keys(_data.studyCheckins).forEach(date => {
      if (_data.studyCheckins[date].items && _data.studyCheckins[date].items[id]) {
        delete _data.studyCheckins[date].items[id];
      }
    });
    this.save();
    this.emit();
  },

  getStudyHistory(days = 7) {
    const history = [];
    for (let i = 0; i < days; i++) {
      const date = formatDate(addDays(new Date(), -i));
      const checkin = _data.studyCheckins[date] || { items: {} };
      const completed = _data.studyItems.filter(item => checkin.items[item.id]?.status === 'done').length;
      history.push({ date, completed, total: _data.studyItems.length });
    }
    return history;
  },

  /* ---------- 公众号追踪 ---------- */
  addTrackedAccount(account) {
    account.id = uid();
    account.lastSync = 0;
    account.articles = [];
    _data.trackedAccounts.push(account);
    this.save();
    this.emit();
  },

  removeTrackedAccount(id) {
    _data.trackedAccounts = _data.trackedAccounts.filter(a => a.id !== id);
    this.save();
    this.emit();
  },

  updateTrackedAccount(id, updates) {
    const acc = _data.trackedAccounts.find(a => a.id === id);
    if (acc) { Object.assign(acc, updates); this.save(); this.emit(); }
  },

  addTrackedArticle(accountId, article) {
    const acc = _data.trackedAccounts.find(a => a.id === accountId);
    if (!acc) return;
    article.id = uid();
    article.fetchedAt = Date.now();
    // 避免重复
    if (acc.articles.some(a => a.title === article.title)) return;
    acc.articles.unshift(article);
    if (acc.articles.length > 50) acc.articles = acc.articles.slice(0, 50);
    acc.lastSync = Date.now();
    this.save();
    this.emit();
  },

  deleteTrackedArticle(accountId, articleId) {
    const acc = _data.trackedAccounts.find(a => a.id === accountId);
    if (!acc) return;
    acc.articles = acc.articles.filter(a => a.id !== articleId);
    this.save();
    this.emit();
  },

  /* 异步获取公众号文章（通过 CORS 代理 + RSSHub） */
  async fetchAccountRSS(account) {
    const corsProxy = 'https://api.allorigins.win/raw?url=';
    const rssUrl = account.rssUrl || `https://rsshub.app/wechat/search/${encodeURIComponent(account.keyword)}`;
    try {
      const resp = await fetch(corsProxy + encodeURIComponent(rssUrl), { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const xmlText = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const items = doc.querySelectorAll('item');
      const articles = [];
      items.forEach(item => {
        const title = item.querySelector('title')?.textContent?.trim() || '';
        const link = item.querySelector('link')?.textContent?.trim() || '';
        const desc = item.querySelector('description')?.textContent?.trim() || '';
        const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
        if (title) {
          articles.push({
            title,
            url: link,
            summary: desc.replace(/<[^>]+>/g, '').slice(0, 200),
            pubDate: pubDate ? new Date(pubDate).getTime() : Date.now(),
            aiScore: '',
            aiReason: '',
          });
        }
      });
      return { success: true, articles };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /* AI 评估单篇文章（本地规则引擎） */
  evaluateArticle(article) {
    const title = (article.title || '').toLowerCase();
    const summary = (article.summary || '').toLowerCase();
    const text = title + ' ' + summary;

    const rules = [
      { keywords: ['核', '核电', '核能', '核工业', '核技术'], score: 'priority', reason: '与核工业主业高度相关，建议优先关注转发' },
      { keywords: ['安全', '质量', '创新', '突破', '成果', '成就'], score: 'priority', reason: '涉及安全质量或创新成果，宣传价值高' },
      { keywords: ['党建', '精神', '学习', '贯彻', '宣讲'], score: 'reference', reason: '党建相关内容，可作为宣传素材参考' },
      { keywords: ['政策', '规划', '意见', '通知'], score: 'reference', reason: '政策性内容，建议收藏备查' },
      { keywords: ['活动', '文化', '比赛', '表彰'], score: 'collect', reason: '文化活动类，有文化建设参考价值' },
      { keywords: ['招聘', '公告', '招标'], score: 'skip', reason: '行政事务类，无宣传价值' },
    ];

    for (const rule of rules) {
      if (rule.keywords.some(kw => text.includes(kw))) {
        return { score: rule.score, reason: rule.reason };
      }
    }
    return { score: 'collect', reason: '待进一步评估，建议先收藏' };
  },

  /* ---------- 情报文章 ---------- */
  addIntelArticle(article) {
    article.id = uid();
    article.createdAt = Date.now();
    article.collected = false;
    _data.intelArticles.unshift(article);
    this.save();
    this.emit();
  },

  toggleCollectArticle(id) {
    const article = _data.intelArticles.find(a => a.id === id);
    if (article) { article.collected = !article.collected; this.save(); this.emit(); }
  },

  deleteIntelArticle(id) {
    _data.intelArticles = _data.intelArticles.filter(a => a.id !== id);
    this.save();
    this.emit();
  },

  /* ---------- 学习素材 ---------- */
  addStudyMaterial(material) {
    material.id = uid();
    material.createdAt = Date.now();
    _data.studyMaterials.unshift(material);
    this.save();
    this.emit();
  },

  updateStudyMaterial(id, updates) {
    const m = _data.studyMaterials.find(m => m.id === id);
    if (m) { Object.assign(m, updates); this.save(); this.emit(); }
  },

  deleteStudyMaterial(id) {
    _data.studyMaterials = _data.studyMaterials.filter(m => m.id !== id);
    this.save();
    this.emit();
  },

  /* ---------- 工作素材 ---------- */
  addWorkMaterial(category, material) {
    material.id = uid();
    material.createdAt = Date.now();
    _data.workMaterials[category].unshift(material);
    this.save();
    this.emit();
  },

  deleteWorkMaterial(category, id) {
    _data.workMaterials[category] = _data.workMaterials[category].filter(m => m.id !== id);
    this.save();
    this.emit();
  },

  /* ---------- AI 历史 ---------- */
  addAIHistory(entry) {
    entry.id = uid();
    entry.time = Date.now();
    _data.aiHistory.unshift(entry);
    if (_data.aiHistory.length > 50) _data.aiHistory = _data.aiHistory.slice(0, 50);
    this.save();
  },

  /* ---------- 复盘 ---------- */
  getReview(date) {
    return _data.reviews[date] || null;
  },

  saveReview(date, content, auto) {
    _data.reviews[date] = { content, auto, edited: !auto, savedAt: Date.now() };
    this.save();
    this.emit();
  },

  generateReview(date) {
    const d = new Date(date);
    const dateStr = formatDate(d);
    const tasks = _data.tasks.filter(t => {
      if (!t.deadline) return false;
      if (t.deadline.startsWith(dateStr)) return true;
      // 长期任务活跃中
      if (t.startDate) {
        const startStr = t.startDate.slice(0, 10);
        const endStr = t.deadline.slice(0, 10);
        if (startStr !== endStr && dateStr >= startStr && dateStr <= endStr) return true;
      }
      return false;
    });
    const doneTasks = tasks.filter(t => t.status === 'done');
    const pendingTasks = tasks.filter(t => t.status !== 'done');
    const checkin = _data.studyCheckins[dateStr] || { items: {} };
    const studyDone = _data.studyItems.filter(item => checkin.items[item.id]?.status === 'done');
    const studyPending = _data.studyItems.filter(item => checkin.items[item.id]?.status !== 'done');
    const articles = _data.intelArticles.filter(a => {
      const ad = new Date(a.createdAt);
      return formatDate(ad) === dateStr;
    });
    const collectedArticles = articles.filter(a => a.collected);

    let content = `## 工作任务完成情况\n`;
    content += `已完成 ${doneTasks.length}/${tasks.length} 项\n`;
    if (doneTasks.length) doneTasks.forEach(t => content += `- [完成] ${t.title}\n`);
    if (pendingTasks.length) {
      content += `\n未完成（自动迁移至次日）：\n`;
      pendingTasks.forEach(t => content += `- [${t.status === 'overdue' ? '逾期' : '待办'}] ${t.title}\n`);
    }

    content += `\n## 学习打卡情况\n`;
    content += `已完成 ${studyDone.length}/${_data.studyItems.length} 项\n`;
    studyDone.forEach(s => content += `- [完成] ${s.name}\n`);
    if (studyPending.length) {
      content += `\n未完成：\n`;
      studyPending.forEach(s => content += `- [待完成] ${s.name}\n`);
    }

    content += `\n## 宣传素材汇总\n`;
    content += `今日录入情报文章 ${articles.length} 篇，收藏 ${collectedArticles.length} 篇\n`;
    if (collectedArticles.length) collectedArticles.forEach(a => content += `- [收藏] ${a.title}\n`);

    // 周期任务完成情况
    const recurringDue = this.getRecurringTasksForDate(dateStr);
    if (recurringDue.length > 0) {
      const recurringDone = recurringDue.filter(rt => rt.completions && rt.completions[dateStr]);
      const recurringPending = recurringDue.filter(rt => !rt.completions || !rt.completions[dateStr]);
      content += `\n## 周期任务完成情况\n`;
      content += `已完成 ${recurringDone.length}/${recurringDue.length} 项\n`;
      recurringDone.forEach(rt => content += `- [完成] ${rt.title}（${this.getCycleDescription(rt)}）\n`);
      if (recurringPending.length) {
        content += `\n未完成：\n`;
        recurringPending.forEach(rt => content += `- [待完成] ${rt.title}（${this.getCycleDescription(rt)}）\n`);
      }
    }

    // 课程学习进度
    const activeCourses = (_data.courses || []).filter(c => !c.archived);
    if (activeCourses.length > 0) {
      content += `\n## 课程学习进度\n`;
      activeCourses.forEach(c => {
        const progress = Math.round(c.completedLessons / c.totalLessons * 100);
        content += `- ${c.name}：${c.completedLessons}/${c.totalLessons}讲（${progress}%）\n`;
      });
    }

    const totalPending = pendingTasks.length + studyPending.length + (recurringDue.filter(rt => !rt.completions || !rt.completions[dateStr]).length);
    if (totalPending === 0) {
      content += `\n## 总结\n今日全部任务已完成，继续保持！\n`;
    } else {
      content += `\n## 总结\n今日有 ${totalPending} 项未完成，已自动迁移至次日待办。\n`;
    }

    return content;
  },

  /* ---------- 通知 ---------- */
  addNotification(notif) {
    notif.id = uid();
    notif.time = Date.now();
    notif.read = false;
    _data.notifications.unshift(notif);
    if (_data.notifications.length > 30) _data.notifications = _data.notifications.slice(0, 30);
    this.save();
    this.emit();
  },

  markNotifRead(id) {
    const n = _data.notifications.find(n => n.id === id);
    if (n) { n.read = true; this.save(); this.emit(); }
  },

  markAllNotifsRead() {
    _data.notifications.forEach(n => n.read = true);
    this.save();
    this.emit();
  },

  getUnreadNotifCount() {
    return _data.notifications.filter(n => !n.read).length;
  },

  /* ---------- 随手记 ---------- */
  addQuickNote(content) {
    _data.quickNotes.unshift({ id: uid(), content, createdAt: Date.now() });
    this.save();
    this.emit();
  },

  deleteQuickNote(id) {
    _data.quickNotes = _data.quickNotes.filter(n => n.id !== id);
    this.save();
    this.emit();
  },

  /* ---------- 热点管理 ---------- */
  // 手动添加热点 → manualHotspots
  addHotspot(hotspot) {
    hotspot.id = uid();
    hotspot.createdAt = Date.now();
    hotspot.manual = true;
    _data.manualHotspots.unshift(hotspot);
    this.save();
    this.emit();
  },

  // 删除热点（自动或手动）
  deleteHotspot(id) {
    _data.manualHotspots = _data.manualHotspots.filter(h => h.id !== id);
    _data.autoHotspots = _data.autoHotspots.filter(h => h.id !== id);
    this.save();
    this.emit();
  },

  // 获取合并后的热点列表（自动 + 手动）
  getAllHotspots() {
    return [..._data.manualHotspots, ..._data.autoHotspots];
  },

  /* ---------- 热点数据源管理 ---------- */
  updateHotspotSource(id, updates) {
    const src = _data.hotspotSources.find(s => s.id === id);
    if (src) { Object.assign(src, updates); this.save(); this.emit(); }
  },

  addHotspotSource(source) {
    source.id = 'src_' + uid();
    _data.hotspotSources.push(source);
    this.save();
    this.emit();
  },

  deleteHotspotSource(id) {
    _data.hotspotSources = _data.hotspotSources.filter(s => s.id !== id);
    this.save();
    this.emit();
  },

  /* ---------- 每日自动抓取热点 ---------- */
  async checkDailyHotspotUpdate() {
    const todayStr = formatDate(new Date());
    const lastUpdateStr = _data.lastHotspotUpdate ? formatDate(new Date(_data.lastHotspotUpdate)) : '';
    // 每天只更新一次
    if (todayStr === lastUpdateStr && _data.autoHotspots.length > 0) return false;
    return await this.fetchDailyHotspots();
  },

  async fetchDailyHotspots() {
    const corsProxy = 'https://api.allorigins.win/raw?url=';
    const enabledSources = _data.hotspotSources.filter(s => s.enabled && s.url);
    const allHotspots = [];
    // 每个源抓取 2-3 条
    for (const src of enabledSources) {
      try {
        const resp = await fetch(corsProxy + encodeURIComponent(src.url), { signal: AbortSignal.timeout(12000) });
        if (!resp.ok) continue;
        const html = await resp.text();
        const items = this.parseHotspotHTML(html, src);
        // 过滤低俗内容，保留正能量+有趣
        const filtered = items.filter(item => !this.isLowQuality(item.title));
        allHotspots.push(...filtered.slice(0, 3).map(item => ({
          ...item,
          id: uid(),
          tag: src.tag,
          tagColor: src.tagColor,
          source: src.name,
          fetchedAt: Date.now(),
          auto: true,
        })));
      } catch (err) {
        // 抓取失败，跳过该源
      }
    }

    if (allHotspots.length > 0) {
      _data.autoHotspots = allHotspots;
      _data.lastHotspotUpdate = Date.now();
      this.save();
      this.emit();
      return true;
    }
    return false;
  },

  // 解析不同类型的热点页面 HTML
  parseHotspotHTML(html, source) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const items = [];

    if (source.type === 'weibo') {
      // 微博热搜：解析热搜榜
      const rows = doc.querySelectorAll('td.td-02');
      rows.forEach(row => {
        const a = row.querySelector('a');
        if (a && a.textContent.trim()) {
          const title = a.textContent.trim();
          let link = a.getAttribute('href') || '';
          if (link && !link.startsWith('http')) link = 'https://s.weibo.com' + link;
          items.push({ title, link, summary: '微博热搜' });
        }
      });
    } else if (source.type === 'bili') {
      // B站热门：解析视频排行榜
      const videos = doc.querySelectorAll('.rank-item, .video-card, .info');
      videos.forEach(v => {
        const titleEl = v.querySelector('.title, a.title, .info a');
        const linkEl = v.querySelector('a[href*="/video/"]') || (titleEl && titleEl.tagName === 'A' ? titleEl : null);
        if (titleEl && titleEl.textContent.trim()) {
          const title = titleEl.textContent.trim();
          let link = linkEl ? linkEl.getAttribute('href') : '';
          if (link && !link.startsWith('http')) link = 'https://www.bilibili.com' + link;
          items.push({ title: title.slice(0, 60), link, summary: 'B站热门' });
        }
      });
      // B站可能用 JSON 数据，尝试另一种解析
      if (items.length === 0) {
        const links = doc.querySelectorAll('a[href*="/video/"]');
        links.forEach(a => {
          const title = a.textContent.trim();
          if (title && title.length > 4 && title.length < 80) {
            let link = a.getAttribute('href') || '';
            if (link && !link.startsWith('http')) link = 'https://www.bilibili.com' + link;
            items.push({ title, link, summary: 'B站热门' });
          }
        });
      }
    } else if (source.type === 'people') {
      // 人民网：解析文章列表
      const links = doc.querySelectorAll('a[href*="people.com.cn"], a[href*="/n1/"], a[href*="/n2/"]');
      const seen = new Set();
      links.forEach(a => {
        const title = a.textContent.trim();
        let link = a.getAttribute('href') || '';
        if (title && title.length > 6 && title.length < 100 && !seen.has(title)) {
          seen.add(title);
          if (link && !link.startsWith('http')) {
            link = link.startsWith('//') ? 'http:' + link : 'http://politics.people.com.cn' + link;
          }
          items.push({ title, link, summary: title.slice(0, 80) });
        }
      });
    } else if (source.type === 'zhihu') {
      // 知乎热榜
      const items2 = doc.querySelectorAll('.HotList-item, .ContentItem-title');
      items2.forEach(item => {
        const title = item.textContent.trim();
        if (title && title.length > 4) {
          const a = item.querySelector('a') || (item.tagName === 'A' ? item : null);
          let link = a ? a.getAttribute('href') : '';
          if (link && !link.startsWith('http')) link = 'https://www.zhihu.com' + link;
          items.push({ title: title.slice(0, 60), link, summary: '知乎热榜' });
        }
      });
    } else {
      // 通用解析：提取页面中的文章链接
      const links = doc.querySelectorAll('a');
      const seen = new Set();
      links.forEach(a => {
        const title = a.textContent.trim();
        let link = a.getAttribute('href') || '';
        if (title && title.length > 8 && title.length < 100 && !seen.has(title) && link) {
          seen.add(title);
          if (link.startsWith('//')) link = 'https:' + link;
          else if (link.startsWith('/')) {
            try { link = new URL(source.url).origin + link; } catch(e) {}
          }
          items.push({ title, link, summary: title.slice(0, 80) });
        }
      });
    }

    // 去重并限制数量
    const unique = [];
    const seenTitles = new Set();
    items.forEach(item => {
      const key = item.title.slice(0, 20);
      if (!seenTitles.has(key) && item.link) {
        seenTitles.add(key);
        unique.push(item);
      }
    });
    return unique;
  },

  // 低俗内容过滤
  isLowQuality(title) {
    const low = ['porn', '色情', '裸', 'fuck', '出轨', '偷拍', '不雅', '艳照', '包养', '约炮',
                 '赌博', '代孕', '炫富', '低俗', '恶搞烈士', '辱华'];
    const t = title.toLowerCase();
    return low.some(kw => t.includes(kw));
  },

  /* ---------- 本地文件夹 ---------- */
  addLocalFolder(folder) {
    folder.id = uid();
    folder.createdAt = Date.now();
    _data.workMaterials.localFolders.push(folder);
    this.save();
    this.emit();
  },

  deleteLocalFolder(id) {
    _data.workMaterials.localFolders = _data.workMaterials.localFolders.filter(f => f.id !== id);
    this.save();
    this.emit();
  },

  /* ---------- 本地文件 ---------- */
  addLocalFile(file) {
    file.id = uid();
    file.createdAt = Date.now();
    _data.workMaterials.localFiles.push(file);
    this.save();
    this.emit();
  },

  deleteLocalFile(id) {
    _data.workMaterials.localFiles = _data.workMaterials.localFiles.filter(f => f.id !== id);
    this.save();
    this.emit();
  },

  /* ---------- 自定义分类管理 ---------- */
  addStudyCategory(name) {
    const id = 'custom_' + uid();
    _data.customStudyCategories.push({ id, name });
    this.save();
    this.emit();
    return id;
  },

  deleteStudyCategory(id) {
    _data.customStudyCategories = _data.customStudyCategories.filter(c => c.id !== id);
    this.save();
    this.emit();
  },

  addTaskType(label) {
    const id = 'custom_' + uid();
    _data.customTaskTypes.push({ id, label });
    this.save();
    this.emit();
    return id;
  },

  deleteTaskType(id) {
    _data.customTaskTypes = _data.customTaskTypes.filter(t => t.id !== id);
    this.save();
    this.emit();
  },

  addHotspotTag(label, color) {
    _data.customHotspotTags.push({ label, color: color || '#64748b' });
    this.save();
    this.emit();
  },

  deleteHotspotTag(label) {
    _data.customHotspotTags = _data.customHotspotTags.filter(t => t.label !== label);
    this.save();
    this.emit();
  },

  /* ---------- 热点收藏到素材库 ---------- */
  isHotspotCollected(id) {
    return _data.collectedHotspotIds.includes(id);
  },

  collectHotspot(hotspot, category, note) {
    const material = {
      title: hotspot.title,
      category: category,
      type: 'link',
      url: hotspot.link || '',
      status: 'pending',
      note: (hotspot.summary ? hotspot.summary : '') + (note ? '\n' + note : ''),
      source: 'hotspot',
    };
    this.addStudyMaterial(material);
    if (!_data.collectedHotspotIds.includes(hotspot.id)) {
      _data.collectedHotspotIds.push(hotspot.id);
    }
    this.save();
    this.emit();
  },

  /* ---------- AI 工具 & 常用网址 ---------- */
  addAITool(tool) {
    tool.id = uid();
    if (!tool.type) tool.type = 'web';
    if (!tool.icon) tool.icon = tool.name.charAt(0).toUpperCase();
    if (!tool.color) tool.color = '#6366f1';
    _data.aiTools.push(tool);
    this.save();
    this.emit();
  },

  updateAITool(id, updates) {
    const t = _data.aiTools.find(t => t.id === id);
    if (t) { Object.assign(t, updates); this.save(); this.emit(); }
  },

  deleteAITool(id) {
    _data.aiTools = _data.aiTools.filter(t => t.id !== id);
    this.save();
    this.emit();
  },

  /* ---------- 周期性任务 ---------- */
  addRecurringTask(task) {
    task.id = uid();
    task.createdAt = Date.now();
    task.enabled = true;
    task.completions = {};
    if (!task.startDate) task.startDate = formatDate(new Date());
    if (!task.cycleType) task.cycleType = 'daily';
    if (!task.cycleDays) task.cycleDays = 1;
    if (!task.cycleWeekdays) task.cycleWeekdays = [];
    if (!task.cycleMonthDay) task.cycleMonthDay = 1;
    if (!task.estTime) task.estTime = 60;
    if (!task.preferredTime) task.preferredTime = '14:00';
    _data.recurringTasks.push(task);
    this.save();
    this.emit();
    return task;
  },

  updateRecurringTask(id, updates) {
    const task = _data.recurringTasks.find(t => t.id === id);
    if (task) { Object.assign(task, updates); this.save(); this.emit(); }
  },

  deleteRecurringTask(id) {
    _data.recurringTasks = _data.recurringTasks.filter(t => t.id !== id);
    this.save();
    this.emit();
  },

  // 判断某条周期任务在某天是否到期
  isRecurringDueOnDate(task, dateStr) {
    if (!task.enabled) return false;
    // 早于开始日期则未到期
    if (task.startDate && dateStr < task.startDate) return false;

    switch (task.cycleType) {
      case 'daily':
        return true;
      case 'every-n-days': {
        const start = new Date(task.startDate || dateStr);
        const target = new Date(dateStr);
        const diffDays = Math.round((target - start) / 86400000);
        return diffDays >= 0 && diffDays % (task.cycleDays || 1) === 0;
      }
      case 'weekly': {
        const weekday = new Date(dateStr).getDay(); // 0=Sun
        return (task.cycleWeekdays || []).includes(weekday);
      }
      case 'monthly': {
        const dayOfMonth = new Date(dateStr).getDate();
        return dayOfMonth === (task.cycleMonthDay || 1);
      }
      default:
        return false;
    }
  },

  // 获取某天到期的所有周期任务
  getRecurringTasksForDate(dateStr) {
    return _data.recurringTasks.filter(t => this.isRecurringDueOnDate(t, dateStr));
  },

  // 标记周期任务在某天的完成状态
  toggleRecurringCompletion(taskId, dateStr) {
    const task = _data.recurringTasks.find(t => t.id === taskId);
    if (!task) return;
    if (!task.completions) task.completions = {};
    if (task.completions[dateStr]) {
      delete task.completions[dateStr];
    } else {
      task.completions[dateStr] = true;
    }
    this.save();
    this.emit();
  },

  // 获取周期任务的人类可读周期描述
  getCycleDescription(task) {
    const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    switch (task.cycleType) {
      case 'daily':
        return '每日';
      case 'every-n-days':
        return `每${task.cycleDays}天`;
      case 'weekly':
        if (task.cycleWeekdays && task.cycleWeekdays.length > 0) {
          return '每周' + task.cycleWeekdays.sort().map(d => weekdayNames[d]).join('、');
        }
        return '每周';
      case 'monthly':
        return `每月${task.cycleMonthDay}日`;
      default:
        return '自定义周期';
    }
  },

  /* ---------- 课程任务 ---------- */
  addCourse(course) {
    course.id = uid();
    course.createdAt = Date.now();
    course.completedLessons = 0;
    course.archived = false;
    if (!course.lessonDuration) course.lessonDuration = 45;
    if (!course.preferredTime) course.preferredTime = '20:00';
    if (!course.startDate) course.startDate = formatDate(new Date());
    if (!course.deadline) course.deadline = formatDate(addDays(new Date(), 30));
    _data.courses.push(course);
    // 自动排第一讲
    this.scheduleNextCourseLesson(course);
    this.save();
    this.emit();
    return course;
  },

  updateCourse(id, updates) {
    const course = _data.courses.find(c => c.id === id);
    if (course) { Object.assign(course, updates); this.save(); this.emit(); }
  },

  deleteCourse(id) {
    _data.courses = _data.courses.filter(c => c.id !== id);
    // 清理关联的课程讲次任务
    _data.tasks = _data.tasks.filter(t => t.courseId !== id);
    this.save();
    this.emit();
  },

  // 获取课程的下一讲待办任务
  getCoursePendingTask(courseId) {
    return _data.tasks.find(t => t.courseId === courseId && t.status !== 'done');
  },

  // 打卡完成当前讲，自动排下一讲
  completeCourseLesson(courseId) {
    const course = _data.courses.find(c => c.id === courseId);
    if (!course || course.completedLessons >= course.totalLessons) return null;

    // 标记当前待办的讲次任务为已完成
    const pendingTask = _data.tasks.find(t => t.courseId === courseId && t.status !== 'done');
    if (pendingTask) {
      pendingTask.status = 'done';
    }

    // 增加已完成讲数
    course.completedLessons++;

    // 全部完成
    if (course.completedLessons >= course.totalLessons) {
      course.archived = true;
      this.save();
      this.emit();
      return { courseCompleted: true, nextTask: null };
    }

    // 自动排下一讲
    const nextTask = this.scheduleNextCourseLesson(course);

    this.save();
    this.emit();
    return { courseCompleted: false, nextTask };
  },

  // 自动排下一讲：根据剩余讲数和剩余天数计算下一讲日期
  scheduleNextCourseLesson(course) {
    const remainingLessons = course.totalLessons - course.completedLessons;
    if (remainingLessons <= 0) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(course.deadline + 'T23:59');
    const remainingMs = deadline - today;
    const remainingDays = Math.max(1, Math.ceil(remainingMs / 86400000));

    // 计算间隔天数（至少1天）
    const intervalDays = Math.max(1, Math.round(remainingDays / remainingLessons));

    // 下一讲日期
    const nextDate = addDays(today, intervalDays);
    const nextDateStr = formatDate(nextDate);
    const preferredTime = course.preferredTime || '20:00';

    // 如果间隔只有1天且今天偏好时间已过，则排到明天
    if (intervalDays <= 1) {
      const [ph, pm] = preferredTime.split(':').map(Number);
      const now = new Date();
      if (ph * 60 + pm <= now.getHours() * 60 + now.getMinutes()) {
        const tomorrow = addDays(today, 1);
        const tomorrowStr = formatDate(tomorrow);
        if (tomorrowStr <= course.deadline) {
          return this.createCourseLessonTask(course, tomorrowStr, preferredTime);
        }
      }
    }

    return this.createCourseLessonTask(course, nextDateStr, preferredTime);
  },

  // 创建课程讲次任务
  createCourseLessonTask(course, dateStr, timeStr) {
    const nextLessonNumber = course.completedLessons + 1;
    const task = {
      id: uid(),
      title: `${course.name} - 第${nextLessonNumber}讲`,
      type: 'personal_study',
      priority: 'medium',
      deadline: dateStr + 'T' + timeStr,
      startDate: '',
      estTime: course.lessonDuration || 45,
      status: 'pending',
      createdAt: Date.now(),
      linkedMaterials: [],
      reminderMinutes: [],
      courseId: course.id,
      lessonNumber: nextLessonNumber,
    };
    _data.tasks.push(task);
    return task;
  },

  /* ---------- 每日一句 ---------- */
  getDailyQuote() {
    const quotes = _data.dailyQuotes || [];
    if (quotes.length === 0) return '今天也是充满希望的一天！';
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    return quotes[dayOfYear % quotes.length];
  },

  /* ---------- 事件系统 ---------- */
  subscribe(fn) { _listeners.push(fn); },
  emit() { _listeners.forEach(fn => fn(_data)); },

  /* ---------- 搜索 ---------- */
  search(query) {
    if (!query || query.trim().length < 1) return [];
    const q = query.trim().toLowerCase();
    const results = [];

    _data.tasks.forEach(t => {
      if (t.title.toLowerCase().includes(q)) {
        results.push({ type: '任务', title: t.title, meta: t.deadline ? formatDateLabel(t.deadline) : '无截止时间', panel: 'left', tab: 'tasks', action: () => {} });
      }
    });

    // 搜索周期任务
    _data.recurringTasks.forEach(rt => {
      if (rt.title.toLowerCase().includes(q)) {
        results.push({ type: '周期任务', title: rt.title, meta: this.getCycleDescription(rt), panel: 'left', tab: 'tasks', action: () => {} });
      }
    });

    // 搜索课程
    _data.courses.forEach(c => {
      if (c.name.toLowerCase().includes(q)) {
        results.push({ type: '课程', title: c.name, meta: `${c.completedLessons}/${c.totalLessons}讲`, panel: 'left', tab: 'study', action: () => {} });
      }
    });

    _data.intelArticles.forEach(a => {
      if (a.title.toLowerCase().includes(q)) {
        results.push({ type: '情报', title: a.title, meta: a.source, panel: 'right', tab: 'intel', action: () => {} });
      }
    });

    // 搜索热点
    this.getAllHotspots().forEach(h => {
      if (h.title.toLowerCase().includes(q)) {
        results.push({ type: '热点', title: h.title, meta: h.tag, panel: 'right', tab: 'intel', action: () => {} });
      }
    });

    _data.studyMaterials.forEach(m => {
      if (m.title.toLowerCase().includes(q)) {
        results.push({ type: '学习素材', title: m.title, meta: m.category, panel: 'right', tab: 'studyLib', action: () => {} });
      }
    });

    _data.workMaterials.documents.forEach(d => {
      if (d.title.toLowerCase().includes(q)) {
        results.push({ type: '文稿', title: d.title, meta: d.status, panel: 'bottom', tab: 'worklib', action: () => {} });
      }
    });

    _data.quickNotes.forEach(n => {
      if (n.content.toLowerCase().includes(q)) {
        results.push({ type: '随手记', title: n.content.slice(0, 30), meta: timeAgo(n.createdAt), panel: 'bottom', tab: 'notes', action: () => {} });
      }
    });

    return results;
  },

  /* ---------- 统计 ---------- */
  getTodayStats() {
    const today = formatDate(new Date());
    const todayTasks = _data.tasks.filter(t => {
      if (!t.deadline) return false;
      if (t.deadline.startsWith(today)) return true;
      // 长期任务活跃中
      if (t.startDate) {
        const startStr = t.startDate.slice(0, 10);
        const endStr = t.deadline.slice(0, 10);
        if (startStr !== endStr && today >= startStr && today <= endStr) return true;
      }
      return false;
    });
    const pendingTasks = todayTasks.filter(t => t.status === 'pending' || t.status === 'progress');
    const overdueTasks = _data.tasks.filter(t => t.status !== 'done' && t.deadline && new Date(t.deadline) < new Date());
    const todayMeetings = todayTasks.filter(t => t.type === 'internal_meeting' || t.type === 'external_meeting');
    const checkin = _data.studyCheckins[today] || { items: {} };
    const pendingStudy = _data.studyItems.filter(item => checkin.items[item.id]?.status !== 'done');
    // 今日到期的周期任务（未完成的）
    const recurringDue = this.getRecurringTasksForDate(today);
    const pendingRecurring = recurringDue.filter(rt => !rt.completions || !rt.completions[today]);

    return {
      pendingTasks: pendingTasks.length + pendingRecurring.length,
      pendingStudy: pendingStudy.length,
      todayMeetings: todayMeetings.length,
      overdue: overdueTasks.length,
    };
  },
};

/* ---------- 智能排期算法 ---------- */
const Scheduler = {
  generateDayPlan(date) {
    const dateStr = formatDate(date);
    const dayTasks = Store.data.tasks.filter(t => {
      if (!t.deadline) return false;
      // 截止日期当天的任务
      if (t.deadline.startsWith(dateStr)) return true;
      // 长期任务：在开始日期到截止日期之间的每一天都显示
      if (t.startDate) {
        const startStr = t.startDate.slice(0, 10);
        const endStr = t.deadline.slice(0, 10);
        if (startStr !== endStr && dateStr >= startStr && dateStr <= endStr) return true;
      }
      return false;
    });

    // 无截止日期的任务也纳入今日排期（作为低优先级弹性任务）
    const noDeadlineTasks = Store.data.tasks.filter(t => !t.deadline && t.status !== 'done');

    // 分离硬时间任务（会议 + 课程讲次，有固定时间）和弹性任务
    const hardTasks = dayTasks.filter(t =>
      ((t.type === 'internal_meeting' || t.type === 'external_meeting') || t.courseId) &&
      t.deadline && t.deadline.includes('T')
    );
    const flexTasks = dayTasks.filter(t => !hardTasks.includes(t));
    // 无截止日期任务追加到弹性任务末尾（最低优先级）
    flexTasks.push(...noDeadlineTasks);

    // 按时间排序硬任务
    hardTasks.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    // 按优先级排序弹性任务
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    flexTasks.sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));

    // 生成时间槽
    const slots = [];
    const workStart = 9;  // 9:00
    const workEnd = 18;   // 18:00
    let currentTime = workStart * 60; // 分钟

    // 先放入硬时间任务
    hardTasks.forEach(task => {
      const taskTime = new Date(task.deadline);
      const taskStartMin = taskTime.getHours() * 60 + taskTime.getMinutes();
      const estTime = task.estTime || 60;

      // 如果硬任务前有空闲时间，填充弹性任务
      while (currentTime < taskStartMin - 10 && flexTasks.length > 0) {
        const flexTask = flexTasks[0];
        const flexEst = flexTask.estTime || 60;
        if (currentTime + flexEst <= taskStartMin - 5) {
          slots.push({
            ...flexTask,
            slotType: 'flex',
            startTime: currentTime,
            endTime: currentTime + flexEst,
          });
          flexTasks.shift();
          currentTime += flexEst + 10; // 10分钟休息
        } else {
          break;
        }
      }

      slots.push({
        ...task,
        slotType: 'hard',
        startTime: taskStartMin,
        endTime: taskStartMin + estTime,
      });
      currentTime = taskStartMin + estTime;
    });

    // 剩余弹性任务填充到下午
    while (currentTime < workEnd * 60 && flexTasks.length > 0) {
      const flexTask = flexTasks.shift();
      const flexEst = flexTask.estTime || 60;
      slots.push({
        ...flexTask,
        slotType: 'flex',
        startTime: currentTime,
        endTime: Math.min(currentTime + flexEst, workEnd * 60),
      });
      currentTime += flexEst + 10;
    }

    // ====== 周期任务自动插入（优先级介于弹性任务和学习打卡之间）======
    const recurringDue = Store.getRecurringTasksForDate(dateStr);
    recurringDue.forEach(rt => {
      const isCompleted = rt.completions && rt.completions[dateStr];
      const [ph, pm] = (rt.preferredTime || '14:00').split(':').map(Number);
      const preferredMin = ph * 60 + pm;
      const rtEst = rt.estTime || 60;

      // 尝试在偏好时间附近放置，最多尝试10次（每次偏移30分钟）
      let placed = false;
      let tryTime = preferredMin;
      for (let attempt = 0; attempt < 12; attempt++) {
        // 检查是否在工作时间范围内
        if (tryTime < workStart * 60) tryTime = workStart * 60;
        if (tryTime + rtEst > workEnd * 60) {
          tryTime = workStart * 60;
          continue;
        }
        // 检查是否与已有slot冲突
        const hasConflict = slots.some(s =>
          (tryTime >= s.startTime && tryTime < s.endTime) ||
          (tryTime + rtEst > s.startTime && tryTime < s.endTime)
        );
        if (!hasConflict) {
          slots.push({
            ...rt,
            slotType: 'recurring',
            startTime: tryTime,
            endTime: tryTime + rtEst,
            status: isCompleted ? 'done' : 'pending',
            recurringId: rt.id,
          });
          placed = true;
          break;
        }
        tryTime += 30;
      }

      // 如果偏好时间附近都冲突了，放到最后
      if (!placed) {
        let endTime = currentTime;
        if (endTime + rtEst > workEnd * 60) endTime = workStart * 60;
        // 再检查冲突
        let foundSlot = false;
        for (let t = endTime; t + rtEst <= workEnd * 60; t += 15) {
          const conflict = slots.some(s =>
            (t >= s.startTime && t < s.endTime) ||
            (t + rtEst > s.startTime && t < s.endTime)
          );
          if (!conflict) {
            slots.push({
              ...rt,
              slotType: 'recurring',
              startTime: t,
              endTime: t + rtEst,
              status: isCompleted ? 'done' : 'pending',
              recurringId: rt.id,
            });
            foundSlot = true;
            break;
          }
        }
      }
    });

    // 重新排序（周期任务可能插入到中间位置）
    slots.sort((a, b) => a.startTime - b.startTime);

    // ====== 学习打卡自动填入（按偏好时段排期）======
    const studyItems = Store.data.studyItems;
    const todayCheckin = Store.getTodayCheckins();
    const studySlots = [];

    // 为每个未完成的学习项分配30分钟时段，按偏好时间排序
    studyItems.forEach(item => {
      const isDone = todayCheckin.items[item.id]?.status === 'done';
      if (!isDone) {
        const [sh, sm] = (item.preferredTime || '12:30').split(':').map(Number);
        studySlots.push({
          id: 'study_' + item.id,
          title: item.name + '（每日打卡）',
          type: 'personal_study',
          priority: 'low',
          status: todayCheckin.items[item.id]?.status || 'pending',
          estTime: 30,
          slotType: 'study',
          studyItemId: item.id,
          studyLink: item.link || '',
          preferredMin: sh * 60 + sm,
        });
      }
    });

    // 按偏好时间排序
    studySlots.sort((a, b) => a.preferredMin - b.preferredMin);

    // 将学习项按偏好时间插入空闲时段
    studySlots.forEach(studySlot => {
      const studyEst = 30;
      let tryTime = studySlot.preferredMin;

      // 尝试在偏好时间附近放置（最多尝试20次，每次偏移15分钟）
      let placed = false;
      for (let attempt = 0; attempt < 24; attempt++) {
        // 确保在工作时间范围内（允许到20:00，因为学习可以下班后）
        if (tryTime < workStart * 60) tryTime = workStart * 60;
        if (tryTime + studyEst > 20 * 60) {
          tryTime = workStart * 60;
          continue;
        }
        // 检查冲突
        const hasConflict = slots.some(s =>
          (tryTime >= s.startTime && tryTime < s.endTime) ||
          (tryTime + studyEst > s.startTime && tryTime < s.endTime)
        );
        if (!hasConflict) {
          studySlot.startTime = tryTime;
          studySlot.endTime = tryTime + studyEst;
          slots.push(studySlot);
          placed = true;
          break;
        }
        tryTime += 15;
      }

      // 如果偏好时间附近都冲突了，找任意空闲时段
      if (!placed) {
        for (let t = workStart * 60; t + studyEst <= 20 * 60; t += 15) {
          const conflict = slots.some(s =>
            (t >= s.startTime && t < s.endTime) ||
            (t + studyEst > s.startTime && t < s.endTime)
          );
          if (!conflict) {
            studySlot.startTime = t;
            studySlot.endTime = t + studyEst;
            slots.push(studySlot);
            break;
          }
        }
      }
    });

    // 按时间排序所有slot
    slots.sort((a, b) => a.startTime - b.startTime);

    // 检查过载（仅有截止日期的弹性任务未排下才算过载）
    const overload = flexTasks.filter(t => t.deadline).length > 0;
    const remainingTasks = flexTasks.filter(t => t.deadline);

    return { slots, overload, remainingTasks: flexTasks };
  },
};
