const { v4: uuidv4 } = require('uuid');

const state = {
  appearances: new Map(), // telegramUserId -> appearance
  sessions: new Map() // telegramUserId -> { [sessionId]: session }
};

function setAppearance(telegramUserId, appearance) {
  state.appearances.set(String(telegramUserId), appearance);
}

function getAppearance(telegramUserId) {
  return state.appearances.get(String(telegramUserId)) || null;
}

function upsertSession(telegramUserId, { sessionId, product }) {
  const userId = String(telegramUserId);
  let userSessions = state.sessions.get(userId);
  if (!userSessions) {
    userSessions = {};
    state.sessions.set(userId, userSessions);
  }

  const id = sessionId || uuidv4();

  if (!userSessions[id]) {
    userSessions[id] = {
      id,
      createdAt: new Date().toISOString(),
      products: [],
      images: []
    };
  }

  if (product) {
    userSessions[id].products.push(product);
  }

  return userSessions[id];
}

function appendGeneratedImages(telegramUserId, sessionId, images) {
  const userId = String(telegramUserId);
  const userSessions = state.sessions.get(userId);
  if (!userSessions || !userSessions[sessionId]) return;

  userSessions[sessionId].images.push(...images);
}

function getSessions(telegramUserId) {
  const userId = String(telegramUserId);
  const userSessions = state.sessions.get(userId);
  if (!userSessions) return [];
  return Object.values(userSessions);
}

const sessionStore = {
  setAppearance,
  getAppearance,
  upsertSession,
  appendGeneratedImages,
  getSessions
};

module.exports = {
  sessionStore
};

