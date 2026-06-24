const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

/** GBK 编码的 HTTP GET 辅助函数 */
async function fetchGBK(url) {
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: { 'User-Agent': UA }
  });
  return iconv.decode(Buffer.from(resp.data), 'gbk');
}

module.exports = async (req, res) => {
  // Vercel 把 [id] 放在 req.query.id
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: '缺少小说 ID' });

  try {
    // 1) 抓取小说信息页
    const infoHtml = await fetchGBK(`https://www.wenku8.net/book/${id}.htm`);
    const $info = cheerio.load(infoHtml);

    // ---- 封面 ----
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

    // ---- 标题 ----
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

    // ---- 作者 ----
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

    // ---- 简介 ----
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

    // ---- novelPath ----
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
};
