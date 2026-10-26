/* Russian Cinema for Nuvio v1.1.1
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




Russian Cinema is an independent Nuvio provider. It is not affiliated with Filmix, Seasonvar, Collaps, KinoPub, HDVB, Nuvio or TMDB.

Protocol references:

- Filmix mobile API conventions: https://github.com/n0madic/go-filmix (MIT, Copyright (c) 2026 nomadic). This plugin implements an independent guest client and does not include that Go library or its website decoder.
- Seasonvar background reference: https://github.com/googoid/seasonvar-client. The extractor was independently implemented against current public HTML and playlist JSON; no library code is distributed.
- Collaps public player structure: https://github.com/lampac-nextgen/lampac/blob/main/Modules/OnlineRUS/Collaps/Services/Invoke.cs. This plugin independently parses inert player data; no Lampac source is included.
- FilmixTV API conventions: https://github.com/lampac-nextgen/lampac/blob/main/Modules/OnlinePaid/Filmix/Controllers/FilmixTV.cs. The disabled account adapter is independently implemented; no Lampac source or credentials are included.
- KinoPub official API documentation: https://kinoapi.com/authentication.html and https://kinoapi.com/api_video.html. Account API handling is independently implemented without borrowed client secrets or access tokens.
- HDVB partner/API background: https://hdvb-balanser.video/ and https://github.com/lampac-nextgen/lampac/blob/main/Modules/OnlineRUS/HDVB/Controller.cs. The optional adapter is independently implemented; no Lampac source or partner keys are included.

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
function session(deadline) { return { deadline: deadline || Date.now() + 50000, blocked: {}, pending: [], cancelled: false }; }
function cancel(state) {
  if (!state || state.cancelled) return;
  state.cancelled = true;
  (state.pending || []).slice().forEach(function (stop) { stop(); });
}

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
    if (state.cancelled) return Promise.reject(safeError('Lookup completed'));
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
        var pending = state.pending || [], index = pending.indexOf(stop);
        if (index >= 0) pending.splice(index, 1);
        if (error) reject(error); else resolve(value);
      }
      function stop() {
        finish(safeError('Lookup completed'));
        if (controller) controller.abort();
      }
      if (!state.pending) state.pending = [];
      state.pending.push(stop);
      if (typeof setTimeout === 'function') {
        timer = setTimeout(function () {
          finish(safeError('Request timed out: ' + site, false, true));
          if (controller) controller.abort();
        }, Math.min(timeout, remaining));
      }
      var init = { method: method, headers: headers, credentials: 'same-origin' };
      if (options.body !== undefined) init.body = options.body;
      if (controller) init.signal = controller.signal;
      Promise.resolve().then(function () { if (finished) return null; return fetch(url, init); }).then(function (response) {
        if (finished) return;
        var mitigation = response.headers && typeof response.headers.get === 'function' ? response.headers.get('cf-mitigated') : '';
        if (response.status === 403 || response.status === 429 || response.status === 451) throw blocked('Site access blocked (HTTP ' + response.status + '): ' + site);
        if (mitigation === 'challenge') throw blocked('Cloudflare challenge: ' + site);
        if (!response.status) throw safeError('Network request failed: ' + site, false, true);
        return readBody(response, options).then(function (result) {
          if (finished) return;
          var body = result.body;
          if (result.bytes >= MAX_BYTES) throw safeError('Response reaches TV size limit: ' + site);
          if (body.length < 512 && /^(?:Технические работы|Technical maintenance|Temporarily unavailable)[.!\s]*$/i.test(u.text(body))) throw blocked('Website maintenance: ' + site);
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
      if (!state.cancelled && method === 'GET' && number === 0 && error.transient && state.deadline - Date.now() >= timeout) return attempt(1);
      throw error;
    });
  }
  return attempt(0);
}

module.exports = { request: request, USER_AGENT: USER_AGENT, session: session, cancel: cancel };

},
"media": function(module, exports, require) {
'use strict';
var u = require("utils");

function codecName(value) {
  if (/^avc[13]/i.test(value)) return 'H.264';
  if (/^(?:hvc1|hev1|hevc)/i.test(value)) return 'HEVC';
  if (/^(?:vp09|vp9)/i.test(value)) return 'VP9';
  if (/^av01/i.test(value)) return 'AV1';
  if (/^mp4a/i.test(value)) return 'AAC';
  if (/^opus/i.test(value)) return 'Opus';
  if (/^ac-3/i.test(value)) return 'AC-3';
  if (/^ec-3/i.test(value)) return 'E-AC-3';
  if (/^flac/i.test(value)) return 'FLAC';
  return '';
}
function codecs(values) {
  var found = [];
  values.forEach(function (value) {
    String(value || '').split(',').forEach(function (item) {
      var name = codecName(item.trim());
      if (name && found.indexOf(name) < 0) found.push(name);
    });
  });
  return found.join(' + ');
}
function dash(body) {
  if (typeof body !== 'string' || body.length > 1024 * 1024 || !/<(?:[\w.-]+:)?MPD\b/i.test(body)) return null;
  body = body.replace(/<!--[\s\S]*?-->/g, '');
  if (!/<(?:[\w.-]+:)?Period\b/i.test(body) || !/<\/(?:[\w.-]+:)?MPD\s*>\s*$/i.test(body)) return null;
  // This provider only exposes ordinary clear streams, not protected manifests.
  if (/<(?:[\w.-]+:)?ContentProtection\b|default_KID|<(?:[\w.-]+:)?pssh\b/i.test(body)) return null;
  var tags = /<(\/?)(?:[\w.-]+:)?(Representation|AdaptationSet)\b([^>]*)>/gi, match;
  var height = 0, width = 0, values = [], representations = 0, parent = {};
  while ((match = tags.exec(body))) {
    var adaptation = match[2].toLowerCase() === 'adaptationset';
    if (match[1]) { if (adaptation) parent = {}; continue; }
    var h = Number(u.attr(match[3], 'height')) || Number(u.attr(match[3], 'maxHeight')) || 0;
    var w = Number(u.attr(match[3], 'width')) || Number(u.attr(match[3], 'maxWidth')) || 0;
    var codec = u.attr(match[3], 'codecs');
    if (adaptation) { parent = { height: h, width: w, codec: codec }; continue; }
    representations++;
    h = h || parent.height || 0; w = w || parent.width || 0;
    if (h > height) { height = h; width = w; }
    values.push(codec || parent.codec);
  }
  if (!representations || !height || height > 8640 || width > 15360) return null;
  return { quality: height + 'p', codecSummary: codecs(values), height: height, width: width };
}
function hls(body) {
  if (typeof body !== 'string' || body.length > 1024 * 1024 || !/^\s*#EXTM3U/.test(body)) return null;
  // AES-128 HLS can be played by the native player. DRM key formats cannot.
  var keys = /#EXT-X-(?:SESSION-)?KEY:([^\r\n]*)/gi, key;
  while ((key = keys.exec(body))) {
    if (/\bMETHOD=SAMPLE-AES(?:-CTR)?\b/i.test(key[1])) return null;
    var format = /\bKEYFORMAT=(?:"([^"]+)"|'([^']+)'|([^,\s]+))/i.exec(key[1]);
    if (format && String(format[1] || format[2] || format[3]).toLowerCase() !== 'identity') return null;
  }
  var lines = body.split(/\r?\n/), playable = false;
  for (var i = 0; i < lines.length; i++) {
    if (!/^\s*#EXT(?:INF:|-X-STREAM-INF:)/i.test(lines[i])) continue;
    var next = i + 1;
    while (next < lines.length && (!lines[next].trim() || /^\s*#/.test(lines[next]))) next++;
    if (next < lines.length && /^[^#<>\s]+$/.test(lines[next].trim())) { playable = true; break; }
  }
  if (!playable) return null;
  var heights = /\bRESOLUTION=(\d+)x(\d+)/gi, match, height = 0, width = 0, values = [];
  while ((match = heights.exec(body))) if (Number(match[2]) > height) { height = Number(match[2]); width = Number(match[1]); }
  var codec = /\bCODECS="([^"]+)"/gi;
  while ((match = codec.exec(body))) values.push(match[1]);
  return { quality: height ? height + 'p' : '', codecSummary: codecs(values), height: height, width: width };
}
module.exports = { dash: dash, hls: hls };

},
"filmix": function(module, exports, require) {
'use strict';
var u = require("utils");
var media = require("media");

// Filmix publishes this mobile API over HTTP. Guest requests contain no account
// token, password, cookies, or TMDB key. Optional account HLS uses the separate
// fixed HTTPS FilmixTV API below; its bearer token never enters the guest path.
var API = 'http://filmixapp.cyou/api/v2';
var USER_AGENT = 'okhttp/4.9.2';
var MAX_STREAMS = 8;
var GUEST_QUALITY = 480;
var TV_API = 'https://api.filmix.tv/api-fx';
var MAX_ACCOUNT_STREAMS = 2;
// Higher resolutions listed in a guest response can resolve to short preview
// files. Do not infer an account entitlement from a filename or quality list.
// The published mobile API mirrors currently lack a verified HTTPS endpoint;
// the distinct FilmixTV protocol cannot use their mobile device tokens.
var ACCOUNT_UNAVAILABLE = 'Mobile Pro / Pro+ tokens need a verified HTTPS mobile API. FilmixTV account mode also needs safe redirect handling unavailable in this Nuvio runtime. Guest access is limited to 480p.';
var TV_RUNTIME_UNAVAILABLE = 'FilmixTV account mode is unavailable in this Nuvio runtime: redirects can forward its device hash. Guest sources remain available.';

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

function guestResolve(meta, season, episode, client) {
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

function tvItem(item) {
  if (!item || typeof item !== 'object') return null;
  var serial = Number(item.last_season) > 0 || Number(item.last_episode) > 0 || /\/seria\//i.test(String(item.url || ''));
  return {
    id: item.id, title: item.title, original_title: item.original_name || item.original_title,
    year: item.year, section: serial ? 7 : 0, imdb_id: item.imdb_id
  };
}

function tvApi(path, cfg, client) {
  return client.request(TV_API + path, {
    json: true, responseInfo: true, timeout: 10000, bearer: cfg.filmixTvToken, redirect: 'error',
    headers: { 'User-Agent': USER_AGENT, hash: cfg.filmixTvHash }
  }).then(function (response) {
    if (!response || !u.sameSite(response.finalUrl || '', TV_API)) throw safeError('FilmixTV account API response could not be verified.');
    return response.body;
  });
}

function tvSearch(meta, cfg, client) {
  var queries = [meta.originalTitle, meta.title].filter(function (value, index, all) { return value && all.indexOf(value) === index; }).slice(0, 2);
  function next(index) {
    if (index >= queries.length) return Promise.resolve(null);
    return tvApi('/list?search=' + encodeURIComponent(queries[index]) + '&limit=48', cfg, client).then(function (data) {
      var items = data && Array.isArray(data.items) ? data.items.slice(0, 100).map(tvItem).filter(Boolean) : [];
      return selectResult(items, meta) || next(index + 1);
    });
  }
  return next(0);
}

function hlsUrl(value, base) {
  var url = u.absolute(String(value || ''), base || TV_API);
  if (url.length > 8192 || !/^https:\/\/[^\s/?#@]+\/[^\s]*\.m3u8(?:[?#][^\s]*)?$/i.test(url) || u.sameSite(url, TV_API)) return '';
  return url;
}

function accountUrlSafe(url, account) {
  var decoded = String(url || '');
  try { decoded = decodeURIComponent(decoded); } catch (ignored) { return false; }
  var secrets = [account && account.filmixTvToken, account && account.filmixTvHash].filter(Boolean);
  if (secrets.some(function (secret) { return decoded.indexOf(secret) !== -1; })) return false;
  return !/[?&#](?:token|access_token|refresh_token|user_dev_token|api_key|apikey|authorization|auth|bearer|hash|device_hash|password|user_passw|passw)=/i.test(decoded);
}

function tvCandidates(data, meta, season, episode) {
  var voices = [];
  if (meta.type === 'movie') {
    if (!Array.isArray(data)) return [];
    data.slice(0, 24).forEach(function (voice) { voices.push({ name: voice.voiceover, files: voice.files }); });
  } else {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
    Object.keys(data).slice(0, 24).forEach(function (name) {
      var seasons = data[name];
      if (!seasons || typeof seasons !== 'object' || Array.isArray(seasons)) return;
      Object.keys(seasons).slice(0, 100).forEach(function (key) {
        var value = seasons[key];
        if (!value || Number(value.season) !== Number(season) || !value.episodes || typeof value.episodes !== 'object') return;
        var selected = value.episodes['e' + Number(episode)] || value.episodes[String(Number(episode))];
        if (selected && Number(selected.episode) === Number(episode)) voices.push({ name: name, files: selected.files });
      });
    });
  }
  var out = [], seen = {};
  voices.forEach(function (voice) {
    if (!Array.isArray(voice.files)) return;
    voice.files.slice(0, 16).forEach(function (file) {
      var quality = Number(file && file.quality), url = hlsUrl(file && file.url);
      // MP4 filenames can return a premium preview. Account mode deliberately
      // supports only HLS whose complete duration can be checked without video.
      if (!url || quality < 1080 || quality > 2160 || seen[url]) return;
      seen[url] = true;
      out.push({ url: url, quality: quality, voice: u.text(voice.name).slice(0, 160) || 'Russian voiceover' });
    });
  });
  out.sort(function (a, b) { return b.quality - a.quality; });
  var selected = [];
  if (out.length) {
    selected.push(out[0]);
    var fallback = out.filter(function (item) { return item.quality !== out[0].quality; })[0] || out[1];
    if (fallback) selected.push(fallback);
  }
  return selected.slice(0, MAX_ACCOUNT_STREAMS);
}

function vodDuration(body, expected) {
  if (typeof body !== 'string' || !/^\s*#EXTM3U/.test(body) || !/#EXT-X-ENDLIST(?:\s|$)/.test(body) || /#EXT-X-STREAM-INF|#EXT-X-I-FRAME-STREAM-INF/.test(body)) return 0;
  var lines = body.split(/\r?\n/), duration = 0, segments = 0, pending = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim(), value = /^#EXTINF:(\d+(?:\.\d+)?)(?:,|$)/.exec(line);
    if (value) {
      if (pending || Number(value[1]) <= 0 || Number(value[1]) > 600) return 0;
      duration += Number(value[1]); pending = true;
    } else if (line && line.charAt(0) !== '#') {
      if (!pending || /^(?!https:\/\/)[\w+.-]+:|^\/\//i.test(line)) return 0;
      pending = false; segments++;
    }
  }
  if (pending || !segments || segments > 15000 || !isFinite(duration) || duration < expected * 0.8 || duration > expected * 1.25) return 0;
  return duration;
}

function tvPlaylist(candidate, expected, client, account) {
  var playbackHeaders = { 'User-Agent': USER_AGENT, Accept: '*/*' };
  function read(url) {
    // Account Authorization and device hash belong only to the API host.
    if (!accountUrlSafe(url, account)) return Promise.reject(safeError('FilmixTV media URL contains account credentials.'));
    return client.request(url, { responseInfo: true, headers: playbackHeaders, timeout: 10000 }).then(function (response) {
      if (!response || !/^https:\/\//i.test(response.finalUrl || '') || !accountUrlSafe(response.finalUrl, account)) throw safeError('FilmixTV HLS response could not be verified.');
      return { body: response.body, url: response.finalUrl };
    });
  }
  return read(candidate.url).then(function (response) {
    var body = response.body, url = response.url, quality = candidate.quality, actual = false;
    var lines = typeof body === 'string' ? body.split(/\r?\n/) : [], variants = [];
    for (var i = 0; i < lines.length; i++) {
      var tag = /^#EXT-X-STREAM-INF:(.*)/.exec(lines[i].trim());
      if (!tag) continue;
      var resolution = /(?:^|,)\s*RESOLUTION=\d+x(\d+)(?:,|$)/i.exec(tag[1]);
      var next = i + 1;
      while (next < lines.length && !lines[next].trim()) next++;
      var variantUrl = next < lines.length ? hlsUrl(lines[next].trim(), url) : '';
      if (resolution && variantUrl && accountUrlSafe(variantUrl, account) && Number(resolution[1]) >= 1080 && Number(resolution[1]) <= Math.min(candidate.quality, 2160)) {
        variants.push({ url: variantUrl, quality: Number(resolution[1]) });
      }
    }
    variants.sort(function (a, b) { return b.quality - a.quality; });
    var chosen = variants[0];
    if (/#EXT-X-STREAM-INF/.test(String(body)) && !chosen) return null;
    var selectedPlaylist = chosen ? read(chosen.url) : Promise.resolve(response);
    if (chosen) { quality = chosen.quality; actual = true; }
    return selectedPlaylist.then(function (playlist) {
      var duration = media.hls(playlist.body) ? vodDuration(playlist.body, expected) : 0;
      if (!duration) return null;
      return {
        url: playlist.url, quality: quality + 'p', type: 'hls', headers: playbackHeaders,
        title: 'FilmixTV | ' + candidate.voice + ' | Account' + (actual ? '' : ' | source-labelled ' + quality + 'p'),
        qualityVerified: actual, qualitySource: actual ? 'hls' : 'api', durationVerified: true, durationSeconds: duration
      };
    });
  });
}

function tvResolve(meta, season, episode, cfg, client) {
  // Nuvio TV's current bridge ignores fetch redirect options and forwards
  // custom headers on cross-origin redirects. A finalUrl check is too late to
  // protect the device hash. Only a host client that enforces redirect:'error'
  // (or strips this credential before redirects) may enable this adapter.
  // This is an internal host capability, never a user-configurable setting.
  if (!client || client.filmixTvRedirectSafe !== true) return Promise.reject(safeError(TV_RUNTIME_UNAVAILABLE));
  var token = String(cfg.filmixTvToken || '').trim(), hash = String(cfg.filmixTvHash || '').trim();
  var expected = Number(meta.runtimeSeconds);
  if (!/^[A-Za-z0-9._~-]{8,4096}$/.test(token) || !/^[A-Za-z0-9_-]{16,128}$/.test(hash)) return Promise.reject(safeError('FilmixTV needs your own access token and matching device hash.'));
  if (!isFinite(expected) || expected < 60 || expected > 40000) return Promise.reject(safeError('FilmixTV needs an exact title or episode runtime to reject preview streams.'));
  var account = { filmixTvToken: token, filmixTvHash: hash };
  return tvSearch(meta, account, client).then(function (result) {
    if (!result) return [];
    return tvApi('/post/' + result.id + '/video-links', account, client).then(function (data) {
      return Promise.all(tvCandidates(data, meta, season, episode).map(function (candidate) {
        return tvPlaylist(candidate, expected, client, account).catch(function () { return null; });
      })).then(function (streams) { return streams.filter(Boolean); });
    });
  });
}

function resolve(meta, season, episode, cfg, client) {
  if (!meta || ['movie', 'tv'].indexOf(meta.type) === -1) return Promise.resolve([]);
  if (meta.type === 'tv' && (!/^\d+$/.test(String(season)) || !/^\d+$/.test(String(episode)) || Number(episode) < 1)) return Promise.resolve([]);
  cfg = cfg || {};
  // The mobile token is not interchangeable with a FilmixTV bearer token.
  if (cfg.filmixToken || cfg.filmixUsername || cfg.filmixPassword || cfg.filmixApi) return Promise.reject(safeError(ACCOUNT_UNAVAILABLE));
  var guest = guestResolve(meta, season, episode, client);
  if (!cfg.filmixTvToken && !cfg.filmixTvHash) return guest;
  guest = guest.catch(function () { return []; });
  var account = tvResolve(meta, season, episode, cfg, client).catch(function (error) {
    console.warn('[Russian Cinema / FilmixTV] ' + (error && error.providerSafe && error.message === 'Filmix: ' + TV_RUNTIME_UNAVAILABLE ? TV_RUNTIME_UNAVAILABLE : 'Account HLS could not be verified. Guest sources remain available.'));
    return [];
  });
  return Promise.all([account, guest]).then(function (results) { return results[0].concat(results[1]).slice(0, MAX_STREAMS); });
}

module.exports = {
  resolve: resolve, matchScore: matchScore, selectResult: selectResult,
  mediaLink: mediaLink, candidates: candidates, tvCandidates: tvCandidates, vodDuration: vodDuration,
  capabilities: { guestMaxQuality: GUEST_QUALITY, accountAvailable: false, accountImplemented: true, accountType: 'FilmixTV HLS with runtime verification', accountMessage: TV_RUNTIME_UNAVAILABLE }
};

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
"collaps": function(module, exports, require) {
'use strict';
var u = require("utils");
var USER_AGENT = require("http").USER_AGENT;
var DEFAULT_SITE = 'https://api.luxembd.ws';
var MAX_DATA = 1024 * 1024;

// Read narrowly scoped public player data. The surrounding script, advertising
// callbacks and player libraries are never evaluated or downloaded.
function skipSpace(value, offset) {
  while (offset < value.length) {
    if (/\s/.test(value.charAt(offset))) { offset++; continue; }
    if (value.slice(offset, offset + 2) === '//') {
      offset = value.indexOf('\n', offset + 2);
      if (offset < 0) return value.length;
      continue;
    }
    if (value.slice(offset, offset + 2) === '/*') {
      var end = value.indexOf('*/', offset + 2);
      if (end < 0) return value.length;
      offset = end + 2;
      continue;
    }
    break;
  }
  return offset;
}

function valueEnd(value, start) {
  var stack = [], quote = '', escaped = false;
  for (var i = start; i < value.length; i++) {
    var ch = value.charAt(i);
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (value.slice(i, i + 2) === '//' || value.slice(i, i + 2) === '/*') {
      var after = skipSpace(value, i);
      if (after >= value.length) return -1;
      i = after - 1;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      stack.push(ch);
      if (stack.length > 32) return -1;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      if (!stack.length) return i;
      var wanted = ch === '}' ? '{' : ch === ']' ? '[' : '(';
      if (stack.pop() !== wanted) return -1;
      if (!stack.length && (value.charAt(start) === '{' || value.charAt(start) === '[')) return i + 1;
    } else if (ch === ',' && !stack.length) return i;
  }
  return quote || stack.length ? -1 : value.length;
}

function properties(value) {
  if (typeof value !== 'string' || value.length > MAX_DATA || value.charAt(0) !== '{') return null;
  var out = {}, count = 0, offset = 1;
  while (offset < value.length && count++ < 128) {
    offset = skipSpace(value, offset);
    if (value.charAt(offset) === '}') return skipSpace(value, offset + 1) === value.length ? out : null;
    var key = /^([a-zA-Z_$][\w$]*)\s*:/.exec(value.slice(offset));
    if (!key) return null;
    if (Object.prototype.hasOwnProperty.call(out, key[1])) return null;
    offset = skipSpace(value, offset + key[0].length);
    var end = valueEnd(value, offset);
    if (end < 0) return null;
    out[key[1]] = value.slice(offset, end).trim();
    offset = skipSpace(value, end);
    if (value.charAt(offset) === ',') offset++;
    else if (value.charAt(offset) !== '}') return null;
  }
  return null;
}

function json(value) {
  if (typeof value !== 'string' || value.length > MAX_DATA) return null;
  try { return JSON.parse(value); } catch (ignored) { return null; }
}

function playerData(html) {
  if (typeof html !== 'string' || html.length > MAX_DATA) return null;
  var scripts = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, match, selected = null;
  while ((match = scripts.exec(html))) {
    if (u.attr(match[1], 'data-name') !== 'mk') continue;
    if (selected !== null) return null;
    selected = match[2];
  }
  if (!selected) return null;
  var call = /\bmakePlayer\s*\(\s*\{/.exec(selected);
  if (!call) return null;
  var start = call.index + call[0].lastIndexOf('{');
  var end = valueEnd(selected, start);
  if (end < 0 || !/^\s*\)/.test(selected.slice(end))) return null;
  return properties(selected.slice(start, end));
}

function safeUrl(value, extension) {
  if (typeof value !== 'string' || value.length > 8192 || /[\s\\\x00-\x1f\x7f]/.test(value) || /%(?![a-f\d]{2})/i.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|20|5c|7f)/i.test(value)) return '';
  var parts = /^(https?):\/\/([a-z\d](?:[a-z\d.-]*[a-z\d])?)(?::(\d{1,5}))?(\/[\s\S]*)$/i.exec(value);
  if (!parts || parts[3] && (Number(parts[3]) < 1 || Number(parts[3]) > 65535)) return '';
  return new RegExp('\\.' + extension + '$', 'i').test(parts[4].split(/[?#]/)[0]) ? value : '';
}

function subtitles(value) {
  if (!Array.isArray(value)) return [];
  var seen = {};
  return value.slice(0, 32).map(function (track) {
    var url = track && safeUrl(track.url, '(?:vtt|srt)');
    if (!url || seen[url]) return null;
    seen[url] = true;
    var label = u.text(track.name || '').slice(0, 120);
    var lang = /^(?:Рус|Russian|ru\b)/i.test(label) ? 'ru' : /^(?:Eng|English|en\b)/i.test(label) ? 'en' : /^(?:Укр|Ukrainian|uk\b)/i.test(label) ? 'uk' : 'und';
    return { url: url, lang: lang, label: label || 'Subtitles' };
  }).filter(Boolean).slice(0, 16);
}

function audioLabels(value) {
  if (!value || !Array.isArray(value.names)) return [];
  return value.names.slice(0, 32).map(function (name) { return typeof name === 'string' ? u.text(name).slice(0, 120) : ''; }).filter(Boolean);
}

function sources(entry, site) {
  if (!entry || typeof entry !== 'object' || entry.blocked === true) return [];
  var tracks = subtitles(entry.cc), audio = audioLabels(entry.audio), seen = {};
  return ['dash', 'dasha', 'hls'].map(function (key) {
    var url = safeUrl(entry[key], key === 'hls' ? 'm3u8' : 'mpd');
    if (!url || seen[url]) return null;
    seen[url] = true;
    var out = {
      url: url, type: key === 'hls' ? 'hls' : 'dash',
      title: 'Collaps | ' + (key === 'dash' ? 'DASH' : key === 'dasha' ? 'DASH alternate' : 'HLS') + (audio.length > 1 ? ' | Multiple audio tracks' : audio.length === 1 ? ' | ' + audio[0] : ''),
      headers: { Referer: site + '/', Origin: site, 'User-Agent': USER_AGENT, Accept: '*/*' }
    };
    if (tracks.length) out.subtitles = tracks;
    if (audio.length) out.audio = audio;
    return out;
  }).filter(Boolean);
}

function candidates(html, meta, season, episode, site) {
  var data = playerData(html);
  if (!data || data.blocked === 'true') return [];
  if (meta.type === 'movie') {
    if (data.playlist || !data.source) return [];
    var source = properties(data.source);
    if (!source) return [];
    var entry = {};
    ['dash', 'dasha', 'hls', 'audio', 'cc', 'blocked'].forEach(function (key) { entry[key] = json(source[key]); });
    return sources(entry, site);
  }
  var playlist = properties(data.playlist), seasons = playlist && json(playlist.seasons);
  if (!Array.isArray(seasons) || seasons.length > 100) return [];
  var selectedSeasons = seasons.filter(function (item) { return item && String(item.season) === String(season); });
  if (selectedSeasons.length !== 1 || selectedSeasons[0].blocked === true) return [];
  var episodes = selectedSeasons[0].episodes;
  if (!Array.isArray(episodes) || episodes.length > 1000) return [];
  var selectedEpisodes = episodes.filter(function (item) { return item && String(item.episode) === String(episode); });
  return selectedEpisodes.length === 1 ? sources(selectedEpisodes[0], site) : [];
}

function resolve(meta, season, episode, cfg, client) {
  if (!meta || ['movie', 'tv'].indexOf(meta.type) === -1 || !/^tt\d{7,10}$/.test(String(meta.imdb || ''))) return Promise.resolve([]);
  if (meta.type === 'tv' && (!/^\d+$/.test(String(season)) || !/^\d+$/.test(String(episode)) || Number(episode) < 1)) return Promise.resolve([]);
  if (cfg && cfg.deadline && cfg.deadline <= Date.now()) return Promise.resolve([]);
  var site = u.siteUrl(cfg && cfg.collapsSite) || DEFAULT_SITE;
  return client.request(site + '/embed/imdb/' + meta.imdb, { referer: site + '/', timeout: 10000 }).then(function (html) {
    return candidates(html, meta, Number(season), Number(episode), site).slice(0, 8);
  });
}

module.exports = { resolve: resolve, candidates: candidates, playerData: playerData, safeUrl: safeUrl };

},
"kinopub": function(module, exports, require) {
'use strict';
var u = require("utils");
var DEFAULT_API = 'https://api.srvkp.com';
var MAX_STREAMS = 3;

function safeError(message) {
  var error = new Error('KinoPub: ' + message);
  error.providerSafe = true;
  return error;
}

function imdb(value) {
  value = String(value || '').replace(/^tt/i, '');
  return /^\d{1,10}$/.test(value) && Number(value) > 0 ? String(Number(value)) : '';
}

function kind(item) {
  var type = String(item && item.type || '').toLowerCase();
  if (['serial', 'docuserial', 'tvshow', 'tv', 'series'].indexOf(type) !== -1) return 'tv';
  if (['movie', 'documovie', '4k', '3d', 'concert'].indexOf(type) !== -1) return 'movie';
  return '';
}

function matchScore(item, meta) {
  if (!item || !/^\d+$/.test(String(item.id || '')) || kind(item) !== meta.type) return -1;
  var actualImdb = imdb(item.imdb || item.imdb_id), wantedImdb = imdb(meta.imdb);
  if (wantedImdb && actualImdb && actualImdb !== wantedImdb) return -1;
  if (wantedImdb && actualImdb === wantedImdb) return 200;
  var names = String(item.title || '').split(/\s*\/\s*/).concat([item.original_title || '']).map(u.normalize).filter(Boolean);
  var titles = [meta.title, meta.originalTitle].map(u.normalize).filter(Boolean);
  if (!titles.some(function (title) { return names.indexOf(title) !== -1; })) return -1;
  var year = Number(String(item.year || '').slice(0, 4));
  if (!meta.year || !year || Math.abs(year - Number(meta.year)) > 1) return -1;
  return year === Number(meta.year) ? 120 : 100;
}

function selectResult(items, meta) {
  if (!Array.isArray(items)) return null;
  var best = null, score = -1;
  items.slice(0, 100).forEach(function (item) {
    var next = matchScore(item, meta);
    if (next > score) { score = next; best = item; }
  });
  return best;
}

function selectedMedia(item, type, season, episode) {
  if (!item) return null;
  if (type === 'movie') {
    // The API can contain trailers/parts, so prefer the explicitly numbered main video.
    var videos = Array.isArray(item.videos) ? item.videos : [];
    return videos.filter(function (video) { return Number(video.number) === 1; })[0] || (videos.length === 1 ? videos[0] : null);
  }
  var seasons = Array.isArray(item.seasons) ? item.seasons : [];
  var chosen = seasons.filter(function (entry) { return Number(entry.number) === Number(season); })[0];
  return chosen && Array.isArray(chosen.episodes) ? chosen.episodes.filter(function (entry) { return Number(entry.number) === Number(episode); })[0] || null : null;
}

function safeMediaUrl(value, token) {
  value = String(value || '');
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?\/[^\s#]*$/i.test(value)) return '';
  // Signed CDN URLs are expected; an account access token is never a playback credential.
  if (/[?&](?:access_token|authorization|api_key)=/i.test(value)) return '';
  if (token && (value.indexOf(token) !== -1 || value.indexOf(encodeURIComponent(token)) !== -1)) return '';
  return value;
}

function fileQuality(file) {
  var declared = /^(\d{3,4})(?:p)?$/i.exec(String(file.quality || ''));
  var height = Number(file.h || file.height), width = Number(file.w || file.width);
  var value = declared ? Number(declared[1]) : height || 0;
  if (width > 0 && height > 0) {
    // Cropped cinema encodes retain their standard width tier, but a claimed
    // 4K label on a 1920-wide file must never become a verified 4K result.
    if (width >= 7680 && height >= 3000) value = 4320;
    else if (width >= 3840 && height >= 1500) value = 2160;
    else if (width >= 2560 && height >= 1000) value = 1440;
    else if (width >= 1920 && height >= 700) value = 1080;
    else if (width >= 1280 && height >= 460) value = 720;
    else value = Math.min(value || height, height);
  }
  if (value < 240 || value > 4320) return '';
  return value + 'p';
}

function streamsFromLinks(data, media, token) {
  if (!data || !Array.isArray(data.files)) return [];
  var seen = {}, result = [];
  var subtitles = (Array.isArray(data.subtitles) ? data.subtitles : Array.isArray(media.subtitles) ? media.subtitles : []).slice(0, 20).filter(function (sub) {
    return safeMediaUrl(sub.url, token);
  }).map(function (sub, index) {
    return { id: 'kinopub-sub-' + index, url: sub.url, language: sub.lang || 'ru', name: sub.lang || 'Subtitle', headers: {} };
  });
  data.files.slice(0, 30).sort(function (a, b) { return parseInt(fileQuality(b), 10) - parseInt(fileQuality(a), 10); }).forEach(function (file) {
    var urls = file.urls || file.url || {};
    if (typeof urls !== 'object') return;
    var quality = fileQuality(file);
    if (!quality) return;
    // One HLS transport per encoding avoids exposing several equivalent paid sessions.
    var value = safeMediaUrl(urls.hls4 || urls.hls || urls.hls2, token);
    var type = 'hls';
    if (!value) { value = safeMediaUrl(urls.http, token); type = 'mp4'; }
    if (!value || seen[value] || result.length >= MAX_STREAMS) return;
    seen[value] = true;
    var codec = u.text(file.codec || '').slice(0, 20);
    result.push({
      url: value, type: type, quality: quality, title: 'KinoPub | ' + quality + (codec ? ' | ' + codec : ''),
      headers: {}, subtitles: subtitles, codecSummary: codec + (Number(file.w) && Number(file.h) ? ' ' + file.w + 'x' + file.h : ''),
      // Fetching a paid manifest can open a viewing session. The authenticated
      // media-links response supplies the exact file metadata; do not bulk-probe.
      metadataVerified: true
    });
  });
  return result;
}

function resolve(meta, season, episode, cfg, client) {
  cfg = cfg || {};
  var token = String(cfg.kinopubToken || '').trim();
  if (!token) return Promise.resolve([]);
  if (/\s/.test(token) || token.length > 4096) return Promise.reject(safeError('Invalid access token setting.'));
  var api = u.siteUrl(cfg.kinopubApi || DEFAULT_API);
  if (!api) return Promise.reject(safeError('The API address must use HTTPS.'));
  if (!meta || ['movie', 'tv'].indexOf(meta.type) === -1) return Promise.resolve([]);
  if (meta.type === 'tv' && (!/^\d+$/.test(String(season)) || !/^\d+$/.test(String(episode)) || Number(episode) < 1)) return Promise.resolve([]);
  function request(path, values) {
    var url = api + '/v1/' + path + (values ? '?' + u.form(values) : '');
    return client.request(url, { json: true, headers: { Authorization: 'Bearer ' + token }, sensitive: true, timeout: 10000 }).then(function (data) {
      if (!data || data.error || Number(data.status) >= 400) throw safeError('Account access failed. Check your own access token and subscription.');
      return data;
    });
  }
  var queries = [meta.originalTitle, meta.title].filter(function (value, index, all) { return value && all.indexOf(value) === index; }).slice(0, 2);
  function search(index) {
    if (index >= queries.length) return Promise.resolve(null);
    return request('items/search', { q: queries[index], field: 'title', perpage: 50 }).then(function (data) {
      return selectResult(data.items, meta) || search(index + 1);
    });
  }
  return search(0).then(function (match) {
    if (!match) return [];
    return request('items/' + match.id, { nolinks: 1 }).then(function (data) {
      var item = data.item;
      if (!item || String(item.id) !== String(match.id) || matchScore(item, meta) < 0) return [];
      var media = selectedMedia(item, meta.type, season, episode);
      if (!media) return [];
      var mid = media.id || media.mid || media.media_id;
      if (/^\d+$/.test(String(mid || ''))) {
        return request('items/media-links', { mid: mid }).then(function (links) { return streamsFromLinks(links, media, token); });
      }
      // Older API deployments return the selected video's links in the item.
      return streamsFromLinks(media, media, token);
    });
  }).catch(function () {
    // API bodies/transport errors can echo an account token. Diagnostics are fixed text.
    throw safeError('Account/API request failed. Check your own access token, subscription, and HTTPS API address.');
  });
}

module.exports = { resolve: resolve, matchScore: matchScore, selectResult: selectResult, selectedMedia: selectedMedia, streamsFromLinks: streamsFromLinks, fileQuality: fileQuality };

},
"hdvb": function(module, exports, require) {
'use strict';
var u = require("utils");
var DEFAULT_API = 'https://apivb.com';
var MAX_VOICES = 2;

function safeError(message) {
  var error = new Error('HDVB: ' + message);
  error.providerSafe = true;
  return error;
}

function imdb(value) {
  value = String(value || '').replace(/^tt/i, '');
  return /^\d{1,10}$/.test(value) && Number(value) > 0 ? String(Number(value)) : '';
}

function matchScore(item, meta) {
  if (!item) return -1;
  var type = String(item.type || '').toLowerCase();
  var actualType = type === 'movie' ? 'movie' : ['serial', 'series', 'tv'].indexOf(type) !== -1 ? 'tv' : '';
  if (actualType !== meta.type) return -1;
  var wantedImdb = imdb(meta.imdb), actualImdb = imdb(item.imdb_id || item.imdb);
  if (wantedImdb && actualImdb && wantedImdb !== actualImdb) return -1;
  if (wantedImdb && wantedImdb === actualImdb) return 200;
  var names = [item.title_ru, item.title_en, item.title, item.original_title].map(u.normalize).filter(Boolean);
  var titles = [meta.title, meta.originalTitle].map(u.normalize).filter(Boolean);
  var year = Number(String(item.year || '').slice(0, 4));
  if (!titles.some(function (title) { return names.indexOf(title) !== -1; })) return -1;
  if (!year || !meta.year || Math.abs(year - Number(meta.year)) > 1) return -1;
  return year === Number(meta.year) ? 120 : 100;
}

function validHttps(value) {
  return /^https:\/\/[a-z0-9.-]+(?::\d+)?\/[^\s#]*$/i.test(String(value || ''));
}

function safePlayback(value, token) {
  value = String(value || '');
  if (!validHttps(value) || /[?&](?:access_token|authorization|api_key)=/i.test(value)) return '';
  if (token && (value.indexOf(token) !== -1 || value.indexOf(encodeURIComponent(token)) !== -1)) return '';
  return value;
}

function field(html, name) {
  var match = new RegExp('"' + name + '"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")').exec(String(html || ''));
  if (!match) return '';
  try { return JSON.parse(match[1]); } catch (ignored) { return ''; }
}

function playerConfig(html, iframe) {
  var host = field(html, 'href'), key = field(html, 'key'), file = field(html, 'file');
  var vid = field(html, 'vid');
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(host) || host.indexOf('..') !== -1) return null;
  if (!key || key.length > 4096 || /[\r\n]/.test(key)) return null;
  var root = u.origin(iframe);
  if (!/^https:\/\//i.test(root)) return null;
  return { base: 'https://' + (/^vid\d+$/.test(vid) ? vid : 'vid11') + '.' + host, key: key, file: file, origin: root };
}

function playlistUrl(file, config) {
  file = String(file || '').replace(/^\/playlist\//, '').replace(/^\/+/, '').replace(/\.txt$/, '');
  if (!file || file.length > 2048 || !/^[a-z0-9_/-]+$/i.test(file) || /(?:^|\/)\.\.(?:\/|$)/.test(file)) return '';
  return config.base + '/playlist/' + file + '.txt';
}

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value || '')); } catch (ignored) { return null; }
}

function selectedEpisode(data, season, episode, translator) {
  if (!Array.isArray(data)) return null;
  var selected = data.filter(function (entry) { return Number(entry.id !== undefined ? entry.id : entry.season) === Number(season); })[0];
  if (!selected || !Array.isArray(selected.folder)) return null;
  var ep = selected.folder.filter(function (entry) { return Number(entry.episode) === Number(episode); })[0];
  if (!ep || !Array.isArray(ep.folder)) return null;
  var voices = ep.folder;
  var wanted = u.normalize(translator);
  var chosen = wanted ? voices.filter(function (entry) { return u.normalize(entry.title) === wanted; })[0] : null;
  return chosen || (!wanted && voices.length === 1 ? voices[0] : null);
}

function mediaUrls(body, token, title, headers) {
  var parsed = parseJson(body), value = typeof parsed === 'string' ? parsed : parsed && typeof parsed.file === 'string' ? parsed.file : String(body || '').trim();
  var result = [], seen = {}, match;
  var tagged = /\[(\d{3,4})p?\]\s*(https:\/\/[^,\s"<>]+)/gi;
  while ((match = tagged.exec(value)) && result.length < 4) {
    if (Number(match[1]) < 240 || Number(match[1]) > 4320) continue;
    var url = safePlayback(match[2], token);
    if (!url || !/\.m3u8(?:[?#]|$)/i.test(url) || seen[url]) continue;
    seen[url] = true;
    result.push({ url: url, type: 'hls', quality: match[1] + 'p', title: title, headers: headers });
  }
  if (result.length) return result;
  var direct = /https:\/\/[^\s"<>]+?\.m3u8(?:\?[^\s"<>]*)?/i.exec(value.replace(/\\\//g, '/'));
  var url = direct && safePlayback(direct[0], token);
  return url ? [{ url: url, type: 'hls', quality: 'Auto', title: title, headers: headers }] : [];
}

function resolveFrame(item, meta, season, episode, token, client) {
  var iframe = safePlayback(item.iframe_url, token);
  if (!iframe) return Promise.resolve([]);
  var title = 'HDVB' + (item.translator ? ' | ' + u.text(item.translator).slice(0, 100) : '');
  return client.request(iframe, { referer: u.origin(iframe) + '/', timeout: 10000 }).then(function (html) {
    var config = playerConfig(html, iframe);
    if (!config) return [];
    var playbackHeaders = { Referer: config.origin + '/', Origin: config.origin };
    function post(file) {
      var url = playlistUrl(file, config);
      if (!url) return Promise.resolve('');
      return client.request(url, {
        method: 'POST', body: '', origin: config.origin, referer: config.origin + '/',
        headers: { 'X-CSRF-Token': config.key, Accept: '*/*' }, timeout: 10000
      });
    }
    return post(config.file).then(function (body) {
      if (meta.type === 'tv') {
        var selected = selectedEpisode(parseJson(body), season, episode, item.translator);
        if (!selected) return [];
        return post(selected.file).then(function (value) { return mediaUrls(value, token, title, playbackHeaders); });
      }
      var streams = mediaUrls(body, token, title, playbackHeaders);
      if (streams.length) return streams;
      var pointer = parseJson(body);
      return pointer && typeof pointer.file === 'string' ? post(pointer.file).then(function (value) { return mediaUrls(value, token, title, playbackHeaders); }) : [];
    });
  });
}

function resolve(meta, season, episode, cfg, client) {
  cfg = cfg || {};
  var token = String(cfg.hdvbToken || '').trim();
  if (!token) return Promise.resolve([]);
  if (/\s/.test(token) || token.length > 4096) return Promise.reject(safeError('Invalid partner token setting.'));
  var api = u.siteUrl(cfg.hdvbApi || DEFAULT_API);
  if (!api) return Promise.reject(safeError('The API address must use HTTPS.'));
  if (!meta || ['movie', 'tv'].indexOf(meta.type) === -1) return Promise.resolve([]);
  if (meta.type === 'tv' && (!/^\d+$/.test(String(season)) || !/^\d+$/.test(String(episode)) || Number(episode) < 1)) return Promise.resolve([]);
  var queries = [meta.originalTitle, meta.title].filter(function (value, index, all) { return value && all.indexOf(value) === index; }).slice(0, 2);
  function search(index) {
    if (index >= queries.length) return Promise.resolve([]);
    // HDVB's approved partner API requires the token as a query parameter.
    // Only this HTTPS API request receives it; iframe/CDN requests do not.
    var url = api + '/api/videos.json?' + u.form({ token: token, title: queries[index] });
    return client.request(url, { json: true, sensitive: true, timeout: 10000 }).then(function (data) {
      if (!Array.isArray(data)) throw safeError('Partner API access failed. Check your own approved partner token.');
      var matches = data.slice(0, 100).filter(function (item) { return matchScore(item, meta) >= 0; }).sort(function (a, b) { return matchScore(b, meta) - matchScore(a, meta); });
      if (!matches.length) return search(index + 1);
      return matches.slice(0, MAX_VOICES);
    });
  }
  return search(0).then(function (items) {
    return Promise.all(items.map(function (item) { return resolveFrame(item, meta, season, episode, token, client); }));
  }).then(function (groups) {
    return [].concat.apply([], groups).slice(0, 8);
  }).catch(function () {
    // Do not surface API query strings, echoed partner tokens, or player keys.
    throw safeError('Partner API/player request failed. Check your own approved partner token and HTTPS API address.');
  });
}

module.exports = { resolve: resolve, matchScore: matchScore, playerConfig: playerConfig, playlistUrl: playlistUrl, selectedEpisode: selectedEpisode, mediaUrls: mediaUrls };

},
"index": function(module, exports, require) {
'use strict';
var u = require("utils");
var http = require("http");
var filmix = require("filmix");
var seasonvar = require("seasonvar");
var collaps = require("collaps");
var kinopub = require("kinopub");
var hdvb = require("hdvb");
var media = require("media");
var DEFAULT_SEASONVAR = 'https://seasonvar.ru';
var DEFAULT_COLLAPS = 'https://api.luxembd.ws';
var DEFAULT_KINOPUB = 'https://api.srvkp.com';
var DEFAULT_HDVB = 'https://apivb.com';

function settings() {
  var root = typeof globalThis !== 'undefined' ? globalThis : {};
  var saved = root.SCRAPER_SETTINGS || {};
  return {
    seasonvarSite: u.siteUrl(saved.seasonvarSite || DEFAULT_SEASONVAR) || DEFAULT_SEASONVAR,
    collapsSite: u.siteUrl(saved.collapsSite || DEFAULT_COLLAPS) || DEFAULT_COLLAPS,
    kinopubApi: String(saved.kinopubApi || DEFAULT_KINOPUB).trim(),
    kinopubToken: String(saved.kinopubToken || '').trim(),
    hdvbApi: String(saved.hdvbApi || DEFAULT_HDVB).trim(),
    hdvbToken: String(saved.hdvbToken || '').trim(),
    filmixTvToken: String(saved.filmixTvToken || '').trim(),
    filmixTvHash: String(saved.filmixTvHash || '').trim(),
    key: String(saved.tmdbApiKey || root.TMDB_API_KEY || '').trim(),
    deadline: Date.now() + 50000
  };
}

function metadata(id, type, cfg) {
  if (!cfg.key) return Promise.reject(new Error('TMDB key unavailable. Enter your own key in Russian Cinema settings.'));
  var token = cfg.key.length > 40;
  var url = 'https://api.themoviedb.org/3/' + type + '/' + encodeURIComponent(id) + '?language=ru-RU&append_to_response=external_ids';
  if (!token) url += '&api_key=' + encodeURIComponent(cfg.key);
  var state = http.session(cfg.deadline);
  var options = { json: true, bearer: token ? cfg.key : '', session: state };
  return http.request(url, options).then(function (data) {
    var imdb = data.external_ids && data.external_ids.imdb_id || data.imdb_id || '';
    return {
      type: type, title: data.title || data.name || '', originalTitle: data.original_title || data.original_name || '',
      year: Number(String(data.release_date || data.first_air_date || '').slice(0, 4)) || null,
      imdb: /^tt\d{7,10}$/.test(imdb) ? imdb : '',
      runtimeSeconds: (type === 'movie' ? Number(data.runtime) || 0 : 0) * 60
    };
  });
}

function client(cfg) {
  var state = cfg.state;
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
    if (cfg.state.cancelled) return [];
    console.warn('[Russian Cinema / ' + label + '] ' + (error && error.providerSafe ? error.message : 'Source resolution failed.'));
    return [];
  });
}

function playbackHeaders(values) {
  var clean = {};
  Object.keys(values || {}).forEach(function (name) {
    if (/^(?:authorization|cookie|proxy-authorization|x-api-key|token|hash)$/i.test(name)) return;
    clean[name] = values[name];
  });
  return clean;
}

function verify(stream, cfg) {
  if (!stream || !/^https?:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/i.test(String(stream.url || ''))) return Promise.resolve(null);
  var hls = stream.type === 'hls' || /\.m3u8(?:[?#]|$)/i.test(stream.url);
  var dash = stream.type === 'dash' || /\.mpd(?:[?#]|$)/i.test(stream.url);
  if (stream.sourceName === 'KinoPub' && !/^https:\/\//i.test(stream.url)) return Promise.resolve(null);
  // Fetching KinoPub playlists starts paid account sessions. Use its selected
  // media-link API response and resolution/codec metadata until actual playback.
  if (stream.sourceName === 'KinoPub' && stream.metadataVerified === true && /^https:\/\//i.test(stream.url) && /^(?:hls|dash|mp4)$/.test(stream.type || '') && /^\d{3,4}p$/.test(stream.quality || '')) return Promise.resolve(stream);
  var headers = {};
  headers = playbackHeaders(stream.headers);
  // Nuvio TV's native bridge maps HEAD to GET. A small byte range avoids
  // requesting the video body while checking that an MP4 URL is still usable.
  if (!hls && !dash) headers.Range = 'bytes=0-63';
  var opts = { session: cfg.state, headers: headers, responseInfo: true, method: 'GET', binary: !hls && !dash };
  return http.request(stream.url, opts).then(function (response) {
    if (hls || dash) {
      var details = dash ? media.dash(response.body) : media.hls(response.body);
      if (!details) return null;
      if (details.quality) stream.quality = details.quality;
      if (details.codecSummary) stream.codecSummary = details.codecSummary;
    } else {
      var range = /^bytes\s+0-(\d+)\/(\d+)$/i.exec(response.contentRange);
      var data = response.data || [];
      if (response.status !== 206 || !range || Number(range[1]) + 1 !== data.length || Number(range[2]) <= data.length || data.length < 16 || data.length > 64) return null;
      if (!/^(?:video\/|application\/(?:octet-stream|mp4))/i.test(response.contentType) || String.fromCharCode.apply(null, data.slice(4, 8)) !== 'ftyp') return null;
    }
    stream.type = dash ? 'dash' : hls ? 'hls' : 'mp4';
    return stream;
  }).catch(function () { return null; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var type = ['tv', 'series', 'show'].indexOf(mediaType) !== -1 ? 'tv' : mediaType;
  if (!/^\d+$/.test(String(tmdbId)) || ['movie', 'tv'].indexOf(type) === -1) return Promise.resolve([]);
  if (type === 'tv' && (!/^\d+$/.test(String(season)) || !/^\d+$/.test(String(episode)) || Number(season) < 0 || Number(episode) < 1)) return Promise.resolve([]);
  if (type === 'tv') { season = Number(season); episode = Number(episode); }
  var cfg = settings();
  cfg.state = http.session(cfg.deadline);
  return metadata(String(tmdbId), type, cfg).then(function (meta) {
    var providers = [
      { label: 'Filmix', module: filmix },
      { label: 'Seasonvar', module: seasonvar, skip: type !== 'tv' },
      { label: 'Collaps', module: collaps },
      { label: 'KinoPub', module: kinopub, skip: !cfg.kinopubToken },
      { label: 'HDVB', module: hdvb, skip: !cfg.hdvbToken }
    ];
    return new Promise(function (resolve) {
      var seen = {}, found = providers.map(function () { return []; }), completed = {}, remaining = providers.length, done = false;
      function finish() {
        if (done) return;
        done = true;
        var streams = [];
        found.forEach(function (list) { list.forEach(function (stream) { if (stream) streams.push(stream); }); });
        http.cancel(cfg.state);
        resolve(streams);
      }
      function check() {
        if (done) return;
        if (!remaining) { finish(); return; }
        // Once both an HD choice and a broadly compatible HLS/MP4 choice are
        // verified, unrelated slow origins cannot hold up the source list.
        // Configured account providers finish first so their higher-quality
        // entitlement is not silently dropped for an anonymous source.
        if (cfg.kinopubToken && !completed.KinoPub || cfg.hdvbToken && !completed.HDVB) return;
        var hd = false, compatible = false;
        found.forEach(function (list) { list.forEach(function (stream) {
          if (!stream) return;
          if (parseInt(stream.quality, 10) >= 1080) hd = true;
          if (stream.type === 'hls' || stream.type === 'mp4') compatible = true;
        }); });
        if (hd && compatible) finish();
      }
      providers.forEach(function (provider, index) {
        var lookup = provider.skip ? Promise.resolve([]) : source(provider.label, provider.module, meta, season, episode, cfg);
        lookup.then(function (streams) {
          if (done) return [];
          return Promise.all(streams.map(function (stream, streamIndex) {
            if (!stream || !stream.url || seen[stream.url]) return null;
            seen[stream.url] = true;
            return verify(stream, cfg).then(function (verified) {
              if (done) return;
              found[index][streamIndex] = verified;
              check();
            });
          }));
        }).then(function () {
          if (done) return;
          completed[provider.label] = true;
          remaining--;
          check();
        }).catch(function () {
          if (done) return;
          completed[provider.label] = true;
          remaining--;
          check();
        });
      });
    }).then(function (streams) {
      return streams.filter(Boolean).map(function (stream) {
        var headers = playbackHeaders(stream.headers);
        var subtitles = (stream.subtitles || []).filter(function (sub) { return /^https?:\/\//i.test(String(sub.url || '')); }).map(function (sub, index) {
          return { id: sub.id || 'russian-cinema-' + index, url: sub.url, language: sub.language || sub.lang || 'ru', name: sub.name || sub.label || sub.language || 'Subtitle', headers: sub.headers ? playbackHeaders(sub.headers) : headers };
        });
        return {
          name: 'Russian Cinema', provider: 'Russian Cinema',
          title: meta.title + (type === 'tv' ? ' S' + season + 'E' + episode : '') + ' | ' + stream.sourceName + (stream.title ? ' | ' + String(stream.title).replace(/^(?:Filmix|Seasonvar|Collaps|KinoPub|HDVB)\s*[|·]\s*/i, '') : '') + (stream.codecSummary ? ' | ' + stream.codecSummary : ''),
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
    { type: 'text', key: 'collapsSite', label: 'Collaps player', defaultValue: DEFAULT_COLLAPS, description: 'Public movie and episode player. Includes 1080p DASH when available.' },
    { type: 'text', key: 'kinopubToken', label: 'KinoPub access token (optional)', isPassword: true, defaultValue: '', description: 'Your own authorized account access token. Leave empty to skip KinoPub.' },
    { type: 'text', key: 'kinopubApi', label: 'KinoPub API', defaultValue: DEFAULT_KINOPUB, description: 'HTTPS API origin for your KinoPub account.' },
    { type: 'text', key: 'hdvbToken', label: 'HDVB partner API key (optional)', isPassword: true, defaultValue: '', description: 'Your own approved partner key. Leave empty to skip HDVB.' },
    { type: 'text', key: 'hdvbApi', label: 'HDVB API', defaultValue: DEFAULT_HDVB, description: 'HTTPS origin for approved HDVB API access.' },
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
