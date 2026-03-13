const url = require('url');

/**
 * Very lightweight analyzer for Wildberries / Ozon product URLs.
 * For production you should add real scraping of product card metadata.
 */
async function analyzeProductUrl(productUrl) {
  const parsed = url.parse(productUrl);
  const host = (parsed.host || '').toLowerCase();
  const pathname = (parsed.pathname || '').toLowerCase();

  const supportedHosts = ['www.wildberries.ru', 'wildberries.ru', 'ozon.ru', 'www.ozon.ru'];

  const isSupportedMarketplace = supportedHosts.includes(host);

  // ВРЕМЕННО: любую карточку WB/Ozon считаем тем, что можно примерить
  const isWearable = isSupportedMarketplace;

 
  // For MVP: if marketplace is supported but we didn't detect keywords, still mark as not wearable.
  const isWearable = isSupportedMarketplace && pathMatchesWearable;

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

  return {
    isWearable: true,
    productUrl,
    title: null,
    images: [productUrl]
  };
}

module.exports = {
  analyzeProductUrl
};

