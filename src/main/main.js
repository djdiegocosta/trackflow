'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

const { scanMp3Files } = require('./mp3-scanner');
const { readAllMetadata } = require('./metadata-reader');
const { generatePreview, DEFAULT_PRESERVE_TERMS, defaultRules } = require('./renamer');
const { executeRename, undoLastSession, listSessions } = require('./backup-manager');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    title: 'TrackFlow Renamer',
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Bloqueia qualquer tentativa de navegação/abertura de janelas externas
  // (o app é 100% local e não deve carregar nada da rede).
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- IPC: seleção de pasta ----------

ipcMain.handle('dialog:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Selecione a pasta com os arquivos MP3',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// ---------- IPC: escaneamento + leitura de metadados ----------

ipcMain.handle('library:scan', async (event, rootDir) => {
  const files = await scanMp3Files(rootDir);
  const total = files.length;

  const items = await readAllMetadata(files, (done) => {
    event.sender.send('library:scan-progress', { done, total });
  });

  return { rootDir, total, items };
});

// ---------- IPC: geração de prévia ----------

ipcMain.handle('preview:generate', async (event, { items, options }) => {
  return generatePreview(items, options);
});

ipcMain.handle('preview:defaults', async () => {
  return { preserveTerms: DEFAULT_PRESERVE_TERMS, rules: defaultRules() };
});

// ---------- IPC: execução da renomeação ----------

ipcMain.handle('rename:execute', async (event, { rootDir, approvedItems, copyFilesToBackup }) => {
  return executeRename(rootDir, approvedItems, { copyFilesToBackup });
});

// ---------- IPC: desfazer ----------

ipcMain.handle('rename:undo', async (event, rootDir) => {
  return undoLastSession(rootDir);
});

ipcMain.handle('backup:list-sessions', async (event, rootDir) => {
  return listSessions(rootDir);
});

ipcMain.handle('backup:open-folder', async (event, rootDir) => {
  const { backupRootFor } = require('./backup-manager');
  const fs = require('fs');
  const backupRoot = backupRootFor(rootDir);
  if (fs.existsSync(backupRoot)) {
    await shell.openPath(backupRoot);
    return true;
  }
  return false;
});
