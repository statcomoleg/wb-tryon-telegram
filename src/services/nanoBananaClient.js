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
 */
async function createGenerationTask({ prompt, referenceImages }) {
  const response = await axios.post(
    `${NANO_BANANA_BASE_URL}/api/image/gen`,
    {
      model: NANO_BANANA_MODEL_ID,
      prompt,
      // API поддерживает до 4 reference images; ограничим массив.
      images: Array.isArray(referenceImages) ? referenceImages.slice(0, 4) : undefined
    },
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
 * Генерация фотосессии:
 * - берём референс‑фото пользователя (appearance.referenceImages)
 * - добавляем 1–2 фото товара как дополнительные подсказки
 * - формируем промпт под примерку одежды
 * - запускаем задачу и ждём результат.
 */
async function generatePhotoshoot({ appearance, productImages, sessionId }) {
  const fallbackResult = () => ({
    sessionId,
    images: Array.isArray(productImages) ? productImages : [productImages].filter(Boolean)
  });

  if (!NANO_BANANA_API_KEY) {
    console.warn('NANO_BANANA_API_KEY is not set. Returning mocked photoshoot.');
    return fallbackResult();
  }

  const referenceImages = [
    ...(appearance?.referenceImages || []),
    ...(Array.isArray(productImages) ? productImages.slice(0, 2) : [])
  ];

  const prompt =
    'High‑quality fashion photoshoot of this person wearing the provided clothing items. ' +
    'Realistic lighting, accurate body proportions, natural skin tones, no distortions, ' +
    'several angles (front, 3/4, side), clean background suitable for e‑commerce.';

  try {
    const taskId = await createGenerationTask({ prompt, referenceImages });
    const images = await waitForTaskResult(taskId, {
      pollIntervalMs: 2500,
      timeoutMs: 90000
    });
    return { sessionId, images };
  } catch (err) {
    console.error('Nano Banana Pro API failed, returning product images as fallback:', err && err.message);
    return fallbackResult();
  }
}

const nanoBananaClient = {
  createOrUpdateAppearance,
  generatePhotoshoot
};

module.exports = {
  nanoBananaClient
};

