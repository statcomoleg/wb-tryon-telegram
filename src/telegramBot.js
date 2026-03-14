const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://example.com/webapp';
const USE_WEBHOOK = process.env.TELEGRAM_USE_WEBHOOK === 'true';

let botInstance = null;

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

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from?.first_name || '';

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
  processUpdate
};

