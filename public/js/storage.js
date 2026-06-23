/**
 * localStorage 数据管理
 * 存储书架、阅读进度、主题偏好等
 */
const Storage = {
  KEY_BOOKS: 'wxr_books',
  KEY_THEME: 'wxr_theme',
  KEY_FONT_SIZE: 'wxr_font_size',

  // ---- 书架操作 ----

  /** 获取所有已导入小说 */
  getBooks() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY_BOOKS)) || {};
    } catch { return {}; }
  },

  /** 保存整部小说数据（包含章节列表+阅读进度） */
  saveBook(id, data) {
    const books = this.getBooks();
    books[id] = { ...(books[id] || {}), ...data, updatedAt: Date.now() };
    localStorage.setItem(this.KEY_BOOKS, JSON.stringify(books));
  },

  /** 获取单部小说 */
  getBook(id) {
    const books = this.getBooks();
    return books[id] || null;
  },

  /** 删除小说 */
  removeBook(id) {
    const books = this.getBooks();
    delete books[id];
    localStorage.setItem(this.KEY_BOOKS, JSON.stringify(books));
  },

  // ---- 阅读进度 ----

  /** 保存阅读进度到小说数据中 */
  saveProgress(id, progress) {
    const books = this.getBooks();
    if (books[id]) {
      books[id].lastRead = {
        ...progress,
        timestamp: Date.now()
      };
      localStorage.setItem(this.KEY_BOOKS, JSON.stringify(books));
    }
  },

  /** 获取阅读进度 */
  getProgress(id) {
    const book = this.getBook(id);
    return book?.lastRead || null;
  },

  // ---- 缓存章节内容 ----

  /** 缓存章节内容（离线阅读用） */
  cacheChapter(novelId, chapterId, data) {
    const books = this.getBooks();
    if (!books[novelId]) return;
    if (!books[novelId].chaptersCache) {
      books[novelId].chaptersCache = {};
    }
    books[novelId].chaptersCache[String(chapterId)] = data;
    localStorage.setItem(this.KEY_BOOKS, JSON.stringify(books));
  },

  /** 读取缓存的章节内容 */
  getCachedChapter(novelId, chapterId) {
    const book = this.getBook(novelId);
    return book?.chaptersCache?.[String(chapterId)] || null;
  },

  // ---- 主题 ----

  getTheme() {
    return localStorage.getItem(this.KEY_THEME) || 'auto';
  },

  setTheme(theme) {
    localStorage.setItem(this.KEY_THEME, theme);
  },

  // ---- 字号 ----

  getFontSize() {
    return parseInt(localStorage.getItem(this.KEY_FONT_SIZE)) || 17;
  },

  setFontSize(size) {
    localStorage.setItem(this.KEY_FONT_SIZE, String(size));
  }
};
