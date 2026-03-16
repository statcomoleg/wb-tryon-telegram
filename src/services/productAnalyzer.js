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
  // wbbasket.ru обычно стабильнее при прямой загрузке
  const base = `https://basket-${hostNum}.wbbasket.ru/${pathPart}`;
  return [1, 2, 3].map((n) => `${base}${n}.webp`);
}

const WB_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9'
};

/** Проверка URL картинки: GET (часть CDN не отдаёт HEAD), до 2 попыток. */
async function checkImageUrlOk(imageUrl, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 8000,
        maxContentLength: 8 * 1024 * 1024,
        maxRedirects: 5,
        validateStatus: (s) => s === 200,
        headers: WB_HEADERS
      });
      const ct = (res.headers && res.headers['content-type']) || '';
      const isImage = /^image\/(jpeg|jpg|png|webp|avif)/i.test(ct);
      const hasBody = res.data && res.data.length > 200;
      if (isImage && hasBody) return true;
    } catch (_) {}
    if (attempt < retries) await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/**
 * Вернуть рабочие URL картинок WB: wbbasket.ru / wb.ru, пути big/plain/hq, расширения .webp и .jpg.
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

  /** Собрать рабочие URL для домена/пути: проверяем индексы 1..5 и расширения .webp, .jpg */
  const tryDomain = async (domain, pathPart, host) => {
    const found = [];
    const exts = ['webp', 'jpg'];
    for (let n = 1; n <= 5; n++) {
      for (const ext of exts) {
        const u = `https://basket-${host}.${domain}/${pathPart}${n}.${ext}`;
        if (found.includes(u)) continue;
        const ok = await checkImageUrlOk(u);
        if (ok) {
          found.push(u);
          break; // один индекс — один URL
        }
      }
      if (found.length >= 3) return found;
    }
    return found.length ? found : null;
  };

  // Сначала парсинг страницы (часто даёт точные URL с любого зеркала)
  const fromPage = await getWildberriesImageUrlsFromPage(productUrl);
  if (fromPage.length >= 1) return fromPage.slice(0, 5);

  // wbbasket.ru часто стабильнее, потом wb.ru
  for (const domain of ['wbbasket.ru', 'wb.ru']) {
    const urls = await tryDomain(domain, pathPartBig, hostNum);
    if (urls && urls.length) return urls;
  }
  for (const domain of ['wbbasket.ru', 'wb.ru']) {
    const urls = await tryDomain(domain, pathPartPlain, hostNum);
    if (urls && urls.length) return urls;
  }
  if (hostNum !== '01') {
    for (const domain of ['wbbasket.ru', 'wb.ru']) {
      const urls = await tryDomain(domain, pathPartBig, '01');
      if (urls && urls.length) return urls;
    }
  }

  for (const host of ['31', '18', '17', '01']) {
    const urls = await tryDomain('wbcontent.net', pathPartHq, host);
    if (urls && urls.length) return urls;
  }
  for (const host of ['31', '18', '17', '01']) {
    const urls = await tryDomain('wbcontent.net', pathPartBig, host);
    if (urls && urls.length) return urls;
  }

  // Иногда формула basket-XX для больших vol устаревает: подбираем basket быстрым перебором.
  // Это покрывает случаи вроде nmId=502312919 (vol=5023), где "18" может быть неверным.
  const probeBasketHost = async (domain, pathPart) => {
    const hostCandidates = Array.from({ length: 40 }, (_, i) => String(i + 1).padStart(2, '0'));
    const exts = ['webp', 'jpg'];
    const n = 1; // сначала проверяем первое фото, этого достаточно чтобы найти basket

    const checkOne = async (host) => {
      for (const ext of exts) {
        const u = `https://basket-${host}.${domain}/${pathPart}${n}.${ext}`;
        // быстрее: одна попытка, и чуть меньший таймаут
        const ok = await checkImageUrlOk(u, 1);
        if (ok) return { host, url: u };
      }
      return null;
    };

    // батчами, чтобы не грузить сеть
    const batchSize = 6;
    for (let i = 0; i < hostCandidates.length; i += batchSize) {
      const batch = hostCandidates.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(checkOne));
      const hit = results.find(Boolean);
      if (hit) {
        // нашли basket — добираем ещё 2-3 фото с этого же хоста
        const more = await tryDomain(domain, pathPart, hit.host);
        return more && more.length ? more : [hit.url];
      }
    }
    return null;
  };

  for (const domain of ['wbbasket.ru', 'wb.ru']) {
    const probed = await probeBasketHost(domain, pathPartBig);
    if (probed && probed.length) return probed;
  }

  // Фолбэк: возвращаем сконструированные URL без проверки (прокси попробует загрузить)
  const constructed = getWildberriesImageUrls(productUrl);
  if (constructed.length) return constructed;
  return [`https://basket-${hostNum}.wbbasket.ru/${pathPartBig}1.webp`];
}

/**
 * Запасной вариант: загрузить страницу товара WB и вытащить URL картинок из HTML.
 * Referer и повторные попытки повышают стабильность.
 */
async function getWildberriesImageUrlsFromPage(productUrl) {
  const opts = (url) => ({
    timeout: 12000,
    maxRedirects: 5,
    headers: {
      ...WB_HEADERS,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: 'https://www.wildberries.ru/'
    },
    validateStatus: (s) => s === 200
  });
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await axios.get(productUrl, opts(productUrl));
      const html = (res.data && typeof res.data === 'string') ? res.data : '';
      const found = new Set();
      const reWb = /https?:\/\/[^"'\s<>]*?(?:basket-\d+\.(?:wb\.ru|wbbasket\.ru)|[\w-]+\.wb\.ru)[^"'\s<>]*\.(?:webp|jpg|jpeg|png|avif)(?:\?[^"'\s<>]*)?/gi;
      const reWbContent = /https?:\/\/[^"'\s<>]*?(?:basket-\d+\.wbcontent\.net|[\w-]+\.wbcontent\.net)[^"'\s<>]*\.(?:webp|jpg|jpeg|png|avif)(?:\?[^"'\s<>]*)?/gi;
      const reGeneric = /https?:\/\/[^"'\s<>]*?(?:wb\.ru|wbbasket\.ru|wbcontent\.net)[^"'\s<>]*\.(?:webp|jpg|jpeg|png|avif)(?:\?[^"'\s<>]*)?/gi;
      let m;
      while ((m = reWb.exec(html)) !== null) found.add(m[0].replace(/["'\s)]+$/, '').replace(/\\u002F/g, '/'));
      while ((m = reWbContent.exec(html)) !== null) found.add(m[0].replace(/["'\s)]+$/, '').replace(/\\u002F/g, '/'));
      while ((m = reGeneric.exec(html)) !== null) found.add(m[0].replace(/["'\s)]+$/, '').replace(/\\u002F/g, '/'));
      const arr = [...found].slice(0, 7);
      const verified = [];
      for (const u of arr) {
        const ok = await checkImageUrlOk(u, 1);
        if (ok) verified.push(u);
        if (verified.length >= 3) break;
      }
      if (verified.length) return verified;
    } catch (_) {}
    if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
  }
  return [];
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
  let fetchUrl = (productUrl || '').trim().replace(/\s+/g, '%20');
  if (/ozon\.ru\/t\//i.test(fetchUrl)) {
    const fullUrl = await resolveOzonShortLink(fetchUrl);
    if (fullUrl) fetchUrl = fullUrl;
  }
  if (/^https?:\/\/ozon\.ru\//i.test(fetchUrl)) {
    fetchUrl = fetchUrl.replace(/^https?:\/\/ozon\.ru/i, 'https://www.ozon.ru');
  }
  const urlNoQuery = (u) => {
    try {
      const parsed = url.parse(u);
      return (parsed.protocol || 'https:') + '//' + (parsed.host || '') + (parsed.pathname || '/');
    } catch (_) {
      return u;
    }
  };
  // Строго 1 редирект — иначе Ozon зацикливает и даёт "Maximum number of redirects exceeded"
  const opts = {
    timeout: 20000,
    maxRedirects: 1,
    headers: getOzonHeaders(),
    validateStatus: () => true
  };
  const getOne = async (u) => {
    try {
      return await axios.get(u, opts);
    } catch (e) {
      if (/redirects? exceeded/i.test(e?.message || '')) return { status: 307 };
      throw e;
    }
  };
  try {
    const cleanUrl = urlNoQuery(fetchUrl);
    let res = await getOne(cleanUrl);
    if (res.status !== 200) res = await getOne(fetchUrl);
    if (res.status !== 200 && fetchUrl.includes('www.ozon.ru')) {
      res = await getOne(fetchUrl.replace(/https?:\/\/www\.ozon\.ru/i, 'https://ozon.ru'));
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

  const OZON_PARSER_URL = (process.env.OZON_PARSER_URL || '').trim();

  let images = [];
  if (host.includes('wildberries')) {
    images = await resolveWildberriesImageUrls(productUrl);
    if (images.length === 0) images = getWildberriesImageUrls(productUrl);
  } else if (host.includes('ozon')) {
    if (OZON_PARSER_URL) {
      try {
        const parserRes = await axios.post(OZON_PARSER_URL, { url: productUrl }, { timeout: 20000 });
        const list = parserRes?.data?.images || parserRes?.data?.imageUrls || parserRes?.data;
        if (Array.isArray(list) && list.length > 0) {
          images = list.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));
        }
      } catch (e) {
        console.warn('[Ozon] external parser failed:', e?.message);
      }
    }
    if (images.length === 0) {
      images = await resolveOzonImageUrls(productUrl);
    }
    if (images.length === 0) {
      const isShortLink = /ozon\.ru\/t\//i.test(productUrl);
      return {
        isWearable: true,
        productUrl,
        title: null,
        images: [],
        imageFetchHint: (isShortLink
          ? 'По короткой ссылке Ozon фото загрузить не удалось. '
          : 'Не удалось загрузить фото с Ozon автоматически. ') +
          'Вставьте прямые ссылки на фото в поле «Ссылки на фото товара вручную» (правый клик по фото на карточке → Копировать адрес изображения) и нажмите «Запустить фотосессию».'
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

