const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'
];
const DOMAINS = ['www.wenku8.net', 'www.wen8.net', 'www.wenku8.com'];

function randomUA() { return UAS[Math.floor(Math.random() * UAS.length)]; }
function browserHeaders() {
  return {
    'User-Agent': randomUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Connection': 'keep-alive'
  };
}

async function fetchWithFallback(path) {
  let lastErr;
  for (const domain of DOMAINS) {
    try {
      const url = `https://${domain}${path}`;
      const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: browserHeaders()
      });
      return iconv.decode(Buffer.from(resp.data), 'gbk');
    } catch (e) { lastErr = e; }
  }
  for (const domain of DOMAINS) {
    try {
      const url = `http://${domain}${path}`;
      const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: browserHeaders()
      });
      return iconv.decode(Buffer.from(resp.data), 'gbk');
    } catch (e) { /* ignore */ }
  }
  throw lastErr;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { novelId, chapterId } = req.query;
  if (!novelId || !chapterId) {
    return res.status(400).json({ error: '缺少参数' });
  }

  try {
    // 优先用完整路径尝试
    let html;
    try {
      html = await fetchWithFallback(`/novel/${novelId}/${chapterId}.htm`);
    } catch (e1) {
      let found = false;
      for (let cat = 1; cat <= 9; cat++) {
        try {
          html = await fetchWithFallback(`/novel/${cat}/${novelId}/${chapterId}.htm`);
          found = true;
          break;
        } catch (e) { /* 继续尝试 */ }
      }
      if (!found) throw new Error(`未能找到章节 ${novelId}/${chapterId}`);
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
      content = $('body').text().replace(/\s+/g, ' ').trim();
    }

    res.json({ novelId, chapterId, title, content });

  } catch (err) {
    console.error(`[ERROR] 获取章节 ${novelId}/${chapterId} 失败:`, err.message);
    res.status(500).json({ error: `获取章节失败: ${err.message}` });
  }
};
