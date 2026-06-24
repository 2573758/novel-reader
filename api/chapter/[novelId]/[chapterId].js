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
  return axios.get(url, { responseType: 'arraybuffer', timeout: 8000, headers: hdrs() })
    .then(function(r) { return iconv.decode(Buffer.from(r.data), 'gbk'); });
}

async function fetchAny(path) {
  var jobs = [];
  for (var i = 0; i < DOMAINS.length; i++) {
    jobs.push(fetchOne('https://' + DOMAINS[i] + path));
    jobs.push(fetchOne('http://' + DOMAINS[i] + path));
  }
  var results = await Promise.all(jobs.map(function(p) { return p.catch(function() { return null; }); }));
  for (var k = 0; k < results.length; k++) {
    if (results[k] && results[k].length > 200) { return results[k]; }
  }
  throw new Error('all failed');
}

// -------- content extraction helpers --------

function extractContent(html) {
  var $ = cheerio.load(html);
  var lines = [];

  // strategy 1: #content
  var contentDiv = $('#content').first();
  if (contentDiv.length) {
    contentDiv.contents().each(function() {
      var t = $(this).text().trim();
      if (t) { lines.push(t); }
    });
    if (lines.length > 5) { return lines.join('\n\n'); }
  }

  // strategy 2: body minus nav/script
  lines = [];
  var body = $('body').clone();
  body.find('script,style,iframe,header,footer,nav,#headlink,#adv1,#adv6,#adtop,#adv900,#adv300,#adbottom').remove();
  body.contents().each(function() {
    var t = $(this).text().trim();
    if (t && t.length > 10) { lines.push(t); }
  });
  if (lines.length > 3) { return lines.join('\n\n'); }

  // strategy 3: raw body text
  return $('body').clone().find('script,style').remove().end().text().trim();
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var novelId = req.query.novelId;
  var chapterId = req.query.chapterId;
  if (!novelId || !chapterId) { return res.status(400).json({ error: 'missing params' }); }

  try {
    var result = null;
    var firstErr = null;

    // try direct path
    try { result = await fetchAny('/novel/' + novelId + '/' + chapterId + '.htm'); }
    catch (e) { firstErr = e; }

    // try category prefixes 1-9 IN PARALLEL
    if (!result) {
      var catJobs = [];
      for (var cat = 1; cat <= 9; cat++) {
        catJobs.push(
          fetchAny('/novel/' + cat + '/' + novelId + '/' + chapterId + '.htm')
            .then(function(d) { return d; })
            .catch(function() { return null; })
        );
      }
      var catResults = await Promise.all(catJobs);
      for (var n = 0; n < catResults.length; n++) {
        if (catResults[n]) { result = catResults[n]; break; }
      }
    }

    if (!result) {
      return res.status(404).json({
        error: 'chapter not found', detail: 'all paths tried',
        novelId: novelId, chapterId: chapterId
      });
    }

    var $ = cheerio.load(result);

    // title
    var title = $('#title').first().text().trim();
    if (!title) { title = $('h3').first().text().trim(); }
    if (!title) { title = 'Ch.' + chapterId; }

    // content (using helper)
    var content = extractContent(result);

    res.json({ novelId: novelId, chapterId: chapterId, title: title, content: content });

  } catch (err) {
    res.status(500).json({ error: 'chapter error', detail: err.message, novelId: novelId, chapterId: chapterId });
  }
};
