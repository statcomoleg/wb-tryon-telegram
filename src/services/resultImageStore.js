const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const RESULTS_DIR = path.join(DATA_DIR, 'results');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function getFilePath(tryonId) {
  ensure();
  return path.join(RESULTS_DIR, `${String(tryonId)}.jpg`);
}

function exists(tryonId) {
  try {
    return fs.existsSync(getFilePath(tryonId));
  } catch (_) {
    return false;
  }
}

async function saveFromUrl({ tryonId, url }) {
  if (!tryonId || !url) throw new Error('tryonId and url are required');
  ensure();

  const filePath = getFilePath(tryonId);
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: 20 * 1024 * 1024,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8'
    }
  });

  if (!resp.data || !resp.data.length) throw new Error('empty image response');
  fs.writeFileSync(filePath, Buffer.from(resp.data));
  return { filePath };
}

function readBuffer(tryonId) {
  const p = getFilePath(tryonId);
  return fs.readFileSync(p);
}

module.exports = {
  resultImageStore: {
    ensure,
    getFilePath,
    exists,
    saveFromUrl,
    readBuffer
  }
};

