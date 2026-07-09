const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// ---------- Settings persistence ----------
const configDir = path.join(app.getPath('userData'));
const configPath = path.join(configDir, 'settings.json');

const defaultSettings = {
  intervalMinutes: 60,     // main reminder cadence
  snoozeMinutes: 5,        // "Snooze" button duration
  autostart: true,
  paused: false,
  spriteType: 'default',   // 'default' or 'custom'
  customSpritePath: null,  // path on disk
  spriteConfig: {
    rows: 3,
    colsPerRow: [6, 5, 6],
    walkInFrames: 6,
    drinkingFrames: 5,
    walkOutFrames: 6
  },
  theme: 'dark'
};

function loadSettings() {
  try {
    if (fs.existsSync(configPath)) {
      return { ...defaultSettings, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
    }
  } catch (e) { console.error('load settings failed', e); }
  return { ...defaultSettings };
}

function saveSettings(s) {
  try {
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(s, null, 2));
  } catch (e) { console.error('save settings failed', e); }
}

let settings = loadSettings();

// ---------- App state ----------
let reminderWindow = null;
let settingsWindow = null;
let tray = null;
let targetTime = null;
let checkInterval = null;

// Prevent multiple instances and open settings on double-click
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    openSettings();
  });
}

// ---------- Reminder window ----------
function createReminderWindow() {
  if (reminderWindow) return reminderWindow;

  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.workAreaSize;

  const winWidth = 520;
  const winHeight = 360;

  reminderWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: width - winWidth,
    y: height - winHeight,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,   // needs true so buttons work
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  reminderWindow.setAlwaysOnTop(true, 'screen-saver');
  reminderWindow.loadFile(path.join(__dirname, 'renderer', 'reminder.html'));

  reminderWindow.on('closed', () => { reminderWindow = null; });
  return reminderWindow;
}

function showReminder() {
  if (settings.paused) return;
  const w = createReminderWindow();
  w.showInactive();      // don't steal focus
  w.webContents.send('play-animation');
}

function hideReminder() {
  if (reminderWindow) reminderWindow.hide();
}

// ---------- Settings / Dashboard window ----------
function openSettings() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 780,
    height: 580,
    resizable: true,
    minimizable: true,
    maximizable: true,
    title: 'Water Reminder — Dashboard',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ---------- Timers (Wall-clock target check for sleep mode reliability) ----------
function scheduleNext(minutes) {
  if (settings.paused) {
    targetTime = null;
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    return;
  }

  targetTime = Date.now() + Math.max(1, minutes) * 60 * 1000;

  if (!checkInterval) {
    checkInterval = setInterval(() => {
      if (settings.paused) {
        targetTime = null;
        clearInterval(checkInterval);
        checkInterval = null;
        return;
      }
      if (targetTime && Date.now() >= targetTime) {
        targetTime = null; // Clear so we don't trigger repeatedly
        showReminder();
      }
    }, 5000); // Check every 5 seconds
  }
}

function restartMainSchedule() {
  scheduleNext(settings.intervalMinutes);
}

// ---------- Tray ----------
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Trigger reminder now', click: () => showReminder() },
    { type: 'separator' },
    {
      label: settings.paused ? 'Resume reminders' : 'Pause reminders',
      click: () => {
        settings.paused = !settings.paused;
        saveSettings(settings);
        if (settings.paused) {
          targetTime = null;
          if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
          }
        } else {
          restartMainSchedule();
        }
        tray.setContextMenu(buildTrayMenu());
      },
    },
    { label: 'Settings…', click: openSettings },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } },
  ]);
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) {
    // fallback: 16x16 blue square so app still launches if icon missing
    img = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVQ4T2NkYGD4z0AEYBxVSF6IjIYCw6ihMBoKDKOhwDAaCgxDMxQAqTQCAWy0m0kAAAAASUVORK5CYII='
    );
  } else if (process.platform === 'darwin') {
    img = img.resize({ width: 22, height: 22 });
  }
  tray = new Tray(img);
  tray.setToolTip('Water Reminder');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => tray.popUpContextMenu());
}

// ---------- Autostart ----------
function applyAutostart(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    path: process.execPath,
    args: ['--hidden'],
  });
}

// ---------- IPC ----------
ipcMain.handle('get-settings', () => settings);

ipcMain.handle('save-settings', (_evt, newSettings) => {
  const prevAutostart = settings.autostart;
  settings = { ...settings, ...newSettings };
  saveSettings(settings);
  if (settings.autostart !== prevAutostart) applyAutostart(settings.autostart);
  restartMainSchedule();
  tray.setContextMenu(buildTrayMenu());
  return settings;
});

ipcMain.handle('select-and-upload-sprite', async () => {
  if (!settingsWindow) return null;
  const result = await dialog.showOpenDialog(settingsWindow, {
    title: 'Select Spritesheet PNG',
    filters: [{ name: 'Images', extensions: ['png'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const srcPath = result.filePaths[0];
  const customDir = path.join(app.getPath('userData'), 'custom-sprites');
  if (!fs.existsSync(customDir)) {
    fs.mkdirSync(customDir, { recursive: true });
  }
  const destPath = path.join(customDir, 'spritesheet.png');
  fs.copyFileSync(srcPath, destPath);
  return destPath;
});

ipcMain.handle('get-custom-sprite-data', async (_evt, customPath) => {
  const pathToRead = customPath || settings.customSpritePath;
  if (pathToRead && fs.existsSync(pathToRead)) {
    try {
      const data = fs.readFileSync(pathToRead);
      return `data:image/png;base64,${data.toString('base64')}`;
    } catch (e) {
      console.error('Failed to read custom sprite', e);
    }
  }
  return null;
});

ipcMain.on('reminder-action', (_evt, action) => {
  // action: { type: 'remind30' | 'remind60' | 'snooze' }
  if (action.type === 'remind30') scheduleNext(30);
  else if (action.type === 'remind60') scheduleNext(60);
  else if (action.type === 'snooze') scheduleNext(settings.snoozeMinutes);
  else restartMainSchedule();
});

ipcMain.on('reminder-animation-done', () => {
  // Character finished the walk-out animation
  hideReminder();
});

// ---------- Lifecycle ----------
app.whenReady().then(() => {
  createTray();
  applyAutostart(settings.autostart);
  restartMainSchedule();

  // If not launched silently on system boot (e.g. user manually opens the app), show Settings
  const shouldStartHidden = process.argv.includes('--hidden');
  if (!shouldStartHidden) {
    openSettings();
  }
});

app.on('window-all-closed', (e) => { e.preventDefault(); });
app.on('activate', () => { openSettings(); });
app.on('before-quit', () => {
  targetTime = null;
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
});
