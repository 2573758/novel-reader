const axios = require('axios');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

module.exports = async (req, res) => {
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
    console.error(`[ERROR] 图片代理失败:`, err.message);
    res.status(500).json({ error: '图片代理失败' });
  }
};
