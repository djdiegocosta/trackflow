'use strict';

// Termos que, por padrão, devem ser preservados (com sua grafia canônica)
// mesmo quando estiverem entre colchetes/parênteses ou passarem por
// capitalização automática.
const DEFAULT_PRESERVE_TERMS = [
  'Remix',
  'Live',
  'Extended Mix',
  'Radio Edit',
  'Remaster',
  'Bootleg',
  'VIP Mix',
];

// Caracteres inválidos em nomes de arquivo no Windows + caracteres invisíveis comuns
const INVALID_FS_CHARS = /[\\/:*?"<>|]/g;
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\uFEFF\u00A0]/g;

const MAX_FILENAME_LENGTH = 180; // margem de segurança abaixo do limite do Windows (260 no caminho completo)

function defaultRules() {
  return {
    removeLeadingNumbering: true,
    removeUnderscores: true,
    collapseDuplicates: true,
    removeInvalidChars: true,
    removeBracketed: false,
    standardizeSeparators: true,
    capitalization: true,
  };
}

/** Escapa um texto para uso em RegExp */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Remove conteúdo entre [] e () preservando os termos protegidos */
function removeBracketedPreserving(text, preserveTerms) {
  return text.replace(/[\[(][^\[\]()]*[\])]/g, (match) => {
    const inner = match.slice(1, -1).trim();
    const isPreserved = preserveTerms.some(
      (term) => term.toLowerCase() === inner.toLowerCase()
    );
    return isPreserved ? match : '';
  });
}

/** Capitaliza em Title Case, preservando a grafia canônica dos termos protegidos */
function toTitleCasePreserving(text, preserveTerms) {
  // Ordena por comprimento decrescente para casar frases (ex: "Extended Mix") antes de palavras soltas
  const sortedTerms = [...preserveTerms].sort((a, b) => b.length - a.length);

  const MARK = '\u0001';
  const stored = [];
  let working = text;

  sortedTerms.forEach((term) => {
    const re = new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi');
    working = working.replace(re, (m) => {
      const idx = stored.length;
      stored.push(term); // grafia canônica
      return `${MARK}${idx}${MARK}`;
    });
  });

  const smallWords = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'com', 'feat', 'ft']);

  working = working
    .split(/(\s+)/)
    .map((token, i) => {
      if (token.trim() === '' || token.startsWith(MARK)) return token;
      const lower = token.toLowerCase();
      if (i !== 0 && smallWords.has(lower.replace(/[.,]/g, ''))) return lower;
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join('');

  working = working.replace(new RegExp(`${MARK}(\\d+)${MARK}`, 'g'), (_, idx) => stored[Number(idx)]);

  return working;
}

/** Aplica as regras de limpeza selecionadas a um campo de texto (artist/title/album) */
function cleanField(rawText, rules, preserveTerms) {
  let t = (rawText || '').normalize('NFC');
  if (!t) return '';

  if (rules.removeInvalidChars) {
    t = t.replace(INVISIBLE_CHARS, '');
    t = t.replace(INVALID_FS_CHARS, '');
  }

  if (rules.removeBracketed) {
    t = removeBracketedPreserving(t, preserveTerms);
  }

  if (rules.removeUnderscores) {
    t = t.replace(/_/g, ' ');
  }

  if (rules.removeLeadingNumbering) {
    t = t.replace(/^\s*\d{1,3}\s*[.\-_)]\s*/, '');
  }

  if (rules.standardizeSeparators) {
    t = t.replace(/\s*-\s*/g, ' - ');
  }

  if (rules.collapseDuplicates) {
    t = t.replace(/[ \t]{2,}/g, ' ');
    t = t.replace(/-{2,}/g, '-');
    t = t.replace(/(\s-\s){2,}/g, ' - ');
  }

  t = t.trim().replace(/^[-\s]+|[-\s]+$/g, '');

  if (rules.capitalization && t) {
    t = toTitleCasePreserving(t, preserveTerms);
  }

  return t.trim();
}

/** Monta o nome final (sem extensão) a partir do template escolhido */
function buildBaseName({ templateId, customTemplate, fields }) {
  const { artist, title, album, year, track } = fields;

  switch (templateId) {
    case 'artist-title':
      return [artist, title].filter(Boolean).join(' - ');
    case 'title-artist':
      return [title, artist].filter(Boolean).join(' - ');
    case 'title-only':
      return title;
    case 'artist-only':
      return artist;
    case 'custom':
      return (customTemplate || '{artist} - {title}')
        .replace(/\{artist\}/gi, artist)
        .replace(/\{title\}/gi, title)
        .replace(/\{album\}/gi, album)
        .replace(/\{year\}/gi, year)
        .replace(/\{track\}/gi, track)
        .replace(/\s{2,}/g, ' ')
        .replace(/^[-\s]+|[-\s]+$/g, '')
        .trim();
    default:
      return [artist, title].filter(Boolean).join(' - ');
  }
}

/**
 * Gera a prévia de renomeação para uma lista de arquivos já com metadados lidos.
 * @param {Array} items - itens vindos do metadata-reader
 * @param {Object} options - { templateId, customTemplate, rules, preserveTerms, includeMissingMetadata }
 */
function generatePreview(items, options) {
  const rules = { ...defaultRules(), ...(options.rules || {}) };
  const preserveTerms = options.preserveTerms && options.preserveTerms.length
    ? options.preserveTerms
    : DEFAULT_PRESERVE_TERMS;

  const preview = items.map((item) => {
    if (item.error) {
      return {
        ...item,
        newName: null,
        status: 'read-error',
        message: `Não foi possível ler metadados: ${item.error}`,
      };
    }

    const fields = {
      artist: cleanField(item.artist, rules, preserveTerms),
      title: cleanField(item.title, rules, preserveTerms),
      album: cleanField(item.album, rules, preserveTerms),
      year: item.year || '',
      track: item.track || '',
    };

    const missingCore =
      (options.templateId !== 'title-only' && !fields.artist) ||
      (options.templateId !== 'artist-only' && !fields.title);

    if (missingCore && !options.includeMissingMetadata) {
      return {
        ...item,
        fields,
        newName: null,
        status: 'missing-metadata',
        message: 'Metadados de Artista/Título ausentes — arquivo ignorado (ative "incluir mesmo sem metadados" para gerar um nome de qualquer forma).',
      };
    }

    let baseName = buildBaseName({
      templateId: options.templateId,
      customTemplate: options.customTemplate,
      fields,
    }) || item.originalName.replace(/\.mp3$/i, '');

    if (baseName.length > MAX_FILENAME_LENGTH) {
      baseName = baseName.slice(0, MAX_FILENAME_LENGTH).trim();
    }

    const newName = `${baseName}${item.ext}`;
    const unchanged = newName === item.originalName;

    return {
      ...item,
      fields,
      newName,
      status: unchanged ? 'unchanged' : 'ready',
      message: unchanged ? 'Nome já está no padrão selecionado.' : null,
    };
  });

  return markConflicts(preview);
}

/** Marca conflitos: nomes duplicados dentro do mesmo diretório ou colisão com arquivo já existente no disco */
function markConflicts(preview) {
  const fs = require('fs');
  const path = require('path');

  const groupsByDir = new Map();
  preview.forEach((item) => {
    if (item.status !== 'ready') return;
    const key = item.dir;
    if (!groupsByDir.has(key)) groupsByDir.set(key, new Map());
    const namesInDir = groupsByDir.get(key);
    const lowerName = item.newName.toLowerCase();
    if (!namesInDir.has(lowerName)) namesInDir.set(lowerName, []);
    namesInDir.get(lowerName).push(item);
  });

  const result = preview.map((item) => {
    if (item.status !== 'ready') return item;

    const namesInDir = groupsByDir.get(item.dir);
    const sameNameItems = namesInDir.get(item.newName.toLowerCase());

    if (sameNameItems.length > 1) {
      return {
        ...item,
        status: 'conflict-duplicate',
        message: `Conflito: outro arquivo da lista também seria renomeado para "${item.newName}" nesta pasta.`,
      };
    }

    const targetPath = path.join(item.dir, item.newName);
    if (
      targetPath.toLowerCase() !== item.filePath.toLowerCase() &&
      fs.existsSync(targetPath)
    ) {
      return {
        ...item,
        status: 'conflict-exists',
        message: `Conflito: já existe um arquivo "${item.newName}" nesta pasta.`,
      };
    }

    return item;
  });

  return result;
}

module.exports = {
  DEFAULT_PRESERVE_TERMS,
  defaultRules,
  cleanField,
  buildBaseName,
  generatePreview,
  markConflicts,
};
