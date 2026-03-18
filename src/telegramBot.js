const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://example.com/webapp';
const USE_WEBHOOK = process.env.TELEGRAM_USE_WEBHOOK === 'true';
const { persistDb } = require('./services/persistDb');

let botInstance = null;

async function fetchTelegramWebhookInfo() {
  if (!BOT_TOKEN) return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not set' };
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`;
    const resp = await axios.get(url, { timeout: 15000 });
    return resp.data;
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function fetchTelegramMe() {
  if (!BOT_TOKEN) return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not set' };
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getMe`;
    const resp = await axios.get(url, { timeout: 15000 });
    return resp.data;
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function initBot() {
  if (!BOT_TOKEN) {
    console.warn('TELEGRAM_BOT_TOKEN is not set. Telegram bot will not be started.');
    return;
  }

  try {
    const bot = new TelegramBot(BOT_TOKEN, { polling: !USE_WEBHOOK });
    botInstance = bot;
  } catch (err) {
    console.error('Telegram bot failed to start:', err && err.message);
    return;
  }

  const bot = botInstance;

  // Helpful diagnostics for Render / multi-instance issues
  bot.on('polling_error', (err) => {
    console.error('[telegram] polling_error:', err?.message || err);
    if (err?.response?.body) console.error('[telegram] polling_error body:', JSON.stringify(err.response.body));
  });
  bot.on('webhook_error', (err) => {
    console.error('[telegram] webhook_error:', err?.message || err);
  });

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from?.first_name || '';
    const telegramUserId = String(msg.from?.id || chatId);

    // Persist mapping so we can notify user in bot later
    try {
      persistDb.upsertTgUser({ telegramUserId, chatId });
      console.log('[telegram] /start mapping saved', { telegramUserId, chatId });
    } catch (_) {}

    try {
      await bot.sendMessage(
        chatId,
        `Привет, ${firstName || 'друг'}!\n\n` +
          'Это мини-приложение для нейрофотосессий с примеркой вещей с Wildberries и Ozon.\n' +
          'Нажми кнопку ниже, чтобы открыть мини-приложение.',
        {
          reply_markup: {
            keyboard: [
              [
                {
                  text: 'Открыть мини-приложение',
                  web_app: { url: WEBAPP_URL }
                }
              ]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
          }
        }
      );
    } catch (err) {
      console.error('Error in /start handler:', err);
    }
  });

  if (USE_WEBHOOK) {
    const baseUrl = (WEBAPP_URL || '').replace(/\/webapp\/?$/, '').replace(/\/+$/, '');
    const webhookUrl = baseUrl ? `${baseUrl}/telegram-webhook` : null;
    if (webhookUrl) {
      bot.setWebHook(webhookUrl).then(() => {
        console.log('Telegram bot webhook set:', webhookUrl);
      }).catch((err) => {
        console.error('Telegram setWebHook failed:', err && err.message);
      });
    } else {
      console.warn('TELEGRAM_USE_WEBHOOK=true but WEBAPP_URL has no base (e.g. https://xxx.onrender.com/webapp).');
    }
  } else {
    console.log('Telegram bot started with long polling.');
  }
}

function processUpdate(update) {
  if (botInstance) botInstance.processUpdate(update);
}

module.exports = {
  initBot,
  getBot: () => botInstance,
  processUpdate,
  fetchTelegramWebhookInfo,
  fetchTelegramMe
};

