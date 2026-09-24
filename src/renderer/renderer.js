'use strict';

const state = {
  rootDir: null,
  rawItems: [],      // itens com metadados lidos (vindos do main)
  preview: [],        // itens com newName/status calculados
  included: new Set(), // filePaths marcados para renomear
};

const el = {
  btnSelectFolder: document.getElementById('btnSelectFolder'),
  currentFolder: document.getElementById('currentFolder'),
  templateSelect: document.getElementById('templateSelect'),
  customTemplateField: document.getElementById('customTemplateField'),
  customTemplateInput: document.getElementById('customTemplateInput'),
  preserveTerms: document.getElementById('preserveTerms'),
  includeMissing: document.getElementById('includeMissing'),
  copyBackup: document.getElementById('copyBackup'),
  btnGeneratePreview: document.getElementById('btnGeneratePreview'),
  btnToggleAll: document.getElementById('btnToggleAll'),
  btnExecute: document.getElementById('btnExecute'),
  btnUndo: document.getElementById('btnUndo'),
  emptyState: document.getElementById('emptyState'),
  progressState: document.getElementById('progressState'),
  progressText: document.getElementById('progressText'),
  tableWrapper: document.getElementById('tableWrapper'),
  previewTbody: document.getElementById('previewTbody'),
  checkAllHeader: document.getElementById('checkAllHeader'),
  statTotal: document.getElementById('statTotal'),
  statReady: document.getElementById('statReady'),
  statConflict: document.getElementById('statConflict'),
  statMissing: document.getElementById('statMissing'),
  reportPanel: document.getElementById('reportPanel'),
  reportContent: document.getElementById('reportContent'),
  statusMessage: document.getElementById('statusMessage'),
  ruleLeadingNumbering: document.getElementById('ruleLeadingNumbering'),
  ruleUnderscores: document.getElementById('ruleUnderscores'),
  ruleCollapseDuplicates: document.getElementById('ruleCollapseDuplicates'),
  ruleInvalidChars: document.getElementById('ruleInvalidChars'),
  ruleBracketed: document.getElementById('ruleBracketed'),
  ruleSeparators: document.getElementById('ruleSeparators'),
  ruleCapitalization: document.getElementById('ruleCapitalization'),
};

function setStatus(msg) {
  el.statusMessage.textContent = msg;
}

function collectRules() {
  return {
    removeLeadingNumbering: el.ruleLeadingNumbering.checked,
    removeUnderscores: el.ruleUnderscores.checked,
    collapseDuplicates: el.ruleCollapseDuplicates.checked,
    removeInvalidChars: el.ruleInvalidChars.checked,
    removeBracketed: el.ruleBracketed.checked,
    standardizeSeparators: el.ruleSeparators.checked,
    capitalization: el.ruleCapitalization.checked,
  };
}

function collectOptions() {
  return {
    templateId: el.templateSelect.value,
    customTemplate: el.customTemplateInput.value,
    rules: collectRules(),
    preserveTerms: el.preserveTerms.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    includeMissingMetadata: el.includeMissing.checked,
  };
}

async function init() {
  const defaults = await window.trackflow.getDefaults();
  el.preserveTerms.value = defaults.preserveTerms.join('\n');

  el.btnSelectFolder.addEventListener('click', onSelectFolder);
  el.templateSelect.addEventListener('change', () => {
    el.customTemplateField.style.display = el.templateSelect.value === 'custom' ? 'flex' : 'none';
  });
  el.btnGeneratePreview.addEventListener('click', onGeneratePreview);
  el.btnToggleAll.addEventListener('click', onToggleAll);
  el.checkAllHeader.addEventListener('change', () => onToggleAll(el.checkAllHeader.checked));
  el.btnExecute.addEventListener('click', onExecute);
  el.btnUndo.addEventListener('click', onUndo);

  window.trackflow.onScanProgress(({ done, total }) => {
    el.progressText.textContent = `Lendo metadados… ${done} / ${total}`;
  });
}

async function onSelectFolder() {
  const dir = await window.trackflow.selectFolder();
  if (!dir) return;

  state.rootDir = dir;
  el.currentFolder.textContent = dir;
  el.currentFolder.title = dir;

  el.emptyState.style.display = 'none';
  el.tableWrapper.style.display = 'none';
  el.progressState.style.display = 'flex';
  el.progressText.textContent = 'Procurando arquivos MP3…';
  el.reportPanel.style.display = 'none';

  const result = await window.trackflow.scanLibrary(dir);
  state.rawItems = result.items;

  el.progressState.style.display = 'none';

  if (!result.total) {
    el.emptyState.style.display = 'flex';
    el.emptyState.querySelector('p').textContent = 'Nenhum arquivo .mp3 encontrado nesta pasta.';
    el.btnGeneratePreview.disabled = true;
    setStatus('Nenhum MP3 encontrado.');
    return;
  }

  el.btnGeneratePreview.disabled = false;
  setStatus(`${result.total} arquivo(s) MP3 encontrados. Ajuste as opções e gere a prévia.`);
  await onGeneratePreview();
}

async function onGeneratePreview() {
  if (!state.rawItems.length) return;
  setStatus('Gerando prévia…');

  const preview = await window.trackflow.generatePreview(state.rawItems, collectOptions());
  state.preview = preview;
  state.included = new Set(preview.filter((p) => p.status === 'ready').map((p) => p.filePath));

  renderTable();
  setStatus('Prévia gerada. Revise os nomes antes de executar.');
}

function statusBadge(item) {
  const map = {
    'ready': ['badge-ready', 'Pronto'],
    'unchanged': ['badge-unchanged', 'Já correto'],
    'conflict-duplicate': ['badge-conflict-duplicate', 'Conflito (duplicado)'],
    'conflict-exists': ['badge-conflict-exists', 'Conflito (já existe)'],
    'missing-metadata': ['badge-missing-metadata', 'Sem metadados'],
    'read-error': ['badge-read-error', 'Erro de leitura'],
  };
  const [cls, label] = map[item.status] || ['badge-unchanged', item.status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function renderTable() {
  const items = state.preview;

  el.statTotal.textContent = `${items.length} arquivos`;
  el.statReady.textContent = `${items.filter((i) => i.status === 'ready').length} prontos`;
  el.statConflict.textContent = `${items.filter((i) => i.status.startsWith('conflict')).length} conflitos`;
  el.statMissing.textContent = `${items.filter((i) => i.status === 'missing-metadata' || i.status === 'read-error').length} sem metadados`;

  el.previewTbody.innerHTML = items.map((item) => {
    const canToggle = item.status === 'ready';
    const checked = canToggle && state.included.has(item.filePath);
    const newNameText = item.newName ? escapeHtml(item.newName) : '—';
    const msg = item.message ? `<span class="row-msg">${escapeHtml(item.message)}</span>` : '';

    return `
      <tr data-path="${escapeAttr(item.filePath)}">
        <td class="col-check">
          <input type="checkbox" class="row-check" ${checked ? 'checked' : ''} ${canToggle ? '' : 'disabled'} />
        </td>
        <td>${statusBadge(item)}</td>
        <td class="name-old">${escapeHtml(item.originalName)}</td>
        <td class="name-new">${newNameText}${msg}</td>
        <td class="dir-cell" title="${escapeAttr(item.dir)}">${escapeHtml(item.dir)}</td>
      </tr>`;
  }).join('');

  el.previewTbody.querySelectorAll('.row-check').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      const path = tr.getAttribute('data-path');
      if (e.target.checked) state.included.add(path);
      else state.included.delete(path);
      updateExecuteButton();
    });
  });

  el.tableWrapper.style.display = 'block';
  el.btnToggleAll.disabled = items.every((i) => i.status !== 'ready');
  updateExecuteButton();
}

function updateExecuteButton() {
  el.btnExecute.disabled = state.included.size === 0;
  el.btnExecute.textContent = state.included.size
    ? `Executar renomeação (${state.included.size})`
    : 'Executar renomeação';
}

function onToggleAll(forceValue) {
  const readyItems = state.preview.filter((i) => i.status === 'ready');
  const shouldCheck = typeof forceValue === 'boolean'
    ? forceValue
    : state.included.size < readyItems.length;

  if (shouldCheck) readyItems.forEach((i) => state.included.add(i.filePath));
  else state.included.clear();

  renderTable();
}

async function onExecute() {
  const approvedItems = state.preview.filter((i) => state.included.has(i.filePath));
  if (!approvedItems.length) return;

  const confirmMsg = `Renomear ${approvedItems.length} arquivo(s)?\n\nUm backup local será criado e você poderá desfazer depois.`;
  if (!window.confirm(confirmMsg)) return;

  el.btnExecute.disabled = true;
  setStatus('Executando renomeação…');

  const { report } = await window.trackflow.executeRename(
    state.rootDir,
    approvedItems,
    el.copyBackup.checked
  );

  showReport(report);
  setStatus(`Concluído: ${report.success.length} renomeados, ${report.failed.length} falhas, ${report.skipped.length} ignorados.`);

  // Recarrega a biblioteca para refletir os novos nomes
  await onSelectFolderRefresh();
}

async function onSelectFolderRefresh() {
  if (!state.rootDir) return;
  const result = await window.trackflow.scanLibrary(state.rootDir);
  state.rawItems = result.items;
  await onGeneratePreview();
}

async function onUndo() {
  if (!state.rootDir) {
    alert('Selecione uma pasta primeiro.');
    return;
  }
  if (!window.confirm('Desfazer a última renomeação executada nesta pasta?')) return;

  setStatus('Desfazendo última alteração…');
  const { report, message } = await window.trackflow.undoLast(state.rootDir);

  if (!report) {
    alert(message);
    setStatus(message);
    return;
  }

  showUndoReport(report);
  setStatus(`Desfeito: ${report.restored.length} restaurados, ${report.failed.length} falhas.`);
  await onSelectFolderRefresh();
}

function showReport(report) {
  const lines = [];
  report.success.forEach((s) => lines.push(`<div class="report-line ok">✔ ${escapeHtml(s.from)} → ${escapeHtml(s.to)}</div>`));
  report.skipped.forEach((s) => lines.push(`<div class="report-line skip">— ${escapeHtml(s.file)} (${escapeHtml(s.reason)})</div>`));
  report.failed.forEach((f) => lines.push(`<div class="report-line fail">✘ ${escapeHtml(f.file)} — ${escapeHtml(f.reason)}</div>`));

  el.reportContent.innerHTML = lines.join('') || '<div class="report-line skip">Nenhuma ação realizada.</div>';
  el.reportPanel.style.display = 'block';
}

function showUndoReport(report) {
  const lines = [];
  report.restored.forEach((r) => lines.push(`<div class="report-line ok">✔ restaurado: ${escapeHtml(r.to)}</div>`));
  report.failed.forEach((f) => lines.push(`<div class="report-line fail">✘ ${escapeHtml(f.file)} — ${escapeHtml(f.reason)}</div>`));

  el.reportContent.innerHTML = `<h4 style="margin:0 0 6px;font-size:11px;color:var(--text-dim)">Desfazer</h4>${lines.join('')}`;
  el.reportPanel.style.display = 'block';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

init();
