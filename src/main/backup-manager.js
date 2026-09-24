'use strict';

const fs = require('fs');
const path = require('path');

const BACKUP_DIRNAME = '.trackflow-backups';

function backupRootFor(rootDir) {
  return path.join(rootDir, BACKUP_DIRNAME);
}

function timestampId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

/**
 * Executa a renomeação em lote para os itens aprovados (status === 'ready').
 * Sempre grava um manifesto (para permitir desfazer). Opcionalmente também
 * copia os arquivos originais para uma pasta de backup antes de renomear.
 *
 * @param {string} rootDir - pasta raiz selecionada pelo usuário (onde fica a pasta de backup)
 * @param {Array} approvedItems - itens da prévia já filtrados pelo usuário (apenas 'ready')
 * @param {Object} opts - { copyFilesToBackup: boolean }
 */
async function executeRename(rootDir, approvedItems, opts = {}) {
  const copyFilesToBackup = opts.copyFilesToBackup !== false; // default true

  const sessionId = timestampId();
  const backupRoot = backupRootFor(rootDir);
  const sessionDir = path.join(backupRoot, sessionId);
  const filesBackupDir = path.join(sessionDir, 'files');

  await ensureDir(backupRoot);
  if (copyFilesToBackup) await ensureDir(filesBackupDir);

  const manifestEntries = [];
  const report = { success: [], skipped: [], failed: [], total: approvedItems.length };

  let counter = 0;
  for (const item of approvedItems) {
    counter += 1;
    if (item.status !== 'ready') {
      report.skipped.push({ file: item.originalName, reason: `status: ${item.status}` });
      continue;
    }

    const oldPath = item.filePath;
    const newPath = path.join(item.dir, item.newName);

    try {
      if (!fs.existsSync(oldPath)) {
        throw new Error('Arquivo de origem não encontrado (pode ter sido movido/apagado).');
      }
      if (fs.existsSync(newPath)) {
        throw new Error('Já existe um arquivo com o nome de destino (não sobrescrito).');
      }

      let backupFilePath = null;
      if (copyFilesToBackup) {
        backupFilePath = path.join(filesBackupDir, `${String(counter).padStart(4, '0')}__${item.originalName}`);
        await fs.promises.copyFile(oldPath, backupFilePath);
      }

      await fs.promises.rename(oldPath, newPath);

      manifestEntries.push({
        oldPath,
        newPath,
        backupFilePath,
      });
      report.success.push({ from: item.originalName, to: item.newName, dir: item.dir });
    } catch (err) {
      report.failed.push({ file: item.originalName, reason: err.message });
    }
  }

  const manifest = {
    sessionId,
    rootDir,
    createdAt: new Date().toISOString(),
    copyFilesToBackup,
    entries: manifestEntries,
  };

  await fs.promises.writeFile(
    path.join(sessionDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  return { report, sessionId, sessionDir };
}

/** Lista as sessões de backup disponíveis (mais recente primeiro) */
async function listSessions(rootDir) {
  const backupRoot = backupRootFor(rootDir);
  if (!fs.existsSync(backupRoot)) return [];

  const dirs = await fs.promises.readdir(backupRoot, { withFileTypes: true });
  const sessions = [];

  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const manifestPath = path.join(backupRoot, d.name, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
        sessions.push(manifest);
      } catch (_) {
        // manifesto corrompido, ignora
      }
    }
  }

  sessions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return sessions;
}

/** Desfaz a última sessão de renomeação daquela pasta raiz */
async function undoLastSession(rootDir) {
  const sessions = await listSessions(rootDir);
  if (!sessions.length) {
    return { report: null, message: 'Nenhum backup encontrado para desfazer nesta pasta.' };
  }

  const manifest = sessions[0];
  const report = { restored: [], failed: [], total: manifest.entries.length };

  for (const entry of manifest.entries) {
    try {
      if (fs.existsSync(entry.newPath)) {
        if (fs.existsSync(entry.oldPath)) {
          throw new Error('Já existe um arquivo no caminho original — restauração cancelada para não sobrescrever.');
        }
        await fs.promises.rename(entry.newPath, entry.oldPath);
        report.restored.push({ from: path.basename(entry.newPath), to: path.basename(entry.oldPath) });
      } else if (entry.backupFilePath && fs.existsSync(entry.backupFilePath)) {
        // arquivo renomeado sumiu, mas temos cópia de backup — restaura a partir dela
        if (fs.existsSync(entry.oldPath)) {
          throw new Error('Já existe um arquivo no caminho original — restauração cancelada.');
        }
        await fs.promises.copyFile(entry.backupFilePath, entry.oldPath);
        report.restored.push({ from: '(cópia de backup)', to: path.basename(entry.oldPath) });
      } else {
        throw new Error('Arquivo renomeado não foi encontrado para reverter.');
      }
    } catch (err) {
      report.failed.push({ file: path.basename(entry.oldPath), reason: err.message });
    }
  }

  return { report, sessionId: manifest.sessionId };
}

module.exports = {
  BACKUP_DIRNAME,
  backupRootFor,
  executeRename,
  listSessions,
  undoLastSession,
};
