// ==UserScript==
// @name         evan癫影 Dian115 Emby&115 转存助手
// @namespace    https://dian115-helper.local/
// @version      0.1.13
// @description  癫影 m.dian115.com 显示 Emby 入库状态，并在详情页一键解锁 115 分享后转存到 115 网盘。(加固本地缓存提速版)
// @author       Nagi & Gemini
// @match        https://m.dian115.com/*
// @match        https://115.com/s/*
// @match        https://115cdn.com/*
// @homepageURL   https://gist.github.com/zhen19931993-cmyk/546bd2cda09a7348ca8021d0593d9790
// @updateURL     https://gist.githubusercontent.com/zhen19931993-cmyk/546bd2cda09a7348ca8021d0593d9790/raw/dian115-emby-115-helper.user.js
// @downloadURL   https://gist.githubusercontent.com/zhen19931993-cmyk/546bd2cda09a7348ca8021d0593d9790/raw/dian115-emby-115-helper.user.js
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const APP = {
    name: 'Dian115 Emby&115',
    apiBase: '/api/portal',
    api115Receive: 'https://115cdn.com/webapi/share/receive',
    api115Snap: 'https://115cdn.com/webapi/share/snap',
    symediaApiPath: '/api/v1/plugin/cloud_helper/add_share_urls_115',
    maxCardsPerScan: 120,
    scanDelay: 550
  };

  const store = {
    embyHost: GM_getValue('d115_emby_host', ''),
    embyApiKey: GM_getValue('d115_emby_api_key', ''),
    cookie115: GM_getValue('d115_115_cookie', ''),
    targetCid: GM_getValue('d115_115_cid', '0'),
    transferMethod: GM_getValue('d115_transfer_method', 'cookie'),
    symediaUrl: GM_getValue('d115_symedia_url', ''),
    symediaToken: GM_getValue('d115_symedia_token', 'symedia'),
    enableTransfer: GM_getValue('d115_enable_transfer', true),
    confirmUnlock: GM_getValue('d115_confirm_unlock', true),
    maxUnlockCost: GM_getValue('d115_max_unlock_cost', ''),
    skipWhenInEmby: GM_getValue('d115_skip_when_emby_has', false),
    autoLoadPages: GM_getValue('d115_auto_load_pages', true)
  };

  // 从本地安全读取持久化缓存
  let localEmbyCache = {};
  try {
    localEmbyCache = JSON.parse(GM_getValue('d115_emby_persistent_cache', '{}'));
  } catch (e) {
    localEmbyCache = {};
  }

  const state = {
    embyCache: new Map(Object.entries(localEmbyCache)), // 初始化加载缓存
    processingCards: new WeakSet(),
    detailCacheKey: '',
    detailCache: null,
    mutationTimer: null,
    logPanel: null,
    logBody: null,
    currentDetailEmby: null,
    genreCache: new Map(),
    autoPager: {
      loading: false,
      done: false,
      page: 0,
      totalPages: 0,
      baseKey: '',
      timer: null,
      statusEl: null,
      loadedKeys: new Set()
    }
  };

  const css = `
    .d115-fab {
      position: fixed;
      right: 16px;
      bottom: 88px;
      z-index: 2147483000;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 36px;
      padding: 0 12px;
      border: 1px solid rgba(59,130,246,.45);
      border-radius: 18px;
      background: rgba(15,23,42,.92);
      color: #dbeafe;
      font-size: 12px;
      font-weight: 700;
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      cursor: pointer;
      user-select: none;
      backdrop-filter: blur(12px);
    }
    .d115-fab:hover { color: #fff; border-color: rgba(96,165,250,.9); }
    .d115-log-panel {
      position: fixed;
      right: 16px;
      bottom: 132px;
      z-index: 2147483000;
      width: min(420px, calc(100vw - 32px));
      height: 320px;
      display: none;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid rgba(148,163,184,.28);
      border-radius: 10px;
      background: rgba(15,23,42,.96);
      color: #e5e7eb;
      box-shadow: 0 20px 50px rgba(0,0,0,.45);
      font: 12px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      backdrop-filter: blur(14px);
    }
    .d115-log-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 38px;
      padding: 0 12px;
      border-bottom: 1px solid rgba(148,163,184,.16);
      font-weight: 700;
    }
    .d115-log-close { cursor: pointer; color: #93c5fd; }
    .d115-log-body { flex: 1; overflow: auto; padding: 10px 12px; }
    .d115-log-line { padding: 3px 0; border-bottom: 1px dashed rgba(148,163,184,.12); }
    .d115-log-line a { color: #93c5fd; }
    .d115-log-time { color: #94a3b8; margin-right: 6px; }
    .d115-log-success { color: #86efac; }
    .d115-log-error { color: #fca5a5; }
    .d115-log-info { color: #bfdbfe; }
    .d115-emby-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 22px;
      min-width: 22px;
      padding: 0 7px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      line-height: 1;
      white-space: nowrap;
      box-shadow: 0 5px 15px rgba(0,0,0,.24);
      backdrop-filter: blur(10px);
    }
    .d115-emby-badge.is-floating {
      position: absolute;
      left: 8px;
      top: 8px;
      z-index: 10;
      padding: 0;
      width: 25px;
      height: 25px;
      font-size: 15px;
      border: 2px solid rgba(255,255,255,.78);
    }
    .d115-emby-badge.has {
      color: #fff;
      background: linear-gradient(135deg,#22c55e,#15803d);
    }
    .d115-emby-badge.miss {
      color: #fff;
      background: linear-gradient(135deg,#ef4444,#991b1b);
    }
    .d115-emby-title-wrap {
      display: inline-flex;
      vertical-align: middle;
      margin-left: 10px;
    }
    .d115-transfer-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .d115-transfer-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 30px;
      padding: 0 11px;
      margin-left: 2px;
      border: 1px solid rgba(59,130,246,.45);
      border-radius: 999px;
      background: rgba(37,99,235,.18);
      color: #bfdbfe;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      user-select: none;
    }
    .d115-transfer-btn:hover { background: rgba(37,99,235,.28); color: #fff; }
    .d115-transfer-btn[disabled] { cursor: not-allowed; opacity: .55; }
    .d115-transfer-meta { color: #94a3b8; font-size: 11px; }
    .d115-modal-mask {
      position: fixed;
      inset: 0;
      z-index: 2147483001;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background: rgba(0,0,0,.55);
      backdrop-filter: blur(10px);
    }
    .d115-modal {
      width: min(560px, 100%);
      max-height: 88vh;
      overflow: auto;
      border: 1px solid rgba(148,163,184,.24);
      border-radius: 12px;
      background: #111827;
      color: #e5e7eb;
      box-shadow: 0 26px 70px rgba(0,0,0,.55);
      font: 13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    .d115-modal h3 { margin: 0; padding: 16px 18px; border-bottom: 1px solid rgba(148,163,184,.16); font-size: 16px; }
    .d115-modal-body { padding: 16px 18px; }
    .d115-field { margin-bottom: 13px; }
    .d115-field label { display: block; margin-bottom: 5px; color: #cbd5e1; font-weight: 700; }
    .d115-field input[type="text"],
    .d115-field input[type="password"],
    .d115-field textarea,
    .d115-field select {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid rgba(148,163,184,.25);
      border-radius: 8px;
      background: rgba(15,23,42,.88);
      color: #e5e7eb;
      padding: 8px 10px;
      font: inherit;
      outline: none;
    }
    .d115-field textarea { min-height: 80px; resize: vertical; font-family: ui-monospace,SFMono-Regular,Menlo,monospace; }
    .d115-field small { display: block; color: #94a3b8; margin-top: 4px; }
    .d115-check-row { display: flex; align-items: center; gap: 8px; margin: 10px 0; color: #cbd5e1; }
    .d115-modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 18px 18px; border-top: 1px solid rgba(148,163,184,.16); }
    .d115-modal button { height: 34px; padding: 0 14px; border: 0; border-radius: 8px; color: #e5e7eb; background: rgba(71,85,105,.75); cursor: pointer; font-weight: 700; }
    .d115-modal button.primary { background: #2563eb; color: #fff; }
    .d115-autopager-status {
      width: 100%;
      margin: 18px 0 8px;
      padding: 10px 12px;
      border: 1px solid rgba(148,163,184,.18);
      border-radius: 10px;
      background: rgba(15,23,42,.72);
      color: #94a3b8;
      text-align: center;
      font-size: 12px;
      line-height: 1.45;
    }
  `;

  GM_addStyle(css);

  function normalizeTitle(text) {
    return String(text || '')
      .replace(/[（]/g, '(')
      .replace(/[）]/g, ')')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  function escapeHtml(text) {
    return String(text || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function debounceScan() {
    clearTimeout(state.mutationTimer);
    state.mutationTimer = setTimeout(scanPage, APP.scanDelay);
  }

  function log(message, type = 'info') {
    ensureLogPanel();
    const line = document.createElement('div');
    line.className = `d115-log-line d115-log-${type}`;
    const time = new Date().toLocaleTimeString();
    line.innerHTML = `<span class="d115-log-time">[${time}]</span>${message}`;
    state.logBody.appendChild(line);
    state.logBody.scrollTop = state.logBody.scrollHeight;
  }

  function notify(message, type = 'info') {
    log(escapeHtml(message), type);
  }

  function ensureLogPanel() {
    if (state.logPanel) return state.logPanel;

    const panel = document.createElement('div');
    panel.className = 'd115-log-panel';
    panel.innerHTML = `
      <div class="d115-log-head">
        <span>Dian115 转存日志</span>
        <span class="d115-log-close">关闭</span>
      </div>
      <div class="d115-log-body"></div>
    `;
    panel.querySelector('.d115-log-close').addEventListener('click', () => {
      panel.style.display = 'none';
    });
    document.body.appendChild(panel);
    state.logPanel = panel;
    state.logBody = panel.querySelector('.d115-log-body');
    return panel;
  }

  function toggleLogPanel() {
    ensureLogPanel();
    state.logPanel.style.display = state.logPanel.style.display === 'flex' ? 'none' : 'flex';
  }

  function ensureFab() {
    if (document.querySelector('.d115-fab')) return;
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'd115-fab';
    fab.textContent = 'E115 设置';
    fab.addEventListener('click', showSettings);
    fab.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      toggleLogPanel();
    });
    document.body.appendChild(fab);
  }

  // 清空本地缓存全局函数
  function clearAndReloadCache() {
    GM_setValue('d115_emby_persistent_cache', '{}');
    state.embyCache.clear();
    state.detailCacheKey = '';
    state.detailCache = null;
    resetAutoPager();
    document.querySelectorAll('.d115-emby-badge, .d115-transfer-row').forEach((el) => el.remove());
    document.querySelectorAll('[data-d115-emby]').forEach((el) => delete el.dataset.d115Emby);
    notify('比对缓存已清空，正在重新进行全面扫描同步...', 'success');
    debounceScan();
  }

  function saveSettingsFromModal(modal) {
    store.embyHost = modal.querySelector('#d115-emby-host').value.trim().replace(/\/+$/, '');
    store.embyApiKey = modal.querySelector('#d115-emby-key').value.trim();
    store.cookie115 = modal.querySelector('#d115-cookie').value.trim();
    store.targetCid = modal.querySelector('#d115-cid').value.trim() || '0';
    store.transferMethod = modal.querySelector('#d115-transfer-method').value;
    store.symediaUrl = modal.querySelector('#d115-symedia-url').value.trim();
    store.symediaToken = modal.querySelector('#d115-symedia-token').value.trim() || 'symedia';
    store.enableTransfer = modal.querySelector('#d115-enable-transfer').checked;
    store.confirmUnlock = modal.querySelector('#d115-confirm-unlock').checked;
    store.maxUnlockCost = modal.querySelector('#d115-max-cost').value.trim();
    store.skipWhenInEmby = modal.querySelector('#d115-skip-emby').checked;
    store.autoLoadPages = modal.querySelector('#d115-auto-load-pages').checked;

    GM_setValue('d115_emby_host', store.embyHost);
    GM_setValue('d115_emby_api_key', store.embyApiKey);
    GM_setValue('d115_115_cookie', store.cookie115);
    GM_setValue('d115_115_cid', store.targetCid);
    GM_setValue('d115_transfer_method', store.transferMethod);
    GM_setValue('d115_symedia_url', store.symediaUrl);
    GM_setValue('d115_symedia_token', store.symediaToken);
    GM_setValue('d115_enable_transfer', store.enableTransfer);
    GM_setValue('d115_confirm_unlock', store.confirmUnlock);
    GM_setValue('d115_max_unlock_cost', store.maxUnlockCost);
    GM_setValue('d115_skip_when_emby_has', store.skipWhenInEmby);
    GM_setValue('d115_auto_load_pages', store.autoLoadPages);

    clearAndReloadCache();
  }

  function showSettings() {
    if (document.querySelector('.d115-modal-mask')) return;
    const mask = document.createElement('div');
    mask.className = 'd115-modal-mask';
    mask.innerHTML = `
      <div class="d115-modal">
        <h3>Dian115 Emby&115 转存助手</h3>
        <div class="d115-modal-body">
          <div class="d115-field">
            <label for="d115-emby-host">Emby 地址</label>
            <input id="d115-emby-host" type="text" value="${escapeHtml(store.embyHost)}" placeholder="https://emby.example.com">
          </div>
          <div class="d115-field">
            <label for="d115-emby-key">Emby API Key</label>
            <input id="d115-emby-key" type="password" value="${escapeHtml(store.embyApiKey)}" placeholder="用于查询是否已入库">
          </div>
          <div class="d115-field">
            <label for="d115-transfer-method">转存方式</label>
            <select id="d115-transfer-method">
              <option value="cookie" ${store.transferMethod === 'cookie' ? 'selected' : ''}>115 Cookie 转存</option>
              <option value="symedia" ${store.transferMethod === 'symedia' ? 'selected' : ''}>Symedia API 转存</option>
            </select>
          </div>
          <div id="d115-cid-field" class="d115-field">
            <label for="d115-cid">目标 CID</label>
            <input id="d115-cid" type="text" value="${escapeHtml(store.targetCid)}" placeholder="0">
            <small>0 表示根目录。</small>
          </div>
          <div id="d115-cookie-field" class="d115-field" style="${store.transferMethod === 'symedia' ? 'display:none;' : ''}">
            <label for="d115-cookie">115 Cookie</label>
            <textarea id="d115-cookie" placeholder="UID=...; CID=...; SEID=...">${escapeHtml(store.cookie115)}</textarea>
            <small>选择 Cookie 转存时使用。只保存在 Tampermonkey 的脚本存储里。</small>
          </div>
          <div id="d115-symedia-url-field" class="d115-field" style="${store.transferMethod === 'cookie' ? 'display:none;' : ''}">
            <label for="d115-symedia-url">Symedia 地址</label>
            <input id="d115-symedia-url" type="text" value="${escapeHtml(store.symediaUrl)}" placeholder="http://127.0.0.1:8095">
          </div>
          <div id="d115-symedia-token-field" class="d115-field" style="${store.transferMethod === 'cookie' ? 'display:none;' : ''}">
            <label for="d115-symedia-token">Symedia Token</label>
            <input id="d115-symedia-token" type="text" value="${escapeHtml(store.symediaToken)}" placeholder="symedia">
          </div>
          <div class="d115-field">
            <label for="d115-max-cost">最高自动解锁积分</label>
            <input id="d115-max-cost" type="text" value="${escapeHtml(store.maxUnlockCost)}" placeholder="留空表示不限制">
          </div>
          <label class="d115-check-row"><input id="d115-enable-transfer" type="checkbox" ${store.enableTransfer ? 'checked' : ''}> 解锁后自动转存到 115</label>
          <label class="d115-check-row"><input id="d115-confirm-unlock" type="checkbox" ${store.confirmUnlock ? 'checked' : ''}> 消耗积分前弹窗确认</label>
          <label class="d115-check-row"><input id="d115-skip-emby" type="checkbox" ${store.skipWhenInEmby ? 'checked' : ''}> Emby 已入库时阻止一键转存</label>
          <label class="d115-check-row"><input id="d115-auto-load-pages" type="checkbox" ${store.autoLoadPages ? 'checked' : ''}> 浏览列表时自动加载下一页</label>
        </div>
        <div class="d115-modal-actions">
          <button type="button" data-action="flush" style="background:#dc2626; color:#fff; margin-right:auto;">🔄 刷新缓存</button>
          <button type="button" data-action="logs">日志</button>
          <button type="button" data-action="cancel">取消</button>
          <button type="button" data-action="save" class="primary">保存</button>
        </div>
      </div>
    `;
    mask.addEventListener('click', (event) => {
      if (event.target === mask) mask.remove();
    });
    mask.querySelector('[data-action="cancel"]').addEventListener('click', () => mask.remove());
    mask.querySelector('[data-action="logs"]').addEventListener('click', () => toggleLogPanel());

    // 刷新缓存按钮绑定逻辑
    mask.querySelector('[data-action="flush"]').addEventListener('click', () => {
      clearAndReloadCache();
      mask.remove();
    });

    const transferSelect = mask.querySelector('#d115-transfer-method');
    const cookieField = mask.querySelector('#d115-cookie-field');
    const symediaUrlField = mask.querySelector('#d115-symedia-url-field');
    const symediaTokenField = mask.querySelector('#d115-symedia-token-field');
    const cidField = mask.querySelector('#d115-cid-field');
    const updateTransferFields = () => {
      const isSymedia = transferSelect.value === 'symedia';
      cookieField.style.display = isSymedia ? 'none' : '';
      cidField.style.display = '';
      symediaUrlField.style.display = isSymedia ? '' : 'none';
      symediaTokenField.style.display = isSymedia ? '' : 'none';
    };
    transferSelect.addEventListener('change', updateTransferFields);
    updateTransferFields();
    mask.querySelector('[data-action="save"]').addEventListener('click', () => {
      saveSettingsFromModal(mask);
      mask.remove();
    });
    document.body.appendChild(mask);
  }

  function gmRequest(options) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        ...options,
        onload: (response) => resolve(response),
        onerror: (error) => reject(error),
        ontimeout: (error) => reject(error)
      });
    });
  }

  async function checkEmby(title, year) {
    if (!store.embyHost || !store.embyApiKey || !title) return null;
    const cacheKey = `${normalizeTitle(title)}:${year || ''}`;

    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000; // 缓存有效期24小时

    // 1. 读取运行时内存缓存和时效比对
    if (state.embyCache.has(cacheKey)) {
      const cachedItem = state.embyCache.get(cacheKey);
      if (cachedItem && typeof cachedItem === 'object' && (now - cachedItem.timestamp < ONE_DAY)) {
        return cachedItem.has;
      }
      if (typeof cachedItem === 'boolean') {
        return cachedItem; // 兼容旧版布尔型缓存
      }
    }

    // 2. 内存不命中或过期，发起网络 API 请求
    const url = `${store.embyHost}/emby/Items?api_key=${encodeURIComponent(store.embyApiKey)}&SearchTerm=${encodeURIComponent(title)}&IncludeItemTypes=Movie,Series&Recursive=true&Fields=ProductionYear,OriginalTitle&Limit=30`;
    try {
      const response = await gmRequest({ method: 'GET', url, timeout: 12000 });
      const data = JSON.parse(response.responseText || '{}');
      const expected = normalizeTitle(title);
      const expectedYear = Number(year || 0);
      const has = Array.isArray(data.Items) && data.Items.some((item) => {
        const itemYear = Number(item.ProductionYear || 0);
        const yearOk = !expectedYear || !itemYear || itemYear === expectedYear;
        if (!yearOk) return false;
        return normalizeTitle(item.Name) === expected ||
          normalizeTitle(item.OriginalTitle) === expected ||
          normalizeTitle(item.Name).includes(expected) ||
          expected.includes(normalizeTitle(item.Name));
      });

      // 3. 写入持久化存储
      const cacheObj = { has: has, timestamp: now };
      state.embyCache.set(cacheKey, cacheObj);

      let syncCache = {};
      state.embyCache.forEach((val, key) => { syncCache[key] = val; });
      GM_setValue('d115_emby_persistent_cache', JSON.stringify(syncCache));

      return has;
    } catch (error) {
      const cacheObj = { has: false, timestamp: now };
      state.embyCache.set(cacheKey, cacheObj);
      return false;
    }
  }

  function createEmbyBadge(has, floating = false) {
    const badge = document.createElement('span');
    badge.className = `d115-emby-badge ${has ? 'has' : 'miss'} ${floating ? 'is-floating' : ''}`;
    badge.textContent = has ? '✓' : '✕';
    badge.title = has ? 'Emby 已入库' : 'Emby 未入库';
    if (!floating) badge.textContent = has ? '已入库' : '未入库';
    return badge;
  }

  function parseTitleYear(text) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    const match = raw.match(/(.+?)[(（](\d{4})[)）]/);
    if (!match) return null;
    const title = match[1].replace(/^[\d.]+\s*(?:\d+\s*资源)?\s*/, '').trim();
    const year = Number(match[2]);
    if (!title || !year) return null;
    return { title, year };
  }

  async function processCard(anchor) {
    if (anchor.dataset.d115Emby || state.processingCards.has(anchor)) return;
    const info = parseTitleYear(anchor.querySelector('h3')?.textContent || anchor.innerText);
    if (!info) return;

    anchor.dataset.d115Emby = 'pending';
    state.processingCards.add(anchor);
    try {
      const has = await checkEmby(info.title, info.year);
      if (has === null) {
        anchor.dataset.d115Emby = 'skipped';
        return;
      }
      if (!anchor.querySelector('.d115-emby-badge')) {
        anchor.style.position = anchor.style.position || 'relative';
        anchor.appendChild(createEmbyBadge(has, true));
      }
      anchor.dataset.d115Emby = has ? 'has' : 'miss';
    } finally {
      state.processingCards.delete(anchor);
    }
  }

  async function processCards() {
    const anchors = Array.from(document.querySelectorAll('a[href*="/tmdb/movie/"], a[href*="/tmdb/tv/"]'))
      .filter((a) => a.querySelector('h3') || /[(（]\d{4}[)）]/.test(a.innerText))
      .filter((a) => !a.dataset.d115Emby && !state.processingCards.has(a))
      .slice(0, APP.maxCardsPerScan);
    let index = 0;
    const workers = Array.from({ length: 4 }, async () => {
      while (index < anchors.length) {
        const current = anchors[index++];
        await processCard(current);
      }
    });
    await Promise.all(workers);
  }

  function currentTmdbRoute() {
    const match = location.pathname.match(/^\/tmdb\/(movie|tv)\/(\d+)/);
    if (!match) return null;
    const params = new URLSearchParams(location.search);
    const season = params.get('season') || params.get('s') || '';
    return {
      mediaType: match[1],
      tmdbId: Number(match[2]),
      season
    };
  }

  async function portalRequest(method, path, data) {
    const options = {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    };
    if (data && method !== 'GET') options.body = JSON.stringify(data);
    const response = await fetch(`${APP.apiBase}${path}`, options);
    const text = await response.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch (error) {
      json = { raw: text };
    }
    if (!response.ok || (json.code && json.code !== 'ok')) {
      const message = json.msg || json.message || json.code || `HTTP ${response.status}`;
      const err = new Error(message);
      err.response = json;
      throw err;
    }
    return json;
  }

  function queryString(params) {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') sp.set(key, value);
    });
    return sp.toString();
  }

  function isDiscoverPage() {
    return location.hostname === 'm.dian115.com' && location.pathname.replace(/\/+$/, '') === '/discover';
  }

  function discoverGrid() {
    return document.querySelector('.discover-poster-grid');
  }

  function currentDiscoverKind() {
    const active = document.querySelector('.discover-type-tab-active');
    const text = active?.textContent?.trim() || new URLSearchParams(location.search).get('kind') || '';
    if (/动漫|anime/i.test(text)) return 'anime';
    if (/剧|tv|series/i.test(text)) return 'tv';
    return 'movie';
  }

  function discoverApiMatchesKind(url) {
    const kind = currentDiscoverKind();
    const mediaType = url.searchParams.get('media_type');
    const genres = url.searchParams.get('with_genres') || '';
    if (kind === 'movie') return mediaType === 'movie';
    if (kind === 'anime') return mediaType === 'tv' && genres.split(',').includes('16');
    return mediaType === 'tv';
  }

  function latestDiscoverApiUrl() {
    const entries = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .reverse();
    for (const name of entries) {
      if (!name.includes('/api/portal/tmdb/discover?')) continue;
      try {
        const url = new URL(name, location.origin);
        if (discoverApiMatchesKind(url)) return url;
      } catch (error) {
        // Ignore malformed resource names from browser extensions.
      }
    }

    const kind = currentDiscoverKind();
    const url = new URL(`${location.origin}${APP.apiBase}/tmdb/discover`);
    url.searchParams.set('media_type', kind === 'movie' ? 'movie' : 'tv');
    url.searchParams.set('sort_by', 'popularity.desc');
    url.searchParams.set('page', '1');
    url.searchParams.set('size', '20');
    if (kind === 'anime') url.searchParams.set('with_genres', '16');
    return url;
  }

  function discoverBaseKey(url) {
    const copy = new URL(url.href);
    copy.searchParams.delete('page');
    return `${location.pathname}?${copy.pathname}?${copy.searchParams.toString()}`;
  }

  function resetAutoPager() {
    state.autoPager.loading = false;
    state.autoPager.done = false;
    state.autoPager.page = 0;
    state.autoPager.totalPages = 0;
    state.autoPager.baseKey = '';
    state.autoPager.loadedKeys.clear();
    if (state.autoPager.statusEl) {
      state.autoPager.statusEl.remove();
      state.autoPager.statusEl = null;
    }
  }

  function ensureAutoPagerStatus() {
    if (!store.autoLoadPages || !isDiscoverPage()) {
      if (state.autoPager.statusEl) {
        state.autoPager.statusEl.remove();
        state.autoPager.statusEl = null;
      }
      return null;
    }
    const grid = discoverGrid();
    if (!grid) return null;
    if (state.autoPager.statusEl && state.autoPager.statusEl.isConnected) return state.autoPager.statusEl;
    const status = document.createElement('div');
    status.className = 'd115-autopager-status';
    status.textContent = '继续下滑自动加载下一页';
    grid.after(status);
    state.autoPager.statusEl = status;
    return status;
  }

  function setAutoPagerStatus(message) {
    const status = ensureAutoPagerStatus();
    if (status) status.textContent = message;
  }

  function discoverItemKey(item) {
    const mediaType = item?.media_type || (currentDiscoverKind() === 'movie' ? 'movie' : 'tv');
    const id = item?.tmdb_id || item?.id;
    return mediaType && id ? `${mediaType}:${id}` : '';
  }

  function collectExistingDiscoverKeys() {
    const keys = new Set();
    document.querySelectorAll('a[href*="/tmdb/movie/"], a[href*="/tmdb/tv/"]').forEach((anchor) => {
      const match = anchor.getAttribute('href')?.match(/\/tmdb\/(movie|tv)\/(\d+)/);
      if (match) keys.add(`${match[1]}:${match[2]}`);
    });
    return keys;
  }

  async function getGenreMap(mediaType) {
    if (state.genreCache.has(mediaType)) return state.genreCache.get(mediaType);
    const data = await portalRequest('GET', `/tmdb/genres?${queryString({ media_type: mediaType })}`).catch(() => ({}));
    const map = new Map((data.genres || []).map((genre) => [Number(genre.id), genre.name]));
    state.genreCache.set(mediaType, map);
    return map;
  }

  async function fetchShareCounts(items) {
    const ids = items.map(discoverItemKey).filter(Boolean);
    if (!ids.length) return {};
    const data = await portalRequest('GET', `/tmdb/share-counts?${queryString({ ids: ids.join(',') })}`).catch(() => ({}));
    return data.counts || {};
  }

  function itemYear(item) {
    const raw = item.year || item.release_date || item.first_air_date || '';
    const match = String(raw).match(/\d{4}/);
    return match ? match[0] : '';
  }

  function itemTitle(item) {
    return item.title || item.name || item.original_title || item.original_name || '未命名';
  }

  function itemGenres(item, genreMap) {
    return (item.genre_ids || [])
      .map((id) => genreMap.get(Number(id)))
      .filter(Boolean)
      .slice(0, 3)
      .join(' · ');
  }

  function createDiscoverCard(item, shareCount, genreMap) {
    const mediaType = item.media_type || (currentDiscoverKind() === 'movie' ? 'movie' : 'tv');
    const tmdbId = item.tmdb_id || item.id;
    const title = itemTitle(item);
    const year = itemYear(item);
    const score = Number(item.vote_average || 0);
    const poster = item.poster_url || item.poster_path || '';
    const genres = itemGenres(item, genreMap);
    const count = Number(shareCount || 0);

    const countHtml = count > 0 ? `<span class="absolute top-8 left-1 chip-primary z-[1] px-1.5 py-0.5 text-[9px] font-medium sm:left-2 sm:top-10 sm:px-2 sm:py-1 sm:text-[11px]">${count} 资源</span>` : '';
    const posterHtml = poster ? `<img src="${escapeHtml(poster)}" alt="${escapeHtml(title)}" decoding="async" loading="lazy" class="absolute inset-0 w-full h-full object-cover transition-transform duration-300 ease-out md:group-hover:scale-[1.04]">` : `<div class="absolute inset-0 flex items-center justify-center bg-slate-800 px-3 text-center text-sm font-semibold text-white">${escapeHtml(title)}</div>`;

    const anchor = document.createElement('a');
    anchor.href = `/tmdb/${mediaType}/${tmdbId}`;
    anchor.className = 'group relative block aspect-[2/3] overflow-hidden rounded-2xl bg-transparent transition duration-200 ease-out md:hover:brightness-110';
    anchor.dataset.d115AutopagerCard = '1';
    anchor.innerHTML = `
      ${posterHtml}
      <span class="absolute top-2 left-1 chip-primary z-[1] px-1.5 py-0.5 text-[9px] font-medium sm:left-2 sm:px-2 sm:py-1 sm:text-[11px]">${mediaType === 'tv' ? '剧集' : '电影'}</span>
      <div class="absolute top-1 right-1 z-[1] sm:top-2 sm:right-2">
        <span class="chip gap-0.5 px-1.5 py-0.5 text-[9px] font-medium sm:gap-1 sm:px-2 sm:py-1 sm:text-[11px]" style="background:rgba(0,0,0,.7);border-color:rgba(255,255,255,.2);color:#fff;">★ ${score ? score.toFixed(1) : '-'}</span>
      </div>
      ${countHtml}
      <div class="absolute inset-x-0 bottom-0 px-1.5 pt-8 pb-1.5 z-[1] bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-none sm:px-3 sm:pt-12 sm:pb-3">
        <h3 class="text-[11px] font-medium leading-snug text-white sm:text-sm" title="${escapeHtml(title)}" style="overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;">${escapeHtml(title)}${year ? `<span class="ml-0.5 text-[9px] text-white/70 sm:ml-1 sm:text-[11px]">(${escapeHtml(year)})</span>` : ''}</h3>
        <div class="mt-0.5 text-[9px] text-white/80 sm:mt-1 sm:text-[11px]" style="overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;">${escapeHtml(genres)}</div>
      </div>
    `;
    return anchor;
  }

  async function loadNextDiscoverPage() {
    if (state.autoPager.loading || state.autoPager.done) return;
    const grid = discoverGrid();
    if (!grid) return;

    const apiUrl = latestDiscoverApiUrl();
    const currentKey = discoverBaseKey(apiUrl);
    if (state.autoPager.baseKey && state.autoPager.baseKey !== currentKey) resetAutoPager();

    if (state.autoPager.page === 0) {
      const pageParam = Number(apiUrl.searchParams.get('page') || '1');
      state.autoPager.page = pageParam;
      state.autoPager.totalPages = pageParam + 3;
      state.autoPager.baseKey = currentKey;
      state.autoPager.loadedKeys = collectExistingDiscoverKeys();
    }

    if (state.autoPager.page >= state.autoPager.totalPages) {
      state.autoPager.done = true;
      setAutoPagerStatus('没有更多了');
      return;
    }

    state.autoPager.loading = true;
    setAutoPagerStatus(`正在加载第 ${state.autoPager.page + 1} 页...`);

    try {
      apiUrl.searchParams.set('page', String(state.autoPager.page + 1));
      const response = await fetch(apiUrl.href, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      const items = Array.isArray(data.results) ? data.results : [];
      if (data.total_pages) state.autoPager.totalPages = Number(data.total_pages);

      if (!items.length) {
        state.autoPager.done = true;
        setAutoPagerStatus('没有更多了');
        return;
      }

      const mediaType = apiUrl.searchParams.get('media_type') || 'movie';
      const [genreMap, shareCounts] = await Promise.all([
        getGenreMap(mediaType),
        fetchShareCounts(items)
      ]);

      let added = 0;
      const fragment = document.createDocumentFragment();
      for (const item of items) {
        const key = discoverItemKey(item);
        if (key && state.autoPager.loadedKeys.has(key)) continue;
        if (key) state.autoPager.loadedKeys.add(key);
        fragment.appendChild(createDiscoverCard(item, shareCounts[key], genreMap));
        added++;
      }

      if (added > 0) grid.appendChild(fragment);
      state.autoPager.page++;

      if (state.autoPager.page >= state.autoPager.totalPages) {
        state.autoPager.done = true;
        setAutoPagerStatus('没有更多了');
      } else {
        setAutoPagerStatus('继续下滑自动加载下一页');
      }
      debounceScan();
    } catch (error) {
      setAutoPagerStatus(`加载失败: ${error.message}`);
    } finally {
      state.autoPager.loading = false;
    }
  }

  function scheduleAutoPagerCheck() {
    if (!store.autoLoadPages || !isDiscoverPage()) return;
    clearTimeout(state.autoPager.timer);
    state.autoPager.timer = setTimeout(() => {
      const status = ensureAutoPagerStatus();
      if (!status) return;
      const rect = status.getBoundingClientRect();
      if (rect.top <= window.innerHeight + 260) loadNextDiscoverPage();
    }, 120);
  }

  function parseDetailTitleYear() {
    const titleEl = document.querySelector('.media-detail-title, h1');
    const metaEl = document.querySelector('.media-detail-meta, .show-meta');
    const title = titleEl?.childNodes[0]?.textContent?.trim() || '';
    const yearMatch = metaEl?.textContent?.match(/\b(19\d{2}|20[0-2]\d)\b/);
    const year = yearMatch ? Number(yearMatch[1]) : 0;
    return title ? { title, year } : null;
  }

  async function processDetailEmby(detail) {
    const wrap = document.querySelector('.d115-emby-title-wrap');
    if (wrap) return;

    const info = parseDetailTitleYear();
    if (!info) return;

    const has = await checkEmby(info.title, info.year);
    if (has === null) return;

    state.currentDetailEmby = has;
    const titleEl = document.querySelector('.media-detail-title, h1');
    if (titleEl) {
      const container = document.createElement('span');
      container.className = 'd115-emby-title-wrap';
      container.appendChild(createEmbyBadge(has, false));
      titleEl.appendChild(container);
    }
  }

  async function transfer115Cookie(shareCode, sharePass, targetCid) {
    if (!store.cookie115) throw new Error('未配置 115 Cookie');
    const snapRes = await gmRequest({
      method: 'POST',
      url: APP.api115Snap,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': store.cookie115
      },
      data: new URLSearchParams({ share_code: shareCode, receive_code: sharePass }).toString()
    });
    const snap = JSON.parse(snapRes.responseText || '{}');
    if (!snap.state) throw new Error(snap.error_msg || '获取分享快照失败');

    const fileIds = Array.isArray(snap.data?.list) ? snap.data.list.map((f) => f.file_id).join(',') : '';
    if (!fileIds) throw new Error('分享内未发现有效文件');

    const receiveRes = await gmRequest({
      method: 'POST',
      url: APP.api115Receive,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': store.cookie115
      },
      data: new URLSearchParams({ share_code: shareCode, receive_code: sharePass, cid: targetCid, file_id: fileIds }).toString()
    });
    const result = JSON.parse(receiveRes.responseText || '{}');
    if (!result.state) throw new Error(result.error_msg || '转存失败');
    return result.data || {};
  }

  async function transferSymedia(shareCode, sharePass, targetCid) {
    if (!store.symediaUrl) throw new Error('未配置 Symedia 地址');
    const url = `${store.symediaUrl.replace(/\/+$/, '')}${APP.symediaApiPath}`;
    const response = await gmRequest({
      method: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${store.symediaToken}`
      },
      data: JSON.stringify({
        urls: [`https://115.com/s/${shareCode}?password=${sharePass}`],
        cid: Number(targetCid || 0)
      })
    });
    if (response.status !== 200) throw new Error(`Symedia 响应 HTTP ${response.status}`);
    const result = JSON.parse(response.responseText || '{}');
    if (result.code !== 0) throw new Error(result.message || 'Symedia 转存错误');
    return result.data || {};
  }

  async function executeTransfer(btn, shareCode, sharePass) {
    if (btn.disabled) return;
    if (store.skipWhenInEmby && state.currentDetailEmby) {
      alert('Emby 媒体库已存在此资源，已拦截一键转存。');
      return;
    }
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = '⏳ 正在转存...';
    try {
      if (store.transferMethod === 'symedia') {
        await transferSymedia(shareCode, sharePass, store.targetCid);
      } else {
        await transfer115Cookie(shareCode, sharePass, store.targetCid);
      }
      btn.textContent = '🎉 转存成功';
      btn.style.background = 'rgba(22,163,74,.25)';
      btn.style.color = '#86efac';
      btn.style.borderColor = 'rgba(34,197,94,.5)';
      log(`一键转存成功: share_code=${shareCode}`, 'success');
    } catch (error) {
      btn.disabled = false;
      btn.textContent = oldText;
      alert(`转存失败: ${error.message}`);
      log(`转存失败: ${error.message}`, 'error');
    }
  }

  async function handleUnlockClick(btn, rowId, cost, shareCode, sharePass) {
    if (btn.disabled) return;
    if (store.confirmUnlock) {
      if (!confirm(`确认扣除 ${cost} 积分以解锁此资源分享链接吗？`)) return;
    }
    btn.disabled = true;
    btn.textContent = '⏳ 解锁中...';
    try {
      const data = await portalRequest('POST', `/resource/unlock`, { id: rowId });
      btn.textContent = '🔓 已解锁';
      btn.style.background = 'rgba(148,163,184,.12)';
      btn.style.color = '#94a3b8';
      btn.style.borderColor = 'rgba(148,163,184,.2)';

      const code = data.share_code || shareCode;
      const pass = data.share_pass || sharePass;

      const p = btn.parentElement;
      if (p) {
        const link = p.querySelector('a');
        if (link && code) link.href = `https://115.com/s/${code}?password=${pass || ''}`;
        const meta = p.querySelector('.d115-transfer-meta');
        if (meta && pass) meta.textContent = `提取码: ${pass}`;
      }

      if (store.enableTransfer && code) {
        const transferBtn = p?.querySelector('.d115-transfer-btn:not([data-action="unlock"])');
        if (transferBtn) executeTransfer(transferBtn, code, pass);
      }
      log(`成功解锁资源卡片 (ID: ${rowId})，消耗 ${cost} 积分`, 'success');
    } catch (error) {
      btn.disabled = false;
      btn.textContent = `🔓 解锁 (${cost}分)`;
      alert(`解锁失败: ${error.message}`);
      log(`解锁失败: ${error.message}`, 'error');
    }
  }

  function injectTransferRow(container, share) {
    if (container.querySelector('.d115-transfer-row')) return;

    const row = document.createElement('div');
    row.className = 'd115-transfer-row';

    const isLocked = !share.share_code && !!share.unlock_cost;
    const cost = Number(share.unlock_cost || 0);

    let metaText = share.share_pass ? `提取码: ${share.share_pass}` : '';
    if (isLocked) metaText = `需消耗 ${cost} 积分`;

    let html = `<span class="d115-transfer-meta">${metaText}</span>`;
    const targetUrl = share.share_code ? `https://115.com/s/${share.share_code}?password=${share.share_pass || ''}` : '#';

    html += `<a href="${targetUrl}" target="_blank" class="d115-transfer-btn" style="background:rgba(30,41,59,.4);border-color:rgba(148,163,184,.3);">打开网盘</a>`;

    if (isLocked) {
      html += `<button type="button" class="d115-transfer-btn" data-action="unlock" style="background:rgba(234,179,8,.15);color:#fef08a;border-color:rgba(234,179,8,.45);">🔓 解锁 (${cost}分)</button>`;
    }
    html += `<button type="button" class="d115-transfer-btn" style="background:rgba(37,99,235,.25);color:#93c5fd;border-color:rgba(59,130,246,.55);">⚡ 一键转存</button>`;

    row.innerHTML = html;

    const unlockBtn = row.querySelector('[data-action="unlock"]');
    if (unlockBtn) {
      const maxCost = store.maxUnlockCost !== '' ? Number(store.maxUnlockCost) : null;
      if (maxCost !== null && cost > maxCost) {
        unlockBtn.disabled = true;
        unlockBtn.title = `积分高于设定的最高限制 (${maxCost})`;
      } else {
        unlockBtn.addEventListener('click', (e) => {
          e.preventDefault();
          handleUnlockClick(unlockBtn, share.id, cost, share.share_code, share.share_pass);
        });
      }
    }

    const transBtn = row.querySelector('.d115-transfer-btn:last-child');
    if (transBtn) {
      if (isLocked) {
        transBtn.disabled = true;
        transBtn.title = '请先解锁资源';
      } else {
        transBtn.addEventListener('click', (e) => {
          e.preventDefault();
          executeTransfer(transBtn, share.share_code, share.share_pass);
        });
      }
    }

    container.appendChild(row);
  }

  async function fetchDetail(useCache = true) {
    const route = currentTmdbRoute();
    if (!route) return null;
    const cacheKey = `${route.mediaType}:${route.tmdbId}:${route.season}`;
    if (useCache && state.detailCacheKey === cacheKey && state.detailCache) return state.detailCache;

    const data = await portalRequest('GET', `/tmdb/${route.mediaType}/${route.tmdbId}?${queryString({ season: route.season })}`);
    state.detailCacheKey = cacheKey;
    state.detailCache = data;
    return data;
  }

  async function processDetailShares(detail) {
    const shares = Array.isArray(detail?.shares) ? detail.shares : [];
    if (!shares.length) return;

    const items = Array.from(document.querySelectorAll('.border-b\\.border-slate-100\\/5, .border-b\\.border-slate-800\\/50'));
    items.forEach((container) => {
      const text = container.innerText || '';
      if (!text.includes('115')) return;

      const sizeMatch = text.match(/([\d.]+)\s*(GB|MB)/i);
      const sizeStr = sizeMatch ? sizeMatch[0].replace(/\s+/g, '').toLowerCase() : '';

      const matchedShare = shares.find((s) => {
        if (!s.size) return false;
        const sSize = s.size.replace(/\s+/g, '').toLowerCase();
        return sSize === sizeStr || sSize.includes(sizeStr) || sizeStr.includes(sSize);
      });

      if (matchedShare) injectTransferRow(container, matchedShare);
    });
  }

  async function processDetailPage() {
    const route = currentTmdbRoute();
    if (!route) return;
    let detail;
    try {
      detail = await fetchDetail(false);
    } catch (error) {
      return;
    }
    await processDetailEmby(detail);
    await processDetailShares(detail);
  }

  async function scanPage() {
    ensureFab();
    await processCards();
    await processDetailPage();
    ensureAutoPagerStatus();
    scheduleAutoPagerCheck();
  }

  function setupObserver() {
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.addedNodes.length > 0)) debounceScan();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    let oldUrl = location.href;
    setInterval(() => {
      if (location.href !== oldUrl) {
        oldUrl = location.href;
        state.detailCacheKey = '';
        state.detailCache = null;
        state.currentDetailEmby = null;
        resetAutoPager();
        debounceScan();
      }
    }, 800);

    window.addEventListener('scroll', scheduleAutoPagerCheck, { passive: true });
    window.addEventListener('resize', scheduleAutoPagerCheck, { passive: true });
  }

  setTimeout(() => {
    scanPage();
    setupObserver();
  }, 400);

})();
