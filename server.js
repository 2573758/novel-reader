const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

/** GBK 编码的 HTTP GET 辅助函数 */
async function fetchGBK(url) {
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': UA }
  });
  return iconv.decode(Buffer.from(resp.data), 'gbk');
}

// -----------------------------------------------------------
// 从 wenku8 获取小说基本信息 + 章节列表
// -----------------------------------------------------------
app.get('/api/novel/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // 1) 抓取小说信息页
    const infoHtml = await fetchGBK(`https://www.wenku8.net/book/${id}.htm`);
    const $info = cheerio.load(infoHtml);

    // ---- 提取信息 ----
    // 封面：优先取带有 novelId 的图片 src（如 /3281/3281s.jpg）
    let cover = '';
    $info('img').each((_, el) => {
      const src = $info(el).attr('src') || '';
      if (src.includes(id) && (src.includes('img.wenku8') || src.includes('wenku8'))) {
        cover = src.startsWith('http') ? src : `https:${src}`;
      }
    });
    // 降级：取宽度 168 的图片
    if (!cover) {
      $info('img').each((_, el) => {
        const w = parseInt($info(el).attr('width')) || 0;
        const src = $info(el).attr('src') || '';
        if (w >= 150 && src.includes('img.wenku8')) {
          cover = src.startsWith('http') ? src : `https:${src}`;
        }
      });
    }

    // 标题：<span style="font-size:16px; font-weight: bold;"> 内的 <b>
    let title = '';
    $info('span').each((_, el) => {
      const style = $info(el).attr('style') || '';
      if (style.includes('font-size:16px') && style.includes('font-weight: bold')) {
        title = $info(el).text().replace(/\[.*?\]/g, '').trim();
      }
    });
    if (!title) {
      title = $info('title').text().replace(/[\s-].*$/, '').trim();
    }

    // 作者：取包含 "小说作者" 的 td
    let author = '';
    $info('td').each((_, el) => {
      const txt = $info(el).text().trim();
      if (txt.includes('小说作者') || txt.includes('作者')) {
        author = txt.replace(/小说作者[：:]?/, '').trim();
      }
    });
    if (!author) {
      author = $info('#info').text().replace(/作者[：:]?/, '').trim() || '未知作者';
    }

    // 简介："内容简介：" 之后的下一个 <span>
    let description = '';
    $info('span.hottext').each((_, el) => {
      const txt = $info(el).text().trim();
      if (txt.includes('内容简介')) {
        const next = $info(el).nextAll('span').first();
        if (next.length) {
          description = next.text().trim();
        }
      }
    });
    // 降级：取 meta description
    if (!description) {
      const metaDesc = $info('meta[name="description"]').attr('content');
      if (metaDesc) description = metaDesc;
    }

    // 从 "小说目录" 链接提取完整路径 (如 3/3281)
    let novelPath = id;
    $info('a').each((_, el) => {
      const href = $info(el).attr('href') || '';
      if (href.includes('index.htm')) {
        const match = href.match(/\/novel\/(.+?)\/index\.htm/);
        if (match) novelPath = match[1].replace(/\/+$/, '');
      }
    });

    // 2) 抓取章节列表
    const indexUrl = `https://www.wenku8.net/novel/${novelPath}/index.htm`;
    const idxHtml = await fetchGBK(indexUrl);
    const $idx = cheerio.load(idxHtml);

    const volumes = [];
    let currentVolume = null;
    let currentChapters = [];

    // 遍历 table.css 下的所有行
    $idx('table.css tr').each((_, tr) => {
      const $tr = $idx(tr);
      const vcss = $tr.find('td.vcss');
      if (vcss.length) {
        // 卷标题
        if (currentVolume && currentChapters.length > 0) {
          volumes.push({ name: currentVolume, chapters: [...currentChapters] });
        }
        currentVolume = vcss.first().text().trim();
        currentChapters = [];
      } else {
        // 章节行
        $tr.find('td.ccss a').each((_, a) => {
          const href = $idx(a).attr('href') || '';
          const match = href.match(/(\d+)\.htm/);
          if (match) {
            currentChapters.push({
              id: match[1],
              title: $idx(a).text().trim()
            });
          }
        });
      }
    });
    // 最后一卷
    if (currentVolume && currentChapters.length > 0) {
      volumes.push({ name: currentVolume, chapters: [...currentChapters] });
    }

    // 降级：如果 table 方式没抓到，用通用 a 标签查找
    if (volumes.length === 0) {
      const allCh = [];
      $idx('a[href*=".htm"]').each((_, a) => {
        const href = $idx(a).attr('href') || '';
        const match = href.match(/(\d+)\.htm/);
        if (match && !href.includes('index')) {
          allCh.push({ id: match[1], title: $idx(a).text().trim() });
        }
      });
      if (allCh.length > 0) volumes.push({ name: '正文', chapters: allCh });
    }

    res.json({
      id,
      novelPath,
      title: title || `小说 ${id}`,
      author: author || '未知作者',
      cover,
      description: description || '暂无简介',
      volumes
    });

  } catch (err) {
    console.error(`[ERROR] 获取小说 ${id} 失败:`, err.message);
    res.status(500).json({ error: `获取小说失败: ${err.message}` });
  }
});

// -----------------------------------------------------------
// 获取章节正文
// -----------------------------------------------------------
app.get('/api/chapter/:novelId/:chapterId', async (req, res) => {
  const { novelId, chapterId } = req.params;
  try {
    // 优先从已缓存的 book 数据获取 novelPath
    // 这里不能直接访问 localStorage（服务器端），所以我们需要从 novelId 推断
    // novelId 可能是 3281，也可能是 3/3281
    // 先尝试直接获取，如果失败则尝试带前缀的路径

    async function tryFetch(novelPath) {
      const url = `https://www.wenku8.net/novel/${novelPath}/${chapterId}.htm`;
      const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: { 'User-Agent': UA }
      });
      return iconv.decode(Buffer.from(resp.data), 'gbk');
    }

    let html;
    let usedPath = novelId;

    try {
      html = await tryFetch(novelId);
    } catch (e1) {
      // 尝试在 novelId 前加分类前缀：遍历可能的分类 1-9
      let found = false;
      for (let cat = 1; cat <= 9; cat++) {
        try {
          html = await tryFetch(`${cat}/${novelId}`);
          usedPath = `${cat}/${novelId}`;
          found = true;
          break;
        } catch (e) { /* try next */ }
      }
      if (!found) throw new Error(`未能找到章节 ${novelId}/${chapterId}`);
    }

    const $ = cheerio.load(html);

    // 标题：优先取 <div id="title"> (目录页的标题行) 或 h3
    let title = $('#title').first().text().trim();
    if (!title) title = $('h3').first().text().trim();
    if (!title) title = `第${chapterId}章`;

    // 正文：Wenku8 章节页正文在 <div id="content"> 内或 <br> 隔开的文本
    let content = '';
    const contentDiv = $('#content').first();
    if (contentDiv.length) {
      const lines = [];
      contentDiv.contents().each((_, el) => {
        if (el.type === 'text') {
          const text = $(el).text().trim();
          if (text) lines.push(text);
        } else if (el.type === 'tag' && (el.tagName === 'p' || el.tagName === 'div')) {
          const text = $(el).text().trim();
          if (text) lines.push(text);
        }
      });
      content = lines.join('\n\n');
    }

    if (!content) {
      // 降级：取 body 文本，去掉头部导航等
      content = $('body').text().replace(/\s+/g, ' ').trim();
    }

    res.json({
      novelId,
      chapterId,
      title,
      content
    });

  } catch (err) {
    console.error(`[ERROR] 获取章节 ${novelId}/${chapterId} 失败:`, err.message);
    res.status(500).json({ error: `获取章节失败: ${err.message}` });
  }
});

// -----------------------------------------------------------
// 代理封面图片（解决 CORS / 防盗链）
// -----------------------------------------------------------
app.get('/api/proxy-image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: '缺少 url 参数' });

  try {
    const resp = await axios.get(url, {
      responseType: 'stream',
      timeout: 10000,
      headers: {
        'Referer': 'https://www.wenku8.net/',
        'User-Agent': UA
      }
    });

    const ct = resp.headers['content-type'] || 'image/jpeg';
    res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=86400');
    resp.data.pipe(res);
  } catch (err) {
    res.status(500).json({ error: '图片代理失败' });
  }
});

// -----------------------------------------------------------
// 兜底：前端路由（SPA fallback）
// -----------------------------------------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`📖 小说阅读器已启动:`);
  console.log(`   本地: http://localhost:${PORT}`);
  console.log(`   手机: http://你的局域网IP:${PORT}`);
  console.log(`   在 iPhone Safari 中打开，然后点击"分享">"添加到主屏幕"获得最佳体验`);
});
