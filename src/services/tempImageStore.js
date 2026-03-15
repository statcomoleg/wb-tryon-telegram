const { v4: uuidv4 } = require('uuid');

const store = new Map();

function saveDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  const id = uuidv4();
  store.set(id, dataUrl);
  setTimeout(() => store.delete(id), 10 * 60 * 1000);
  return id;
}

function get(id) {
  return store.get(id) || null;
}

const tempImageStore = { saveDataUrl, get };
module.exports = { tempImageStore };
