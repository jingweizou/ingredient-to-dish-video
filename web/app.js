const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');
const detectBtn = document.getElementById('detectBtn');
const labelsBox = document.getElementById('labels');
const ingredientsInput = document.getElementById('ingredientsInput');
const dishInput = document.getElementById('dishInput');
const genBtn = document.getElementById('genBtn');
const statusEl = document.getElementById('status');
const detectMeta = document.getElementById('detectMeta');

const styleSelect = document.getElementById('styleSelect');
const paceSelect = document.getElementById('paceSelect');
const storyboardOutput = document.getElementById('storyboardOutput');
const imagePromptOutput = document.getElementById('imagePromptOutput');
const stepsOutput = document.getElementById('stepsOutput');
const copyStoryboardBtn = document.getElementById('copyStoryboardBtn');
const copyPromptBtn = document.getElementById('copyPromptBtn');
const copyStepsBtn = document.getElementById('copyStepsBtn');

let model = null;
let detectorMode = 'mobilenet';
let detected = [];
let isDetecting = false;

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

const foodKeywords = [
  'tomato','potato','onion','garlic','ginger','cabbage','carrot','broccoli','cauliflower','spinach','lettuce','cucumber','zucchini','eggplant','pepper','chili','mushroom','corn','bean','pea','rice','noodle','pasta','egg','chicken','beef','pork','fish','shrimp','salmon','tuna','meat'
];

const ingredientAlias = {
  zucchini: 'zucchini',
  cucumber: 'cucumber',
  aubergine: 'eggplant',
  eggplant: 'eggplant',
  courgette: 'zucchini',
  bellpepper: 'bell pepper',
  capsicum: 'bell pepper',
  chili: 'chili',
  chilli: 'chili',
  scallion: 'scallion',
  springonion: 'scallion',
  greenonion: 'scallion',
  garlic: 'garlic',
  ginger: 'ginger',
  carrot: 'carrot',
  cabbage: 'cabbage',
  cauliflower: 'cauliflower',
  broccoli: 'broccoli',
  spinach: 'spinach',
  lettuce: 'lettuce',
  mushroom: 'mushroom',
  tomato: 'tomato',
  potato: 'potato',
  onion: 'onion',
  egg: 'egg',
  chicken: 'chicken',
  beef: 'beef',
  pork: 'pork',
  shrimp: 'shrimp',
  fish: 'fish',
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

function mapLabelToIngredient(rawClassName) {
  const norm = normalizeLabel(rawClassName || '');
  if (!norm) return '';

  const parts = norm.split(',').map(x => x.trim()).filter(Boolean);
  const primary = (parts[0] || norm).replace(/\s+/g, ' ').trim();

  const compact = primary.replace(/\s+/g, '');
  if (ingredientAlias[compact]) return ingredientAlias[compact];

  for (const key of Object.keys(ingredientAlias)) {
    if (compact.includes(key)) return ingredientAlias[key];
  }

  for (const k of foodKeywords) {
    if (primary.includes(k)) return k;
  }

  return primary;
}

function suggestDish(labels) {
  const tokens = labels.join(' ').toLowerCase();
  for (const key of Object.keys(dishMap)) {
    if (tokens.includes(key)) return dishMap[key];
  }
  return 'Home Style Mixed Ingredient Stir-fry';
}

function uniqueByLabel(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item.label || seen.has(item.label)) continue;
    seen.add(item.label);
    out.push(item);
  }
  return out;
}

async function copyText(text, successMessage) {
  if (!text || !text.trim()) {
    statusEl.textContent = 'Nothing to copy yet. Generate a plan first.';
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    statusEl.textContent = successMessage;
  } catch (_) {
    statusEl.textContent = 'Copy blocked by browser. You can still select and copy manually.';
  }
}

async function loadModel() {
  if (model) return model;
  statusEl.textContent = 'Loading AI detector...';

  if (window.__mlReady && typeof window.__mlReady.then === 'function') {
    try {
      await Promise.race([
        window.__mlReady,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Detector library load timeout')), 10000)),
      ]);
    } catch (_) {}
  }

  if (window.__mlError) {
    throw new Error('AI detector libraries blocked by network');
  }
  if (!window.tf) {
    throw new Error('AI detector libraries blocked by network');
  }

  try {
    await Promise.race([
      tf.ready(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TF backend init timeout')), 8000)),
    ]);
  } catch (_) {}

  if (window.mobilenet) {
    try {
      model = await Promise.race([
        mobilenet.load({ version: 2, alpha: 1.0 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Model load timeout')), 12000)),
      ]);
      detectorMode = 'mobilenet';
      return model;
    } catch (_) {}
  }

  if (window.cocoSsd) {
    model = await Promise.race([
      cocoSsd.load(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Coco model load timeout')), 12000)),
    ]);
    detectorMode = 'coco';
    return model;
  }

  throw new Error('No detector model available');
}

function ensureImageReady(img) {
  if (img.complete) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Image load timeout')), 8000);
    img.onload = () => { clearTimeout(t); resolve(); };
    img.onerror = () => { clearTimeout(t); reject(new Error('Image failed to load')); };
  });
}

function buildClassifyInput(img) {
  const maxSide = 640;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return img;

  const scale = Math.min(1, maxSide / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, tw, th);
  return canvas;
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
  if (detectMeta) detectMeta.textContent = '';
  statusEl.textContent = 'Photo loaded. Auto-detecting ingredients...';
  storyboardOutput.value = '';
  imagePromptOutput.value = '';
  stepsOutput.value = '';

  // Auto trigger — user should not need extra clicks.
  setTimeout(() => {
    runDetection('auto');
  }, 120);
});

async function runDetection(source = 'manual') {
  if (!preview.src) {
    statusEl.textContent = 'Please take/upload a photo first.';
    return;
  }
  if (isDetecting) return;

  isDetecting = true;
  detectBtn.disabled = true;
  detectBtn.textContent = source === 'auto' ? 'Auto detecting...' : 'Detecting...';

  try {
    await loadModel();
    statusEl.textContent = source === 'auto'
      ? 'Auto-detecting ingredients from photo...'
      : 'Detecting ingredients from image...';

    await ensureImageReady(preview);
    await withTimeout(preview.decode().catch(() => {}), 5000, 'Decode');

    const classifyInput = buildClassifyInput(preview);
    let ranked = [];

    if (detectorMode === 'mobilenet') {
      const predictions = await withTimeout(model.classify(classifyInput, 10), 16000, 'Detect');
      ranked = uniqueByLabel(
        predictions.map(p => ({
          label: mapLabelToIngredient(p.className),
          prob: Number(p.probability || 0),
        }))
      );
    } else {
      const predictions = await withTimeout(model.detect(classifyInput, 12, 0.15), 12000, 'Detect');
      ranked = uniqueByLabel(
        predictions.map(p => ({
          label: mapLabelToIngredient(p.class),
          prob: Number(p.score || 0),
        }))
      );
    }

    ranked = ranked
      .filter(p => p.label)
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 8);

    detected = ranked.map(x => x.label);

    labelsBox.innerHTML = '';
    ranked.forEach(x => {
      const chip = document.createElement('span');
      chip.textContent = `${x.label} ${Math.round(x.prob * 100)}%`;
      labelsBox.appendChild(chip);
    });

    if (detectMeta) {
      detectMeta.textContent = ranked.length
        ? `Detected ${ranked.length} items automatically (ranked by confidence, engine: ${detectorMode}).`
        : 'Could not confidently identify ingredients. You can tap Detect again or type manually.';
    }

    if (ranked.length) {
      ingredientsInput.value = detected.join(', ');
      if (!dishInput.value) {
        dishInput.value = suggestDish(detected);
      }
      statusEl.textContent = source === 'auto'
        ? 'Auto-detection complete. You can directly generate the plan.'
        : 'Detection done. You can edit ingredients/dish, then generate static plan.';
    } else {
      statusEl.textContent = 'Could not detect clearly. Try a closer/brighter photo, or tap Detect again.';
    }
  } catch (e) {
    const msg = String(e?.message || e);
    if (/blocked by network/i.test(msg) || /library failed/i.test(msg) || /mobilenet/i.test(msg) || /tf/i.test(msg)) {
      statusEl.textContent = 'Detector library was blocked by your network. Please switch network and retry auto-detect.';
    } else if (/model load timeout/i.test(msg) || /backend init timeout/i.test(msg) || /timeout/i.test(msg)) {
      statusEl.textContent = source === 'auto'
        ? 'Auto-detect timed out. Tap Detect again once, or retake a clearer photo.'
        : 'Detection timed out. Retry once, or retake a clearer photo.';
    } else {
      statusEl.textContent = `Detection failed (${msg}). Please retake photo and retry.`;
    }
  } finally {
    isDetecting = false;
    detectBtn.disabled = false;
    detectBtn.textContent = 'Detect again';
  }
}

detectBtn.addEventListener('click', async () => {
  runDetection('manual');
});

genBtn.addEventListener('click', () => {
  genBtn.disabled = true;
  try {
    generateStaticPlan();
  } finally {
    genBtn.disabled = false;
  }
});

if (copyStoryboardBtn) {
  copyStoryboardBtn.addEventListener('click', () => copyText(storyboardOutput.value, 'Storyboard copied.'));
}
if (copyPromptBtn) {
  copyPromptBtn.addEventListener('click', () => copyText(imagePromptOutput.value, 'Image prompts copied.'));
}
if (copyStepsBtn) {
  copyStepsBtn.addEventListener('click', () => copyText(stepsOutput.value, 'Cooking steps copied.'));
}
