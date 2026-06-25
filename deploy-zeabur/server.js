/**
 * wenku8.net 中继代理服务器 (Express 版本)
 *
 * 在中国服务器上运行此文件，然后配置 Vercel 的 RELAY_URL 环境变量指向此服务器。
 *
 * 使用方法：
 *   1. npm install
 *   2. node server.js
 *   3. 服务器将在 http://localhost:3001 上运行
 *   4. 在 Vercel 项目设置中添加环境变量：
 *      RELAY_URL = http://你的服务器IP:3001/relay
 *
 * 也可以直接作为完整的 API 服务器使用（包含小说导入和阅读功能）：
 *   http://localhost:3001/api/novel/3281
 *   http://localhost:3001/api/chapter?novelId=3281&chapterId=135812&np=3/3281
 *   http://localhost:3001/api/proxy-image?url=...
 */

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

const ALLOWED_HOSTS = [
  'www.wenku8.net',
  'wenku8.net',
  'img.wenku8.com',
  'img.wenku8.net'
];

// CORS 中间件
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

/** GBK 编码的 HTTP GET */
async function fetchGBK(url) {
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    headers: { 'User-Agent': UA }
  });
  return iconv.decode(Buffer.from(resp.data), 'gbk');
}

// ====== 中继代理路由 ======
app.get('/relay', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: '缺少 url 参数' });

  try {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return res.status(403).json({ error: '不允许代理该域名，仅限 wenku8.net' });
    }
  } catch (e) {
    return res.status(400).json({ error: '无效的 URL' });
  }

  try {
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 20000,
      headers: {
        'User-Agent': UA,
        'Referer': 'https://www.wenku8.net/'
      }
    });

    const contentType = resp.headers['content-type'] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(resp.data));
  } catch (err) {
    console.error('[RELAY ERROR]', url, err.message);
    res.status(502).json({ error: `中继请求失败: ${err.message}` });
  }
});

// ====== 完整 API 路由（可直接用作独立后端） ======

// 获取小说信息
app.get('/api/novel/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: '缺少小说 ID' });

  try {
    const infoHtml = await fetchGBK(`https://www.wenku8.net/book/${id}.htm`);
    const $info = cheerio.load(infoHtml);

    // 封面
    let cover = '';
    $info('img').each((_, el) => {
      const src = $info(el).attr('src') || '';
      if (src.includes(id) && (src.includes('img.wenku8') || src.includes('wenku8'))) {
        cover = src.startsWith('http') ? src : `https:${src}`;
      }
    });
    if (!cover) {
      $info('img').each((_, el) => {
        const w = parseInt($info(el).attr('width')) || 0;
        const src = $info(el).attr('src') || '';
        if (w >= 150 && src.includes('img.wenku8')) {
          cover = src.startsWith('http') ? src : `https:${src}`;
        }
      });
    }

    // 标题
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

    // 作者
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

    // 简介
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
    if (!description) {
      const metaDesc = $info('meta[name="description"]').attr('content');
      if (metaDesc) description = metaDesc;
    }

    // novelPath
    let novelPath = id;
    $info('a').each((_, el) => {
      const href = $info(el).attr('href') || '';
      if (href.includes('index.htm')) {
        const match = href.match(/\/novel\/(.+?)\/index\.htm/);
        if (match) novelPath = match[1].replace(/\/+$/, '');
      }
    });

    // 章节列表
    const indexUrl = `https://www.wenku8.net/novel/${novelPath}/index.htm`;
    const idxHtml = await fetchGBK(indexUrl);
    const $idx = cheerio.load(idxHtml);

    const volumes = [];
    let currentVolume = null;
    let currentChapters = [];

    $idx('table.css tr').each((_, tr) => {
      const $tr = $idx(tr);
      const vcss = $tr.find('td.vcss');
      if (vcss.length) {
        if (currentVolume && currentChapters.length > 0) {
          volumes.push({ name: currentVolume, chapters: [...currentChapters] });
        }
        currentVolume = vcss.first().text().trim();
        currentChapters = [];
      } else {
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
    if (currentVolume && currentChapters.length > 0) {
      volumes.push({ name: currentVolume, chapters: [...currentChapters] });
    }

    // 降级
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

    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
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

// 获取章节内容
app.get('/api/chapter/:novelId/:chapterId', async (req, res) => {
  const { novelId, chapterId } = req.params;
  if (!novelId || !chapterId) {
    return res.status(400).json({ error: '缺少 novelId 或 chapterId 参数' });
  }

  try {
    async function tryPath(path, cid) {
      const url = `https://www.wenku8.net/novel/${path}/${cid}.htm`;
      const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 12000,
        headers: { 'User-Agent': UA }
      });
      return iconv.decode(Buffer.from(resp.data), 'gbk');
    }

    let html;
    let usedPath = novelId;

    if (!html) {
      try {
        html = await tryPath(novelId, chapterId);
      } catch (e1) {
        let found = false;
        for (let cat = 1; cat <= 9; cat++) {
          try {
            html = await tryPath(`${cat}/${novelId}`, chapterId);
            usedPath = `${cat}/${novelId}`;
            found = true;
            break;
          } catch (e) { /* continue */ }
        }
        if (!found) {
          return res.status(404).json({ error: `找不到章节 ${novelId}/${chapterId}` });
        }
      }
    }

    const $ = cheerio.load(html);

    let title = $('#title').first().text().trim();
    if (!title) title = $('h3').first().text().trim();
    if (!title) title = `第${chapterId}章`;

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
      $('script, style, iframe, nav, header, footer, #headlink, #adv1, #adv6, #adtop, #adv900, #adv300, #adbottom').remove();
      content = $('body').text().replace(/[\s]+/g, ' ').trim();
    }

    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.json({
      novelId: usedPath,
      chapterId,
      title,
      content
    });

  } catch (err) {
    console.error(`[ERROR] 获取章节 ${novelId}/${chapterId} 失败:`, err.message);
    res.status(500).json({ error: `获取章节失败: ${err.message}` });
  }
});

// 兼容 Vercel 风格的查询参数
app.get('/api/chapter', async (req, res) => {
  const { novelId, chapterId, np } = req.query;
  if (!novelId || !chapterId) {
    return res.status(400).json({ error: '缺少 novelId 或 chapterId 参数' });
  }

  try {
    async function tryPath(path, cid) {
      const url = `https://www.wenku8.net/novel/${path}/${cid}.htm`;
      const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 12000,
        headers: { 'User-Agent': UA }
      });
      return iconv.decode(Buffer.from(resp.data), 'gbk');
    }

    let html;
    let usedPath = novelId;

    if (np && np.includes('/')) {
      try {
        html = await tryPath(np, chapterId);
        usedPath = np;
      } catch (e) { /* 降级 */ }
    }

    if (!html) {
      try {
        html = await tryPath(novelId, chapterId);
      } catch (e1) {
        let found = false;
        for (let cat = 1; cat <= 9; cat++) {
          try {
            html = await tryPath(`${cat}/${novelId}`, chapterId);
            usedPath = `${cat}/${novelId}`;
            found = true;
            break;
          } catch (e) { /* continue */ }
        }
        if (!found) {
          return res.status(404).json({ error: `找不到章节 ${novelId}/${chapterId}` });
        }
      }
    }

    const $ = cheerio.load(html);

    let title = $('#title').first().text().trim();
    if (!title) title = $('h3').first().text().trim();
    if (!title) title = `第${chapterId}章`;

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
      $('script, style, iframe, nav, header, footer, #headlink, #adv1, #adv6, #adtop, #adv900, #adv300, #adbottom').remove();
      content = $('body').text().replace(/[\s]+/g, ' ').trim();
    }

    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.json({
      novelId: usedPath,
      chapterId,
      title,
      content
    });

  } catch (err) {
    console.error(`[ERROR] 获取章节 ${novelId}/${chapterId} 失败:`, err.message);
    res.status(500).json({ error: `获取章节失败: ${err.message}` });
  }
});

// 图片代理
app.get('/api/proxy-image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: '缺少 url 参数' });

  try {
    const resp = await axios.get(url, {
      responseType: 'stream',
      timeout: 15000,
      headers: {
        'Referer': 'https://www.wenku8.net/',
        'User-Agent': UA
      }
    });

    const ct = resp.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000');
    resp.data.pipe(res);
  } catch (err) {
    console.error('[ERROR] 图片代理失败:', err.message);
    res.status(500).json({ error: '图片代理失败' });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 wenku8 中继服务器已启动`);
  console.log(`   中继代理: http://localhost:${PORT}/relay?url=<encoded_url>`);
  console.log(`   完整 API: http://localhost:${PORT}/api/novel/<id>`);
  console.log(`   在 Vercel 设置 RELAY_URL = http://你的IP:${PORT}/relay`);
});
