/**
 * 绠€闃?- 灏忚闃呰鍣?涓婚€昏緫
 */
(function() {
  'use strict';

  // ============================================================
  // 鐘舵€?  // ============================================================
  const state = {
    currentView: 'shelf',
    currentNovelId: null,
    currentChapterIdx: null,    // 褰撳墠绔犺妭鍦?volumes 涓殑鍏ㄥ眬绱㈠紩
    currentBook: null,          // 褰撳墠涔︾睄鏁版嵁
    fontSize: Storage.getFontSize(),
    theme: Storage.getTheme(),
    hideUI: false,              // 闃呰鏃舵槸鍚﹂殣钘忛《閮?搴曢儴鏍?    chaptersFlat: []            // 鎵佸钩鍖栫殑绔犺妭鏁扮粍 [{id, title, volumeIdx}]
  };

  // DOM 寮曠敤
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const app = document.getElementById('app');
  const toast = document.getElementById('toast');
  const loading = document.getElementById('loading');
  const loadingText = document.getElementById('loading-text');

  // ============================================================
  // 宸ュ叿鍑芥暟
  // ============================================================
  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function showToast(msg, duration = 1800) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.add('hidden'), duration);
  }

  function showLoading(text = '鍔犺浇涓?..') {
    loadingText.textContent = text;
    loading.classList.remove('hidden');
  }

  function hideLoading() {
    loading.classList.add('hidden');
  }

  function formatTimestamp(ts) {
    if (!ts) return '';
    const date = new Date(ts);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return '鍒氬垰';
    if (diff < 3600000) return `${Math.floor(diff/60000)}鍒嗛挓鍓峘;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}灏忔椂鍓峘;
    return `${date.getMonth()+1}鏈?{date.getDate()}鏃;
  }

  function isCurrentChapter(novelId, chapterId) {
    const p = Storage.getProgress(novelId);
    return p && String(p.chapterId) === String(chapterId);
  }

  // ============================================================
  // 涓婚
  // ============================================================
  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }
  applyTheme(state.theme);

  // ============================================================
  // API 璋冪敤
  // ============================================================
  // CORS proxy fallback for chapter content (bypasses Vercel IP restrictions)
  const CORS_PROXIES = ['https://api.allorigins.win/raw?url=', 'https://corsproxy.io/?url='];
  const WENKU8_DOMAINS = ['www.wenku8.net', 'www.wen8.net', 'www.wenku8.com'];

  async function fetchWenku8ViaProxy(path) {
    var attempts = [path];
    var m = path.match(/\/novel\/(\d+)/);
    if (m) {
      var base = m[1];
      for (var c = 1; c <= 9; c++) attempts.push('/novel/' + c + '/' + base + '/' + path.split('/').pop());
    }
    for (var a = 0; a < attempts.length; a++) {
      for (var d = 0; d < WENKU8_DOMAINS.length; d++) {
        var url = 'https://' + WENKU8_DOMAINS[d] + attempts[a];
        for (var p = 0; p < CORS_PROXIES.length; p++) {
          try {
            var resp = await fetch(CORS_PROXIES[p] + encodeURIComponent(url), { signal: AbortSignal.timeout(10000) });
            if (!resp.ok) continue;
            var buf = await resp.arrayBuffer();
            var dec = new TextDecoder('gbk');
            var html = dec.decode(buf);
            if (html && html.length > 500) return html;
          } catch(e) {}
        }
      }
    }
    throw new Error('CORS proxy fetch failed');
  }
  async function fetchNovel(id) {
    const resp = await fetch(`/api/novel/${encodeURIComponent(id)}`);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `璇锋眰澶辫触 (${resp.status})`);
    }
    return resp.json();
  }

  async function fetchChapter(novelId, chapterId) {
    var cached = Storage.getCachedChapter(novelId, chapterId);
    if (cached) return cached;

    // 1) Try Vercel API
    try {
      var resp = await fetch('/api/chapter/' + encodeURIComponent(novelId) + '/' + encodeURIComponent(chapterId));
      if (resp.ok) {
        var data = await resp.json();
        if (data && data.content && data.content.length > 200) {
          Storage.cacheChapter(novelId, chapterId, data);
          return data;
        }
      }
    } catch(e) {}

    // 2) Fallback: direct CORS proxy from browser
    var html = await fetchWenku8ViaProxy('/novel/' + novelId + '/' + chapterId + '.htm');
    var doc = new DOMParser().parseFromString(html, 'text/html');

    var title = (doc.querySelector('#title') || {}).textContent || (doc.querySelector('h3') || {}).textContent || 'Ch.' + chapterId;
    title = title.trim();

    var contentDiv = doc.querySelector('#content');
    var content = contentDiv ? contentDiv.textContent.trim() : '';
    if (!content || content.length < 50) {
      var body = doc.body.cloneNode(true);
      (body.querySelectorAll('script,style,iframe,nav,header,footer,#headlink,#adv1,#adv6,#adtop,#adv900,#adv300,#adbottom') || []).forEach(function(e) { e.remove(); });
      content = body.textContent.trim();
    }
    content = content.replace(/\s+/g, '\n\n').trim();

    var result = { novelId: novelId, chapterId: chapterId, title: title, content: content };
    Storage.cacheChapter(novelId, chapterId, result);
    return result;
  }
  // 璺敱
  // ============================================================
  function navigate(hash) {
    window.location.hash = hash;
  }

  function getRoute() {
    const hash = window.location.hash.slice(1) || 'shelf';
    const parts = hash.split('/');
    return { view: parts[0], params: parts.slice(1) };
  }

  function router() {
    const route = getRoute();
    switch (route.view) {
      case 'shelf':
        renderShelf();
        break;
      case 'book':
        renderDetail(route.params[0]);
        break;
      case 'read':
        renderReader(route.params[0], parseInt(route.params[1]));
        break;
      default:
        renderShelf();
    }
  }

  window.addEventListener('hashchange', router);

  // ============================================================
  // 娓叉煋锛氫功鏋?  // ============================================================
  function renderShelf() {
    state.currentView = 'shelf';
    const books = Storage.getBooks();
    const ids = Object.keys(books);

    let html = `
      <div class="shelf-header">
        <h1>馃摉 鎴戠殑涔︽灦</h1>
        <div class="shelf-actions">
          <button class="btn" onclick="App._toggleDelete()" title="绠＄悊">鉁忥笍</button>
          <button class="btn" onclick="App._showImport()" title="瀵煎叆">锛?/button>
        </div>
      </div>
      <div class="shelf-grid" id="shelf-grid">
    `;

    if (ids.length === 0) {
      html += `
        <div class="empty-shelf">
          <div class="empty-icon">馃摎</div>
          <p>涔︽灦杩樻槸绌虹殑</p>
          <p class="hint">鐐瑰嚮鍙充笂瑙?锛?瀵煎叆灏忚</p>
        </div>
      `;
    } else {
      for (const id of ids) {
        const b = books[id];
        const progress = b.lastRead;
        const progressText = progress ? `${progress.chapterTitle || ''}` : '';
        const coverStyle = b.cover ? `style="background-image: url('/api/proxy-image?url=${encodeURIComponent(b.cover)}')"` : '';

        html += `
          <div class="book-card" data-id="${escapeHtml(id)}" onclick="App._openBook('${escapeHtml(id)}')">
            <div class="book-cover">
              ${b.cover ? `<img src="/api/proxy-image?url=${encodeURIComponent(b.cover)}" alt="${escapeHtml(b.title)}" loading="lazy">` : '馃摃'}
            </div>
            <div class="book-info">
              <div class="book-title">${escapeHtml(b.title)}</div>
              ${progressText ? `<div class="book-progress">${escapeHtml(progressText)}</div>` : ''}
            </div>
            <button class="delete-btn" onclick="event.stopPropagation();App._confirmDelete('${escapeHtml(id)}')">鉁?/button>
          </div>
        `;
      }
    }

    html += '</div>';
    app.innerHTML = html;
    app.scrollTop = 0;
  }

  // ---- 涔︽灦锛氬垹闄ゆā寮?----
  let _deleteMode = false;

  window.App = window.App || {};
  App._toggleDelete = function() {
    _deleteMode = !_deleteMode;
    const cards = $$('.book-card');
    cards.forEach(c => c.classList.toggle('deleting', _deleteMode));
    showToast(_deleteMode ? '鐐瑰嚮 鉁?鍒犻櫎灏忚' : '宸查€€鍑虹鐞?);
  };

  App._confirmDelete = function(id) {
    if (confirm('纭畾瑕佷粠涔︽灦绉婚櫎杩欐湰灏忚鍚楋紵\n锛堥槄璇昏繘搴︿篃灏嗚鍒犻櫎锛?)) {
      Storage.removeBook(id);
      renderShelf();
      showToast('宸茬Щ闄?);
      _deleteMode = false;
    }
  };

  App._openBook = function(id) {
    navigate(`book/${id}`);
  };

  // ============================================================
  // 瀵煎叆瀵硅瘽妗?  // ============================================================
  App._showImport = function() {
    // 鑻ュ凡瀛樺湪鍒欑Щ闄?    const old = document.querySelector('.modal-overlay');
    if (old) old.remove();

    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.innerHTML = `
      <div class="modal" onclick="event.stopPropagation()">
        <h2>瀵煎叆灏忚</h2>
        <p>浠?wenku8.net 瀵煎叆灏忚锛岃緭鍏ュ皬璇寸紪鍙锋垨瀹屾暣缃戝潃鍗冲彲銆?/p>
        <label for="import-input">灏忚缂栧彿鎴栫綉鍧€</label>
        <input id="import-input" type="text" placeholder="渚嬪: 12345 鎴?https://www.wenku8.net/book/12345.htm" autocomplete="off">
        <div class="modal-actions">
          <button class="btn btn-ghost" id="import-cancel">鍙栨秷</button>
          <button class="btn btn-primary" id="import-confirm">瀵煎叆</button>
        </div>
      </div>
    `;

    div.addEventListener('click', () => div.remove());
    document.body.appendChild(div);

    const input = document.getElementById('import-input');
    const confirmBtn = document.getElementById('import-confirm');
    const cancelBtn = document.getElementById('import-cancel');

    function getNovelId() {
      const val = input.value.trim();
      if (!val) return null;
      // 浠?URL 涓彁鍙栨暟瀛?ID
      const match = val.match(/(?:book|novel)\/(\d+)/);
      if (match) return match[1];
      // 绾暟瀛?      if (/^\d+$/.test(val)) return val;
      return null;
    }

    async function doImport() {
      const id = getNovelId();
      if (!id) {
        showToast('璇疯緭鍏ユ纭殑灏忚缂栧彿鎴?wenku8 缃戝潃');
        return;
      }

      // 妫€鏌ユ槸鍚﹀凡瀵煎叆
      if (Storage.getBook(id)) {
        showToast('杩欐湰灏忚宸插湪涔︽灦涓?);
        div.remove();
        return;
      }

      confirmBtn.disabled = true;
      confirmBtn.textContent = '瀵煎叆涓?..';
      showLoading('姝ｅ湪鑾峰彇灏忚淇℃伅...');

      try {
        const data = await fetchNovel(id);

        // 鎵佸钩鍖栫珷鑺?        const chaptersFlat = [];
        data.volumes.forEach((v, vi) => {
          v.chapters.forEach(ch => {
            chaptersFlat.push({ ...ch, volumeName: v.name, volumeIdx: vi });
          });
        });

        Storage.saveBook(id, {
          id: data.id,
          title: data.title,
          author: data.author,
          cover: data.cover,
          description: data.description,
          volumes: data.volumes,
          chaptersCount: chaptersFlat.length,
          lastRead: null,
          chaptersCache: {}
        });

        div.remove();
        renderShelf();
        showToast(`鉁?宸插鍏ャ€?{data.title}銆?${chaptersFlat.length}绔?`);
      } catch (err) {
        showToast('瀵煎叆澶辫触: ' + err.message);
      } finally {
        hideLoading();
        confirmBtn.disabled = false;
        confirmBtn.textContent = '瀵煎叆';
      }
    }

    confirmBtn.addEventListener('click', doImport);
    cancelBtn.addEventListener('click', () => div.remove());
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doImport(); });
    setTimeout(() => input.focus(), 100);
  };

  // ============================================================
  // 娓叉煋锛氬皬璇磋鎯?+ 绔犺妭鍒楄〃
  // ============================================================
  function renderDetail(id) {
    const book = Storage.getBook(id);
    if (!book) {
      navigate('shelf');
      showToast('灏忚涓嶅瓨鍦?);
      return;
    }

    state.currentView = 'book';
    state.currentNovelId = id;
    state.currentBook = book;
    state.currentChapterIdx = null;

    const progress = book.lastRead;

    let html = `
      <div class="detail-view">
        <div class="detail-hero">
          <button class="back-btn" onclick="App._goShelf()">鈫?/button>
          <div class="detail-cover">
            ${book.cover ? `<img src="/api/proxy-image?url=${encodeURIComponent(book.cover)}" alt="${escapeHtml(book.title)}">` : '馃摃'}
          </div>
          <div class="detail-title">${escapeHtml(book.title)}</div>
          <div class="detail-author">${escapeHtml(book.author)}</div>
          <div class="detail-actions">
            ${progress ? `<button class="btn btn-primary" onclick="App._continueRead('${escapeHtml(id)}')">缁х画闃呰</button>` : ''}
            <button class="btn btn-primary ${!progress ? 'btn-primary' : 'btn-ghost'}" onclick="App._startRead('${escapeHtml(id)}')">${progress ? '浠庡ご闃呰' : '寮€濮嬮槄璇?}</button>
          </div>
        </div>
        <div class="detail-body">
    `;

    if (book.description && book.description !== '鏆傛棤绠€浠?) {
      html += `<h3>绠€浠?/h3><div class="detail-desc">${escapeHtml(book.description)}</div>`;
    }

    html += `<div class="detail-volume-list">`;
    if (book.volumes && book.volumes.length > 0) {
      let chIdx = 0;
      for (const vol of book.volumes) {
        html += `<div class="detail-volume"><div class="detail-volume-name">${escapeHtml(vol.name)}</div>`;
        for (const ch of vol.chapters) {
          const isCurrent = progress && String(progress.chapterId) === String(ch.id);
          html += `
            <div class="detail-chapter-row ${isCurrent ? 'current' : ''}" onclick="App._readChapter('${escapeHtml(id)}', ${chIdx})">
              ${isCurrent ? '<span class="check-icon">鈼?/span>' : ''}
              ${escapeHtml(ch.title)}
            </div>
          `;
          chIdx++;
        }
        html += `</div>`;
      }
    } else {
      html += `<p style="text-align:center;color:var(--text-muted);padding:40px 0;">鏆傛棤绔犺妭淇℃伅</p>`;
    }
    html += `</div></div></div>`;

    app.innerHTML = html;
    app.scrollTop = 0;
  }

  App._goShelf = function() { navigate('shelf'); };
  App._continueRead = function(id) {
    const book = Storage.getBook(id);
    const p = book?.lastRead;
    if (p) {
      navigate(`read/${id}/${p.chapterIdx || 0}`);
    } else {
      App._startRead(id);
    }
  };
  App._startRead = function(id) { navigate(`read/${id}/0`); };
  App._readChapter = function(id, idx) { navigate(`read/${id}/${idx}`); };

  // ============================================================
  // 娓叉煋锛氶槄璇诲櫒
  // ============================================================
  function renderReader(id, chapterIdx) {
    const book = Storage.getBook(id);
    if (!book) { navigate('shelf'); return; }

    // 鎵佸钩鍖栫珷鑺?    const chaptersFlat = [];
    (book.volumes || []).forEach((v, vi) => {
      v.chapters.forEach(ch => {
        chaptersFlat.push({ ...ch, volumeName: v.name, volumeIdx: vi, globalIdx: chaptersFlat.length });
      });
    });

    if (chaptersFlat.length === 0) { navigate(`book/${id}`); return; }

    const idx = Math.max(0, Math.min(chapterIdx, chaptersFlat.length - 1));
    state.currentView = 'read';
    state.currentNovelId = id;
    state.currentBook = book;
    state.currentChapterIdx = idx;
    state.chaptersFlat = chaptersFlat;
    state.hideUI = false;

    // 娓叉煋闃呰鍣ㄦ鏋?    app.innerHTML = `
      <div class="reader-view" id="reader-view">
        <div class="reader-header" id="reader-header">
          <button class="back-btn" onclick="App._readerBack()">鈫?/button>
          <span class="chapter-title" id="reader-chapter-title">${escapeHtml(chaptersFlat[idx]?.title || '')}</span>
          <div class="reader-actions">
            <button onclick="App._toggleSettings()" title="璁剧疆">Aa</button>
          </div>
        </div>
        <div class="reader-content" id="reader-content">
          <p class="chapter-loading">鍔犺浇涓?..</p>
        </div>
        <div class="reader-footer" id="reader-footer">
          <button class="nav-btn" id="prev-btn" onclick="App._prevChapter()">鈫?涓婁竴绔?/button>
          <span class="reader-progress" id="reader-progress"></span>
          <button class="nav-btn" id="next-btn" onclick="App._nextChapter()">涓嬩竴绔?鈫?/button>
        </div>
      </div>
    `;

    app.scrollTop = 0;

    // 鍔犺浇绔犺妭鍐呭
    loadChapterContent(id, idx, chaptersFlat);

    // 缁戝畾鐐瑰嚮闃呰鍣ㄥ垏鎹?UI 鏄鹃殣
    const readerContent = document.getElementById('reader-content');
    readerContent.addEventListener('click', (e) => {
      // 鍙湪鐐瑰嚮绾枃鏈尯鍩熸椂鍒囨崲
      if (e.target.closest('.reader-header') || e.target.closest('.reader-footer')) return;
      toggleReaderUI();
    });

    // 缁戝畾婊氬姩鍚屾杩涘害
    readerContent.addEventListener('scroll', () => {
      saveReadProgress();
    });
  }

  // ---- 鍔犺浇绔犺妭 ----
  async function loadChapterContent(novelId, idx, chaptersFlat) {
    const ch = chaptersFlat[idx];
    if (!ch) return;

    const container = document.getElementById('reader-content');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const progressEl = document.getElementById('reader-progress');
    const titleEl = document.getElementById('reader-chapter-title');

    if (!container) return;

    titleEl.textContent = ch.title;
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx >= chaptersFlat.length - 1;

    if (chaptersFlat.length > 1) {
      progressEl.textContent = `${idx + 1} / ${chaptersFlat.length}`;
    } else {
      progressEl.textContent = '';
    }

    container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px 0;">鍔犺浇涓?..</p>';
    container.scrollTop = 0;

    try {
      const data = await fetchChapter(novelId, ch.id);

      // 灏嗘鏂囨寜娈佃惤鎷嗗垎
      const paragraphs = data.content
        .split(/\n+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      let bodyHtml = '';
      if (data.title) {
        bodyHtml += `<h3>${escapeHtml(data.title)}</h3>`;
      }
      for (const p of paragraphs) {
        bodyHtml += `<p>${escapeHtml(p)}</p>`;
      }

      container.innerHTML = bodyHtml;
      container.scrollTop = 0;

      // 瀛椾綋澶у皬
      container.style.fontSize = state.fontSize + 'px';

      // 鎭㈠婊氬姩浣嶇疆
      const progress = Storage.getProgress(novelId);
      if (progress && String(progress.chapterId) === String(ch.id) && progress.scrollRatio) {
        container.scrollTop = progress.scrollRatio * container.scrollHeight;
      }

    } catch (err) {
      container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:var(--text-muted);">
          <p style="font-size:40px;margin-bottom:16px;">馃樀</p>
          <p>鍔犺浇澶辫触</p>
          <p style="font-size:13px;margin-top:8px;">${escapeHtml(err.message)}</p>
          <button class="btn btn-primary" style="margin-top:16px;" onclick="location.reload()">閲嶈瘯</button>
        </div>
      `;
    } finally {
      // 淇濆瓨闃呰杩涘害
      saveReadProgress();
    }
  }

  // ---- 闃呰鍣?UI 鏄鹃殣 ----
  function toggleReaderUI() {
    state.hideUI = !state.hideUI;
    const header = document.getElementById('reader-header');
    const footer = document.getElementById('reader-footer');
    if (header) header.classList.toggle('hidden', state.hideUI);
    if (footer) footer.classList.toggle('hidden', state.hideUI);
  }

  // ---- 淇濆瓨杩涘害 ----
  function saveReadProgress() {
    const container = document.getElementById('reader-content');
    if (!container || state.currentChapterIdx === null || !state.currentNovelId) return;

    const ch = state.chaptersFlat[state.currentChapterIdx];
    if (!ch) return;

    const scrollRatio = container.scrollHeight > container.clientHeight
      ? container.scrollTop / (container.scrollHeight - container.clientHeight)
      : 0;

    Storage.saveProgress(state.currentNovelId, {
      chapterId: ch.id,
      chapterIdx: state.currentChapterIdx,
      chapterTitle: ch.title,
      scrollRatio: Math.min(1, Math.max(0, scrollRatio))
    });
  }

  // ---- 瀵艰埅 ----
  App._readerBack = function() {
    if (state.currentNovelId) {
      navigate(`book/${state.currentNovelId}`);
    } else {
      navigate('shelf');
    }
  };

  App._prevChapter = function() {
    if (state.currentChapterIdx > 0) {
      const idx = state.currentChapterIdx - 1;
      state.currentChapterIdx = idx;
      navigate(`read/${state.currentNovelId}/${idx}`);
    }
  };

  App._nextChapter = function() {
    if (state.currentChapterIdx < state.chaptersFlat.length - 1) {
      const idx = state.currentChapterIdx + 1;
      state.currentChapterIdx = idx;
      navigate(`read/${state.currentNovelId}/${idx}`);
    }
  };

  // ---- 璁剧疆闈㈡澘 ----
  let settingsOpen = false;

  App._toggleSettings = function() {
    settingsOpen = !settingsOpen;
    const existing = document.querySelector('.reader-settings');
    if (existing) existing.remove();

    if (!settingsOpen) return;

    const div = document.createElement('div');
    div.className = 'reader-settings';
    div.innerHTML = `
      <h3>闃呰璁剧疆</h3>
      <div class="settings-row">
        <label>瀛楀彿</label>
        <input type="range" min="14" max="26" value="${state.fontSize}" id="font-size-slider">
        <span style="font-size:13px;min-width:32px;text-align:right;">${state.fontSize}</span>
      </div>
      <div class="settings-row">
        <label>涓婚</label>
        <div class="theme-switch">
          <button class="theme-btn light ${state.theme === 'light' ? 'active' : ''}" data-theme="light">鈽€锔?/button>
          <button class="theme-btn dark ${state.theme === 'dark' ? 'active' : ''}" data-theme="dark">馃寵</button>
          <button class="theme-btn ${state.theme === 'auto' ? 'active' : ''}" data-theme="auto" style="font-size:14px;font-weight:600;">鑷姩</button>
        </div>
      </div>
      <button class="settings-close" id="settings-close">瀹屾垚</button>
    `;

    document.body.appendChild(div);

    // 瀛楀彿
    const slider = document.getElementById('font-size-slider');
    slider.addEventListener('input', () => {
      const size = parseInt(slider.value);
      state.fontSize = size;
      const container = document.getElementById('reader-content');
      if (container) container.style.fontSize = size + 'px';
      slider.nextElementSibling.textContent = size;
    });

    // 涓婚
    div.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        state.theme = theme;
        Storage.setTheme(theme);
        applyTheme(theme);
        div.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    document.getElementById('settings-close').addEventListener('click', () => {
      Storage.setFontSize(state.fontSize);
      settingsOpen = false;
      div.remove();
    });
  };

  // ============================================================
  // 鍒濆鍖?  // ============================================================
  function init() {
    router();
  }

  // 濡傛灉椤甸潰宸插姞杞藉畬姣曞垯鐩存帴鍒濆鍖?  if (document.readyState === 'complete') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

})();
