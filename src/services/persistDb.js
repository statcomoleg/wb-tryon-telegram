const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ tgUsers: {}, tryons: [] }, null, 2), 'utf8');
  }
}

function load() {
  ensure();
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const data = raw ? JSON.parse(raw) : {};
    if (!data.tgUsers) data.tgUsers = {};
    if (!Array.isArray(data.tryons)) data.tryons = [];
    return data;
  } catch (_) {
    return { tgUsers: {}, tryons: [] };
  }
}

function save(data) {
  ensure();
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DB_PATH);
}

function upsertTgUser({ telegramUserId, chatId }) {
  if (!telegramUserId || !chatId) return;
  const db = load();
  db.tgUsers[String(telegramUserId)] = { chatId: Number(chatId), updatedAt: new Date().toISOString() };
  save(db);
}

function getChatIdByTelegramUserId(telegramUserId) {
  if (!telegramUserId) return null;
  const db = load();
  const row = db.tgUsers[String(telegramUserId)];
  return row && row.chatId ? row.chatId : null;
}

function createTryon({
  telegramUserId,
  sessionId,
  productUrl,
  productTitle,
  productImages = [],
  taskId,
  status
}) {
  const db = load();
  const now = new Date().toISOString();
  const id = uuidv4();
  const row = {
    id,
    telegramUserId: String(telegramUserId),
    sessionId: sessionId ? String(sessionId) : null,
    productUrl: productUrl || null,
    productTitle: productTitle || null,
    productImages: Array.isArray(productImages) ? productImages.slice(0, 8) : [],
    taskId: taskId || null,
    status: status || 'queued', // queued|running|success|error
    resultImages: [],
    error: null,
    createdAt: now,
    updatedAt: now
  };
  db.tryons.unshift(row);
  db.tryons = db.tryons.slice(0, 2000);
  save(db);
  return row;
}

function updateTryonByTaskId(taskId, patch) {
  if (!taskId) return null;
  const db = load();
  const idx = db.tryons.findIndex((t) => t.taskId === taskId);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  db.tryons[idx] = { ...db.tryons[idx], ...patch, updatedAt: now };
  save(db);
  return db.tryons[idx];
}

function updateTryonById(id, patch) {
  if (!id) return null;
  const db = load();
  const idx = db.tryons.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  db.tryons[idx] = { ...db.tryons[idx], ...patch, updatedAt: now };
  save(db);
  return db.tryons[idx];
}

function listTryons(telegramUserId, { limit = 50 } = {}) {
  const db = load();
  return db.tryons
    .filter((t) => String(t.telegramUserId) === String(telegramUserId))
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 50)));
}

function getTryon(id) {
  const db = load();
  return db.tryons.find((t) => t.id === id) || null;
}

function listRunningTryons({ limit = 20 } = {}) {
  const db = load();
  return db.tryons
    .filter((t) => t.status === 'running' && t.taskId)
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 20)));
}

function listAllTryons({ limit = 50 } = {}) {
  const db = load();
  return db.tryons.slice(0, Math.max(1, Math.min(500, Number(limit) || 50)));
}

function listTgUsers({ limit = 200 } = {}) {
  const db = load();
  const rows = Object.entries(db.tgUsers || {}).map(([telegramUserId, v]) => ({
    telegramUserId: String(telegramUserId),
    chatId: v?.chatId ?? null,
    updatedAt: v?.updatedAt ?? null
  }));
  rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return rows.slice(0, Math.max(1, Math.min(1000, Number(limit) || 200)));
}

const persistDb = {
  upsertTgUser,
  getChatIdByTelegramUserId,
  createTryon,
  updateTryonByTaskId,
  updateTryonById,
  listTryons,
  getTryon,
  listRunningTryons,
  listAllTryons,
  listTgUsers
};

module.exports = { persistDb };

