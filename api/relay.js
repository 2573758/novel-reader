const axios = require('axios');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

const ALLOWED_HOSTS = [
  'www.wenku8.net',
  'wenku8.net',
  'img.wenku8.com',
  'img.wenku8.net'
];

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.status(200).send(Buffer.from(resp.data));
  } catch (err) {
    console.error('[RELAY ERROR]', url, err.message);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(502).json({ error: `中继请求失败: ${err.message}` });
  }
};
