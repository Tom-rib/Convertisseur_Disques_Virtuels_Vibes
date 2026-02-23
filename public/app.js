let sourceFilePath = '';
let sourceFormat = '';
let sourceSize = 0;
let destFolderPath = '';
let conversionUnsubscribe = null;

const sourceFilePathInput = document.getElementById('sourceFilePath');
const sourceInfoSection = document.getElementById('sourceInfo');
const sourceFormatEl = document.getElementById('sourceFormat');
const sourceSizeEl = document.getElementById('sourceSize');
const sourceFileNameEl = document.getElementById('sourceFileName');
const browseSourceBtn = document.getElementById('browseSourceBtn');

const destFormatSelect = document.getElementById('destFormat');
const compatibilityBadge = document.getElementById('compatibilityBadge');
const compressionOption = document.getElementById('compressionOption');

const browseDestBtn = document.getElementById('browseDestBtn');
const destFolderPathInput = document.getElementById('destFolderPath');
const destInfo = document.getElementById('destInfo');
const freeSpaceEl = document.getElementById('freeSpace');
const outputFileNameInput = document.getElementById('outputFileName');
const fullOutputPathInput = document.getElementById('fullOutputPath');

const compressionCheck = document.getElementById('compressionCheck');
const validationCheck = document.getElementById('validationCheck');
const threadsSlider = document.getElementById('threadsSlider');
const threadsValue = document.getElementById('threadsValue');

const convertBtn = document.getElementById('convertBtn');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');
const progressMessage = document.getElementById('progressMessage');
const timeRemaining = document.getElementById('timeRemaining');

const resultSection = document.getElementById('resultSection');
const resultCard = document.getElementById('resultCard');
const resultIcon = document.getElementById('resultIcon');
const resultTitle = document.getElementById('resultTitle');
const resultMessage = document.getElementById('resultMessage');
const resultDetails = document.getElementById('resultDetails');
const openResultFileBtn = document.getElementById('openResultFile');
const newConversionBtn = document.getElementById('newConversionBtn');

const historyList = document.getElementById('historyList');
const themeToggle = document.getElementById('themeToggle');

function normalizePathJoin(folder, fileName) {
  if (!folder || !fileName) return '';
  const separator = folder.includes('\\') ? '\\' : '/';
  return `${folder}${separator}${fileName}`;
}

function updateConvertButtonState() {
  const ready = Boolean(sourceFilePath && destFolderPath && destFormatSelect.value && outputFileNameInput.value.trim());
  convertBtn.disabled = !ready;
}

async function refreshCompatibility() {
  const dest = destFormatSelect.value;

  if (!sourceFormat || !dest) {
    compatibilityBadge.innerHTML = '<span class="badge badge-danger">Sélectionnez un format</span>';
    compressionOption.style.display = 'none';
    updateConvertButtonState();
    return;
  }

  const possible = await window.api.isConversionPossible(sourceFormat, dest);

  if (possible) {
    compatibilityBadge.innerHTML = '<span class="badge badge-success">Compatible</span>';
  } else {
    compatibilityBadge.innerHTML = '<span class="badge badge-danger">Non compatible</span>';
  }

  compressionOption.style.display = dest === 'QCOW2' ? 'flex' : 'none';
  updateConvertButtonState();
}

function resetProgress() {
  progressFill.style.width = '0%';
  progressPercent.textContent = '0%';
  progressMessage.textContent = 'Préparation...';
  timeRemaining.textContent = '--';
}

function showResult(success, title, message, details = {}) {
  resultSection.style.display = 'block';

  if (success) {
    resultCard.className = 'card p-6 border border-green-400 bg-green-50';
    resultIcon.className = 'fas fa-check-circle fa-2x text-green-600';
  } else {
    resultCard.className = 'card p-6 border border-red-400 bg-red-50';
    resultIcon.className = 'fas fa-times-circle fa-2x text-red-600';
  }

  resultTitle.textContent = title;
  resultMessage.textContent = message;

  const lines = [];
  Object.entries(details).forEach(([key, value]) => {
    lines.push(`<p><strong>${key}:</strong> ${value}</p>`);
  });
  resultDetails.innerHTML = lines.join('');
}

async function loadHistory() {
  const history = await window.api.getHistory();
  if (!history || history.length === 0) {
    historyList.innerHTML = '<p class="text-gray-500 text-center py-4">Aucune conversion dans l\'historique</p>';
    return;
  }

  historyList.innerHTML = history.map((item) => {
    const ok = item.success;
    const badge = ok
      ? '<span class="badge badge-success">Succès</span>'
      : '<span class="badge badge-danger">Erreur</span>';

    const when = new Date(item.timestamp).toLocaleString('fr-FR');
    const fromTo = `${item.sourceFormat || '?'} → ${item.destFormat || '?'}`;

    return `
      <div class="history-item">
        <div class="flex justify-between items-start gap-2 mb-2">
          <div class="font-semibold text-sm">${fromTo}</div>
          ${badge}
        </div>
        <div class="text-xs text-gray-500 mb-1">${when}</div>
        <div class="text-xs break-all">${item.inputFile || '-'}</div>
        <div class="text-xs break-all">${item.outputFile || item.error || '-'}</div>
      </div>
    `;
  }).join('');
}

browseSourceBtn.addEventListener('click', async () => {
  const selected = await window.api.browseSourceFile();
  if (!selected) return;

  sourceFilePath = selected;
  sourceFilePathInput.value = selected;

  const info = await window.api.getFileInfo(selected);
  sourceFormat = info.format;
  sourceSize = info.size;

  sourceFormatEl.textContent = info.format;
  sourceSizeEl.textContent = await window.api.formatBytes(info.size);
  sourceFileNameEl.textContent = info.name;
  sourceInfoSection.style.display = 'block';

  if (!outputFileNameInput.value.trim() && destFormatSelect.value) {
    const extMap = { VMDK: '.vmdk', VHD: '.vhd', VHDX: '.vhdx', QCOW2: '.qcow2', RAW: '.raw' };
    outputFileNameInput.value = `${info.name.replace(/\.[^/.]+$/, '')}${extMap[destFormatSelect.value] || '.img'}`;
  }

  fullOutputPathInput.value = normalizePathJoin(destFolderPath, outputFileNameInput.value.trim());
  await refreshCompatibility();
  updateConvertButtonState();
});

browseDestBtn.addEventListener('click', async () => {
  const selected = await window.api.browseDestinationFolder();
  if (!selected) return;

  destFolderPath = selected;
  destFolderPathInput.value = selected;

  const free = await window.api.getFreeDiskSpace(selected);
  freeSpaceEl.textContent = await window.api.formatBytes(free.available || 0);
  destInfo.style.display = 'block';

  fullOutputPathInput.value = normalizePathJoin(destFolderPath, outputFileNameInput.value.trim());
  updateConvertButtonState();
});

destFormatSelect.addEventListener('change', async () => {
  if (sourceFilePath) {
    const extMap = { VMDK: '.vmdk', VHD: '.vhd', VHDX: '.vhdx', QCOW2: '.qcow2', RAW: '.raw' };
    const base = sourceFilePath.split(/[\\/]/).pop().replace(/\.[^/.]+$/, '');
    outputFileNameInput.value = `${base}${extMap[destFormatSelect.value] || '.img'}`;
    fullOutputPathInput.value = normalizePathJoin(destFolderPath, outputFileNameInput.value.trim());
  }

  await refreshCompatibility();
  updateConvertButtonState();
});

outputFileNameInput.addEventListener('input', () => {
  fullOutputPathInput.value = normalizePathJoin(destFolderPath, outputFileNameInput.value.trim());
  updateConvertButtonState();
});

convertBtn.addEventListener('click', async () => {
  if (convertBtn.disabled) return;

  progressSection.style.display = 'block';
  resultSection.style.display = 'none';
  resetProgress();

  if (conversionUnsubscribe) {
    conversionUnsubscribe();
  }

  conversionUnsubscribe = window.api.onConversionProgress((progress) => {
    const pct = Math.max(0, Math.min(100, progress.percentage || 0));
    progressFill.style.width = `${pct}%`;
    progressPercent.textContent = `${pct}%`;
    progressMessage.textContent = progress.message || 'Conversion en cours...';

    if (progress.estimatedTime !== undefined) {
      const ms = Math.max(0, Math.floor(progress.estimatedTime * 1000));
      window.api.formatTime(ms).then((formatted) => {
        timeRemaining.textContent = formatted;
      });
    }
  });

  const outputPath = fullOutputPathInput.value.trim();
  const payload = {
    inputFile: sourceFilePath,
    outputFile: outputPath,
    outputFolder: destFolderPath,
    sourceFormat,
    destFormat: destFormatSelect.value,
    compression: Boolean(compressionCheck.checked),
    validate: Boolean(validationCheck.checked),
    threads: Number(threadsSlider.value || 4),
    inputSize: sourceSize
  };

  try {
    const result = await window.api.startConversion(payload);

    const inputSize = await window.api.formatBytes(result.inputSize || sourceSize || 0);
    const outputSize = await window.api.formatBytes(result.outputSize || 0);
    const duration = await window.api.formatTime(result.duration || 0);

    showResult(true, 'Conversion réussie', result.message || 'Le fichier a été converti avec succès.', {
      Source: inputSize,
      Sortie: outputSize,
      Durée: duration,
      Fichier: result.outputFile || outputPath
    });

    openResultFileBtn.style.display = 'inline-block';
    openResultFileBtn.onclick = async () => {
      await window.api.openPath(destFolderPath);
    };

    await loadHistory();
  } catch (error) {
    showResult(false, 'Échec de conversion', error.message || 'La conversion a échoué.', {});
    openResultFileBtn.style.display = 'none';
  }
});

newConversionBtn.addEventListener('click', () => {
  resultSection.style.display = 'none';
  progressSection.style.display = 'none';
  resetProgress();
});

themeToggle.addEventListener('click', () => {
  const body = document.body;
  const dark = body.classList.contains('dark-mode');

  if (dark) {
    body.classList.remove('dark-mode');
    body.classList.add('light-mode');
    themeToggle.innerHTML = '<i class="fas fa-moon"></i> Dark';
  } else {
    body.classList.remove('light-mode');
    body.classList.add('dark-mode');
    themeToggle.innerHTML = '<i class="fas fa-sun"></i> Light';
  }
});

window.toggleCollapsible = function toggleCollapsible(headerEl) {
  const content = headerEl.nextElementSibling;
  const icon = headerEl.querySelector('.fa-chevron-down');
  const open = content.classList.toggle('open');

  if (open) {
    icon.style.transform = 'rotate(180deg)';
  } else {
    icon.style.transform = 'rotate(0deg)';
  }
};

window.updateThreads = function updateThreads(value) {
  threadsValue.textContent = String(value);
};

(async function init() {
  try {
    const defaultFolder = await window.api.getDefaultOutputFolder();
    if (defaultFolder) {
      destFolderPath = defaultFolder;
      destFolderPathInput.value = defaultFolder;
      fullOutputPathInput.value = normalizePathJoin(destFolderPath, outputFileNameInput.value.trim());
    }
  } catch (_error) {
  }

  await loadHistory();
  updateConvertButtonState();
})();
