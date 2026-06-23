/**
 * 简阅 - 小说阅读器 主逻辑
 */
(function() {
  'use strict';

  // ============================================================
  // 状态
  // ============================================================
  const state = {
    currentView: 'shelf',
    currentNovelId: null,
    currentChapterIdx: null,    // 当前章节在 volumes 中的全局索引
    currentBook: null,          // 当前书籍数据
    fontSize: Storage.getFontSize(),
    theme: Storage.getTheme(),
    hideUI: false,              // 阅读时是否隐藏顶部/底部栏
    chaptersFlat: []            // 扁平化的章节数组 [{id, title, volumeIdx}]
  };

  // DOM 引用
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const app = document.getElementById('app');
  const toast = document.getElementById('toast');
  const loading = document.getElementById('loading');
  const loadingText = document.getElementById('loading-text');

  // ============================================================
  // 工具函数
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

  function showLoading(text = '加载中...') {
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
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff/60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}小时前`;
    return `${date.getMonth()+1}月${date.getDate()}日`;
  }

  function isCurrentChapter(novelId, chapterId) {
    const p = Storage.getProgress(novelId);
    return p && String(p.chapterId) === String(chapterId);
  }

  // ============================================================
  // 主题
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
  // API 调用
  // ============================================================
  async function fetchNovel(id) {
    const resp = await fetch(`/api/novel/${encodeURIComponent(id)}`);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `请求失败 (${resp.status})`);
    }
    return resp.json();
  }

  async function fetchChapter(novelId, chapterId) {
    // 先检查缓存
    const cached = Storage.getCachedChapter(novelId, chapterId);
    if (cached) return cached;

    const resp = await fetch(`/api/chapter/${encodeURIComponent(novelId)}/${encodeURIComponent(chapterId)}`);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `请求失败 (${resp.status})`);
    }
    const data = await resp.json();

    // 存入缓存
    Storage.cacheChapter(novelId, chapterId, data);
    return data;
  }

  // ============================================================
  // 路由
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
  // 渲染：书架
  // ============================================================
  function renderShelf() {
    state.currentView = 'shelf';
    const books = Storage.getBooks();
    const ids = Object.keys(books);

    let html = `
      <div class="shelf-header">
        <h1>📖 我的书架</h1>
        <div class="shelf-actions">
          <button class="btn" onclick="App._toggleDelete()" title="管理">✏️</button>
          <button class="btn" onclick="App._showImport()" title="导入">＋</button>
        </div>
      </div>
      <div class="shelf-grid" id="shelf-grid">
    `;

    if (ids.length === 0) {
      html += `
        <div class="empty-shelf">
          <div class="empty-icon">📚</div>
          <p>书架还是空的</p>
          <p class="hint">点击右上角 ＋ 导入小说</p>
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
              ${b.cover ? `<img src="/api/proxy-image?url=${encodeURIComponent(b.cover)}" alt="${escapeHtml(b.title)}" loading="lazy">` : '📕'}
            </div>
            <div class="book-info">
              <div class="book-title">${escapeHtml(b.title)}</div>
              ${progressText ? `<div class="book-progress">${escapeHtml(progressText)}</div>` : ''}
            </div>
            <button class="delete-btn" onclick="event.stopPropagation();App._confirmDelete('${escapeHtml(id)}')">✕</button>
          </div>
        `;
      }
    }

    html += '</div>';
    app.innerHTML = html;
    app.scrollTop = 0;
  }

  // ---- 书架：删除模式 ----
  let _deleteMode = false;

  window.App = window.App || {};
  App._toggleDelete = function() {
    _deleteMode = !_deleteMode;
    const cards = $$('.book-card');
    cards.forEach(c => c.classList.toggle('deleting', _deleteMode));
    showToast(_deleteMode ? '点击 ✕ 删除小说' : '已退出管理');
  };

  App._confirmDelete = function(id) {
    if (confirm('确定要从书架移除这本小说吗？\n（阅读进度也将被删除）')) {
      Storage.removeBook(id);
      renderShelf();
      showToast('已移除');
      _deleteMode = false;
    }
  };

  App._openBook = function(id) {
    navigate(`book/${id}`);
  };

  // ============================================================
  // 导入对话框
  // ============================================================
  App._showImport = function() {
    // 若已存在则移除
    const old = document.querySelector('.modal-overlay');
    if (old) old.remove();

    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.innerHTML = `
      <div class="modal" onclick="event.stopPropagation()">
        <h2>导入小说</h2>
        <p>从 wenku8.net 导入小说，输入小说编号或完整网址即可。</p>
        <label for="import-input">小说编号或网址</label>
        <input id="import-input" type="text" placeholder="例如: 12345 或 https://www.wenku8.net/book/12345.htm" autocomplete="off">
        <div class="modal-actions">
          <button class="btn btn-ghost" id="import-cancel">取消</button>
          <button class="btn btn-primary" id="import-confirm">导入</button>
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
      // 从 URL 中提取数字 ID
      const match = val.match(/(?:book|novel)\/(\d+)/);
      if (match) return match[1];
      // 纯数字
      if (/^\d+$/.test(val)) return val;
      return null;
    }

    async function doImport() {
      const id = getNovelId();
      if (!id) {
        showToast('请输入正确的小说编号或 wenku8 网址');
        return;
      }

      // 检查是否已导入
      if (Storage.getBook(id)) {
        showToast('这本小说已在书架中');
        div.remove();
        return;
      }

      confirmBtn.disabled = true;
      confirmBtn.textContent = '导入中...';
      showLoading('正在获取小说信息...');

      try {
        const data = await fetchNovel(id);

        // 扁平化章节
        const chaptersFlat = [];
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
        showToast(`✅ 已导入《${data.title}》(${chaptersFlat.length}章)`);
      } catch (err) {
        showToast('导入失败: ' + err.message);
      } finally {
        hideLoading();
        confirmBtn.disabled = false;
        confirmBtn.textContent = '导入';
      }
    }

    confirmBtn.addEventListener('click', doImport);
    cancelBtn.addEventListener('click', () => div.remove());
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doImport(); });
    setTimeout(() => input.focus(), 100);
  };

  // ============================================================
  // 渲染：小说详情 + 章节列表
  // ============================================================
  function renderDetail(id) {
    const book = Storage.getBook(id);
    if (!book) {
      navigate('shelf');
      showToast('小说不存在');
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
          <button class="back-btn" onclick="App._goShelf()">←</button>
          <div class="detail-cover">
            ${book.cover ? `<img src="/api/proxy-image?url=${encodeURIComponent(book.cover)}" alt="${escapeHtml(book.title)}">` : '📕'}
          </div>
          <div class="detail-title">${escapeHtml(book.title)}</div>
          <div class="detail-author">${escapeHtml(book.author)}</div>
          <div class="detail-actions">
            ${progress ? `<button class="btn btn-primary" onclick="App._continueRead('${escapeHtml(id)}')">继续阅读</button>` : ''}
            <button class="btn btn-primary ${!progress ? 'btn-primary' : 'btn-ghost'}" onclick="App._startRead('${escapeHtml(id)}')">${progress ? '从头阅读' : '开始阅读'}</button>
          </div>
        </div>
        <div class="detail-body">
    `;

    if (book.description && book.description !== '暂无简介') {
      html += `<h3>简介</h3><div class="detail-desc">${escapeHtml(book.description)}</div>`;
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
              ${isCurrent ? '<span class="check-icon">●</span>' : ''}
              ${escapeHtml(ch.title)}
            </div>
          `;
          chIdx++;
        }
        html += `</div>`;
      }
    } else {
      html += `<p style="text-align:center;color:var(--text-muted);padding:40px 0;">暂无章节信息</p>`;
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
  // 渲染：阅读器
  // ============================================================
  function renderReader(id, chapterIdx) {
    const book = Storage.getBook(id);
    if (!book) { navigate('shelf'); return; }

    // 扁平化章节
    const chaptersFlat = [];
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

    // 渲染阅读器框架
    app.innerHTML = `
      <div class="reader-view" id="reader-view">
        <div class="reader-header" id="reader-header">
          <button class="back-btn" onclick="App._readerBack()">←</button>
          <span class="chapter-title" id="reader-chapter-title">${escapeHtml(chaptersFlat[idx]?.title || '')}</span>
          <div class="reader-actions">
            <button onclick="App._toggleSettings()" title="设置">Aa</button>
          </div>
        </div>
        <div class="reader-content" id="reader-content">
          <p class="chapter-loading">加载中...</p>
        </div>
        <div class="reader-footer" id="reader-footer">
          <button class="nav-btn" id="prev-btn" onclick="App._prevChapter()">← 上一章</button>
          <span class="reader-progress" id="reader-progress"></span>
          <button class="nav-btn" id="next-btn" onclick="App._nextChapter()">下一章 →</button>
        </div>
      </div>
    `;

    app.scrollTop = 0;

    // 加载章节内容
    loadChapterContent(id, idx, chaptersFlat);

    // 绑定点击阅读器切换 UI 显隐
    const readerContent = document.getElementById('reader-content');
    readerContent.addEventListener('click', (e) => {
      // 只在点击纯文本区域时切换
      if (e.target.closest('.reader-header') || e.target.closest('.reader-footer')) return;
      toggleReaderUI();
    });

    // 绑定滚动同步进度
    readerContent.addEventListener('scroll', () => {
      saveReadProgress();
    });
  }

  // ---- 加载章节 ----
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

    container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px 0;">加载中...</p>';
    container.scrollTop = 0;

    try {
      const data = await fetchChapter(novelId, ch.id);

      // 将正文按段落拆分
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

      // 字体大小
      container.style.fontSize = state.fontSize + 'px';

      // 恢复滚动位置
      const progress = Storage.getProgress(novelId);
      if (progress && String(progress.chapterId) === String(ch.id) && progress.scrollRatio) {
        container.scrollTop = progress.scrollRatio * container.scrollHeight;
      }

    } catch (err) {
      container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:var(--text-muted);">
          <p style="font-size:40px;margin-bottom:16px;">😵</p>
          <p>加载失败</p>
          <p style="font-size:13px;margin-top:8px;">${escapeHtml(err.message)}</p>
          <button class="btn btn-primary" style="margin-top:16px;" onclick="location.reload()">重试</button>
        </div>
      `;
    } finally {
      // 保存阅读进度
      saveReadProgress();
    }
  }

  // ---- 阅读器 UI 显隐 ----
  function toggleReaderUI() {
    state.hideUI = !state.hideUI;
    const header = document.getElementById('reader-header');
    const footer = document.getElementById('reader-footer');
    if (header) header.classList.toggle('hidden', state.hideUI);
    if (footer) footer.classList.toggle('hidden', state.hideUI);
  }

  // ---- 保存进度 ----
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

  // ---- 导航 ----
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

  // ---- 设置面板 ----
  let settingsOpen = false;

  App._toggleSettings = function() {
    settingsOpen = !settingsOpen;
    const existing = document.querySelector('.reader-settings');
    if (existing) existing.remove();

    if (!settingsOpen) return;

    const div = document.createElement('div');
    div.className = 'reader-settings';
    div.innerHTML = `
      <h3>阅读设置</h3>
      <div class="settings-row">
        <label>字号</label>
        <input type="range" min="14" max="26" value="${state.fontSize}" id="font-size-slider">
        <span style="font-size:13px;min-width:32px;text-align:right;">${state.fontSize}</span>
      </div>
      <div class="settings-row">
        <label>主题</label>
        <div class="theme-switch">
          <button class="theme-btn light ${state.theme === 'light' ? 'active' : ''}" data-theme="light">☀️</button>
          <button class="theme-btn dark ${state.theme === 'dark' ? 'active' : ''}" data-theme="dark">🌙</button>
          <button class="theme-btn ${state.theme === 'auto' ? 'active' : ''}" data-theme="auto" style="font-size:14px;font-weight:600;">自动</button>
        </div>
      </div>
      <button class="settings-close" id="settings-close">完成</button>
    `;

    document.body.appendChild(div);

    // 字号
    const slider = document.getElementById('font-size-slider');
    slider.addEventListener('input', () => {
      const size = parseInt(slider.value);
      state.fontSize = size;
      const container = document.getElementById('reader-content');
      if (container) container.style.fontSize = size + 'px';
      slider.nextElementSibling.textContent = size;
    });

    // 主题
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
  // 初始化
  // ============================================================
  function init() {
    router();
  }

  // 如果页面已加载完毕则直接初始化
  if (document.readyState === 'complete') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

})();
