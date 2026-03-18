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
const { persistDb } = require('./services/persistDb');
const { resultImageStore } = require('./services/resultImageStore');
const { getBot } = require('./telegramBot');

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

app.get('/api/result-image/:tryonId', (req, res) => {
  try {
    const { tryonId } = req.params || {};
    if (!tryonId) return res.status(400).send('Bad request');
    if (!resultImageStore.exists(tryonId)) return res.status(404).send('Not found');
    const buf = resultImageStore.readBuffer(tryonId);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buf);
  } catch (e) {
    res.status(500).send('Error');
  }
});

async function notifyBotTryonSuccess({ telegramUserId, productTitle, resultUrl, tryonId }) {
  const chatId = persistDb.getChatIdByTelegramUserId(telegramUserId);
  const bot = getBot && getBot();
  if (!chatId) {
    console.warn('[bot] no chatId for telegramUserId=', telegramUserId, '(send /start in bot chat)');
    return;
  }
  if (!bot) {
    console.warn('[bot] bot instance is not ready (check TELEGRAM_BOT_TOKEN / webhook/polling)');
    return;
  }

  try {
    await bot.sendMessage(chatId, 'Примерка готова!');
  } catch (e) {
    console.warn('[bot] sendMessage failed:', e?.message || e);
  }

  // Prefer sending as buffer (Telegram часто не может скачать с временных хостингов)
  if (tryonId && resultImageStore.exists(tryonId)) {
    try {
      const buf = resultImageStore.readBuffer(tryonId);
      await bot.sendPhoto(chatId, buf, {
        caption:
          (productTitle ? `Товар: ${productTitle}\n` : '') +
          'Нажмите «Открыть мини-приложение», чтобы посмотреть историю примерок.'
      });
      return;
    } catch (e) {
      console.warn('[bot] sendPhoto(buffer) failed:', e?.message || e);
    }
  }

  if (resultUrl) {
    try {
      await bot.sendPhoto(chatId, resultUrl, {
        caption:
          (productTitle ? `Товар: ${productTitle}\n` : '') +
          'Нажмите «Открыть мини-приложение», чтобы посмотреть историю примерок.'
      });
    } catch (e) {
      console.warn('[bot] sendPhoto(url) failed:', e?.message || e);
    }
  }
}

async function notifyBotTryonError({ telegramUserId, errorText }) {
  const chatId = persistDb.getChatIdByTelegramUserId(telegramUserId);
  const bot = getBot && getBot();
  if (!chatId) {
    console.warn('[bot] no chatId for telegramUserId=', telegramUserId, '(send /start in bot chat)');
    return;
  }
  if (!bot) {
    console.warn('[bot] bot instance is not ready (check TELEGRAM_BOT_TOKEN / webhook/polling)');
    return;
  }
  try {
    await bot.sendMessage(chatId, `Примерка не получилась.\n\nПричина: ${errorText || 'ошибка генерации'}`);
  } catch (e) {
    console.warn('[bot] sendMessage(error) failed:', e?.message || e);
  }
}

// Debug endpoints (guarded by DEBUG_TOKEN)
function debugAllowed(req) {
  const token = (process.env.DEBUG_TOKEN || '').trim();
  if (!token) return false;
  const got = String(req.query.debugToken || req.headers['x-debug-token'] || '').trim();
  return got && got === token;
}

app.get('/api/debug/tg-user/:telegramUserId', (req, res) => {
  if (!debugAllowed(req)) return res.status(404).send('Not found');
  const telegramUserId = String(req.params.telegramUserId || '');
  const chatId = persistDb.getChatIdByTelegramUserId(telegramUserId);
  res.json({ telegramUserId, hasChatId: !!chatId, chatId: chatId || null, botReady: !!(getBot && getBot()) });
});

app.post('/api/debug/bot-send', async (req, res) => {
  if (!debugAllowed(req)) return res.status(404).send('Not found');
  const { telegramUserId, text } = req.body || {};
  const chatId = persistDb.getChatIdByTelegramUserId(String(telegramUserId || ''));
  const bot = getBot && getBot();
  if (!chatId) return res.status(400).json({ ok: false, error: 'No chatId for this telegramUserId (send /start)' });
  if (!bot) return res.status(500).json({ ok: false, error: 'Bot is not ready (token/webhook/polling)' });
  try {
    await bot.sendMessage(chatId, String(text || 'Тест: бот может отправлять сообщения.'));
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

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
  // Must respond fast (<15s).
  res.status(200).send();

  (async () => {
    const data = req.body?.data || req.body || {};
    const taskId = data?.taskId;
    const successFlag = data?.successFlag;
    const resultImageUrl = data?.response?.resultImageUrl || data?.response?.originImageUrl || null;
    const errorMessage = data?.errorMessage || data?.message || null;

    if (!taskId) return;

    if (successFlag === 1 && resultImageUrl) {
      // First: mark success with raw URL to not lose result even if caching fails.
      const row = persistDb.updateTryonByTaskId(taskId, {
        status: 'success',
        resultImages: [resultImageUrl],
        error: null
      });
      if (!row) return;

      // Cache result on our server (so Telegram WebView can always load it)
      let cachedPublicUrl = null;
      if (PUBLIC_APP_URL) {
        try {
          await resultImageStore.saveFromUrl({ tryonId: row.id, url: resultImageUrl });
          cachedPublicUrl = `${PUBLIC_APP_URL}/api/result-image/${row.id}`;
          persistDb.updateTryonById(row.id, { resultImages: [cachedPublicUrl] });
        } catch (e) {
          console.warn('[result-image] cache failed:', e?.message || e);
        }
      }

      const finalUrl = cachedPublicUrl || resultImageUrl;
      sessionStore.appendGeneratedImages(row.telegramUserId, row.sessionId, [finalUrl]);
      await notifyBotTryonSuccess({
        telegramUserId: row.telegramUserId,
        productTitle: row.productTitle,
        resultUrl: finalUrl,
        tryonId: row.id
      });
      return;
    }

    if (successFlag === 2 || successFlag === 3) {
      const row = persistDb.updateTryonByTaskId(taskId, {
        status: 'error',
        error: errorMessage || 'Generation failed'
      });
      if (row) {
        await notifyBotTryonError({
          telegramUserId: row.telegramUserId,
          errorText: errorMessage || 'Generation failed'
        });
      }
    }
  })().catch((e) => {
    console.error('[nanobanana-callback] error:', e?.message || e);
  });
});

// Fallback poller: если callback не пришёл, сами дёргаем record-info и обновляем историю.
let pollerRunning = false;
setInterval(async () => {
  if (pollerRunning) return;
  pollerRunning = true;
  try {
    const tasks = persistDb.listRunningTryons({ limit: 8 });
    for (const t of tasks) {
      // не долбим свежие задачи
      const ageMs = Date.now() - new Date(t.createdAt || Date.now()).getTime();
      if (ageMs < 12000) continue;
      try {
        const st = await nanoBananaClient.getTaskStatus(t.taskId);
        if (st.successFlag === 1 && st.resultUrl) {
          const row = persistDb.updateTryonByTaskId(t.taskId, {
            status: 'success',
            resultImages: [st.resultUrl],
            error: null
          });
          if (row) {
            let cachedPublicUrl = null;
            if (PUBLIC_APP_URL) {
              try {
                await resultImageStore.saveFromUrl({ tryonId: row.id, url: st.resultUrl });
                cachedPublicUrl = `${PUBLIC_APP_URL}/api/result-image/${row.id}`;
                persistDb.updateTryonById(row.id, { resultImages: [cachedPublicUrl] });
              } catch (e) {
                console.warn('[result-image] cache failed:', e?.message || e);
              }
            }
            const finalUrl = cachedPublicUrl || st.resultUrl;
            sessionStore.appendGeneratedImages(row.telegramUserId, row.sessionId, [finalUrl]);
            notifyBotTryonSuccess({
              telegramUserId: row.telegramUserId,
              productTitle: row.productTitle,
              resultUrl: finalUrl,
              tryonId: row.id
            }).catch(() => {});
          }
        } else if (st.successFlag === 2 || st.successFlag === 3) {
          const row = persistDb.updateTryonByTaskId(t.taskId, {
            status: 'error',
            error: st.errorMessage || 'Generation failed'
          });
          if (row) {
            notifyBotTryonError({
              telegramUserId: row.telegramUserId,
              errorText: st.errorMessage || 'Generation failed'
            }).catch(() => {});
          }
        }
      } catch (e) {
        // если record-info недоступен — подождём следующий тик
      }
    }
  } catch (_) {
  } finally {
    pollerRunning = false;
  }
}, 15000);

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

    // Async mode: create task and return immediately (do not block mini-app UI)
    const enqueue = await nanoBananaClient.enqueueTryOn({
      appearance,
      productImages,
      sessionId: session.id
    });

    const row = persistDb.createTryon({
      telegramUserId,
      sessionId: session.id,
      productUrl: product.url,
      productTitle: product.title || null,
      productImages: productImages.slice(0, 5),
      taskId: enqueue.taskId,
      status: 'running'
    });

    return res.json({
      sessionId: session.id,
      tryonId: row.id,
      status: row.status
    });
  } catch (err) {
    console.error('Error in /api/photoshoot:', err);
    const message = err && err.message ? err.message : 'Failed to generate photoshoot';
    return res.status(500).json({ error: message });
  }
});

// History API (persistent)
app.get('/api/tryons/:telegramUserId', (req, res) => {
  try {
    const telegramUserId = String(req.params.telegramUserId || '');
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    if (!telegramUserId) return res.status(400).json({ error: 'telegramUserId required' });
    const items = persistDb.listTryons(telegramUserId, { limit });
    return res.json({ tryons: items });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load history' });
  }
});

app.get('/api/tryon/:id', (req, res) => {
  try {
    const row = persistDb.getTryon(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json(row);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load tryon' });
  }
});

// Add item to existing session (manual photos only)
app.post('/api/tryon/:id/add-item', async (req, res) => {
  try {
    const base = persistDb.getTryon(req.params.id);
    if (!base) return res.status(404).json({ error: 'Not found' });
    const { telegramUserId, images } = req.body || {};
    if (!telegramUserId || String(telegramUserId) !== String(base.telegramUserId)) {
      return res.status(400).json({ error: 'telegramUserId mismatch' });
    }
    const productImages = Array.isArray(images) ? images : [];
    if (productImages.length === 0) {
      return res.status(400).json({ error: 'images[] required' });
    }

    const appearance = sessionStore.getAppearance(telegramUserId);
    if (!appearance || !(appearance.referenceImages || []).length) {
      return res.status(400).json({ error: 'Appearance not created yet' });
    }

    const enqueue = await nanoBananaClient.enqueueTryOn({
      appearance,
      productImages,
      sessionId: base.sessionId
    });

    const row = persistDb.createTryon({
      telegramUserId,
      sessionId: base.sessionId,
      productUrl: base.productUrl,
      productTitle: base.productTitle || 'Добавленная вещь',
      productImages: productImages.slice(0, 5),
      taskId: enqueue.taskId,
      status: 'running'
    });

    return res.json({ ok: true, tryonId: row.id, status: row.status, sessionId: row.sessionId });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Failed to add item' });
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

