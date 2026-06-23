var axios = require('axios');
var cheerio = require('cheerio');
var iconv = require('iconv-lite');

var DOMAINS = ['www.wenku8.net', 'www.wen8.net', 'www.wenku8.com'];
var UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile/15E148',
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile'
];

function rndUA() { return UAS[Math.floor(Math.random() * UAS.length)]; }
function hdrs() {
  return { 'User-Agent': rndUA(), 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9' };
}

function fetchOne(url) {
  return axios.get(url, { responseType: 'arraybuffer', timeout: 10000, headers: hdrs() })
    .then(function(r) { return iconv.decode(Buffer.from(r.data), 'gbk'); });
}

async function fetchAny(path) {
  var jobs = [];
  // all HTTPS domains in parallel
  for (var i = 0; i < DOMAINS.length; i++) {
    jobs.push(fetchOne('https://' + DOMAINS[i] + path).catch(function() { return null; }));
  }
  // all HTTP domains in parallel
  for (var j = 0; j < DOMAINS.length; j++) {
    jobs.push(fetchOne('http://' + DOMAINS[j] + path).catch(function() { return null; }));
  }
  var results = await Promise.all(jobs);
  for (var k = 0; k < results.length; k++) {
    if (results[k] && results[k].length > 200) return results[k];
  }
  throw new Error('fetch failed for: ' + path);
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var id = req.query.id;
  if (!id) return res.status(400).json({ error: 'missing id' });

  try {
    // 1) novel info page
    var infoHtml = await fetchAny('/book/' + id + '.htm');
    var $ = cheerio.load(infoHtml);

    // cover
    var cover = '';
    $('img').each(function() {
      var src = $(this).attr('src') || '';
      if (src.indexOf('img.wenku8') >= 0 && src.indexOf(id) >= 0) {
        cover = src.indexOf('http') === 0 ? src : 'https:' + src;
      }
    });
    if (!cover) {
      $('img').each(function() {
        var w = parseInt($(this).attr('width'));
        var src = $(this).attr('src') || '';
        if (w >= 150 && src.indexOf('img.wenku8') >= 0) cover = src.indexOf('http') === 0 ? src : 'https:' + src;
      });
    }

    // title
    var title = '';
    $('span').each(function() {
      var s = $(this).attr('style') || '';
      if (s.indexOf('font-size:16px') >= 0 && s.indexOf('font-weight: bold') >= 0) {
        title = $(this).text().replace(/\[.*?\]/g, '').trim();
      }
    });
    if (!title) title = $('title').text().replace(/[\s-].*$/, '').trim();

    // author
    var author = '';
    $('td').each(function() {
      var txt = $(this).text().trim();
      if (txt.indexOf('小 说 作 者') >= 0 || txt.indexOf('小说作者') >= 0) {
        author = txt.replace(/小.说.作.者[：:]?/, '').trim();
      }
    });
    if (!author) author = 'unknown';

    // description
    var desc = '';
    $('span.hottext').each(function() {
      if ($(this).text().indexOf('内 容 简 介') >= 0 || $(this).text().indexOf('内容简介') >= 0) {
        var next = $(this).nextAll('span').first();
        if (next.length) desc = next.text().trim();
      }
    });
    if (!desc) desc = $('meta[name="description"]').attr('content') || '';

    // get novel path from index link
    var novelPath = id;
    $('a').each(function() {
      var href = $(this).attr('href') || '';
      if (href.indexOf('index.htm') >= 0) {
        var m = href.match(/\/novel\/(.+?)\/index\.htm/);
        if (m) novelPath = m[1].replace(/\/+$/, '');
      }
    });

    // 2) chapter list
    var idxHtml = await fetchAny('/novel/' + novelPath + '/index.htm');
    var $x = cheerio.load(idxHtml);
    var volumes = [];
    var curVol = null;
    var curChs = [];

    $x('table.css tr').each(function() {
      var tr = this;
      var vcss = $x(tr).find('td.vcss');
      if (vcss.length) {
        if (curVol && curChs.length > 0) { volumes.push({ name: curVol, chapters: curChs }); }
        curVol = $x(vcss).first().text().trim();
        curChs = [];
      } else {
        $x(tr).find('td.ccss a').each(function() {
          var href = $x(this).attr('href') || '';
          var m = href.match(/(\d+)\.htm/);
          if (m) curChs.push({ id: m[1], title: $x(this).text().trim() });
        });
      }
    });
    if (curVol && curChs.length > 0) volumes.push({ name: curVol, chapters: curChs });

    if (volumes.length === 0) {
      var allCh = [];
      $x('a[href*=".htm"]').each(function() {
        var href = $x(this).attr('href') || '';
        var m = href.match(/(\d+)\.htm/);
        if (m && href.indexOf('index') < 0) allCh.push({ id: m[1], title: $x(this).text().trim() });
      });
      if (allCh.length > 0) volumes.push({ name: 'text', chapters: allCh });
    }

    res.json({ id: id, novelPath: novelPath, title: title, author: author, cover: cover, description: desc, volumes: volumes });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
