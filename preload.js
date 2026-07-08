const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  sendReminderAction: (action) => ipcRenderer.send('reminder-action', action),
  animationDone: () => ipcRenderer.send('reminder-animation-done'),
  onPlayAnimation: (cb) => ipcRenderer.on('play-animation', cb),
  selectAndUploadSprite: () => ipcRenderer.invoke('select-and-upload-sprite'),
  getCustomSpriteData: (customPath) => ipcRenderer.invoke('get-custom-sprite-data', customPath),
});
