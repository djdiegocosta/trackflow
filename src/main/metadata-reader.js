'use strict';

const path = require('path');
const mm = require('music-metadata');

/**
 * Lê os metadados ID3 (e outros formatos suportados) de um arquivo MP3.
 * Nunca lança para fora — em caso de erro, devolve campos vazios e a flag `error`.
 */
async function readMp3Metadata(filePath) {
  const base = {
    filePath,
    dir: path.dirname(filePath),
    originalName: path.basename(filePath),
    ext: path.extname(filePath),
    artist: '',
    title: '',
    album: '',
    year: '',
    track: '',
    error: null,
  };

  try {
    const metadata = await mm.parseFile(filePath, { duration: false, skipCovers: true });
    const common = metadata.common || {};

    base.artist = (common.artist || (common.artists && common.artists[0]) || '').trim();
    base.title = (common.title || '').trim();
    base.album = (common.album || '').trim();
    base.year = common.year ? String(common.year) : '';
    base.track = common.track && common.track.no ? String(common.track.no) : '';
  } catch (err) {
    base.error = err.message || 'Falha ao ler metadados';
  }

  return base;
}

/**
 * Lê metadados de uma lista de arquivos, em lotes, para não travar a UI.
 * @param {string[]} filePaths
 * @param {(done:number, total:number) => void} onProgress
 */
async function readAllMetadata(filePaths, onProgress) {
  const results = [];
  const BATCH_SIZE = 8;

  for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
    const batch = filePaths.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(readMp3Metadata));
    results.push(...batchResults);
    if (onProgress) onProgress(results.length, filePaths.length);
  }

  return results;
}

module.exports = { readMp3Metadata, readAllMetadata };
