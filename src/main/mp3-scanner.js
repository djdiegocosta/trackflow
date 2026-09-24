'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Varre recursivamente uma pasta em busca de arquivos .mp3.
 * Ignora pastas de sistema/ocultas comuns e a própria pasta de backup do app.
 * @param {string} rootDir
 * @returns {Promise<string[]>} lista de caminhos absolutos de arquivos .mp3
 */
async function scanMp3Files(rootDir) {
  const results = [];
  const IGNORED_DIRS = new Set(['.trackflow-backups', '$RECYCLE.BIN', 'System Volume Information']);

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      // pasta inacessível (permissão, link quebrado etc.) — pula silenciosamente
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp3')) {
        results.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return results;
}

module.exports = { scanMp3Files };
