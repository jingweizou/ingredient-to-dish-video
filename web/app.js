const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');
const detectBtn = document.getElementById('detectBtn');
const labelsBox = document.getElementById('labels');
const ingredientsInput = document.getElementById('ingredientsInput');
const dishInput = document.getElementById('dishInput');
const genBtn = document.getElementById('genBtn');
const statusEl = document.getElementById('status');

const styleSelect = document.getElementById('styleSelect');
const paceSelect = document.getElementById('paceSelect');
const storyboardOutput = document.getElementById('storyboardOutput');
const imagePromptOutput = document.getElementById('imagePromptOutput');
const stepsOutput = document.getElementById('stepsOutput');

let model = null;
let detected = [];

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
  pepper: 'Bell Pepper Beef',
  onion: 'Onion Egg Stir-fry',
};

const styleGuide = {
  home: {
    tone: 'warm family kitchen, natural light, practical home-cooking rhythm',
    plating: 'simple clean plate, cozy home table',
    verbs: ['wash', 'slice', 'stir-fry', 'season', 'plate'],
  },
  quick: {
    tone: 'fast weekday meal, efficient prep, minimal tools',
    plating: 'single-bowl serving, quick garnish',
    verbs: ['prep', 'quick-cut', 'flash-fry', 'finish', 'serve'],
  },
  restaurant: {
    tone: 'cinematic kitchen pass, controlled heat, polished presentation',
    plating: 'refined plating with final drizzle and texture contrast',
    verbs: ['mise-en-place', 'precision-cut', 'high-heat sear', 'layer seasoning', 'final plate'],
  },
};

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
  ]);
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

async function loadModel() {
  if (model) return model;
  statusEl.textContent = 'Loading AI detector...';

  if (window.__mlReady && typeof window.__mlReady.then === 'function') {
    try {
      await window.__mlReady;
    } catch (_) {}
  }

  if (!window.mobilenet || !window.tf) {
    throw new Error('AI detector libraries blocked by network');
  }

  try {
    await tf.ready();
  } catch (_) {}

  model = await mobilenet.load({ version: 2, alpha: 1.0 });
  return model;
}

function ensureImageReady(img) {
  if (img.complete) return Promise.resolve();
  return new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Image failed to load'));
  });
}

function sceneLine(i, total, dish, ingredients, style) {
  const ingredientLead = ingredients[i % ingredients.length] || 'main ingredients';
  const verb = style.verbs[i % style.verbs.length] || 'cook';

  if (i === 0) return `${i + 1}. Ingredient hero shot: show ${ingredients.join(', ')} neatly arranged for ${dish}.`;
  if (i === total - 1) return `${i + 1}. Final beauty shot: ${dish} plated (${style.plating}), steam visible, ready to serve.`;
  return `${i + 1}. ${verb} scene: focus on ${ingredientLead}, clear hand movement, close-up texture change.`;
}

function promptLine(i, dish, ingredients, style) {
  const lead = ingredients[i % ingredients.length] || 'fresh ingredients';
  return `${i + 1}) ${dish}, ${lead}, ${style.tone}, food photography, realistic texture, 4k, clean composition`;
}

function stepLine(i, total, dish, ingredients) {
  if (i === 0) return `${i + 1}. Prep all ingredients (${ingredients.join(', ')}), wash and pat dry.`;
  if (i === total - 1) return `${i + 1}. Taste-adjust seasoning, plate ${dish}, serve while hot.`;
  return `${i + 1}. Continue cooking step ${i}: control heat, stir evenly, avoid overcooking.`;
}

function generateStaticPlan() {
  const dish = dishInput.value.trim() || 'Home Style Mixed Ingredient Stir-fry';
  const typedIngredients = ingredientsInput.value
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);

  const ingredients = typedIngredients.length ? typedIngredients : (detected.length ? detected : ['tomato', 'egg']);
  const style = styleGuide[styleSelect.value] || styleGuide.home;
  const sceneCount = Number(paceSelect.value) || 5;

  const storyboard = [];
  const prompts = [];
  const steps = [];

  for (let i = 0; i < sceneCount; i += 1) {
    storyboard.push(sceneLine(i, sceneCount, dish, ingredients, style));
    prompts.push(promptLine(i, dish, ingredients, style));
    steps.push(stepLine(i, sceneCount, dish, ingredients));
  }

  storyboardOutput.value = storyboard.join('\n');
  imagePromptOutput.value = prompts.join('\n');
  stepsOutput.value = steps.join('\n');

  statusEl.textContent = 'Plan generated. 100% static mode — no paid API calls.';
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  preview.src = url;
  preview.style.display = 'block';

  labelsBox.innerHTML = '';
  statusEl.textContent = '';
  storyboardOutput.value = '';
  imagePromptOutput.value = '';
  stepsOutput.value = '';
});

detectBtn.addEventListener('click', async () => {
  if (!preview.src) {
    statusEl.textContent = 'Please take/upload a photo first.';
    return;
  }

  detectBtn.disabled = true;
  try {
    await loadModel();
    statusEl.textContent = 'Detecting ingredients from image...';

    await ensureImageReady(preview);
    await preview.decode().catch(() => {});

    const predictions = await withTimeout(model.classify(preview, 6), 25000, 'Detect');
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

    statusEl.textContent = 'Detection done. You can edit ingredients/dish, then generate static plan.';
  } catch (e) {
    const msg = String(e?.message || e);
    if (/blocked by network/i.test(msg) || /library failed/i.test(msg) || /mobilenet/i.test(msg) || /tf/i.test(msg)) {
      statusEl.textContent = 'Detector CDN is blocked on this network. Please type ingredients manually (or switch network/VPN and retry).';
    } else if (/timeout/i.test(msg)) {
      statusEl.textContent = 'Detection timed out. Retry once, or type ingredients manually.';
    } else {
      statusEl.textContent = `Detection failed (${msg}). You can still type ingredients manually.`;
    }
  } finally {
    detectBtn.disabled = false;
  }
});

genBtn.addEventListener('click', () => {
  genBtn.disabled = true;
  try {
    generateStaticPlan();
  } finally {
    genBtn.disabled = false;
  }
});
