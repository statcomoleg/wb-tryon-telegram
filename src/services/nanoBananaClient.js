const axios = require('axios');

const NANO_BANANA_API_KEY = process.env.NANO_BANANA_API_KEY || '';
// According to official docs, Nano Banana Pro API is served via defapi.org
// https://nanobananaproapi.org/docs
const NANO_BANANA_BASE_URL = process.env.NANO_BANANA_BASE_URL || 'https://api.defapi.org';
const NANO_BANANA_MODEL_ID = process.env.NANO_BANANA_MODEL_ID || 'google/gempix2';

/**
 * For our use‑case "виртуальная внешность" — это набор референс‑фото,
 * которые мы будем передавать в Nano Banana Pro при генерации фотосессии.
 * Сама API не требует отдельного шага "создать персонажа", поэтому
 * на этом шаге мы просто валидируем и сохраняем данные.
 */
async function createOrUpdateAppearance({ userId, photoUrls }) {
  if (!Array.isArray(photoUrls) || photoUrls.length === 0) {
    throw new Error('photoUrls are required');
  }

  // Здесь можно было бы загрузить фото в своё хранилище.
  // Для простоты считаем, что Nano Banana Pro умеет работать
  // с внешними URL и data: URI (base64), как указано в доках.

  return {
    id: `appearance-${userId}`,
    referenceImages: photoUrls
  };
}

/**
 * Вспомогательная функция: создать задачу генерации в Nano Banana Pro.
 * Возвращает task_id.
 * num_images: запросить 1 картинку (коллаж) или несколько.
 */
async function createGenerationTask({ prompt, referenceImages, numImages = 1 }) {
  const body = {
    model: NANO_BANANA_MODEL_ID,
    prompt,
    images: Array.isArray(referenceImages) ? referenceImages.slice(0, 4) : undefined
  };
  if (numImages >= 1 && numImages <= 8) {
    body.n = numImages;
  }
  const response = await axios.post(
    `${NANO_BANANA_BASE_URL}/api/image/gen`,
    body,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NANO_BANANA_API_KEY}`
      },
      timeout: 30000
    }
  );

  if (!response.data || response.data.code !== 0 || !response.data.data?.task_id) {
    throw new Error(
      `Nano Banana Pro: unexpected response ${JSON.stringify(response.data || {}, null, 2)}`
    );
  }

  return response.data.data.task_id;
}

/**
 * Вспомогательная функция: опросить статус задачи и вернуть массив url‑ов картинок.
 */
async function waitForTaskResult(taskId, { pollIntervalMs = 2000, timeoutMs = 60000 } = {}) {
  const start = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Nano Banana Pro: timeout while waiting for task result');
    }

    const response = await axios.get(
      `${NANO_BANANA_BASE_URL}/api/task/query`,
      {
        params: { task_id: taskId },
        headers: {
          Authorization: `Bearer ${NANO_BANANA_API_KEY}`
        },
        timeout: 15000
      }
    );

    const data = response.data;

    if (!data) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }

    const status = data.status || data.data?.status;
    const result = data.result || data.data?.result;

    if (!status || status === 'pending' || status === 'submitted' || status === 'in_progress') {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }

    if (status !== 'success') {
      const message = data.status_reason?.message || data.message || 'Unknown error';
      throw new Error(`Nano Banana Pro task failed: ${message}`);
    }

    if (!Array.isArray(result) || result.length === 0) {
      throw new Error('Nano Banana Pro: empty result');
    }

    const images = result
      .map((item) => item.image)
      .filter(Boolean);

    if (!images.length) {
      throw new Error('Nano Banana Pro: no image URLs in result');
    }

    return images;
  }
}

/**
 * Генерация одного коллажа: человек с референс‑фото в одежде с фото товара.
 * Референсы: сначала фото человека (внешность), потом 1–2 фото товара (одежда).
 * Запрашиваем 1 изображение — один коллаж.
 */
async function generatePhotoshoot({ appearance, productImages, sessionId }) {
  const fallbackResult = () => ({
    sessionId,
    images: Array.isArray(productImages) ? productImages : [productImages].filter(Boolean),
    generated: false
  });

  if (!NANO_BANANA_API_KEY) {
    console.warn('NANO_BANANA_API_KEY is not set. Returning mocked photoshoot.');
    return fallbackResult();
  }

  const personRefs = appearance?.referenceImages || [];
  const productRefs = Array.isArray(productImages) ? productImages.slice(0, 2) : [];
  const referenceImages = [...personRefs, ...productRefs].slice(0, 4);

  const prompt =
    'Single image only. This exact person from the first reference photos wearing the clothing from the last reference images. ' +
    'One photorealistic collage: same face and body as in references, wearing the garment, neutral clean background, fashion try-on. ' +
    'Output exactly one image, no multiple panels.';

  try {
    const taskId = await createGenerationTask({
      prompt,
      referenceImages,
      numImages: 1
    });
    const images = await waitForTaskResult(taskId, {
      pollIntervalMs: 2500,
      timeoutMs: 90000
    });
    return { sessionId, images, generated: true };
  } catch (err) {
    console.error('Nano Banana Pro API failed, returning product images as fallback:', err && err.message);
    return fallbackResult();
  }
}

/**
 * Тест подключения к Nano Banana Pro: одна простая генерация без референсов.
 * Возвращает { success: true, image } или { success: false, error }.
 */
async function testGeneration() {
  if (!NANO_BANANA_API_KEY) {
    return { success: false, error: 'NANO_BANANA_API_KEY не задан в настройках сервера.' };
  }
  try {
    const taskId = await createGenerationTask({
      prompt: 'A single red apple on a white background, photorealistic.',
      referenceImages: [],
      numImages: 1
    });
    const images = await waitForTaskResult(taskId, {
      pollIntervalMs: 2000,
      timeoutMs: 60000
    });
    return {
      success: true,
      image: images[0],
      message: 'Nano Banana Pro отвечает, генерация работает.'
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
      message: 'Nano Banana Pro не ответил. Проверьте ключ, URL и квоты.'
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

