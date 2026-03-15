const axios = require('axios');
const { tempImageStore } = require('./tempImageStore');

// NanoBanana API (https://docs.nanobananaapi.ai) — базовый URL и ключ
const NANO_BANANA_API_KEY = (process.env.NANO_BANANA_API_KEY || '').trim();
const NANO_BANANA_BASE_URL = (process.env.NANO_BANANA_BASE_URL || 'https://api.nanobananaapi.ai').replace(/\/+$/, '');

// Упрощённый промпт: только кто человек, что одежда, один кадр. Меньше текста = меньше шанс successFlag=3.
// Полный вариант (локация ПРИМЕРЯЙКА, ракурсы, стиль) — через NANO_BANANA_PROMPT в Environment.
// Плейсхолдеры: {personCount}, {productCount}.
const DEFAULT_TRYON_PROMPT =
  'First {personCount} images = the person (use only this face and body). Last {productCount} images = the garment. ' +
  'Put the garment on this person. One photorealistic photo, neutral background.';
const NANO_BANANA_PROMPT = (process.env.NANO_BANANA_PROMPT || '').trim() || null;

function getAuthHeaders() {
  if (NANO_BANANA_API_KEY) {
    return { Authorization: `Bearer ${NANO_BANANA_API_KEY}` };
  }
  return {};
}

/**
 * Сохраняем «внешность» пользователя как набор URL референс-фото для генерации.
 */
async function createOrUpdateAppearance({ userId, photoUrls }) {
  if (!Array.isArray(photoUrls) || photoUrls.length === 0) {
    throw new Error('photoUrls are required');
  }
  return {
    id: `appearance-${userId}`,
    referenceImages: photoUrls
  };
}

/**
 * Создать задачу генерации (NanoBanana Pro): POST /api/v1/nanobanana/generate-pro
 * Документация: https://docs.nanobananaapi.ai/nanobanana-api/generate-image-pro
 */
async function createGenerationTask({ prompt, referenceImages }) {
  const baseAppUrl = (process.env.PUBLIC_APP_URL || process.env.WEBAPP_URL || '').replace(/\/webapp\/?$/, '').replace(/\/+$/, '');
  const body = {
    prompt,
    imageUrls: Array.isArray(referenceImages) ? referenceImages.slice(0, 8) : [],
    resolution: process.env.NANO_BANANA_RESOLUTION || '1K',
    aspectRatio: process.env.NANO_BANANA_ASPECT_RATIO || '16:9'
  };
  if (body.imageUrls.length === 0) delete body.imageUrls;
  if (baseAppUrl) body.callBackUrl = `${baseAppUrl}/api/nanobanana-callback`;

  const url = `${NANO_BANANA_BASE_URL}/api/v1/nanobanana/generate-pro`;
  const response = await axios.post(url, body, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    timeout: 30000
  });

  const res = response.data;
  if (!res || res.code !== 200 || !res.data?.taskId) {
    const code = res?.code ?? response?.status;
    const msg = res?.msg || res?.message || 'unexpected response';
    if (code === 402) {
      throw new Error('Недостаточно кредитов на балансе NanoBanana. Пополните счёт на nanobananaapi.ai');
    }
    throw new Error(`NanoBanana API: ${msg}`);
  }
  return res.data.taskId;
}

/**
 * Опросить статус задачи: GET /api/v1/nanobanana/record-info?taskId=...
 * successFlag: 0=generating, 1=success, 2=create failed, 3=generation failed
 */
async function waitForTaskResult(taskId, { pollIntervalMs = 3000, timeoutMs = 120000 } = {}) {
  const start = Date.now();
  const url = `${NANO_BANANA_BASE_URL}/api/v1/nanobanana/record-info`;

  while (Date.now() - start < timeoutMs) {
    const response = await axios.get(url, {
      params: { taskId },
      headers: getAuthHeaders(),
      timeout: 15000
    });

    const res = response.data;
    if (res && res.code !== undefined && res.code !== 200) {
      throw new Error(`NanoBanana API: ${res.msg || res.message || 'query failed'}`);
    }

    const data = res?.data ?? res;
    const successFlag = data?.successFlag ?? -1;

    if (successFlag !== 0 && successFlag !== -1) {
      try {
        console.log('[NanoBanana] record-info завершён successFlag=' + successFlag + ' body=' + JSON.stringify(data).slice(0, 600));
      } catch (_) {}
    }

    if (successFlag === 1) {
      const resp = data?.response || data;
      const resultUrl =
        resp?.resultImageUrl ||
        resp?.originImageUrl ||
        resp?.imageUrl ||
        resp?.url ||
        data?.resultImageUrl ||
        data?.originImageUrl ||
        (Array.isArray(resp?.images) && (resp.images[0]?.url || resp.images[0])) ||
        (Array.isArray(data?.images) && (data.images[0]?.url || data.images[0])) ||
        (typeof resp === 'string' && resp.startsWith('http') ? resp : null);
      if (resultUrl) return [resultUrl];
      let raw;
      try {
        raw = JSON.stringify({ data, response: resp }).slice(0, 800);
      } catch (e) {
        raw = String(resp).slice(0, 200);
      }
      console.error('[NanoBanana] ОТВЕТ API (success, URL не найден): ' + raw);
      console.log('[NanoBanana] ОТВЕТ API (success, URL не найден): ' + raw);
      throw new Error('NanoBanana API: success but no image URL in response');
    }
    if (successFlag === 2 || successFlag === 3) {
      const msg =
        data?.errorMessage ||
        data?.message ||
        res?.msg ||
        (typeof data?.errorCode === 'string' ? data.errorCode : null) ||
        (typeof data?.errorCode === 'number' ? `Error code: ${data.errorCode}` : null) ||
        'Generation failed';
      if (process.env.NODE_ENV !== 'production') {
        console.error('NanoBanana task failed:', JSON.stringify({ successFlag, data: data || {}, res: res?.msg }));
      }
      throw new Error(`NanoBanana API: ${msg}`);
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error('NanoBanana API: timeout waiting for task result');
}

/**
 * Генерация одного коллажа: человек с референс-фото в одежде с фото товара.
 * Референсы: сначала фото человека, потом 1–2 фото товара (до 8 всего).
 */
async function generatePhotoshoot({ appearance, productImages, sessionId }) {
  const fallbackResult = (errorMessage) => ({
    sessionId,
    images: Array.isArray(productImages) ? productImages : [productImages].filter(Boolean),
    generated: false,
    error: errorMessage || null
  });

  if (!NANO_BANANA_API_KEY) {
    console.warn('NANO_BANANA_API_KEY is not set. Returning mocked photoshoot.');
    return fallbackResult('Ключ API не задан.');
  }

  const personRefs = appearance?.referenceImages || [];
  const productRefs = Array.isArray(productImages) ? productImages.slice(0, 2) : [];
  const garmentUrls = productRefs.length >= 2 ? productRefs : productRefs.length === 1 ? [productRefs[0], productRefs[0]] : [];
  let referenceImages = [...personRefs, ...garmentUrls].slice(0, 8);

  const baseAppUrl = (process.env.PUBLIC_APP_URL || process.env.WEBAPP_URL || '').replace(/\/webapp\/?$/, '').replace(/\/+$/, '');
  if (baseAppUrl && referenceImages.some((u) => typeof u === 'string' && u.startsWith('data:image/'))) {
    referenceImages = referenceImages.map((url) => {
      if (typeof url !== 'string' || !url.startsWith('data:image/')) return url;
      const id = tempImageStore.saveDataUrl(url);
      return id ? `${baseAppUrl}/api/temp-image/${id}` : url;
    }).filter(Boolean);
  }

  const personCount = personRefs.length;
  const productCount = garmentUrls.length;

  const basePrompt = NANO_BANANA_PROMPT || DEFAULT_TRYON_PROMPT;
  const prompt = basePrompt
    .replace(/\{personCount\}/g, String(personCount))
    .replace(/\{productCount\}/g, String(productCount));

  try {
    const taskId = await createGenerationTask({ prompt, referenceImages });
    const images = await waitForTaskResult(taskId, {
      pollIntervalMs: 3000,
      timeoutMs: 120000
    });
    return { sessionId, images, generated: true };
  } catch (err) {
    const msg = err?.message || String(err);
    const isNoUrl = /no image URL|success but no image/i.test(msg);
    if (isNoUrl) {
      console.warn('NanoBanana: генерация успешна, но в ответе нет URL картинки — показываем фото товара.');
      return fallbackResult('Генерация прошла, но сервис не вернул ссылку на результат. Показаны фото товара.');
    }
    const isGenFailed = /Generation failed|successFlag|NanoBanana API:/i.test(msg);
    const hint = isGenFailed
      ? ' Сервис не смог сгенерировать кадр. Попробуйте: 1) внешность по ссылкам на фото (не с устройства); 2) другой товар или фото.'
      : '';
    console.error('NanoBanana API failed, returning product images as fallback:', msg);
    return fallbackResult(msg + hint);
  }
}

/**
 * Быстрая проверка: запрос баланса (GET /api/v1/common/credit).
 * Ответ за 1–2 сек, без генерации — страница не «висит».
 */
async function getCredits() {
  const url = `${NANO_BANANA_BASE_URL}/api/v1/common/credit`;
  const response = await axios.get(url, {
    headers: getAuthHeaders(),
    timeout: 10000
  });
  const res = response.data;
  if (res && res.code !== 200) {
    const e = new Error(res.msg || res.message || 'API error');
    e.code = res.code;
    throw e;
  }
  return res?.data ?? 0;
}

/**
 * Тест API: только проверка ключа и баланса (без генерации), ответ сразу.
 */
async function testGeneration() {
  if (!NANO_BANANA_API_KEY) {
    return {
      success: false,
      error: 'NANO_BANANA_API_KEY не задан. Получите ключ на https://nanobananaapi.ai/api-key'
    };
  }
  if (NANO_BANANA_API_KEY.length < 10) {
    return { success: false, error: 'NANO_BANANA_API_KEY слишком короткий — вставьте ключ целиком.' };
  }
  try {
    const credits = await getCredits();
    return {
      success: true,
      credits,
      message: `Ключ принят. Баланс: ${credits} кредитов. Генерация доступна.`,
      baseUrl: NANO_BANANA_BASE_URL
    };
  } catch (err) {
    const code = err?.code ?? err?.response?.data?.code ?? err?.response?.status;
    const msg = err?.response?.data?.msg || err?.message || String(err);
    if (code === 401) {
      return {
        success: false,
        error: msg,
        message: '401: неверный ключ. Проверьте NANO_BANANA_API_KEY на https://nanobananaapi.ai/api-key',
        baseUrl: NANO_BANANA_BASE_URL
      };
    }
    if (code === 402) {
      return {
        success: false,
        error: msg,
        message: '402: недостаточно кредитов. Пополните баланс на nanobananaapi.ai',
        baseUrl: NANO_BANANA_BASE_URL
      };
    }
    return {
      success: false,
      error: msg,
      message: 'NanoBanana API не ответил. Проверьте ключ и сеть.',
      baseUrl: NANO_BANANA_BASE_URL
    };
  }
}

const nanoBananaClient = {
  createOrUpdateAppearance,
  generatePhotoshoot,
  testGeneration
};

module.exports = {
  nanoBananaClient
};
