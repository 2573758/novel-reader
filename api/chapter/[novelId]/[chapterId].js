const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { novelId, chapterId } = req.query;
  if (!novelId || !chapterId) {
    return res.status(400).json({ error: '缺少参数' });
  }

  try {
    async function tryFetch(novelPath) {
      const url = `https://www.wenku8.net/novel/${novelPath}/${chapterId}.htm`;
      const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: { 'User-Agent': UA }
      });
      return iconv.decode(Buffer.from(resp.data), 'gbk');
    }

    let html;
    try {
      html = await tryFetch(novelId);
    } catch (e1) {
      let found = false;
      for (let cat = 1; cat <= 9; cat++) {
        try {
          html = await tryFetch(`${cat}/${novelId}`);
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
