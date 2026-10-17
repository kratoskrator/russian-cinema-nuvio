/* Russian Cinema for Nuvio v1.0.0
MIT License

Copyright (c) 2026 Russian Cinema Nuvio provider contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.




Russian Cinema is an independent Nuvio provider. It is not affiliated with Filmix, Seasonvar, Nuvio or TMDB.

Protocol references:
- Filmix mobile API request and response conventions were researched using https://github.com/n0madic/go-filmix (MIT, Copyright (c) 2026 nomadic). This plugin implements an independent guest client; it does not include that Go library or its website decoder.
- https://github.com/googoid/seasonvar-client was consulted as background. The Seasonvar extractor was independently implemented against the current public HTML and playlist JSON; no code from that library is distributed.

The runtime has no third-party package dependencies. Site scripts are never executed. The source package contains only synthetic test responses; captured website responses and temporary playback URLs are excluded.

Title identification uses The Movie Database. This product uses the TMDB API but is not endorsed or certified by TMDB.

*/
(function () {
var modules = {
"utils": function(module, exports, require) {
'use strict';

function entities(value) {
  return String(value || '').replace(/&#(x[\da-f]+|\d+);|&(amp|quot|apos|lt|gt|nbsp);/gi, function (all, number, named) {
    if (number) return String.fromCharCode(number.charAt(0).toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : parseInt(number, 10));
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[named.toLowerCase()];
  });
}

function text(value) {
  return entities(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function attr(tag, name) {
  var re = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^\"]*)"|\x27([^\x27]*)\x27|([^\\s>]+))', 'i');
  var match = re.exec(tag || '');
  return match ? entities(match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[3]) : '';
}

function origin(url) {
  var match = /^(https?:\/\/[^/?#]+)/i.exec(url || '');
  return match ? match[1] : '';
}

function absolute(value, base) {
  value = entities(value).trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/\//.test(value)) return (String(base).split(':')[0] || 'https') + ':' + value;
  if (!value || /^[\w+.-]+:/.test(value)) return '';
  var root = origin(base);
  if (!root) return '';
  var path = String(base).slice(root.length).split(/[?#]/)[0] || '/';
  if (value.charAt(0) === '?') return root + path + value;
  if (value.charAt(0) === '#') return '';
  path = value.charAt(0) === '/' ? value : path.slice(0, path.lastIndexOf('/') + 1) + value;
  var suffix = /[?#].*$/.exec(path);
  var parts = path.split(/[?#]/)[0].split('/');
  var clean = [];
  parts.forEach(function (part) {
    if (part === '..') clean.pop();
    else if (part && part !== '.') clean.push(part);
  });
  return root + '/' + clean.join('/') + (clean.length && /\/$/.test(path.split(/[?#]/)[0]) ? '/' : '') + (suffix ? suffix[0] : '');
}

function siteUrl(value) {
  return /^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(String(value || '')) ? String(value).replace(/\/+$/, '') : '';
}

function sameSite(url, base) {
  return origin(url).toLowerCase() === origin(base).toLowerCase();
}

function normalize(value) {
  return text(value).toLowerCase().replace(/ё/g, 'е').replace(/[^a-z0-9а-я]+/g, ' ').trim();
}

function form(values) {
  return Object.keys(values).map(function (name) { return encodeURIComponent(name) + '=' + encodeURIComponent(String(values[name])); }).join('&');
}

function classText(html, className) {
  var re = /<([a-z][\w:-]*)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  var match;
  // Search only opening tags carrying this class, so outer containers do not swallow descendants.
  var opening = new RegExp('<([a-z][\\w:-]*)\\b([^>]*\\bclass\\s*=\\s*(?:"[^"]*\\b' + className + '\\b[^"]*"|\x27[^\x27]*\\b' + className + '\\b[^\x27]*\x27)[^>]*)>', 'gi');
  match = opening.exec(html);
  if (!match) return '';
  re = new RegExp('^([\\s\\S]*?)<\\/' + match[1] + '\\s*>', 'i');
  var body = re.exec(html.slice(opening.lastIndex));
  return body ? text(body[1]) : '';
}

module.exports = { entities: entities, text: text, attr: attr, origin: origin, absolute: absolute, siteUrl: siteUrl, sameSite: sameSite, normalize: normalize, classText: classText, form: form };

},
"http": function(module, exports, require) {
'use strict';
var u = require("utils");
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
var MAX_BYTES = 1024 * 1024;

function safeError(message, blocked, transient) {
  var error = new Error(message);
  error.providerSafe = true;
  error.siteBlocked = !!blocked;
  error.transient = !!transient;
  return error;
}

// Only request state is retained. Native TV redirects do not safely scope a
// manually supplied Cookie header, so this provider never copies site cookies.
function session(deadline) { return { deadline: deadline || Date.now() + 50000, blocked: {} }; }

// The TV bridge preserves raw bytes but only decodes UTF-8/Latin-1 itself.
var CP1251 = 'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—\u0098™љ›њќћџ\u00a0ЎўЈ¤Ґ¦§Ё©Є«¬\u00ad®Ї°±Ііґµ¶·ё№є»јЅѕї';
function decode1251(buffer) {
  var bytes = new Uint8Array(buffer);
  if (bytes.length >= MAX_BYTES) throw safeError('Response reaches TV size limit');
  var chunks = [], current = '';
  for (var i = 0; i < bytes.length; i++) {
    var code = bytes[i];
    current += code < 128 ? String.fromCharCode(code) : code < 192 ? CP1251.charAt(code - 128) : String.fromCharCode(1040 + code - 192);
    if (current.length >= 4096) { chunks.push(current); current = ''; }
  }
  chunks.push(current);
  return chunks.join('');
}

function readBody(response, options) {
  var contentType = response.headers && typeof response.headers.get === 'function' ? response.headers.get('content-type') || '' : '';
  if (options.binary) {
    if (typeof response.arrayBuffer !== 'function' || typeof Uint8Array === 'undefined') return Promise.reject(safeError('Runtime binary responses unavailable'));
    return response.arrayBuffer().then(function (buffer) {
      if (buffer.byteLength > 4096) throw safeError('Media verification response exceeds size limit');
      var bytes = new Uint8Array(buffer), data = [];
      for (var i = 0; i < bytes.length; i++) data.push(bytes[i]);
      return { body: '', bytes: bytes.length, data: data };
    });
  }
  if (/windows-1251|cp1251/i.test(options.encoding || contentType) && typeof response.arrayBuffer === 'function' && typeof Uint8Array !== 'undefined') {
    return response.arrayBuffer().then(function (buffer) { return { body: decode1251(buffer), bytes: buffer.byteLength }; });
  }
  return response.text().then(function (body) {
    if (/windows-1251|cp1251/i.test(options.encoding || contentType) && /\ufffd/.test(body)) throw safeError('This runtime cannot decode the website charset');
    return { body: body, bytes: byteLength(body) };
  });
}

function byteLength(value) {
  var bytes = 0;
  for (var i = 0; i < value.length && bytes <= MAX_BYTES; i++) {
    var ch = value.charCodeAt(i);
    if (ch < 128) bytes++;
    else if (ch < 2048) bytes += 2;
    else if (ch >= 55296 && ch <= 56319 && i + 1 < value.length && value.charCodeAt(i + 1) >= 56320 && value.charCodeAt(i + 1) <= 57343) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

function request(url, options) {
  options = options || {};
  if (!/^https?:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/i.test(url)) return Promise.reject(safeError('Unsupported request URL'));
  var site = u.origin(url);
  var state = options.session || session();
  var method = String(options.method || (options.body !== undefined ? 'POST' : 'GET')).toUpperCase();
  var timeout = Math.min(Math.max(Number(options.timeout) || 12000, 1), 12000);
  var headers = {
    'User-Agent': USER_AGENT,
    Accept: options.json ? 'application/json, text/javascript, */*; q=0.01' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8'
  };
  if (options.referer) headers.Referer = options.referer;
  if (options.origin) headers.Origin = options.origin;
  if (options.search) headers['X-Requested-With'] = 'fetch';
  if (options.bearer) headers.Authorization = 'Bearer ' + options.bearer;
  if (options.body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
  Object.keys(options.headers || {}).forEach(function (name) {
    if (/^(?:cookie|host|content-length|connection|proxy-authorization)$/i.test(name)) return;
    headers[name] = String(options.headers[name]);
  });

  function blocked(message) {
    state.blocked[site] = message;
    return safeError(message, true);
  }

  function attempt(number) {
    if (state.blocked[site]) return Promise.reject(safeError(state.blocked[site], true));
    var remaining = state.deadline - Date.now();
    if (remaining <= 0) return Promise.reject(safeError('Lookup time budget exhausted: ' + site));
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    var finished = false;
    return new Promise(function (resolve, reject) {
      function finish(error, value) {
        if (finished) return;
        finished = true;
        if (timer !== null && typeof clearTimeout === 'function') clearTimeout(timer);
        if (error) reject(error); else resolve(value);
      }
      if (typeof setTimeout === 'function') {
        timer = setTimeout(function () {
          finish(safeError('Request timed out: ' + site, false, true));
          if (controller) controller.abort();
        }, Math.min(timeout, remaining));
      }
      var init = { method: method, headers: headers, credentials: 'same-origin' };
      if (options.body !== undefined) init.body = options.body;
      if (controller) init.signal = controller.signal;
      Promise.resolve().then(function () { return fetch(url, init); }).then(function (response) {
        if (finished) return;
        var mitigation = response.headers && typeof response.headers.get === 'function' ? response.headers.get('cf-mitigated') : '';
        if (response.status === 403 || response.status === 429 || response.status === 451) throw blocked('Site access blocked (HTTP ' + response.status + '): ' + site);
        if (mitigation === 'challenge') throw blocked('Cloudflare challenge: ' + site);
        if (!response.status) throw safeError('Network request failed: ' + site, false, true);
        return readBody(response, options).then(function (result) {
          if (finished) return;
          var body = result.body;
          if (result.bytes >= MAX_BYTES) throw safeError('Response reaches TV size limit: ' + site);
          if (/<title[^>]*>\s*(?:Just a moment|Attention Required|Проверяем, что вы не бот)/i.test(body) || /cf-browser-verification|class=["']cf-turnstile|id=["']anubis_challenge/i.test(body)) throw blocked('Website verification required: ' + site);
          if (!response.ok) throw safeError('HTTP ' + response.status + ': ' + site, false, [502, 503, 504].indexOf(response.status) !== -1);
          var value = body;
          if (options.json) {
            try { value = JSON.parse(body); } catch (ignored) { throw safeError('Invalid JSON response: ' + site); }
          }
          if (options.responseInfo) value = {
            body: value, status: response.status, finalUrl: response.url || url,
            contentType: response.headers && typeof response.headers.get === 'function' ? response.headers.get('content-type') || '' : '',
            contentLength: response.headers && typeof response.headers.get === 'function' ? Number(response.headers.get('content-length')) || 0 : 0,
            contentRange: response.headers && typeof response.headers.get === 'function' ? response.headers.get('content-range') || '' : '',
            receivedBytes: result.bytes, data: result.data || []
          };
          finish(null, value);
        });
      }).catch(function (error) {
        finish(error && error.providerSafe ? error : safeError('Network request failed: ' + site, false, true));
      });
    }).catch(function (error) {
      // One GET retry for a transport failure or a temporary upstream outage.
      // Never retry access restrictions, verification pages, or malformed data.
      if (method === 'GET' && number === 0 && error.transient && state.deadline - Date.now() >= timeout) return attempt(1);
      throw error;
    });
  }
  return attempt(0);
}

module.exports = { request: request, USER_AGENT: USER_AGENT, session: session };

},
"filmix": function(module, exports, require) {
'use strict';
var u = require("utils");

// Filmix publishes this mobile API over HTTP. Guest requests contain no account
// token, password, cookies, or TMDB key. Paid/account streams are not requested.
var API = 'http://filmixapp.cyou/api/v2';
var USER_AGENT = 'okhttp/4.9.2';
var MAX_STREAMS = 8;
var GUEST_QUALITY = 480;

function safeError(message) {
  var error = new Error('Filmix: ' + message);
  error.providerSafe = true;
  return error;
}

function deviceId() {
  var value = '';
  for (var i = 0; i < 16; i++) value += Math.floor(Math.random() * 16).toString(16);
  return value;
}

function apiUrl(path, id, values) {
  var params = {
    user_dev_id: id,
    user_dev_name: 'Russian Cinema',
    user_dev_vendor: 'Samsung',
    user_dev_os: 'Tizen',
    user_dev_apk: '2.0.9'
  };
  Object.keys(values || {}).forEach(function (name) { params[name] = values[name]; });
  return API + '/' + path + '?' + u.form(params);
}

function isSeries(item) {
  return Number(item.section) === 7 || !!(item.serial_stats && !Array.isArray(item.serial_stats)) ||
    !!(item.last_episode && item.last_episode.post_id);
}

function imdbId(item) {
  var value = String(item.imdb_id || item.imdb || '');
  return /^tt\d{7,10}$/.test(value) ? value : '';
}

function matchScore(item, meta) {
  if (!item || !/^\d+$/.test(String(item.id || ''))) return -1;
  if (isSeries(item) !== (meta.type === 'tv')) return -1;
  var wanted = [u.normalize(meta.title), u.normalize(meta.originalTitle)].filter(Boolean);
  var names = [u.normalize(item.title), u.normalize(item.original_title)].filter(Boolean);
  var exactImdb = !!(meta.imdb && imdbId(item) === meta.imdb);
  var exactTitle = wanted.some(function (title) { return names.indexOf(title) !== -1; });
  if (!exactImdb && !exactTitle) return -1;
  var year = Number(item.year) || 0;
  var distance = meta.year && year ? Math.abs(Number(meta.year) - year) : null;
  // An IMDb match identifies the work; title-only remakes must agree on year.
  if (!exactImdb && distance !== null && distance > 1) return -1;
  return (exactImdb ? 200 : 100) + (distance === 0 ? 20 : distance === 1 ? 5 : 0);
}

function selectResult(results, meta) {
  if (!Array.isArray(results)) return null;
  var best = null, score = -1;
  results.slice(0, 100).forEach(function (item) {
    var next = matchScore(item, meta);
    if (next > score) { best = item; score = next; }
  });
  return best;
}

function search(meta, id, client) {
  var queries = [meta.originalTitle, meta.title].filter(function (query, index, all) {
    return query && all.indexOf(query) === index;
  }).slice(0, 2);
  function next(index) {
    if (index >= queries.length) return Promise.resolve(null);
    return client.request(apiUrl('search', id, { story: queries[index] }), {
      json: true, headers: { 'User-Agent': USER_AGENT }, timeout: 10000
    }).then(function (results) {
      return selectResult(results, meta) || next(index + 1);
    });
  }
  return next(0);
}

function qualities(link, declared) {
  var bracket = /\[([\d,]+)\]/.exec(link);
  var list = Array.isArray(declared) ? declared : bracket ? bracket[1].split(',') : [];
  var unique = {};
  return list.map(Number).filter(function (value) {
    if (value <= 0 || value > GUEST_QUALITY || unique[value]) return false;
    unique[value] = true;
    return true;
  }).sort(function (a, b) { return b - a; });
}

function mediaLink(link, declared) {
  if (typeof link !== 'string' || link.length > 8192 || /[\s\x00-\x1f\x7f]/.test(link)) return null;
  var available = qualities(link, declared), quality = available[0];
  var hasPlaceholder = /\[[\d,]+\]|%s/.test(link);
  if (hasPlaceholder) {
    if (!quality) return null;
    link = link.replace(/\[[\d,]+\]/g, String(quality)).replace(/%s/g, String(quality));
  } else {
    var namedQuality = /(?:_|[.\/-])(\d{3,4})(?:p)?\.(?:mp4|m3u8)(?:[?#]|$)/i.exec(link);
    if (namedQuality) quality = Number(namedQuality[1]);
    // Do not mislabel an unknown or premium stream as an unrestricted guest file.
    if (!quality || quality > GUEST_QUALITY) return null;
  }
  if (!/^https?:\/\/[^\s/?#@]+\/[^\s]*\.(?:mp4|m3u8)(?:[?#][^\s]*)?$/i.test(link)) return null;
  return { url: link, quality: quality + 'p', type: /\.m3u8(?:[?#]|$)/i.test(link) ? 'hls' : 'mp4' };
}

function candidates(post, meta, season, episode) {
  var links = post && post.player_links;
  if (!links || typeof links !== 'object') return [];
  var selected = [];
  if (meta.type === 'movie') {
    if (!Array.isArray(links.movie)) return [];
    selected = links.movie.slice(0, 24).map(function (entry) {
      return { entry: entry, voice: entry.translation || 'Russian voiceover' };
    });
  } else {
    var seasons = links.playlist;
    var translations = seasons && !Array.isArray(seasons) && seasons[String(Number(season))];
    if (!translations || typeof translations !== 'object' || Array.isArray(translations)) return [];
    Object.keys(translations).slice(0, 24).forEach(function (voice) {
      var episodes = translations[voice];
      var entry = Array.isArray(episodes) ? episodes[Number(episode) - 1] : episodes && episodes[String(Number(episode))];
      if (entry) selected.push({ entry: entry, voice: voice });
    });
  }
  var seen = {};
  return selected.map(function (item) {
    var entry = item.entry;
    if (!entry || typeof entry !== 'object') return null;
    var media = mediaLink(entry.link, entry.qualities);
    if (!media || seen[media.url]) return null;
    seen[media.url] = true;
    media.title = 'Filmix | ' + u.text(item.voice).slice(0, 160) + ' | Guest';
    media.headers = { 'User-Agent': USER_AGENT, Accept: '*/*' };
    return media;
  }).filter(Boolean).slice(0, MAX_STREAMS);
}

function resolve(meta, season, episode, cfg, client) {
  if (!meta || ['movie', 'tv'].indexOf(meta.type) === -1) return Promise.resolve([]);
  if (meta.type === 'tv' && (!/^\d+$/.test(String(season)) || !/^\d+$/.test(String(episode)) || Number(episode) < 1)) return Promise.resolve([]);
  // Never downgrade account credentials to this unencrypted public guest API.
  if (cfg && cfg.filmixToken) return Promise.reject(safeError('Account tokens are unavailable on the public guest API.'));
  var id = deviceId();
  return search(meta, id, client).then(function (result) {
    if (!result) return [];
    return client.request(apiUrl('post/' + result.id, id), {
      json: true, headers: { 'User-Agent': USER_AGENT }, timeout: 10000
    }).then(function (post) {
      if (!post || Number(post.id) !== Number(result.id)) return [];
      // Recheck the returned metadata instead of trusting a stale search result.
      if (matchScore(post, meta) < 0) return [];
      return candidates(post, meta, season, episode);
    });
  });
}

module.exports = { resolve: resolve, matchScore: matchScore, selectResult: selectResult, mediaLink: mediaLink, candidates: candidates };

},
"seasonvar": function(module, exports, require) {
'use strict';
var u = require("utils");

// Parse only published page data. No script from Seasonvar is executed.
function cleanHtml(html) { return String(html || '').replace(/<!--[\s\S]*?-->/g, ''); }
function titleKey(value) {
  return u.normalize(u.text(value).replace(/^\s*(?:Сериал|Сериалы)\s+/i, '').replace(/\s+\d+\s*сезон(?:\s|$).*$/i, '').replace(/\s+онлайн\s*$/i, ''));
}
function metaKeys(meta) {
  var keys = [];
  [meta.originalTitle, meta.title].forEach(function (value) {
    var key = titleKey(value);
    if (key && keys.indexOf(key) < 0) keys.push(key);
  });
  return keys;
}
function knownTitle(titles, meta) {
  var keys = metaKeys(meta);
  return titles.some(function (title) { return keys.indexOf(titleKey(title)) >= 0; });
}
function localPage(value, site) {
  var url = u.absolute(value, site + '/');
  return u.sameSite(url, site) && /^\/serial-\d+-[^?#]*\.html$/i.test(url.slice(u.origin(url).length)) && !/[\\\r\n]/.test(url) ? url : '';
}
function parseSearch(html, site, meta) {
  var results = [], seen = {}, re = /<div\b[^>]*class\s*=\s*["'][^"']*\bpgs-search-info\b[^"']*["'][^>]*>([\s\S]*?)<\/div\s*>/gi, match;
  html = cleanHtml(html);
  while ((match = re.exec(html)) && results.length < 12) {
    var links = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, link, titles = [], url = '';
    while ((link = links.exec(match[1]))) {
      var next = localPage(u.attr(link[1], 'href'), site);
      if (!next || (url && next !== url)) continue;
      url = next;
      titles.push(u.text(link[2]));
    }
    if (url && !seen[url] && knownTitle(titles, meta)) {
      seen[url] = true;
      results.push({ url: url, titles: titles });
    }
  }
  return results;
}
function seasonNumber(value) {
  var match = /(?:^|\s)(\d+)\s*сезон(?:\s|$|[<(])/i.exec(u.text(value));
  return match ? parseInt(match[1], 10) : 1;
}
function parsePage(html, site, pageUrl) {
  html = cleanHtml(html);
  var heading = u.classText(html, 'pgs-sinfo-title');
  var original = /Оригинал\s*:\s*<span\b[^>]*>([\s\S]*?)<\/span\s*>/i.exec(html);
  var year = /Вышел\s*:\s*<span\b[^>]*>\s*((?:19|20)\d{2})\s*<\/span\s*>/i.exec(html);
  var titles = heading.replace(/^\s*Сериал\s+/i, '').replace(/\s+онлайн\s*$/i, '').split('/');
  if (original) titles.push(u.text(original[1]));
  var section = /<div\b[^>]*class\s*=\s*["'][^"']*\bpgs-seaslist\b[^"']*["'][^>]*>([\s\S]*?)<\/div\s*>/i.exec(html);
  var seasons = {}, links = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, link;
  if (section) {
    while ((link = links.exec(section[1]))) {
      var url = localPage(u.attr(link[1], 'href'), site);
      if (url) seasons[seasonNumber(link[2])] = url;
    }
  }
  if (!Object.keys(seasons).length && heading && localPage(pageUrl, site)) seasons[seasonNumber(heading)] = pageUrl;
  return { titles: titles, year: year ? parseInt(year[1], 10) : 0, season: seasonNumber(heading), seasons: seasons };
}
function stringData(value) {
  return value.replace(/\\(u[\da-fA-F]{4}|x[\da-fA-F]{2}|[\\/"'nrt])/g, function (all, escaped) {
    if (escaped.charAt(0) === 'u' || escaped.charAt(0) === 'x') return String.fromCharCode(parseInt(escaped.slice(1), 16));
    return { n: '\n', r: '\r', t: '\t' }[escaped] || escaped;
  });
}
function playlists(html, site) {
  html = cleanHtml(html);
  var urls = {}, labels = {}, match, initial = /\bvar\s+pl\s*=\s*\{([\s\S]{0,12000}?)\}\s*;/i.exec(html);
  var props = /["'](\d+)["']\s*:\s*(["'])((?:\\.|[^\\])*?)\2/g;
  if (initial) while ((match = props.exec(initial[1]))) urls[match[1]] = stringData(match[3]);
  var assignments = /\bpl\s*\[\s*["']?(\d+)["']?\s*\]\s*=\s*(["'])((?:\\.|[^\\])*?)\2\s*;/g;
  while ((match = assignments.exec(html))) urls[match[1]] = stringData(match[3]);
  var items = /<li\b([^>]*)>([\s\S]*?)<\/li\s*>/gi;
  while ((match = items.exec(html))) {
    var id = u.attr(match[1], 'data-translate');
    if (/^\d+$/.test(id)) labels[id] = u.text(match[2]);
  }
  return Object.keys(urls).map(function (id) {
    var url = u.absolute(urls[id], site + '/');
    var title = labels[id] || (id === '0' ? 'Стандартный' : 'Перевод ' + id);
    if (!u.sameSite(url, site) || !/^\/playls2?\//i.test(url.slice(u.origin(url).length)) || /[\\\r\n]/.test(url) || /трейлер|trailer/i.test(title) || id === '68') return null;
    return { url: url, title: title, id: id };
  }).filter(function (item) { return !!item; }).slice(0, 4);
}
function base64(value) {
  if (!value || value.length > 32768 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) return '';
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', out = '', bits = 0, buffer = 0;
  for (var i = 0; i < value.length; i++) {
    if (value.charAt(i) === '=') break;
    var n = alphabet.indexOf(value.charAt(i));
    if (n < 0) return '';
    buffer = (buffer << 6) | n;
    bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((buffer >> bits) & 255); }
  }
  try {
    return decodeURIComponent(out.replace(/[\s\S]/g, function (character) { return '%' + ('0' + character.charCodeAt(0).toString(16)).slice(-2); }));
  } catch (ignore) { return ''; }
}
function decodedFile(value) {
  value = String(value || '');
  if (value.slice(0, 2) === '#2') return base64(value.slice(2).split('//b2xvbG8=').join(''));
  return value.charAt(0) === '#' ? '' : value;
}
function media(value, site) {
  var url = u.absolute(value, site + '/');
  return !/[\s\\]/.test(url) && /^https?:\/\/[^/?#@\s]+\/[^\r\n\\]*\.(?:mp4|m3u8)(?:[?#][^\r\n\\]*)?$/i.test(url) ? url : '';
}
function subtitles(value, site) {
  value = decodedFile(value);
  if (!value) return [];
  var tracks = [], re = /\[([^\]]{1,40})\]([^\[]+)/g, match;
  while ((match = re.exec(value)) && tracks.length < 8) tracks.push({ label: u.text(match[1]), file: match[2].trim().replace(/,+$/, '') });
  if (!tracks.length) tracks.push({ label: '', file: value });
  var seen = {}, out = [];
  tracks.forEach(function (track) {
    var url = u.absolute(track.file, site + '/');
    if (seen[url] || /[\s\\]/.test(url) || !/^https?:\/\/[^/?#@\s]+\/[^\r\n\\]*\.(?:vtt|srt)(?:[?#][^\r\n\\]*)?$/i.test(url)) return;
    seen[url] = true;
    var label = track.label, lang = /^(?:ru|rus|русский|russian)$/i.test(label) ? 'ru' : /^(?:en|eng|английский|english)$/i.test(label) ? 'en' : /^[a-z]{2,3}$/i.test(label) ? label.toLowerCase() : 'und';
    out.push({ url: url, lang: lang, label: lang === 'ru' ? 'Русский' : lang === 'en' ? 'English' : label || 'Subtitles' });
  });
  return out;
}
function episodeStreams(playlist, episode, translation, site, pageUrl) {
  if (!Array.isArray(playlist) || playlist.length > 1000) return [];
  var selected = playlist.filter(function (entry) { return entry && String(entry.id) === String(episode); });
  if (selected.length !== 1) return [];
  var item = selected[0], file = decodedFile(item.file), out = [], seen = {};
  var voice = u.text(String(item.title || '').split(/<br\s*\/?\s*>/i).slice(1).join(' ')) || translation.title;
  var qualities = [], re = /\[([^\]]{1,32})\]([^\[]+)/g, match;
  while ((match = re.exec(file))) qualities.push({ quality: match[1], file: match[2].trim().replace(/,+$/, '') });
  if (!qualities.length) qualities.push({ quality: '', file: file });
  qualities.slice(0, 3).forEach(function (entry) {
    var url = media(entry.file, site);
    if (!url || seen[url]) return;
    seen[url] = true;
    var q = /(?:^|\D)(2160|1080|720|480|360)(?:p|\D|$)/i.exec(entry.quality);
    var candidate = { url: url, quality: q ? q[1] + 'p' : '', type: /\.m3u8(?:[?#]|$)/i.test(url) ? 'hls' : 'mp4', title: 'Seasonvar · ' + voice, headers: { Referer: pageUrl, Origin: site } };
    var tracks = subtitles(item.subtitle, site);
    if (tracks.length) candidate.subtitles = tracks;
    out.push(candidate);
  });
  return out;
}
function resolve(meta, season, episode, cfg, client) {
  season = Number(season);
  episode = Number(episode);
  if (!meta || meta.type !== 'tv' || !isFinite(Number(season)) || season < 1 || Math.floor(season) !== Number(season) || !isFinite(Number(episode)) || episode < 1 || Math.floor(episode) !== Number(episode)) return Promise.resolve([]);
  var site = u.siteUrl(cfg && cfg.seasonvarSite) || 'https://seasonvar.ru';
  var queries = [];
  [meta.originalTitle, meta.title].forEach(function (value) { if (value && queries.indexOf(value) < 0 && String(value).length <= 160) queries.push(value); });
  if (!queries.length) return Promise.resolve([]);
  function search(index) {
    if (index >= Math.min(queries.length, 2)) return Promise.resolve([]);
    return client.request(site + '/search?q=' + encodeURIComponent(queries[index]), { referer: site + '/', timeout: 10000 }).then(function (html) {
      var results = parseSearch(html, site, meta);
      return results.length ? results.slice(0, 2) : search(index + 1);
    });
  }
  function candidate(result) {
    return client.request(result.url, { referer: site + '/', timeout: 10000 }).then(function (html) {
      var page = parsePage(html, site, result.url);
      if (!knownTitle(page.titles, meta) || !page.seasons[season]) return [];
      var wantedUrl = page.seasons[season], firstUrl = page.seasons[1];
      if (!firstUrl) return [];
      function pageBody(url) { return url === result.url ? Promise.resolve(html) : client.request(url, { referer: result.url, timeout: 10000 }); }
      return Promise.all([pageBody(wantedUrl), wantedUrl === firstUrl ? Promise.resolve(null) : pageBody(firstUrl)]).then(function (bodies) {
        var selected = parsePage(bodies[0], site, wantedUrl), first = parsePage(bodies[1] || bodies[0], site, firstUrl);
        if (!knownTitle(selected.titles, meta) || selected.season !== Number(season) || first.season !== 1 || !knownTitle(first.titles, meta)) return [];
        if (meta.year && first.year && Math.abs(Number(meta.year) - first.year) > 1) return [];
        var sources = playlists(bodies[0], site);
        return Promise.all(sources.map(function (translation) {
          return client.request(translation.url, { json: true, referer: wantedUrl, timeout: 10000 }).then(function (playlist) {
            return episodeStreams(playlist, episode, translation, site, wantedUrl);
          }).catch(function (error) { if (error && error.siteBlocked) throw error; return []; });
        })).then(function (lists) { var out = []; lists.forEach(function (list) { out = out.concat(list); }); return out; });
      });
    });
  }
  return search(0).then(function (results) {
    function next(index) {
      if (index >= results.length) return Promise.resolve([]);
      return candidate(results[index]).then(function (streams) { return streams.length ? streams : next(index + 1); });
    }
    return next(0);
  });
}

module.exports = { resolve: resolve, parseSearch: parseSearch, parsePage: parsePage, playlists: playlists, decodedFile: decodedFile, episodeStreams: episodeStreams };

},
"index": function(module, exports, require) {
'use strict';
var u = require("utils");
var http = require("http");
var filmix = require("filmix");
var seasonvar = require("seasonvar");
var DEFAULT_SEASONVAR = 'https://seasonvar.ru';

function settings() {
  var root = typeof globalThis !== 'undefined' ? globalThis : {};
  var saved = root.SCRAPER_SETTINGS || {};
  return {
    seasonvarSite: u.siteUrl(saved.seasonvarSite || DEFAULT_SEASONVAR) || DEFAULT_SEASONVAR,
    key: String(saved.tmdbApiKey || root.TMDB_API_KEY || '').trim(),
    deadline: Date.now() + 50000
  };
}

function metadata(id, type, cfg) {
  if (!cfg.key) return Promise.reject(new Error('TMDB key unavailable. Enter your own key in Russian Cinema settings.'));
  var token = cfg.key.length > 40;
  var url = 'https://api.themoviedb.org/3/' + type + '/' + encodeURIComponent(id) + '?language=ru-RU&append_to_response=external_ids';
  if (!token) url += '&api_key=' + encodeURIComponent(cfg.key);
  return http.request(url, { json: true, bearer: token ? cfg.key : '', session: http.session(cfg.deadline) }).then(function (data) {
    var imdb = data.external_ids && data.external_ids.imdb_id || data.imdb_id || '';
    return {
      type: type, title: data.title || data.name || '', originalTitle: data.original_title || data.original_name || '',
      year: Number(String(data.release_date || data.first_air_date || '').slice(0, 4)) || null,
      imdb: /^tt\d{7,10}$/.test(imdb) ? imdb : ''
    };
  });
}

function client(cfg) {
  var state = http.session(cfg.deadline);
  return { request: function (url, options) {
    options = options || {};
    options.session = state;
    return http.request(url, options);
  } };
}

function source(label, module, meta, season, episode, cfg) {
  return Promise.resolve().then(function () {
    return module.resolve(meta, season, episode, cfg, client(cfg));
  }).then(function (streams) {
    return (Array.isArray(streams) ? streams : []).slice(0, 8).map(function (stream) { stream.sourceName = label; return stream; });
  }).catch(function (error) {
    console.warn('[Russian Cinema / ' + label + '] ' + (error && error.providerSafe ? error.message : 'Source resolution failed.'));
    return [];
  });
}

function verify(stream, cfg) {
  if (!stream || !/^https?:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/i.test(String(stream.url || ''))) return Promise.resolve(null);
  var hls = stream.type === 'hls' || /\.m3u8(?:[?#]|$)/i.test(stream.url);
  var headers = {};
  Object.keys(stream.headers || {}).forEach(function (name) { headers[name] = stream.headers[name]; });
  // Nuvio TV's native bridge maps HEAD to GET. A small byte range avoids
  // requesting the video body while checking that an MP4 URL is still usable.
  if (!hls) headers.Range = 'bytes=0-63';
  var opts = { session: http.session(cfg.deadline), headers: headers, responseInfo: true, method: 'GET', binary: !hls };
  return http.request(stream.url, opts).then(function (response) {
    if (hls) {
      if (!/^\s*#EXTM3U/.test(response.body)) return null;
    } else {
      var range = /^bytes\s+0-(\d+)\/(\d+)$/i.exec(response.contentRange);
      var data = response.data || [];
      if (response.status !== 206 || !range || Number(range[1]) + 1 !== data.length || Number(range[2]) <= data.length || data.length < 16 || data.length > 64) return null;
      if (!/^(?:video\/|application\/(?:octet-stream|mp4))/i.test(response.contentType) || String.fromCharCode.apply(null, data.slice(4, 8)) !== 'ftyp') return null;
    }
    stream.type = hls ? 'hls' : 'mp4';
    return stream;
  }).catch(function () { return null; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var type = ['tv', 'series', 'show'].indexOf(mediaType) !== -1 ? 'tv' : mediaType;
  if (!/^\d+$/.test(String(tmdbId)) || ['movie', 'tv'].indexOf(type) === -1) return Promise.resolve([]);
  if (type === 'tv' && (!/^\d+$/.test(String(season)) || !/^\d+$/.test(String(episode)) || Number(season) < 0 || Number(episode) < 1)) return Promise.resolve([]);
  if (type === 'tv') { season = Number(season); episode = Number(episode); }
  var cfg = settings();
  return metadata(String(tmdbId), type, cfg).then(function (meta) {
    return Promise.all([
      source('Filmix', filmix, meta, season, episode, cfg),
      type === 'tv' ? source('Seasonvar', seasonvar, meta, season, episode, cfg) : Promise.resolve([])
    ]).then(function (results) {
      var seen = {};
      var candidates = results[0].concat(results[1]).filter(function (stream) {
        if (!stream || !stream.url || seen[stream.url]) return false;
        seen[stream.url] = true; return true;
      });
      return Promise.all(candidates.map(function (stream) { return verify(stream, cfg); }));
    }).then(function (streams) {
      return streams.filter(Boolean).map(function (stream) {
        var headers = stream.headers || {};
        var subtitles = (stream.subtitles || []).filter(function (sub) { return /^https?:\/\//i.test(String(sub.url || '')); }).map(function (sub, index) {
          return { id: sub.id || 'russian-cinema-' + index, url: sub.url, language: sub.language || sub.lang || 'ru', name: sub.name || sub.label || sub.language || 'Subtitle', headers: sub.headers || headers };
        });
        return {
          name: 'Russian Cinema', provider: 'Russian Cinema',
          title: meta.title + (type === 'tv' ? ' S' + season + 'E' + episode : '') + ' | ' + stream.sourceName + (stream.title ? ' | ' + String(stream.title).replace(/^(?:Filmix|Seasonvar)\s*[|·]\s*/i, '') : ''),
          url: stream.url, quality: stream.quality || 'Auto', type: stream.type, headers: headers, subtitles: subtitles
        };
      });
    });
  }).catch(function (error) {
    console.warn('[Russian Cinema] ' + (error && error.providerSafe ? error.message : !cfg.key ? 'TMDB key unavailable. Enter your own key in Russian Cinema settings.' : 'Metadata lookup failed.'));
    return [];
  });
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'Russian Cinema' },
    { type: 'text', key: 'seasonvarSite', label: 'Seasonvar website', defaultValue: DEFAULT_SEASONVAR, description: 'Update this HTTPS origin if Seasonvar moves.' },
    { type: 'text', key: 'tmdbApiKey', label: 'TMDB API key (optional)', isPassword: true, defaultValue: '', description: 'Uses Nuvio\'s key when available. Otherwise enter your own v3 key or API Read Access Token.' }
  ]);
}

module.exports = { getStreams: getStreams, onSettings: onSettings };

}
};
var cache = {};
function load(id) {
 if (cache[id]) return cache[id].exports;
 if (!modules[id]) throw new Error("Unknown module: " + id);
 var local = { exports: {} }; cache[id] = local;
 modules[id](local, local.exports, load);
 return local.exports;
}
module.exports = load("index");
}());
