const url = require('url');
const axios = require('axios');

/**
 * Получить URL картинок товара Wildberries по артикулу (nmId).
 * Используется домен wb.ru (как в карточке товара), при 404 — пробуем wbbasket.ru.
 * Структура: https://basket-XX.wb.ru/vol{vol}/part{part}/{nmId}/images/big/N.webp
 */
function getWildberriesImageUrls(productUrl) {
  const pathname = (url.parse(productUrl).pathname || '');
  const match = pathname.match(/\/catalog\/(\d+)/);
  if (!match) return [];
  const nmId = parseInt(match[1], 10);
  if (isNaN(nmId)) return [];

  const vol = Math.floor(nmId / 100000);
  const part = Math.floor(nmId / 1000);

  let hostNum = '01';
  if (vol >= 0 && vol <= 143) hostNum = '01';
  else if (vol >= 144 && vol <= 287) hostNum = '02';
  else if (vol >= 288 && vol <= 431) hostNum = '03';
  else if (vol >= 432 && vol <= 719) hostNum = '04';
  else if (vol >= 720 && vol <= 1007) hostNum = '05';
  else if (vol >= 1008 && vol <= 1061) hostNum = '06';
  else if (vol >= 1062 && vol <= 1115) hostNum = '07';
  else if (vol >= 1116 && vol <= 1169) hostNum = '08';
  else if (vol >= 1170 && vol <= 1313) hostNum = '09';
  else if (vol >= 1314 && vol <= 1601) hostNum = '10';
  else if (vol >= 1602 && vol <= 1655) hostNum = '11';
  else if (vol >= 1656 && vol <= 1919) hostNum = '12';
  else if (vol >= 1920 && vol <= 2045) hostNum = '13';
  else if (vol >= 2046 && vol <= 2189) hostNum = '14';
  else if (vol >= 2190 && vol <= 2405) hostNum = '15';
  else if (vol >= 2406 && vol <= 2621) hostNum = '16';
  else if (vol >= 2622 && vol <= 2837) hostNum = '17';
  else hostNum = '18';

  const pathPart = `vol${vol}/part${part}/${nmId}/images/big/`;
  const base = `https://basket-${hostNum}.wb.ru/${pathPart}`;
  return [1, 2, 3].map((n) => `${base}${n}.webp`);
}

/**
 * Вернуть рабочие URL картинок WB: сначала пробуем wb.ru, при 404 — wbbasket.ru.
 */
async function resolveWildberriesImageUrls(productUrl) {
  const pathname = (url.parse(productUrl).pathname || '');
  const match = pathname.match(/\/catalog\/(\d+)/);
  if (!match) return [];
  const nmId = parseInt(match[1], 10);
  if (isNaN(nmId)) return [];

  const vol = Math.floor(nmId / 100000);
  const part = Math.floor(nmId / 1000);
  let hostNum = '01';
  if (vol >= 0 && vol <= 143) hostNum = '01';
  else if (vol >= 144 && vol <= 287) hostNum = '02';
  else if (vol >= 288 && vol <= 431) hostNum = '03';
  else if (vol >= 432 && vol <= 719) hostNum = '04';
  else if (vol >= 720 && vol <= 1007) hostNum = '05';
  else if (vol >= 1008 && vol <= 1061) hostNum = '06';
  else if (vol >= 1062 && vol <= 1115) hostNum = '07';
  else if (vol >= 1116 && vol <= 1169) hostNum = '08';
  else if (vol >= 1170 && vol <= 1313) hostNum = '09';
  else if (vol >= 1314 && vol <= 1601) hostNum = '10';
  else if (vol >= 1602 && vol <= 1655) hostNum = '11';
  else if (vol >= 1656 && vol <= 1919) hostNum = '12';
  else if (vol >= 1920 && vol <= 2045) hostNum = '13';
  else if (vol >= 2046 && vol <= 2189) hostNum = '14';
  else if (vol >= 2190 && vol <= 2405) hostNum = '15';
  else if (vol >= 2406 && vol <= 2621) hostNum = '16';
  else if (vol >= 2622 && vol <= 2837) hostNum = '17';
  else hostNum = '18';

  const pathPartBig = `vol${vol}/part${part}/${nmId}/images/big/`;
  const pathPartPlain = `vol${vol}/part${part}/${nmId}/images/`;
  const pathPartHq = `vol${vol}/part${part}/${nmId}/images/hq/`;

  const tryDomain = async (domain, pathPart, host) => {
    const found = [];
    const mk = (n) => `https://basket-${host}.${domain}/${pathPart}${n}.webp`;
    for (let n = 1; n <= 3; n++) {
      try {
        const res = await axios.head(mk(n), {
          timeout: 6000,
          validateStatus: () => true,
          maxRedirects: 3
        });
        const ct = (res.headers && res.headers['content-type']) || '';
        const isImage = /^image\/(jpeg|jpg|png|webp|avif)/i.test(ct);
        if (res.status === 200 && isImage) found.push(mk(n));
      } catch (_) {}
    }
    return found.length ? found : null;
  };

  for (const domain of ['wb.ru', 'wbbasket.ru']) {
    const urls = await tryDomain(domain, pathPartBig, hostNum);
    if (urls && urls.length) return urls;
  }
  for (const domain of ['wb.ru', 'wbbasket.ru']) {
    const urls = await tryDomain(domain, pathPartPlain, hostNum);
    if (urls && urls.length) return urls;
  }
  // для высоких nmId пробуем ещё host 01 (часть товаров зеркалится)
  if (hostNum !== '01') {
    for (const domain of ['wb.ru', 'wbbasket.ru']) {
      const urls = await tryDomain(domain, pathPartBig, '01');
      if (urls && urls.length) return urls;
    }
  }

  // часть товаров (например 628558673) отдаётся с basket-XX.wbcontent.net, путь images/hq/
  for (const host of ['31', '18', '17', '01']) {
    const urls = await tryDomain('wbcontent.net', pathPartHq, host);
    if (urls && urls.length) return urls;
  }
  for (const host of ['31', '18', '17', '01']) {
    const urls = await tryDomain('wbcontent.net', pathPartBig, host);
    if (urls && urls.length) return urls;
  }

  const fromPage = await getWildberriesImageUrlsFromPage(productUrl);
  if (fromPage.length) return fromPage;

  return [`https://basket-${hostNum}.wb.ru/${pathPartBig}1.webp`];
}

/**
 * Запасной вариант: загрузить страницу товара WB и вытащить URL картинок из HTML.
 */
async function getWildberriesImageUrlsFromPage(productUrl) {
  try {
    const res = await axios.get(productUrl, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru-RU,ru;q=0.9'
      },
      validateStatus: (s) => s === 200
    });
    const html = (res.data && typeof res.data === 'string') ? res.data : '';
    const found = new Set();
    const reWb = /https?:\/\/[^"'\s<>]*?(?:basket-\d+\.(?:wb\.ru|wbbasket\.ru)|[\w-]+\.wb\.ru)[^"'\s<>]*\.(?:webp|jpg|jpeg|png|avif)(?:\?[^"'\s<>]*)?/gi;
    const reWbContent = /https?:\/\/[^"'\s<>]*?basket-\d+\.wbcontent\.net[^"'\s<>]*\.(?:webp|jpg|jpeg|png|avif)(?:\?[^"'\s<>]*)?/gi;
    let m;
    while ((m = reWb.exec(html)) !== null) found.add(m[0].replace(/["'\s)]+$/, ''));
    while ((m = reWbContent.exec(html)) !== null) found.add(m[0].replace(/["'\s)]+$/, ''));
    const arr = [...found].slice(0, 5);
    const verified = [];
    for (const u of arr) {
      try {
        const r = await axios.head(u, { timeout: 4000, validateStatus: () => true, maxRedirects: 2 });
        const ct = (r.headers && r.headers['content-type']) || '';
        const isImage = /^image\/(jpeg|jpg|png|webp|avif)/i.test(ct);
        if (r.status === 200 && isImage) verified.push(u);
      } catch (_) {}
    }
    return verified;
  } catch (_) {
    return [];
  }
}

function getOzonHeaders(cookie) {
  const base = 'https://www.ozon.ru';
  const h = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    Referer: base + '/',
    Origin: base,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate'
  };
  if (cookie) h.Cookie = cookie;
  return h;
}

/** Собрать строку Cookie из заголовков Set-Cookie ответа */
function getCookieString(setCookieHeaders) {
  if (!setCookieHeaders) return '';
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return list
    .map((c) => (typeof c === 'string' ? c : '').split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

/**
 * Разрешить короткую ссылку Ozon (ozon.ru/t/xxx) в полную (ozon.ru/product/...).
 * Запрос без следования редиректу — читаем Location и возвращаем полный URL.
 */
async function resolveOzonShortLink(shortUrl) {
  try {
    const res = await axios.get(shortUrl, {
      timeout: 8000,
      maxRedirects: 0,
      headers: getOzonHeaders(),
      validateStatus: (s) => s === 200 || s === 301 || s === 302
    });
    if (res.status === 301 || res.status === 302) {
      const location = res.headers.location;
      if (location && typeof location === 'string') {
        const full = url.resolve(shortUrl, location.trim());
        if (/ozon\.ru\/product\//i.test(full)) return full;
      }
    }
  } catch (_) {
    // 403, сеть и т.д. — не получилось разрешить
  }
  return null;
}

/**
 * Получить URL картинок товара Ozon: загрузка страницы и извлечение ссылок на изображения с CDN.
 * Короткие ссылки (ozon.ru/t/xxx) сначала разрешаются в полные по редиректу, затем грузится страница товара.
 */
async function resolveOzonImageUrls(productUrl) {
  let fetchUrl = productUrl;
  if (/ozon\.ru\/t\//i.test(productUrl)) {
    const fullUrl = await resolveOzonShortLink(productUrl);
    if (fullUrl) fetchUrl = fullUrl;
  }
  // Единый вид хоста для запроса (иногда без www отдают 403)
  if (/^https?:\/\/ozon\.ru\//i.test(fetchUrl)) {
    fetchUrl = fetchUrl.replace(/^https?:\/\/ozon\.ru/i, 'https://www.ozon.ru');
  }
  try {
    // Следуем редиректам вручную, чтобы не зациклиться на www ↔ ozon
    const opts = { timeout: 15000, maxRedirects: 0, headers: getOzonHeaders(), validateStatus: () => true };
    let res;
    let currentUrl = fetchUrl;
    const seen = new Set();
    for (let step = 0; step < 6; step++) {
      if (seen.has(currentUrl)) break;
      seen.add(currentUrl);
      res = await axios.get(currentUrl, opts);
      if (res.status === 200) break;
      if (res.status !== 301 && res.status !== 302) break;
      const loc = res.headers.location;
      if (!loc || typeof loc !== 'string') break;
      currentUrl = url.resolve(currentUrl, loc.trim());
    }
    if (res.status === 403 && fetchUrl.includes('www.ozon.ru')) {
      const altUrl = fetchUrl.replace(/https?:\/\/www\.ozon\.ru/i, 'https://ozon.ru');
      res = await axios.get(altUrl, { ...opts, maxRedirects: 5 });
    }
    if (res.status !== 200) {
      console.warn('[Ozon] fetch status=', res.status, 'url=', fetchUrl.slice(0, 80));
      return [];
    }
    const html = res.data && typeof res.data === 'string' ? res.data : '';
    const found = new Set();
    const normalize = (u) => u.replace(/\\u002F/g, '/').replace(/["'\s)]+$/, '').trim();

    // Прямые ссылки на CDN в HTML
    const cdnRegex = /https?:\/\/[^"'\s<>]*?cdn\d*\.ozon\.ru[^"'\s<>]*\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?/gi;
    const multiRegex = /https?:\/\/[^"'\s<>]*?multimedia[^"'\s<>]*\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?/gi;
    let m;
    while ((m = cdnRegex.exec(html)) !== null) found.add(normalize(m[0]));
    while ((m = multiRegex.exec(html)) !== null) found.add(normalize(m[0]));
    // img*.ozon.ru, images.ozon.ru и т.п.
    const imgOzon = /https?:\/\/[^"'\s<>]*?(?:img|images?)\d*\.?ozon\.ru[^"'\s<>]*\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?/gi;
    while ((m = imgOzon.exec(html)) !== null) found.add(normalize(m[0]));
    // JSON в скриптах (unicode-экранирование \u002F для /)
    const jsonImageRegex = /https?:\/\/[^"'\s]*?(?:cdn\d*\.ozon\.ru|multimedia[^"'\s]*\.ozon\.ru)[^"'\s]*\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s]*)?/gi;
    while ((m = jsonImageRegex.exec(html)) !== null) found.add(normalize(m[0]));
    const jsonEscaped = /https?:\\u002[Ff]\\u002[Ff][^"'\s]*?ozon[^"'\s]*?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s]*)?/gi;
    while ((m = jsonEscaped.exec(html)) !== null) found.add(normalize(m[0]));
    // Любой поддомен ozon с картинкой
    const wideOzon = /https?:\/\/[^"'\s<>]*(?:[^/]*\.)?ozon\.ru[^"'\s<>]*\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?/gi;
    while ((m = wideOzon.exec(html)) !== null) {
      const u = normalize(m[0]);
      if (!/\.(?:svg|gif|ico)(?:\?|$)/i.test(u)) found.add(u);
    }
    // Последний шанс: любая ссылка на изображение, в тексте которой есть "ozon"
    if (found.size === 0 && html.length > 500) {
      const anyImage = /https?:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?/gi;
      while ((m = anyImage.exec(html)) !== null) {
        const u = normalize(m[0]);
        if (u.toLowerCase().includes('ozon') && !/\.(?:svg|gif|ico)(?:\?|$)/i.test(u)) found.add(u);
      }
    }

    const arr = [...found].filter((u) => !/\.(?:svg|gif|ico)(?:\?|$)/i.test(u)).slice(0, 5);
    if (arr.length === 0) {
      console.warn('[Ozon] no image URLs in page, html length=', html.length, 'url=', fetchUrl.slice(0, 70));
    }
    return arr.length ? arr : [];
  } catch (e) {
    console.warn('[Ozon] error:', e?.message || e);
    return [];
  }
}

/**
 * Анализ ссылки на товар WB/Ozon и получение URL картинок для генерации примерки.
 */
async function analyzeProductUrl(productUrl) {
  const parsed = url.parse(productUrl);
  const host = (parsed.host || '').toLowerCase();

  const supportedHosts = ['www.wildberries.ru', 'wildberries.ru', 'ozon.ru', 'www.ozon.ru'];

  const isSupportedMarketplace = supportedHosts.includes(host);

  const isWearable = isSupportedMarketplace;

  if (!isSupportedMarketplace) {
    return {
      isWearable: false,
      reason: 'Поддерживаются только карточки Wildberries и Ozon',
      productUrl
    };
  }

  if (!isWearable) {
    return {
      isWearable: false,
      reason: 'Похоже, это не одежда и не аксессуар ...',
      productUrl
    };
  }

  let images = [];
  if (host.includes('wildberries')) {
    images = await resolveWildberriesImageUrls(productUrl);
    if (images.length === 0) images = getWildberriesImageUrls(productUrl);
  } else if (host.includes('ozon')) {
    images = await resolveOzonImageUrls(productUrl);
    if (images.length === 0) {
      const isShortLink = /ozon\.ru\/t\//i.test(productUrl);
      return {
        isWearable: true,
        productUrl,
        title: null,
        images: [],
        imageFetchHint: isShortLink
          ? 'По короткой ссылке Ozon фото загрузить не удалось. Откройте карточку товара в браузере на ozon.ru и вставьте полную ссылку («Поделиться» → «Скопировать ссылку»).'
          : 'Не удалось загрузить фото товара с Ozon. Попробуйте другую ссылку или откройте товар на ozon.ru и скопируйте ссылку из браузера.'
      };
    }
  }
  if (images.length === 0) {
    images = [productUrl];
  }

  return {
    isWearable: true,
    productUrl,
    title: null,
    images
  };
}

module.exports = {
  analyzeProductUrl
};

