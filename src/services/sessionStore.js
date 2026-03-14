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

const MAX_APPEARANCE_PHOTOS = 6;

function clearAppearance(telegramUserId) {
  const id = String(telegramUserId);
  state.appearances.set(id, { id: `appearance-${id}`, referenceImages: [] });
}

function appendAppearancePhoto(telegramUserId, photoUrlOrDataUrl) {
  const id = String(telegramUserId);
  let appearance = state.appearances.get(id);
  if (!appearance) {
    appearance = { id: `appearance-${id}`, referenceImages: [] };
    state.appearances.set(id, appearance);
  }
  const refs = appearance.referenceImages || [];
  if (refs.length >= MAX_APPEARANCE_PHOTOS) return false;
  refs.push(photoUrlOrDataUrl);
  appearance.referenceImages = refs;
  return true;
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
  clearAppearance,
  appendAppearancePhoto,
  upsertSession,
  appendGeneratedImages,
  getSessions
};

module.exports = {
  sessionStore
};

