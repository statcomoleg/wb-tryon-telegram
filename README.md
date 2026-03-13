# Telegram mini-app: нейрофотосессия с Wildberries / Ozon

Мини-приложение для Telegram, которое:

- создаёт **виртуальную внешность** пользователя по реальным фото (через Nano Banana Pro по API);
- принимает ссылку на **карточку товара** Wildberries / Ozon;
- проверяет, что это **одежда / аксессуар** (то, что можно надеть на человека);
- генерирует **нейрофотосессию** с натуральной примеркой одной или нескольких вещей.

> В репозитории реализован каркас: бот, backend-API и WebApp-интерфейс. Интеграция с Nano Banana Pro и реальный парсинг карточек WB/Ozon отмечены как TODO.

---

## Стек

- **Node.js + Express** — backend и API
- **node-telegram-bot-api** — Telegram бот (long polling)
- **Telegram WebApp** — фронтенд мини-приложения (`public/index.html`)
- **Nano Banana Pro** — генерация изображений (через отдельный API‑клиент)

---

## Структура проекта

- `src/server.js` — HTTP‑сервер, API для WebApp, статика
- `src/telegramBot.js` — Telegram бот, кнопка для открытия мини‑приложения
- `src/services/nanoBananaClient.js` — обёртка над Nano Banana Pro (пока с моками)
- `src/services/productAnalyzer.js` — базовый анализатор ссылок WB/Ozon (пока по URL‑хеуристикам)
- `src/services/sessionStore.js` — in‑memory хранилище внешности и фотосессий
- `public/index.html` — WebApp‑интерфейс мини‑приложения
- `.env.example` — пример настроек окружения

---

## Установка и запуск (Windows)

1. **Установите Node.js** (последнюю LTS‑версию) с `https://nodejs.org`.
2. В PowerShell перейдите в папку проекта:

```bash
cd "c:\Users\Олег\Documents\Мини-апп по ВБ"
```

3. **Установите зависимости**:

```bash
npm install
```

4. Создайте файл `.env` рядом с `.env.example` и заполните его:

```bash
copy .env.example .env
```

В `.env`:

- `TELEGRAM_BOT_TOKEN` — токен бота от BotFather;
- `WEBAPP_URL` — публичный URL мини‑приложения (например, `https://<ngrok-id>.ngrok.io/webapp`);
- `NANO_BANANA_API_KEY` — ключ от Nano Banana Pro;
- `NANO_BANANA_BASE_URL` — базовый URL API Nano Banana Pro (смотрите актуальную документацию).

5. **Запуск сервера**:

```bash
npm run dev
```

Сервер поднимется на `http://localhost:3000`.

---

## Подключение Telegram бота и WebApp

1. В `BotFather` создайте бота и получите `TELEGRAM_BOT_TOKEN`.
2. Настройте **WebApp**:
   - в меню настроек бота укажите `WEBAPP_URL` как URL мини‑приложения (`.../webapp`);
   - для локальной разработки можно использовать `ngrok`:

```bash
ngrok http 3000
```

   - возьмите публичный `https://...ngrok.io` и подставьте в `WEBAPP_URL` (с `/webapp` на конце).

3. В PowerShell запустите сервер (`npm run dev`), в Telegram откройте бота и отправьте `/start`.
   Бот пришлёт кнопку «Открыть мини‑приложение», которая откроет WebApp.

---

## Логика по шагам

1. **Создание виртуальной внешности**
   - Пользователь открывает WebApp и вставляет **ссылки на свои фото**.
   - WebApp отправляет `POST /api/avatar` с `telegramUserId` и массивом `photoUrls`.
   - `server.js` вызывает `nanoBananaClient.createOrUpdateAppearance`, сохраняет результат в `sessionStore`.

2. **Анализ карточки товара**
   - Пользователь вставляет ссылку WB/Ozon.
   - WebApp отправляет `POST /api/product/analyze` с `telegramUserId` и `productUrl`.
   - `productAnalyzer` проверяет, что:
     - домен — Wildberries или Ozon;
     - по URL похоже на одежду / аксессуар (ключевые слова).
   - Если не подходит, возвращается ошибка.

3. **Генерация фотосессии**
   - WebApp вызывает `POST /api/photoshoot` с:
     - `telegramUserId`;
     - `product` (url, title, images);
     - опциональным `sessionId` (если нужно добавить вещь в существующую фотосессию).
   - Сервер создаёт или обновляет сессию в `sessionStore`.
   - Вызывает `nanoBananaClient.generatePhotoshoot` (сейчас — мок).
   - Возвращает массив `images` и `sessionId`. WebApp показывает их как «нейрофотосессию».

4. **Работа с несколькими вещами**
   - WebApp может повторно вызывать `/api/photoshoot` с тем же `sessionId`.
   - В `sessionStore` к этой сессии добавятся новые товары и сгенерированные фото.

---

## Где дописать реальную логику

- **Nano Banana Pro API**
  - файл `src/services/nanoBananaClient.js`;
  - замените TODO‑участки на реальные запросы по документации;
  - сохраните `appearance.id` и используйте его в генерации фотосессий.

- **Wildberries / Ozon**
  - файл `src/services/productAnalyzer.js`;
  - добавьте HTTP‑запрос к карточке товара и парсинг:
    - заголовка,
    - категории,
    - списка картинок товара;
  - на основе категории определяйте `isWearable` и заполняйте `images`.

- **Хранилище**
  - сейчас всё хранится в памяти (`sessionStore.js`);
  - для прод‑версии замените на БД (PostgreSQL / MongoDB / Redis и т.п.).

---

## Что уже готово под вашу задачу

- Бот, который показывает кнопку для открытия мини‑приложения.
- WebApp с тремя шагами:
  1. создание виртуальной внешности по ссылкам на фото;
  2. вставка ссылки на карточку товара WB/Ozon и проверка, что это одежда/аксессуар;
  3. запуск «нейрофотосессии» и возможность добавить новые вещи в текущую сессию.
- API‑слой, куда можно прямо сейчас подключить реальные:
  - Nano Banana Pro;
  - парсинг карточек WB и Ozon;
  - хранилище сессий в базе данных.

