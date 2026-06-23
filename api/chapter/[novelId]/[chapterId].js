var axios = require('axios');
var cheerio = require('cheerio');
var iconv = require('iconv-lite');

var UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36'
];
var DOMAINS = ['www.wenku8.net', 'www.wen8.net', 'www.wenku8.com'];

function randUA() { return UAS[Math.floor(Math.random() * UAS.length)]; }
function headers() {
  return {
    'User-Agent': randUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Connection': 'keep-alive'
  };
}

function fetchUrl(url) {
  return axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 8000,
    headers: headers()
  }).then(function(resp) {
    return iconv.decode(Buffer.from(resp.data), 'gbk');
  });
}

function tryAll(path) {
  var lastErr = null;
  function attempt(domain, useHttps) {
    var proto = useHttps ? 'https' : 'http';
    var url = proto + '://' + domain + path;
    return fetchUrl(url);
  }
  // try all https first
  for (var i = 0; i < DOMAINS.length; i++) {
    try { return attempt(DOMAINS[i], true); } catch (e) { lastErr = e; }
  }
  // then all http
  for (var j = 0; j < DOMAINS.length; j++) {
    try { return attempt(DOMAINS[j], false); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('all failed');
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  var novelId = req.query.novelId;
  var chapterId = req.query.chapterId;
  if (!novelId || !chapterId) {
    return res.status(400).json({ error: 'missing params' });
  }

  try {
    var result = null;
    var firstErr = null;

    // try direct path
    try {
      result = await tryAll('/novel/' + novelId + '/' + chapterId + '.htm');
    } catch (e) { firstErr = e; }

    // try category prefixes
    if (!result) {
      for (var cat = 1; cat <= 9; cat++) {
        try {
          result = await tryAll('/novel/' + cat + '/' + novelId + '/' + chapterId + '.htm');
          if (result) break;
        } catch (e) { firstErr = e; }
      }
    }

    if (!result) {
      return res.status(404).json({
        error: 'chapter not found',
        detail: 'all domains and path patterns tried',
        novelId: novelId, chapterId: chapterId
      });
    }

    var $ = cheerio.load(result);

    // title
    var title = $('#title').first().text().trim();
    if (!title) { title = $('h3').first().text().trim(); }

    // content - strategy 1: #content div
    var content = '';
    var contentDiv = $('#content').first();
    if (contentDiv.length) {
      var lines = [];
      contentDiv.contents().each(function() {
        var el = this;
        if (el.type === 'text') {
          var txt = $(el).text().trim();
          if (txt) { lines.push(txt); }
        } else if (el.type === 'tag') {
          var txt = $(el).text().trim();
          if (txt) { lines.push(txt); }
        }
      });
      content = lines.join('\n\n');
    }

    // strategy 2: #BookContent or #htmlContent
    if (!content || content.length < 100) {
      var altDiv = $('#BookContent').first();
      if (!altDiv.length) { altDiv = $('#htmlContent').first(); }
      if (!altDiv.length) { altDiv = $('.content').first(); }
      if (altDiv.length) {
        content = altDiv.text().trim();
      }
    }

    // strategy 3: strip non-content elements
    if (!content || content.length < 100) {
      var body = $('body').clone();
      body.find('script,style,iframe,header,footer,nav,#adv1,#adv6,'
        + '#adtop,#headlink,#adv900,#adv300,#adbottom').remove();
      var allText = body.text().replace(/\s+/g, ' ').trim();
      // keep text longer than 200 chars
      if (allText.length > 200) {
        content = allText;
      }
    }

    if (!title) { title = 'Chapter ' + chapterId; }

    res.json({
      novelId: novelId,
      chapterId: chapterId,
      title: title,
      content: content
    });

  } catch (err) {
    res.status(500).json({
      error: 'server error',
      detail: err.message,
      novelId: novelId, chapterId: chapterId
    });
  }
};
