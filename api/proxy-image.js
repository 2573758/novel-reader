const axios = require('axios');

const DOMAINS = ['img.wenku8.com', 'img.wen8.net', 'img.wenku8.net'];

module.exports = async (req, res) => {
  let url = req.query.url;
  if (!url) return res.status(400).json({ error: '缺少 url 参数' });

  // 如果请求失败，尝试替换域名
  async function tryFetch(targetUrl) {
    const resp = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'Referer': 'https://www.wenku8.net/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      }
    });
    return resp;
  }

  try {
    const resp = await tryFetch(url);
    res.setHeader('Content-Type', resp.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(resp.data));
  } catch (err) {
    // 尝试替换域名
    for (const domain of DOMAINS) {
      try {
        const newUrl = url.replace(/https?:\/\/[^\/]+/, `https://${domain}`);
        if (newUrl !== url) {
          const resp = await tryFetch(newUrl);
          res.setHeader('Content-Type', resp.headers['content-type'] || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.send(Buffer.from(resp.data));
        }
      } catch (e) { /* ignore */ }
    }
    res.status(500).json({ error: '图片代理失败' });
  }
};
