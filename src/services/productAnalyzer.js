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
  const makeUrl = (domain, pathPart, n) => `https://basket-${hostNum}.${domain}/${pathPart}${n}.webp`;

  const tryDomain = async (domain, pathPart) => {
    const found = [];
    for (let n = 1; n <= 3; n++) {
      try {
        const res = await axios.head(makeUrl(domain, pathPart, n), {
          timeout: 6000,
          validateStatus: () => true,
          maxRedirects: 3
        });
        if (res.status === 200) found.push(makeUrl(domain, pathPart, n));
      } catch (_) {}
    }
    return found.length ? found : null;
  };

  for (const domain of ['wb.ru', 'wbbasket.ru']) {
    const urls = await tryDomain(domain, pathPartBig);
    if (urls && urls.length) return urls;
  }
  for (const domain of ['wb.ru', 'wbbasket.ru']) {
    const urls = await tryDomain(domain, pathPartPlain);
    if (urls && urls.length) return urls;
  }
  return [makeUrl('wb.ru', pathPartBig, 1)];
}

/**
 * Получить URL картинок товара Ozon: загрузка страницы и извлечение ссылок на изображения с CDN.
 */
async function resolveOzonImageUrls(productUrl) {
  const parsed = url.parse(productUrl);
  const pathname = (parsed.pathname || '');
  const match = pathname.match(/\/product\/(\d+)/);
  if (!match) return [];

  try {
    const res = await axios.get(productUrl, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8'
      },
      validateStatus: (status) => status === 200
    });
    const html = res.data && typeof res.data === 'string' ? res.data : '';
    const cdnRegex = /https?:\/\/[^"'\s<>]*?cdn\d*\.ozon\.ru[^"'\s<>]*\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?/gi;
    const multiRegex = /https?:\/\/[^"'\s<>]*?multimedia[^"'\s<>]*\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?/gi;
    const found = new Set();
    let m;
    while ((m = cdnRegex.exec(html)) !== null) found.add(m[0].replace(/["'\s)]+$/, ''));
    while ((m = multiRegex.exec(html)) !== null) found.add(m[0].replace(/["'\s)]+$/, ''));
    const arr = [...found].filter((u) => !/\.(?:svg|gif|ico)(?:\?|$)/i.test(u)).slice(0, 5);
    return arr.length ? arr : [];
  } catch (_) {
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

