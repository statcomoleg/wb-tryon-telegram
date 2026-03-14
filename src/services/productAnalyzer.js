const url = require('url');

/**
 * Получить URL картинок товара Wildberries по артикулу (nmId).
 * Структура: basket-XX.wbbasket.ru/vol{vol}/part{part}/{nmId}/images/big/N.webp
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

  const base = `https://basket-${hostNum}.wbbasket.ru/vol${vol}/part${part}/${nmId}/images/big/`;
  return [1, 2, 3].map((n) => `${base}${n}.webp`);
}

/**
 * Анализ ссылки на товар WB/Ozon и получение URL картинок для генерации примерки.
 */
async function analyzeProductUrl(productUrl) {
  const parsed = url.parse(productUrl);
  const host = (parsed.host || '').toLowerCase();
  const pathname = (parsed.pathname || '').toLowerCase();

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
    images = getWildberriesImageUrls(productUrl);
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

