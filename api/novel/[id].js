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
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: '缺少小说 ID' });

  try {
    const infoHtml = await fetchGBK(`https://www.wenku8.net/book/${id}.htm`);
    const $ = cheerio.load(infoHtml);

    // 封面：优先取包含 id 的图片
    let cover = '';
    $('img').each((_, el) => {
      const src = $(el).attr('src') || '';
      if (src.includes('img.wenku8') && src.includes(id)) {
        cover = src.startsWith('http') ? src : `https:${src}`;
      }
    });
    if (!cover) {
      $('img').each((_, el) => {
        const w = parseInt($(el).attr('width')) || 0;
        const src = $(el).attr('src') || '';
        if (w >= 150 && src.includes('img.wenku8')) {
          cover = src.startsWith('http') ? src : `https:${src}`;
        }
      });
    }

    // 标题
    let title = '';
    $('span').each((_, el) => {
      const style = $(el).attr('style') || '';
      if (style.includes('font-size:16px') && style.includes('font-weight: bold')) {
        title = $(el).text().replace(/\[.*?\]/g, '').trim();
      }
    });
    if (!title) title = $('title').text().replace(/[\s-].*$/, '').trim();

    // 作者
    let author = '';
    $('td').each((_, el) => {
      const txt = $(el).text().trim();
      if (txt.includes('小说作者')) {
        author = txt.replace(/小说作者[：:]?/, '').trim();
      }
    });
    if (!author) author = '未知作者';

    // 简介
    let description = '';
    $('span.hottext').each((_, el) => {
      const txt = $(el).text().trim();
      if (txt.includes('内容简介')) {
        const next = $(el).nextAll('span').first();
        if (next.length) description = next.text().trim();
      }
    });
    if (!description) {
      const metaDesc = $('meta[name="description"]').attr('content');
      if (metaDesc) description = metaDesc;
    }

    // 小说目录路径
    let novelPath = id;
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('index.htm')) {
        const match = href.match(/\/novel\/(.+?)\/index\.htm/);
        if (match) novelPath = match[1].replace(/\/+$/, '');
      }
    });

    // 章节列表
    const idxHtml = await fetchGBK(`https://www.wenku8.net/novel/${novelPath}/index.htm`);
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
            currentChapters.push({ id: match[1], title: $idx(a).text().trim() });
          }
        });
      }
    });
    if (currentVolume && currentChapters.length > 0) {
      volumes.push({ name: currentVolume, chapters: [...currentChapters] });
    }

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
};
