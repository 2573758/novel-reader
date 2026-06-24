const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

async function fetchGBK(url) {
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: { 'User-Agent': UA }
  });
  return iconv.decode(Buffer.from(resp.data), 'gbk');
}

module.exports = async (req, res) => {
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

    // 优先用 novelPath（如 "3/3281"）
    if (np && np.includes('/')) {
      try {
        html = await tryPath(np, chapterId);
        usedPath = np;
      } catch (e) { /* 降级到 category 扫描 */ }
    }

    if (!html) {
      // 尝试直接用 novelId
      try {
        html = await tryPath(novelId, chapterId);
      } catch (e1) {
        // 尝试分类前缀 1-9
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

    // 标题
    let title = $('#title').first().text().trim();
    if (!title) title = $('h3').first().text().trim();
    if (!title) title = `第${chapterId}章`;

    // 正文
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
      // 降级
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
};
