'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// API mínima e explícita exposta ao renderer — nada de acesso direto a
// Node.js/fs no lado da interface. Toda a leitura/escrita de arquivos
// acontece no processo principal.
contextBridge.exposeInMainWorld('trackflow', {
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),

  scanLibrary: (rootDir) => ipcRenderer.invoke('library:scan', rootDir),
  onScanProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('library:scan-progress', listener);
    return () => ipcRenderer.removeListener('library:scan-progress', listener);
  },

  getDefaults: () => ipcRenderer.invoke('preview:defaults'),
  generatePreview: (items, options) => ipcRenderer.invoke('preview:generate', { items, options }),

  executeRename: (rootDir, approvedItems, copyFilesToBackup) =>
    ipcRenderer.invoke('rename:execute', { rootDir, approvedItems, copyFilesToBackup }),

  undoLast: (rootDir) => ipcRenderer.invoke('rename:undo', rootDir),
  listBackupSessions: (rootDir) => ipcRenderer.invoke('backup:list-sessions', rootDir),
  openBackupFolder: (rootDir) => ipcRenderer.invoke('backup:open-folder', rootDir),
});
