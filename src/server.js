require('dotenv').config();

// Log any crash so Render captures it
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err && err.message);
  if (err && err.stack) console.error(err.stack);
  process.exit(1);
});

const express = require('express');
const cors = require('cors');
const path = require('path');

const { nanoBananaClient } = require('./services/nanoBananaClient');
const { analyzeProductUrl } = require('./services/productAnalyzer');
const { sessionStore } = require('./services/sessionStore');
const { tempImageStore } = require('./services/tempImageStore');

const app = express();

// Basic middleware (express 4.16+ has json/urlencoded built-in)
// Лимит 50mb — загрузка нескольких фото в base64 (413 Payload Too Large)
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static frontend for Telegram WebApp
app.use('/webapp', express.static(path.join(__dirname, '..', 'public')));

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || process.env.WEBAPP_URL || '')
  .replace(/\/webapp\/?$/, '')
  .replace(/\/+$/, '');

app.get('/api/temp-image/:id', (req, res) => {
  const dataUrl = tempImageStore.get(req.params.id);
  if (!dataUrl) {
    console.warn('[temp-image] 404 id=', req.params.id);
    return res.status(404).send('Not found');
  }
  const m = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!m) return res.status(400).send('Invalid');
  try {
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(Buffer.from(m[2], 'base64'));
    console.log('[temp-image] 200 id=', req.params.id, 'size=', Buffer.from(m[2], 'base64').length);
  } catch (e) {
    res.status(500).send('Error');
  }
});

app.post('/api/nanobanana-callback', (req, res) => {
  res.status(200).send();
});

// Telegram webhook (чтобы не было 409: только один приём обновлений вместо polling)
app.post('/telegram-webhook', (req, res) => {
  res.status(200).send();
  try {
    const { processUpdate } = require('./telegramBot');
    if (processUpdate && req.body) processUpdate(req.body);
  } catch (err) {
    console.error('Telegram webhook process error:', err && err.message);
  }
});

/**
 * Тест Nano Banana Pro: один запрос на генерацию (яблоко на белом фоне).
 * Откройте в браузере: https://ваш-сервис.onrender.com/api/test-nano-banana
 * Если success: true — генератор работает. Если success: false — смотрите error.
 */
app.get('/api/test-nano-banana', async (req, res) => {
  try {
    const result = await nanoBananaClient.testGeneration();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err)
    });
  }
});

/**
 * API: clear appearance (before uploading one-by-one to avoid 413)
 * Body: { telegramUserId: string }
 */
app.post('/api/avatar/clear', (req, res) => {
  try {
    const { telegramUserId } = req.body || {};
    if (!telegramUserId) {
      return res.status(400).json({ error: 'telegramUserId required' });
    }
    sessionStore.clearAppearance(telegramUserId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error in /api/avatar/clear:', err);
    return res.status(500).json({ error: 'Failed to clear avatar' });
  }
});

/**
 * API: upload one photo for appearance (small request to avoid 413)
 * Body: { telegramUserId: string, photoDataUrl: string }
 */
app.post('/api/avatar/upload', async (req, res) => {
  try {
    const { telegramUserId, photoDataUrl } = req.body || {};
    if (!telegramUserId || !photoDataUrl || typeof photoDataUrl !== 'string') {
      return res.status(400).json({ error: 'telegramUserId and photoDataUrl required' });
    }
    const appended = sessionStore.appendAppearancePhoto(telegramUserId, photoDataUrl);
    const appearance = sessionStore.getAppearance(telegramUserId);
    return res.json({ ok: true, appended, appearance });
  } catch (err) {
    console.error('Error in /api/avatar/upload:', err);
    return res.status(500).json({ error: 'Failed to upload photo' });
  }
});

/**
 * API: create / update user appearance profile (full list — for URL-only or small payloads)
 * Body: { telegramUserId: string, photoUrls: string[] }
 */
app.post('/api/avatar', async (req, res) => {
  try {
    const { telegramUserId, photoUrls } = req.body || {};

    if (!telegramUserId || !Array.isArray(photoUrls) || photoUrls.length === 0) {
      return res.status(400).json({ error: 'telegramUserId and photoUrls[] are required' });
    }

    const appearance = await nanoBananaClient.createOrUpdateAppearance({
      userId: telegramUserId,
      photoUrls
    });

    sessionStore.setAppearance(telegramUserId, appearance);

    return res.json({ appearance });
  } catch (err) {
    console.error('Error in /api/avatar:', err);
    return res.status(500).json({ error: 'Failed to create avatar' });
  }
});

/**
 * API: analyze a product URL (Wildberries/Ozon), ensure it is clothing/accessory
 * Body: { telegramUserId: string, productUrl: string }
 */
app.post('/api/product/analyze', async (req, res) => {
  try {
    const { telegramUserId, productUrl } = req.body || {};

    if (!telegramUserId || !productUrl) {
      return res.status(400).json({ error: 'telegramUserId and productUrl are required' });
    }

    const appearance = sessionStore.getAppearance(telegramUserId);
    if (!appearance) {
      return res.status(400).json({ error: 'Appearance not created yet' });
    }

    const analysis = await analyzeProductUrl(productUrl);

    if (!analysis.isWearable) {
      return res.status(400).json({
        error: 'Этот товар нельзя естественно примерить на человеке (не одежда/аксессуар)'
      });
    }

    return res.json(analysis);
  } catch (err) {
    console.error('Error in /api/product/analyze:', err);
    return res.status(500).json({ error: 'Failed to analyze product' });
  }
});

/**
 * API: generate photoshoot with current appearance and product images
 * Body: {
 *   telegramUserId: string,
 *   product: {
 *     url: string,
 *     title?: string,
 *     images: string[]
 *   },
 *   sessionId?: string  // if provided, add clothing to existing session
 * }
 */
app.post('/api/photoshoot', async (req, res) => {
  try {
    const { telegramUserId, product, sessionId } = req.body || {};

    if (!telegramUserId || !product) {
      return res.status(400).json({ error: 'telegramUserId and product are required' });
    }
    const isProductPageUrl = (u) =>
      typeof u === 'string' &&
      /\b(ozon\.ru\/t\/|ozon\.ru\/product\/|wildberries\.ru\/catalog\/)/i.test(u);
    let productImages = Array.isArray(product.images) ? product.images : [];

    // Разрешаем картинки по product.url, если пришли только ссылки на страницы или пустой массив (Ozon короткая ссылка)
    if (product.url && (productImages.length === 0 || productImages.every(isProductPageUrl))) {
      try {
        const analysis = await analyzeProductUrl(product.url);
        if (analysis.isWearable && Array.isArray(analysis.images) && analysis.images.length > 0) {
          const resolved = analysis.images.filter((u) => !isProductPageUrl(u));
          if (resolved.length > 0) productImages = resolved;
        }
        if (productImages.length === 0 && analysis.imageFetchHint) {
          return res.status(400).json({ error: analysis.imageFetchHint });
        }
      } catch (e) {
        console.warn('[photoshoot] Resolve product images from URL failed:', e?.message);
      }
    }
    if (productImages.length === 0) {
      return res.status(400).json({
        error: 'Нет фото товара. Используйте вкладку «Карточка WB/Ozon» и нажмите «Проверить товар» или вкладку «Загрузить вручную» и вставьте ссылки на изображения.'
      });
    }

    const appearance = sessionStore.getAppearance(telegramUserId);
    if (!appearance) {
      return res.status(400).json({ error: 'Appearance not created yet' });
    }

    // Create or get photoshoot session
    const session = sessionStore.upsertSession(telegramUserId, {
      sessionId,
      product
    });

    // Call Nano Banana Pro client to generate a collage / photoshoot
    const generated = await nanoBananaClient.generatePhotoshoot({
      appearance,
      productImages,
      sessionId: session.id
    });

    // Save generated images to session
    sessionStore.appendGeneratedImages(telegramUserId, session.id, generated.images);

    return res.json({
      sessionId: session.id,
      images: generated.images,
      generated: generated.generated === true,
      error: generated.error || null
    });
  } catch (err) {
    console.error('Error in /api/photoshoot:', err);
    const message = err && err.message ? err.message : 'Failed to generate photoshoot';
    return res.status(500).json({ error: message });
  }
});

/**
 * API: get current sessions for a user
 */
app.get('/api/sessions/:telegramUserId', (req, res) => {
  const { telegramUserId } = req.params;
  const sessions = sessionStore.getSessions(telegramUserId);
  res.json({ sessions });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  // Load and start bot only after server is up (avoids crash if bot module fails)
  setImmediate(() => {
    try {
      const { initBot } = require('./telegramBot');
      initBot();
    } catch (err) {
      console.error('Telegram bot load/init failed (server still running):', err && err.message);
      if (err && err.stack) console.error(err.stack);
    }
  });
});

