const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');
const detectBtn = document.getElementById('detectBtn');
const labelsBox = document.getElementById('labels');
const ingredientsInput = document.getElementById('ingredientsInput');
const dishInput = document.getElementById('dishInput');
const genBtn = document.getElementById('genBtn');
const statusEl = document.getElementById('status');
const modelSelect = document.getElementById('modelSelect');
const durationSelect = document.getElementById('durationSelect');
const resultVideo = document.getElementById('resultVideo');
const downloadLink = document.getElementById('downloadLink');

let model = null;
let detected = [];

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
  ]);
}

const dishMap = {
  tomato: 'Tomato Egg Stir-fry',
  egg: 'Tomato Egg Stir-fry',
  potato: 'Crispy Stir-fried Potato',
  fish: 'Steamed Fish with Ginger',
  chicken: 'Braised Chicken',
  beef: 'Black Pepper Beef',
  shrimp: 'Garlic Butter Shrimp',
  broccoli: 'Garlic Broccoli',
  mushroom: 'Creamy Mushroom Pasta',
  noodle: 'Vegetable Noodle Stir-fry',
  rice: 'Egg Fried Rice',
};

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  preview.src = url;
  preview.style.display = 'block';
  labelsBox.innerHTML = '';
  statusEl.textContent = '';
  resultVideo.style.display = 'none';
  downloadLink.style.display = 'none';
});

async function loadModel() {
  if (model) return model;
  statusEl.textContent = 'Loading AI detector...';
  model = await mobilenet.load();
  return model;
}

function normalizeLabel(name) {
  return name.toLowerCase().replace(/[^a-z ]/g, '');
}

function suggestDish(labels) {
  const tokens = labels.join(' ').toLowerCase();
  for (const key of Object.keys(dishMap)) {
    if (tokens.includes(key)) return dishMap[key];
  }
  return 'Home Style Mixed Ingredient Stir-fry';
}

detectBtn.addEventListener('click', async () => {
  if (!preview.src) {
    statusEl.textContent = 'Please take/upload a photo first.';
    return;
  }
  detectBtn.disabled = true;
  try {
    await loadModel();
    statusEl.textContent = 'Detecting ingredients from image...';
    await preview.decode().catch(() => {});
    const predictions = await withTimeout(model.classify(preview, 6), 20000, 'Detect');
    detected = predictions
      .map(p => normalizeLabel(p.className).split(',')[0].trim())
      .filter(Boolean)
      .slice(0, 5);

    labelsBox.innerHTML = '';
    detected.forEach(x => {
      const chip = document.createElement('span');
      chip.textContent = x;
      labelsBox.appendChild(chip);
    });

    ingredientsInput.value = detected.join(', ');
    if (!dishInput.value) {
      dishInput.value = suggestDish(detected);
    }
    statusEl.textContent = 'Detection done. You can edit ingredients/dish then generate video.';
  } catch (e) {
    statusEl.textContent = `Detection failed (${e.message}). You can still type ingredients manually below.`;
  } finally {
    detectBtn.disabled = false;
  }
});

genBtn.addEventListener('click', async () => {
  const dish = dishInput.value.trim() || 'a delicious homemade dish';
  const manualIngredients = ingredientsInput.value
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
  genBtn.disabled = true;
  statusEl.textContent = 'Generating video... this may take 1-3 minutes.';
  resultVideo.style.display = 'none';
  downloadLink.style.display = 'none';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);
    const resp = await fetch('./api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredients: manualIngredients.length ? manualIngredients : detected,
        dish,
        model: modelSelect.value,
        duration: Number(durationSelect.value),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const contentType = resp.headers.get('content-type') || '';
    let data = null;

    if (contentType.includes('application/json')) {
      data = await resp.json();
    } else {
      const text = await resp.text();
      const looksLikeHtml = /<\s*html/i.test(text);
      if (looksLikeHtml) {
        throw new Error('This is a static demo page. Video generation requires a backend service.');
      }
      throw new Error('Server returned a non-JSON response.');
    }

    if (!resp.ok || !data.success) {
      throw new Error(data.error || 'Generation failed');
    }

    const outputPath = data.local_path;
    const rel = outputPath.replace(/^output\//, '');
    const videoUrl = `./output/${rel}`;

    resultVideo.src = videoUrl;
    resultVideo.style.display = 'block';
    resultVideo.play().catch(() => {});

    downloadLink.href = videoUrl;
    downloadLink.textContent = `Download video (${(data.file_size_mb || 0).toFixed(2)} MB)`;
    downloadLink.style.display = 'inline-block';

    statusEl.textContent = `Done. Estimated cost: $${Number(data.cost || 0).toFixed(2)}`;
  } catch (e) {
    if (e.name === 'AbortError') {
      statusEl.textContent = 'Generation took too long. Please retry with 5s + budget mode.';
    } else {
      if (String(e.message || '').includes('requires a backend service')) {
        statusEl.textContent = 'Static demo mode: ingredient detection works, but video generation needs a backend service.';
      } else {
        statusEl.textContent = `Generation failed: ${e.message}`;
      }
    }
  } finally {
    genBtn.disabled = false;
  }
});
