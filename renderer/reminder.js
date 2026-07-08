// Animation config — matches the new 6x3 spritesheet (1529x2048).
// Top row (Row 0) and Bottom row (Row 2) have 6 columns.
// Middle row (Row 1) has 5 columns.
let SHEET = {
  src: '../assets/spritesheet.png',
  rows: 3,
  colsPerRow: [6, 5, 6], // Column count varies per row
  walkInFrames: 6,       // Row 0 has 6 frames
  drinkingFrames: 5,     // Row 1 has 5 frames
  walkOutFrames: 6,      // Row 2 has 6 frames
  frameDuration: 110,    // ms per frame
};

const characterEl = document.getElementById('character');
const bubbleEl = document.getElementById('bubble');
const buttonsEl = document.getElementById('bubble-buttons');
const snoozeBtn = document.getElementById('snooze-btn');

let animInterval = null;
let imgLoaded = false;
let imgWidth = 0;
let imgHeight = 0;
let scale = 1;

function useDefaultSheet() {
  SHEET.src = '../assets/spritesheet.png';
  SHEET.colsPerRow = [6, 5, 6];
  SHEET.walkInFrames = 6;
  SHEET.drinkingFrames = 5;
  SHEET.walkOutFrames = 6;
}

// Preload the sheet and calculate constant scale parameters
function loadSheet() {
  if (imgLoaded) return Promise.resolve();
  return new Promise(async (resolve) => {
    try {
      const s = await window.api.getSettings();
      // Apply Theme
      if (s.theme === 'light') {
        document.body.classList.add('light-theme');
      } else {
        document.body.classList.remove('light-theme');
      }

      // Dynamically update snooze duration label
      if (snoozeBtn) {
        snoozeBtn.textContent = `Snooze ${s.snoozeMinutes} min`;
      }

      if (s.spriteType === 'custom' && s.customSpritePath) {
        const data = await window.api.getCustomSpriteData();
        if (data) {
          SHEET.src = data;
          if (s.spriteConfig) {
            SHEET.colsPerRow = s.spriteConfig.colsPerRow;
            SHEET.walkInFrames = s.spriteConfig.walkInFrames;
            SHEET.drinkingFrames = s.spriteConfig.drinkingFrames;
            SHEET.walkOutFrames = s.spriteConfig.walkOutFrames;
          }
        } else {
          useDefaultSheet();
        }
      } else {
        useDefaultSheet();
      }
    } catch (err) {
      console.error('Error fetching settings/custom sprite path, using default.', err);
      useDefaultSheet();
    }

    const img = new Image();
    img.onload = () => {
      imgWidth = img.naturalWidth;
      imgHeight = img.naturalHeight;

      const displayH = 240;
      const frameH = imgHeight / SHEET.rows; // 2048 / 3 = 682.6667
      
      // Calculate uniform scale based on height to fit 240px container height
      scale = displayH / frameH;

      // Set constant background parameters
      characterEl.style.backgroundImage = `url("${img.src}")`;
      characterEl.style.height = displayH + 'px';
      characterEl.style.backgroundSize =
        (imgWidth * scale) + 'px ' + (imgHeight * scale) + 'px';

      imgLoaded = true;
      resolve();
    };
    img.src = SHEET.src;
  });
}

// Positions the background image and resizes the container dynamically based on the active row's column count
function setFrame(row, col) {
  const displayH = 240;
  const cols = SHEET.colsPerRow[row];
  
  // Use exact floats to avoid sub-pixel misalignment
  const frameW = imgWidth / cols; 
  const scaledFrameW = frameW * scale;

  // Resize container dynamically to match the active row's frame width
  characterEl.style.width = scaledFrameW + 'px';
  
  const posX = -(col * scaledFrameW);
  const posY = -(row * displayH);
  characterEl.style.backgroundPosition = `${posX}px ${posY}px`;
}

function startWalkCycle(row, frameCount) {
  stopWalkCycle();
  let i = 0;
  setFrame(row, i);
  animInterval = setInterval(() => {
    i = (i + 1) % frameCount;
    setFrame(row, i);
  }, SHEET.frameDuration);
}

function stopWalkCycle() {
  if (animInterval) { clearInterval(animInterval); animInterval = null; }
}

// Plays the drinking animation once through Row 1 frames
function playDrinkingAnimation() {
  return new Promise((resolve) => {
    let frame = 0;
    setFrame(1, frame);
    const iv = setInterval(() => {
      frame++;
      if (frame >= SHEET.drinkingFrames) {
        clearInterval(iv);
        resolve();
      } else {
        setFrame(1, frame);
      }
    }, 250); // 250ms per frame for a natural drinking pace
  });
}

// ---------- The reminder sequence ----------
async function playReminder() {
  imgLoaded = false; // Force re-evaluating settings/spritesheet on every trigger
  await loadSheet();

  // Reset state (clear visible classes and remove any flip styling)
  bubbleEl.classList.remove('visible');
  buttonsEl.classList.remove('visible');
  characterEl.classList.remove('walk-in', 'walk-out', 'flip');
  characterEl.style.left = '100%';
  // force reflow so the transition applies cleanly
  void characterEl.offsetWidth;

  // Clear the inline style so the stylesheet rules can take over
  characterEl.style.left = '';

  // 1. Walk in (facing left) — using row 0 (6 frames, no flip needed)
  startWalkCycle(0, SHEET.walkInFrames);
  characterEl.classList.add('walk-in');

  // Wait for CSS transition to finish
  await wait(3300);

  // 2. Stop walking and play the drinking animation
  stopWalkCycle();
  await playDrinkingAnimation();
  
  // Reset character to frame 0 of Row 1 (standing, looking forward/left)
  setFrame(1, 0);
  
  // Show text bubble and horizontal action buttons
  bubbleEl.classList.add('visible');
  buttonsEl.classList.add('visible');
}

function walkOutAndClose() {
  bubbleEl.classList.remove('visible');
  buttonsEl.classList.remove('visible');
  
  // Walk out (facing right) — using row 2 (6 frames, no flip needed)
  startWalkCycle(2, SHEET.walkOutFrames);
  
  // Change CSS target: move from ~55% to +105%
  characterEl.classList.remove('walk-in');
  characterEl.classList.add('walk-out');

  setTimeout(() => {
    stopWalkCycle();
    window.api.animationDone();  // main will hide window & reschedule
  }, 3300);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------- Button wiring ----------
document.querySelectorAll('#bubble-buttons button').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    // Tell main which reschedule to apply
    window.api.sendReminderAction({ type: action });
    // Then play the walk-out animation locally for a nice UX
    walkOutAndClose();
  });
});

// Trigger from main
window.api.onPlayAnimation(() => {
  playReminder();
});
