// Sidebar Tab Switching
const menuItems = document.querySelectorAll('.menu-item');
const tabContents = document.querySelectorAll('.tab-content');

menuItems.forEach((item) => {
  item.addEventListener('click', () => {
    menuItems.forEach((i) => i.classList.remove('active'));
    tabContents.forEach((tc) => tc.classList.remove('active'));

    item.classList.add('active');
    const tabId = item.getAttribute('data-tab');
    document.getElementById(tabId).classList.add('active');
  });
});

// Schedule Elements
const intervalSel = document.getElementById('interval');
const intervalCustom = document.getElementById('intervalCustom');
const snoozeInput = document.getElementById('snooze');
const autostartCb = document.getElementById('autostart');
const pausedCb = document.getElementById('paused');

// Studio Elements
const spriteDefaultRadio = document.getElementById('sprite-default');
const spriteCustomRadio = document.getElementById('sprite-custom');
const customUploaderArea = document.getElementById('custom-uploader-area');
const uploadTrigger = document.getElementById('upload-trigger');
const uploadStatusText = document.getElementById('upload-status-text');
const filePathDisplay = document.getElementById('file-path-display');

const colsRow0 = document.getElementById('cols-row0');
const colsRow1 = document.getElementById('cols-row1');
const colsRow2 = document.getElementById('cols-row2');

// Preview Elements
const previewCharacter = document.getElementById('preview-character');
const btnPrevWalkIn = document.getElementById('btn-prev-walkin');
const btnPrevDrink = document.getElementById('btn-prev-drink');
const btnPrevWalkOut = document.getElementById('btn-prev-walkout');

// General Elements
const saveBtn = document.getElementById('save');
const cancelBtn = document.getElementById('cancel');
const statusEl = document.getElementById('status');
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

const PRESETS = ['30', '60', '90', '120'];

// Active State
let currentSettings = null;
let customSpriteBase64 = null;
let currentCustomPath = null;
let currentTheme = 'dark';

// Animation Preview State
let previewInterval = null;
let previewImgWidth = 0;
let previewImgHeight = 0;
let previewScale = 1;
let previewImgLoaded = false;
let activePreviewRow = 0; // 0: Walkin, 1: Drink, 2: Walkout
let previewImg = new Image();

// Theme Applier
function applyTheme(theme) {
  currentTheme = theme;
  if (theme === 'light') {
    document.body.classList.add('light-theme');
    themeIcon.textContent = '☀️';
  } else {
    document.body.classList.remove('light-theme');
    themeIcon.textContent = '🌙';
  }
}

// Initializer
async function init() {
  currentSettings = await window.api.getSettings();

  // Load schedule presets
  if (PRESETS.includes(String(currentSettings.intervalMinutes))) {
    intervalSel.value = String(currentSettings.intervalMinutes);
    intervalCustom.classList.add('hidden');
  } else {
    intervalSel.value = 'custom';
    intervalCustom.classList.remove('hidden');
    intervalCustom.value = currentSettings.intervalMinutes;
  }
  snoozeInput.value = currentSettings.snoozeMinutes;
  autostartCb.checked = currentSettings.autostart;
  pausedCb.checked = currentSettings.paused;

  // Load theme
  applyTheme(currentSettings.theme || 'dark');

  // Load custom sprite configurations
  currentCustomPath = currentSettings.customSpritePath;
  if (currentSettings.spriteType === 'custom') {
    spriteCustomRadio.checked = true;
    customUploaderArea.classList.remove('hidden');
  } else {
    spriteDefaultRadio.checked = true;
    customUploaderArea.classList.add('hidden');
  }

  if (currentSettings.spriteConfig) {
    colsRow0.value = currentSettings.spriteConfig.colsPerRow[0] || 6;
    colsRow1.value = currentSettings.spriteConfig.colsPerRow[1] || 5;
    colsRow2.value = currentSettings.spriteConfig.colsPerRow[2] || 6;
  }

  if (currentCustomPath) {
    filePathDisplay.textContent = getFilename(currentCustomPath);
    uploadStatusText.textContent = 'Replace PNG Spritesheet';
    customSpriteBase64 = await window.api.getCustomSpriteData(currentCustomPath);
  }

  // Load initial preview spritesheet
  loadPreviewSheet();
}

function getFilename(p) {
  if (!p) return 'No file selected';
  return p.substring(p.lastIndexOf('\\') + 1).substring(p.lastIndexOf('/') + 1);
}

// Preview Engine
function loadPreviewSheet() {
  previewImgLoaded = false;
  stopPreviewAnimation();

  previewImg = new Image();
  previewImg.onload = () => {
    previewImgWidth = previewImg.naturalWidth;
    previewImgHeight = previewImg.naturalHeight;

    const displayH = 240;
    const rows = 3;
    const frameH = previewImgHeight / rows;
    previewScale = displayH / frameH;

    previewCharacter.style.backgroundImage = `url("${previewImg.src}")`;
    previewCharacter.style.backgroundSize = `${previewImgWidth * previewScale}px ${previewImgHeight * previewScale}px`;
    previewCharacter.style.height = `${displayH}px`;

    previewImgLoaded = true;
    startPreviewAnimation(activePreviewRow);
  };

  if (spriteCustomRadio.checked && customSpriteBase64) {
    previewImg.src = customSpriteBase64;
  } else {
    previewImg.src = '../assets/spritesheet.png';
  }
}

function setPreviewFrame(row, col) {
  if (!previewImgLoaded) return;
  const displayH = 240;

  // Read column config from user inputs dynamically so preview updates in real time
  const colsPerRow = [
    parseInt(colsRow0.value, 10) || 6,
    parseInt(colsRow1.value, 10) || 5,
    parseInt(colsRow2.value, 10) || 6
  ];
  const cols = colsPerRow[row];

  const frameW = previewImgWidth / cols;
  const scaledFrameW = frameW * previewScale;

  previewCharacter.style.width = `${scaledFrameW}px`;

  const posX = -(col * scaledFrameW);
  const posY = -(row * displayH);
  previewCharacter.style.backgroundPosition = `${posX}px ${posY}px`;
}

function startPreviewAnimation(row) {
  stopPreviewAnimation();
  activePreviewRow = row;

  // Toggle active styling on preview buttons
  btnPrevWalkIn.classList.toggle('active', row === 0);
  btnPrevDrink.classList.toggle('active', row === 1);
  btnPrevWalkOut.classList.toggle('active', row === 2);

  const colsPerRow = [
    parseInt(colsRow0.value, 10) || 6,
    parseInt(colsRow1.value, 10) || 5,
    parseInt(colsRow2.value, 10) || 6
  ];
  const frameCount = colsPerRow[row];

  let frame = 0;
  setPreviewFrame(row, frame);

  const duration = row === 1 ? 250 : 110; // slow drink sequence, fast walk sequence
  previewInterval = setInterval(() => {
    frame = (frame + 1) % frameCount;
    setPreviewFrame(row, frame);
  }, duration);
}

function stopPreviewAnimation() {
  if (previewInterval) {
    clearInterval(previewInterval);
    previewInterval = null;
  }
}

// Theme Toggle Click Handler
themeToggle.addEventListener('click', () => {
  const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
});

// Event Listeners for Preview Actions
btnPrevWalkIn.addEventListener('click', () => startPreviewAnimation(0));
btnPrevDrink.addEventListener('click', () => startPreviewAnimation(1));
btnPrevWalkOut.addEventListener('click', () => startPreviewAnimation(2));

// Grid size updates trigger live preview reload
[colsRow0, colsRow1, colsRow2].forEach((input) => {
  input.addEventListener('input', () => {
    if (previewImgLoaded) {
      startPreviewAnimation(activePreviewRow);
    }
  });
});

// Toggle Custom Sprite Area
[spriteDefaultRadio, spriteCustomRadio].forEach((radio) => {
  radio.addEventListener('change', () => {
    if (spriteCustomRadio.checked) {
      customUploaderArea.classList.remove('hidden');
    } else {
      customUploaderArea.classList.add('hidden');
    }
    loadPreviewSheet();
  });
});

// Trigger file uploader dialog
uploadTrigger.addEventListener('click', async () => {
  const destPath = await window.api.selectAndUploadSprite();
  if (destPath) {
    currentCustomPath = destPath;
    filePathDisplay.textContent = getFilename(destPath);
    uploadStatusText.textContent = 'Replace PNG Spritesheet';
    statusEl.textContent = 'Uploaded successfully!';
    statusEl.style.color = '#10b981';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);

    // Reload the preview using the new file data
    customSpriteBase64 = await window.api.getCustomSpriteData(currentCustomPath);
    loadPreviewSheet();
  }
});

// Cadence Custom Display Toggle
intervalSel.addEventListener('change', () => {
  if (intervalSel.value === 'custom') intervalCustom.classList.remove('hidden');
  else intervalCustom.classList.add('hidden');
});

// Cancel Btn Click
cancelBtn.addEventListener('click', () => window.close());

// Save Btn Click
saveBtn.addEventListener('click', async () => {
  let interval;
  if (intervalSel.value === 'custom') {
    interval = parseInt(intervalCustom.value, 10);
    if (!interval || interval < 1) {
      statusEl.textContent = 'Enter a valid interval.';
      statusEl.style.color = '#ef4444';
      return;
    }
  } else {
    interval = parseInt(intervalSel.value, 10);
  }

  const snooze = parseInt(snoozeInput.value, 10) || 5;

  const isCustom = spriteCustomRadio.checked;
  if (isCustom && !currentCustomPath) {
    statusEl.textContent = 'Please upload a spritesheet PNG first.';
    statusEl.style.color = '#ef4444';
    return;
  }

  const cols0 = parseInt(colsRow0.value, 10) || 6;
  const cols1 = parseInt(colsRow1.value, 10) || 5;
  const cols2 = parseInt(colsRow2.value, 10) || 6;

  statusEl.textContent = 'Saving changes...';
  statusEl.style.color = '#10b981';

  await window.api.saveSettings({
    intervalMinutes: interval,
    snoozeMinutes: snooze,
    autostart: autostartCb.checked,
    paused: pausedCb.checked,
    spriteType: isCustom ? 'custom' : 'default',
    customSpritePath: isCustom ? currentCustomPath : null,
    spriteConfig: {
      rows: 3,
      colsPerRow: [cols0, cols1, cols2],
      walkInFrames: cols0,
      drinkingFrames: cols1,
      walkOutFrames: cols2
    },
    theme: currentTheme
  });

  statusEl.textContent = 'Saved!';
  setTimeout(() => window.close(), 700);
});

// Run Init
init();