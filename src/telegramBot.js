const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://example.com/webapp';

let botInstance = null;

function initBot() {
  if (!BOT_TOKEN) {
    console.warn('TELEGRAM_BOT_TOKEN is not set. Telegram bot will not be started.');
    return;
  }

  const bot = new TelegramBot(BOT_TOKEN, { polling: true });
  botInstance = bot;

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

  console.log('Telegram bot started with long polling.');
}

module.exports = {
  initBot,
  getBot: () => botInstance
};

