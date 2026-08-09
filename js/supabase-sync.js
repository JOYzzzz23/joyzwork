/* ============================================================
   JOYZWORK - Supabase 云端数据同步模块
   零依赖，直接使用 Supabase REST API
   ============================================================ */

const SUPABASE_CONFIG_KEY = 'joyzwork_supabase_config';
const AUTH_SESSION_KEY = 'joyzwork_auth_session';

/* ---------- 配置存取 ---------- */
const SupabaseSync = {
  getConfig() {
    try {
      const raw = localStorage.getItem(SUPABASE_CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  saveConfig(config) {
    localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(config));
  },

  clearConfig() {
    localStorage.removeItem(SUPABASE_CONFIG_KEY);
  },

  isConfigured() {
    const config = this.getConfig();
    return !!(config && config.url && config.anonKey);
  },

  getDeviceId() {
    let deviceId = localStorage.getItem('joyzwork_device_id');
    if (!deviceId) {
      deviceId = 'device_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('joyzwork_device_id', deviceId);
    }
    return deviceId;
  },

  /* ---------- Supabase Auth 认证 ---------- */
  getAuthSession() {
    try {
      const raw = localStorage.getItem(AUTH_SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (Date.now() >= session.expires_at) return null;
      return session;
    } catch {
      return null;
    }
  },

  async signInWithEmail(email, password) {
    const config = this.getConfig();
    if (!config) throw new Error('Supabase 未配置');
    const baseUrl = config.url.replace(/\/+$/, '');
    const url = `${baseUrl}/auth/v1/token?grant_type=password`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': config.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!resp.ok) {
      let msg = '登录失败';
      try {
        const err = await resp.json();
        msg = err.error_description || err.msg || err.message || msg;
      } catch {}
      throw new Error(msg);
    }

    const data = await resp.json();
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      user: data.user,
    };
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    return session;
  },

  async refreshAuthToken() {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const oldSession = JSON.parse(raw);
    if (!oldSession.refresh_token) return null;

    const config = this.getConfig();
    if (!config) return null;
    const baseUrl = config.url.replace(/\/+$/, '');
    const url = `${baseUrl}/auth/v1/token?grant_type=refresh_token`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': config.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: oldSession.refresh_token }),
    });

    if (!resp.ok) {
      this.clearAuthSession();
      return null;
    }

    const data = await resp.json();
    const newSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      user: data.user,
    };
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(newSession));
    return newSession;
  },

  async getValidToken() {
    const session = this.getAuthSession();
    if (!session) return null;
    // If token expires in next 5 minutes, try refresh
    if (Date.now() >= session.expires_at - 300000) {
      const newSession = await this.refreshAuthToken();
      return newSession?.access_token || null;
    }
    return session.access_token;
  },

  clearAuthSession() {
    localStorage.removeItem(AUTH_SESSION_KEY);
  },

  isAuthenticated() {
    return !!this.getAuthSession();
  },

  /* ---------- REST API 调用 ---------- */
  async _request(method, path, body) {
    const config = this.getConfig();
    if (!config) throw new Error('Supabase 未配置');

    const baseUrl = config.url.replace(/\/+$/, '');
    const url = `${baseUrl}/rest/v1/${path}`;

    const headers = {
      'apikey': config.anonKey,
      'Content-Type': 'application/json',
    };

    // 优先使用 JWT token（认证后），否则用 anon key
    const token = await this.getValidToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      headers['Authorization'] = `Bearer ${config.anonKey}`;
    }

    if (method === 'POST' && body) {
      headers['Prefer'] = 'resolution=merge-duplicates';
    }
    if (method === 'PATCH') {
      headers['Prefer'] = 'return=representation';
    }

    const resp = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!resp.ok) {
      // 401: 认证过期 — 尝试刷新 token 后重试一次
      if (resp.status === 401 && localStorage.getItem(AUTH_SESSION_KEY)) {
        const newSession = await this.refreshAuthToken();
        if (newSession) {
          headers['Authorization'] = `Bearer ${newSession.access_token}`;
          const retryResp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
          if (retryResp.ok) {
            if (retryResp.status === 204) return null;
            return retryResp.json();
          }
        }
        // 刷新失败，清除会话并提示重新登录
        this.clearAuthSession();
        if (typeof showAuthGate === 'function') setTimeout(() => showAuthGate(), 200);
        throw new Error('登录已过期，请重新登录');
      }
      const errorText = await resp.text();
      let errorMsg = `HTTP ${resp.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.message || errorJson.error || errorMsg;
      } catch {
        if (errorText) errorMsg = errorText.slice(0, 200);
      }
      throw new Error(errorMsg);
    }

    if (resp.status === 204) return null;
    return resp.json();
  },

  /* ---------- 推送数据到云端 ---------- */
  async pushToCloud() {
    if (!this.isConfigured()) throw new Error('请先配置 Supabase');

    const localData = localStorage.getItem('joyzwork_data_v5');
    if (!localData) throw new Error('本地无数据');

    const deviceId = this.getDeviceId();
    const deviceName = navigator.userAgent.includes('Mobile') ? '手机端' : '电脑端';
    const parsedData = JSON.parse(localData);

    const payload = {
      id: deviceId,
      device_name: deviceName,
      data: parsedData,
      updated_at: new Date().toISOString(),
    };

    await this._request('POST', 'joyzwork_data', payload);
    localStorage.setItem('joyzwork_last_synced_at', payload.updated_at);
    return { success: true, time: Date.now() };
  },

  /* ---------- 从云端拉取数据 ---------- */
  async pullFromCloud() {
    if (!this.isConfigured()) throw new Error('请先配置 Supabase');

    const deviceId = this.getDeviceId();
    const result = await this._request('GET', `joyzwork_data?id=eq.${deviceId}&select=data,updated_at&limit=1`);

    if (!result || result.length === 0) {
      // 尝试拉取任意一条数据（跨设备同步）
      const allResult = await this._request('GET', 'joyzwork_data?select=id,data,updated_at&order=updated_at.desc&limit=1');
      if (!allResult || allResult.length === 0) {
        throw new Error('云端暂无数据');
      }
      const cloudEntry = allResult[0];
      return {
        success: true,
        data: cloudEntry.data,
        updated_at: cloudEntry.updated_at,
        source_device: cloudEntry.id,
      };
    }

    const cloudEntry = result[0];
    return {
      success: true,
      data: cloudEntry.data,
      updated_at: cloudEntry.updated_at,
      source_device: deviceId,
    };
  },

  /* ---------- 获取云端信息 ---------- */
  async getCloudInfo() {
    if (!this.isConfigured()) return null;

    try {
      const deviceId = this.getDeviceId();
      const result = await this._request('GET', `joyzwork_data?id=eq.${deviceId}&select=updated_at,device_name&limit=1`);
      if (result && result.length > 0) {
        return { updated_at: result[0].updated_at, device_name: result[0].device_name };
      }
      // 尝试获取任意最新记录
      const allResult = await this._request('GET', 'joyzwork_data?select=updated_at,device_name&order=updated_at.desc&limit=1');
      if (allResult && allResult.length > 0) {
        return { updated_at: allResult[0].updated_at, device_name: allResult[0].device_name };
      }
      return null;
    } catch {
      return null;
    }
  },

  /* ---------- 检测表是否存在 ---------- */
  async checkTable() {
    if (!this.isConfigured()) return { exists: false, error: '未配置' };
    try {
      const result = await this._request('GET', 'joyzwork_data?select=id&limit=1');
      return { exists: true };
    } catch (err) {
      return { exists: false, error: err.message };
    }
  },
};

/* ============================================================
   UI 交互 — Supabase 设置 & 同步弹窗
   ============================================================ */

/* ---------- 打开云同步设置弹窗 ---------- */
function openCloudSyncModal() {
  const config = SupabaseSync.getConfig();
  const isConfigured = SupabaseSync.isConfigured();

  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });

  // ---- 配置区域 ----
  const configSection = el('div', { class: 'sync-section' });
  configSection.appendChild(el('div', { class: 'sync-section-title' }, 'Supabase 连接配置'));

  const urlInput = el('input', {
    class: 'form-input',
    type: 'text',
    id: 'supabaseUrl',
    placeholder: 'https://xxxxx.supabase.co',
    value: config?.url || '',
    style: { marginBottom: '8px' },
  });
  configSection.appendChild(el('label', { class: 'form-label', text: 'Supabase Project URL' }));
  configSection.appendChild(urlInput);

  const keyInput = el('input', {
    class: 'form-input',
    type: 'password',
    id: 'supabaseKey',
    placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...',
    value: config?.anonKey || '',
    style: { marginBottom: '8px' },
  });
  configSection.appendChild(el('label', { class: 'form-label', text: 'Supabase Anon Key (公钥)' }));
  configSection.appendChild(keyInput);

  // ---- 提示信息 ----
  const hintBox = el('div', { class: 'sync-hint' });
  hintBox.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px;">使用说明：</div>
    <div style="margin-bottom:4px;">1. 注册 <a href="https://supabase.com" target="_blank" style="color:var(--c-primary);">supabase.com</a> 免费账号</div>
    <div style="margin-bottom:4px;">2. 新建项目，进入 SQL Editor 执行建表语句：</div>
    <pre style="background:var(--c-bg-2);padding:10px;border-radius:6px;font-size:11px;overflow-x:auto;margin:6px 0;color:var(--c-text-2);">${`create table joyzwork_data (
  id text primary key,
  device_name text,
  data jsonb,
  updated_at timestamptz default now()
);

-- 启用行级安全策略
alter table joyzwork_data enable row level security;

-- 允许所有操作（个人使用，简化配置）
create policy "allow_all" on joyzwork_data
  for all using (true) with check (true);`}</pre>
    <div style="margin-bottom:4px;">3. 在项目 Settings > API 中复制 URL 和 anon key</div>
    <div>4. 粘贴到上方输入框，点击"保存配置"</div>
  `;
  configSection.appendChild(hintBox);

  // ---- 配置按钮 ----
  const configBtnRow = el('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } });

  const saveBtn = el('button', {
    class: 'btn btn-primary',
    style: { flex: '1' },
  }, '保存配置');

  const testBtn = el('button', {
    class: 'btn btn-secondary',
    style: { flex: '1' },
  }, '测试连接');

  const clearBtn = el('button', {
    class: 'btn btn-danger',
    style: isConfigured ? {} : { display: 'none' },
  }, '清除配置');

  configBtnRow.appendChild(saveBtn);
  configBtnRow.appendChild(testBtn);
  configBtnRow.appendChild(clearBtn);
  configSection.appendChild(configBtnRow);

  // ---- 同步操作区域 ----
  const syncSection = el('div', { class: 'sync-section', style: isConfigured ? {} : { opacity: '0.5', pointerEvents: 'none' } });
  syncSection.appendChild(el('div', { class: 'sync-section-title' }, '数据同步操作'));

  // 同步状态显示
  const statusRow = el('div', { class: 'sync-status-row', id: 'syncStatusRow' });
  statusRow.appendChild(el('span', { class: 'sync-status-dot', style: { background: isConfigured ? '#10b981' : '#94a3b8' } }));
  statusRow.appendChild(el('span', { text: isConfigured ? '已连接' : '未连接' }));
  syncSection.appendChild(statusRow);

  // 云端信息
  if (isConfigured) {
    const cloudInfo = el('div', { class: 'sync-cloud-info', id: 'syncCloudInfo', text: '正在获取云端信息...' });
    syncSection.appendChild(cloudInfo);

    // 异步获取云端信息
    SupabaseSync.getCloudInfo().then(info => {
      const infoEl = $('#syncCloudInfo');
      if (infoEl) {
        if (info) {
          const date = new Date(info.updated_at);
          const dateStr = `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          infoEl.textContent = `云端最后更新：${dateStr}（${info.device_name || '未知设备'}）`;
        } else {
          infoEl.textContent = '云端暂无数据，点击下方"上传到云端"开始同步';
        }
      }
    });
  }

  // 同步按钮
  const syncBtnRow = el('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } });

  const pushBtn = el('button', {
    class: 'btn btn-primary',
    style: { flex: '1' },
  },
    el('span', { text: '上传到云端' }),
  );

  const pullBtn = el('button', {
    class: 'btn btn-secondary',
    style: { flex: '1' },
  },
    el('span', { text: '从云端拉取' }),
  );

  syncBtnRow.appendChild(pushBtn);
  syncBtnRow.appendChild(pullBtn);
  syncSection.appendChild(syncBtnRow);

  // 自动同步开关
  const autoSyncRow = el('div', { class: 'sync-auto-row', style: { marginTop: '12px' } });
  const autoSyncCheckbox = el('input', {
    type: 'checkbox',
    id: 'autoSyncToggle',
    checked: config?.autoSync === true,
    style: { marginRight: '6px' },
  });
  autoSyncRow.appendChild(autoSyncCheckbox);
  autoSyncRow.appendChild(el('label', { for: 'autoSyncToggle', text: '数据变更时自动上传到云端', style: { fontSize: '13px', cursor: 'pointer' } }));
  syncSection.appendChild(autoSyncRow);

  // ---- 结果显示区 ----
  const resultArea = el('div', { class: 'sync-result', id: 'syncResult', style: { display: 'none' } });

  // ---- 组装 ----
  body.appendChild(configSection);
  body.appendChild(syncSection);
  body.appendChild(resultArea);

  openModal('云端数据同步', true);
  $('#modalBody').innerHTML = '';
  $('#modalBody').appendChild(body);

  // ---- 事件绑定 ----
  saveBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    const anonKey = keyInput.value.trim();

    if (!url || !anonKey) {
      showSyncResult('请填写完整的 URL 和 Key', 'error');
      return;
    }

    if (!url.match(/^https?:\/\/.+supabase\.co.+$/) && !url.match(/^https?:\/\/.+/)) {
      showSyncResult('URL 格式不正确，应以 https:// 开头', 'error');
      return;
    }

    SupabaseSync.saveConfig({
      url,
      anonKey,
      autoSync: autoSyncCheckbox.checked,
    });

    showSyncResult('配置已保存！', 'success');
    showToast('Supabase 配置已保存', 'success');

    // 重新打开弹窗以刷新状态
    setTimeout(() => openCloudSyncModal(), 800);
  });

  testBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const anonKey = keyInput.value.trim();

    if (!url || !anonKey) {
      showSyncResult('请先填写 URL 和 Key', 'error');
      return;
    }

    // 临时保存配置用于测试
    SupabaseSync.saveConfig({ url, anonKey, autoSync: autoSyncCheckbox.checked });

    testBtn.textContent = '测试中...';
    testBtn.disabled = true;

    const result = await SupabaseSync.checkTable();
    testBtn.textContent = '测试连接';
    testBtn.disabled = false;

    if (result.exists) {
      showSyncResult('连接成功！数据表已就绪', 'success');
      showToast('Supabase 连接成功', 'success');
      setTimeout(() => openCloudSyncModal(), 800);
    } else {
      let msg = `连接失败：${result.error}`;
      if (result.error && result.error.includes('Could not find the table')) {
        msg = '连接成功，但数据表不存在。请在 Supabase SQL Editor 中执行建表语句（见上方说明）';
      }
      showSyncResult(msg, 'error');
    }
  });

  clearBtn.addEventListener('click', () => {
    if (confirm('确定清除 Supabase 配置吗？本地数据不会被删除。')) {
      SupabaseSync.clearConfig();
      showToast('配置已清除', 'info');
      setTimeout(() => openCloudSyncModal(), 400);
    }
  });

  pushBtn.addEventListener('click', async () => {
    pushBtn.textContent = '上传中...';
    pushBtn.disabled = true;
    try {
      await SupabaseSync.pushToCloud();
      showSyncResult('数据已成功上传到云端！', 'success');
      showToast('数据已上传到云端', 'success');
      // 刷新云端信息
      setTimeout(() => openCloudSyncModal(), 1000);
    } catch (err) {
      showSyncResult('上传失败：' + err.message, 'error');
      showToast('上传失败：' + err.message, 'danger');
    }
    pushBtn.textContent = '上传到云端';
    pushBtn.disabled = false;
  });

  pullBtn.addEventListener('click', async () => {
    if (!confirm('从云端拉取数据将覆盖当前本地数据，确定继续吗？')) return;

    pullBtn.textContent = '拉取中...';
    pullBtn.disabled = true;
    try {
      const result = await SupabaseSync.pullFromCloud();
      if (result.data) {
        // 备份当前数据
        const backup = localStorage.getItem('joyzwork_data_v5');
        localStorage.setItem('joyzwork_data_backup', backup);

        // 写入云端数据
        localStorage.setItem('joyzwork_data_v5', JSON.stringify(result.data));

        showSyncResult('数据已从云端拉取成功！页面即将刷新...', 'success');
        showToast('云端数据已同步，正在刷新...', 'success');

        setTimeout(() => location.reload(), 1500);
      } else {
        showSyncResult('云端暂无数据', 'error');
      }
    } catch (err) {
      showSyncResult('拉取失败：' + err.message, 'error');
      showToast('拉取失败：' + err.message, 'danger');
    }
    pullBtn.textContent = '从云端拉取';
    pullBtn.disabled = false;
  });

  autoSyncCheckbox.addEventListener('change', () => {
    const currentConfig = SupabaseSync.getConfig();
    if (currentConfig) {
      currentConfig.autoSync = autoSyncCheckbox.checked;
      SupabaseSync.saveConfig(currentConfig);
      if (autoSyncCheckbox.checked) {
        showToast('已开启自动同步', 'info');
      } else {
        showToast('已关闭自动同步', 'info');
      }
    }
  });
}

/* ---------- 显示同步结果 ---------- */
function showSyncResult(message, type) {
  const resultEl = $('#syncResult');
  if (!resultEl) return;

  const colors = {
    success: { bg: '#ecfdf5', border: '#10b981', text: '#065f46', icon: 'checkmark-circle' },
    error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', icon: 'alert-circle' },
    info: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', icon: 'info-circle' },
  };
  const c = colors[type] || colors.info;

  resultEl.style.cssText = `display:block;padding:12px;background:${c.bg};border:1px solid ${c.border};border-radius:8px;color:${c.text};font-size:13px;`;
  const icon = type === 'success' ? '\u2713' : type === 'error' ? '\u26a0' : '\u2139';
  resultEl.innerHTML = `<span style="font-weight:bold;margin-right:6px;">${icon}</span>${message}`;
}

/* ---------- 自动同步钩子（由 Store.save 调用） ---------- */
let _autoSyncTimer = null;
let _lastLocalChangeTime = 0;

function triggerAutoSync() {
  const config = SupabaseSync.getConfig();
  if (!config || !config.autoSync) return;

  _lastLocalChangeTime = Date.now();
  clearTimeout(_autoSyncTimer);
  _autoSyncTimer = setTimeout(async () => {
    try {
      await SupabaseSync.pushToCloud();
    } catch (err) {
      console.warn('Auto sync failed:', err.message);
    }
  }, 5000); // 数据变更后5秒自动上传
}

/* ---------- 自动拉取（从云端同步到本地） ---------- */
let _autoPullTimer = null;
let _lastCloudUpdatedAt = null;

// 智能拉取：比较云端和本地时间戳，云端更新才拉取
async function smartPullFromCloud() {
  if (!SupabaseSync.isConfigured()) return false;

  try {
    // 获取云端最新记录
    const allResult = await SupabaseSync._request('GET', 'joyzwork_data?select=id,data,updated_at&order=updated_at.desc&limit=1');
    if (!allResult || allResult.length === 0) return false;

    const cloudEntry = allResult[0];
    const cloudTime = new Date(cloudEntry.updated_at).getTime();

    // 如果云端时间和上次已知的一致，跳过
    if (_lastCloudUpdatedAt === cloudTime) return false;
    _lastCloudUpdatedAt = cloudTime;

    // 如果本地最近10秒内有改动，跳过（避免覆盖未同步的本地数据）
    if (_lastLocalChangeTime > 0 && (Date.now() - _lastLocalChangeTime) < 10000) return false;

    // 读取本地数据的最后更新时间
    const localRaw = localStorage.getItem('joyzwork_data_v5');
    if (!localRaw) {
      // 本地无数据，直接用云端数据
      localStorage.setItem('joyzwork_data_v5', JSON.stringify(cloudEntry.data));
      return true;
    }

    // 比较时间戳：用本地存储的 _cloudSyncedAt 记录上次同步时间
    const lastSynced = localStorage.getItem('joyzwork_last_synced_at');
    const lastSyncedTime = lastSynced ? new Date(lastSynced).getTime() : 0;

    if (cloudTime > lastSyncedTime) {
      // 云端有新数据，合并拉取
      const localData = JSON.parse(localRaw);

      // 简单合并策略：云端数据覆盖本地（最后写入者优先）
      // 但保留本地的一些即时状态（如当前选中的标签页等）
      const cloudData = cloudEntry.data;

      // 备份当前本地数据
      localStorage.setItem('joyzwork_data_backup', localRaw);

      // 使用云端数据
      localStorage.setItem('joyzwork_data_v5', JSON.stringify(cloudData));
      localStorage.setItem('joyzwork_last_synced_at', cloudEntry.updated_at);

      return true; // 有更新
    }

    return false;
  } catch (err) {
    console.warn('Smart pull failed:', err.message);
    return false;
  }
}

// 初始化自动拉取：页面加载时拉取一次 + 每60秒定时拉取
function initAutoPullSync() {
  if (!SupabaseSync.isConfigured()) return;

  // 页面加载后3秒拉取一次
  setTimeout(async () => {
    const updated = await smartPullFromCloud();
    if (updated) {
      console.log('Cloud data synced, reloading...');
      // 如果有更新且页面刚加载，刷新页面以加载新数据
      if (!window._appInitialized) {
        location.reload();
        return;
      }
      // 如果App已初始化，通过Store重新加载
      if (typeof Store !== 'undefined' && Store._load) {
        Store._load();
        Store.emit();
      }
    }
  }, 3000);

  // 每60秒检查一次云端是否有新数据
  _autoPullTimer = setInterval(async () => {
    const updated = await smartPullFromCloud();
    if (updated && typeof Store !== 'undefined' && Store._load) {
      Store._load();
      Store.emit();
      showToast('已从云端同步最新数据', 'info');
    }
  }, 60000);
}
