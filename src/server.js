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

const { initBot } = require('./telegramBot');
const { nanoBananaClient } = require('./services/nanoBananaClient');
const { analyzeProductUrl } = require('./services/productAnalyzer');
const { sessionStore } = require('./services/sessionStore');

const app = express();

// Basic middleware (express 4.16+ has json/urlencoded built-in)
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static frontend for Telegram WebApp
app.use('/webapp', express.static(path.join(__dirname, '..', 'public')));

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * API: create / update user appearance profile
 * Body: { telegramUserId: string, photoUrls: string[] }
 */
app.post('/api/avatar', async (req, res) => {
  try {
    const { telegramUserId, photoUrls } = req.body || {};

    if (!telegramUserId || !Array.isArray(photoUrls) || photoUrls.length === 0) {
      return res.status(400).json({ error: 'telegramUserId and photoUrls[] are required' });
    }

    // Call Nano Banana Pro (placeholder client) to create / update appearance
    const appearance = await nanoBananaClient.createOrUpdateAppearance({
      userId: telegramUserId,
      photoUrls
    });

    // Save to in-memory store (prototype; replace with DB in production)
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

    if (!telegramUserId || !product || !Array.isArray(product.images) || product.images.length === 0) {
      return res.status(400).json({ error: 'telegramUserId and product.images[] are required' });
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
      productImages: product.images,
      sessionId: session.id
    });

    // Save generated images to session
    sessionStore.appendGeneratedImages(telegramUserId, session.id, generated.images);

    return res.json({
      sessionId: session.id,
      images: generated.images
    });
  } catch (err) {
    console.error('Error in /api/photoshoot:', err);
    return res.status(500).json({ error: 'Failed to generate photoshoot' });
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
  // Start bot after server is up; don't crash if bot fails
  setImmediate(() => {
    try {
      initBot();
    } catch (err) {
      console.error('Telegram bot init failed (server still running):', err && err.message);
    }
  });
});

