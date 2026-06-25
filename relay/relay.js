/**
 * wenku8.net 中继代理服务器
 *
 * 部署在中国云平台上，用于转发对 wenku8.net 的请求。
 * 解决 Vercel 海外服务器无法访问 wenku8.net 的问题。
 *
 * 使用方式：
 *   GET /relay?url=<encoded_url>
 *
 * 支持的部署平台：
 *   - 腾讯云函数 (SCF)
 *   - 阿里云函数计算 (FC)
 *   - 本地 Node.js 服务器
 *   - 任何支持 Node.js 的中国云平台
 */

const axios = require('axios');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

// 只允许代理 wenku8.net 域名的请求（安全限制）
const ALLOWED_HOSTS = [
  'www.wenku8.net',
  'wenku8.net',
  'img.wenku8.com',
  'img.wenku8.net'
];

/**
 * 核心中继处理函数
 */
async function handleRelay(req, res) {
  const url = req.query ? req.query.url : (req.queryStringParameters && req.queryStringParameters.url);

  if (!url) {
    return respond(res, 400, { error: '缺少 url 参数' });
  }

  // 安全校验：只允许代理白名单域名
  try {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return respond(res, 403, { error: '不允许代理该域名，仅限 wenku8.net' });
    }
  } catch (e) {
    return respond(res, 400, { error: '无效的 URL' });
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

    // 设置 CORS 头，允许 Vercel 前端跨域访问
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');

    res.status(200).send(Buffer.from(resp.data));
  } catch (err) {
    console.error('[RELAY ERROR]', url, err.message);
    respond(res, 502, { error: `中继请求失败: ${err.message}` });
  }
}

function respond(res, status, body) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.status(status).json(body);
}

// ============ 部署适配 ============

// 1) Vercel Serverless Function 导出
if (typeof module !== 'undefined') {
  module.exports = async (req, res) => {
    // 处理 CORS 预检请求
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(204).end();
    }
    return handleRelay(req, res);
  };
}
