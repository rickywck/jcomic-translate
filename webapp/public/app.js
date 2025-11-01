import { DEFAULT_PROMPT, GEMINI_MODEL_NAME } from './config.js';

const dirInput = document.getElementById('dirInput');
const apiKeyInput = document.getElementById('apiKeyInput');
const overwriteChk = document.getElementById('overwriteChk');
const translateBtn = document.getElementById('translateBtn');
const dirPicker = document.getElementById('dirPicker');
const uploadBtn = document.getElementById('uploadBtn');
const loadBtn = document.getElementById('loadBtn');
const statusDiv = document.getElementById('status');
const imgEl = document.getElementById('img');
const translatedDiv = document.getElementById('translated');
const counter = document.getElementById('counter');
const textPaneEl = translatedDiv.parentElement; // scroll container (.text-pane)
// Make sure it can receive focus for accessibility (not strictly required for programmatic scroll)
if (textPaneEl && !textPaneEl.hasAttribute('tabindex')) {
  textPaneEl.setAttribute('tabindex', '-1');
}

let files = [];
let index = 0;

function saveLocal() {
  localStorage.setItem('jct.dir', dirInput.value || '');
  localStorage.setItem('jct.key', apiKeyInput.value || '');
}
function loadLocal() {
  dirInput.value = localStorage.getItem('jct.dir') || '';
  apiKeyInput.value = localStorage.getItem('jct.key') || '';
}

function tryParseJsonArrayFromText(text) {
  if (!text || typeof text !== 'string') return null;
  let candidate = text.trim();
  const fenceMatch = candidate.match(/```(?:json)?\n([\s\S]*?)\n```/i);
  if (fenceMatch && fenceMatch[1]) {
    candidate = fenceMatch[1].trim();
  }
  if (!(candidate.trim().startsWith('[') && candidate.trim().endsWith(']'))) {
    const start = candidate.indexOf('[');
    const end = candidate.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      candidate = candidate.slice(start, end + 1);
    }
  }
  try {
    const parsed = JSON.parse(candidate);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    // Fallback: tolerant line-based extraction when JSON is slightly malformed
    // Extract pairs of original/translation even if quotes or commas are missing.
    try {
      const lines = candidate.split(/\r?\n/);
      const items = [];
      let current = { original: null, translation: null };

      const extractVal = (line) => {
        // Try to capture a quoted value first
        let m = line.match(/:\s*"([\s\S]*?)"\s*,?\s*$/);
        if (m) return m[1];
        // Fallback: take everything after colon up to end of line (strip trailing comma/quotes)
        const idx = line.indexOf(':');
        if (idx !== -1) {
          let v = line.slice(idx + 1).trim();
          if (v.endsWith(',')) v = v.slice(0, -1);
          if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
          return v;
        }
        return '';
      };

      for (let raw of lines) {
        const line = raw.trim();
        if (/^"original"\s*:/.test(line)) {
          current.original = extractVal(line);
        } else if (/^"translation"\s*:/.test(line)) {
          current.translation = extractVal(line);
        }

        // On object boundary or when we have both fields, push
        if ((line === '},' || line === '}' || line === '],') && (current.original != null || current.translation != null)) {
          items.push({ original: current.original ?? '', translation: current.translation ?? '' });
          current = { original: null, translation: null };
        }
      }

      // Push last item if pending
      if (current.original != null || current.translation != null) {
        items.push({ original: current.original ?? '', translation: current.translation ?? '' });
      }

      return items.length ? items : null;
    } catch {
      return null;
    }
  }
}

function renderTranslationRows(container, items) {
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  items.forEach(it => {
    const original = it && (it.original ?? it.Original ?? it.source ?? it.Source);
    const translation = it && (it.translation ?? it.Translation ?? it.target ?? it.Target);
    if (original != null) {
      const rowOrig = document.createElement('div');
      rowOrig.className = 'line-row line-original';
      rowOrig.textContent = String(original);
      frag.appendChild(rowOrig);
    }
    if (translation != null) {
      const rowTrans = document.createElement('div');
      rowTrans.className = 'line-row line-translation';
      rowTrans.textContent = String(translation);
      frag.appendChild(rowTrans);
    }
  });
  container.appendChild(frag);
}

async function refreshList() {
  const dir = dirInput.value.trim();
  if (!dir) { statusDiv.textContent = 'Enter a directory path.'; return; }
  const resp = await fetch(`/api/list?dir=${encodeURIComponent(dir)}`);
  if (!resp.ok) { statusDiv.textContent = 'Failed to list directory.'; return; }
  const data = await resp.json();
  files = data.files || [];
  index = 0;
  updateViewer();
}

async function loadCurrent() {
  if (!files.length) return;
  const dir = dirInput.value.trim();
  const f = files[index].file;
  imgEl.src = `/api/image?dir=${encodeURIComponent(dir)}&file=${encodeURIComponent(f)}`;
  counter.textContent = `${index + 1} / ${files.length} — ${f}`;
  translatedDiv.textContent = 'Loading text...';
  const resp = await fetch(`/api/text?dir=${encodeURIComponent(dir)}&file=${encodeURIComponent(f)}`);
  if (!resp.ok) { translatedDiv.textContent = '(No text found)'; return; }
  const text = await resp.text();
  const arr = tryParseJsonArrayFromText(text);
  if (arr && arr.length) {
    renderTranslationRows(translatedDiv, arr);
  } else {
    translatedDiv.textContent = text;
  }
}

function updateViewer() {
  if (!files.length) {
    imgEl.removeAttribute('src');
    translatedDiv.textContent = '(No files)';
    counter.textContent = '0 / 0';
    return;
  }
  loadCurrent();
}

function move(delta) {
  if (!files.length) return;
  index = (index + delta + files.length) % files.length;
  updateViewer();
}

translateBtn.addEventListener('click', async () => {
  saveLocal();
  const dir = dirInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  if (!dir) { statusDiv.textContent = 'Enter a directory path.'; return; }
  statusDiv.textContent = 'Translating... this may take a while.';
  try {
    const resp = await fetch('/api/translate-dir', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir, overwrite: overwriteChk.checked, apiKey: apiKey || undefined, modelName: GEMINI_MODEL_NAME, prompt: DEFAULT_PROMPT })
    });
    const data = await resp.json();
    if (!resp.ok) {
      statusDiv.textContent = 'Error: ' + (data.error || resp.statusText);
    } else {
      const ok = data.results?.filter(r => r.status === 'ok').length || 0;
      const skipped = data.results?.filter(r => r.status === 'skipped').length || 0;
      const failed = data.results?.filter(r => r.status === 'error').length || 0;
      statusDiv.textContent = `Done. ok=${ok}, skipped=${skipped}, failed=${failed}`;
    }
  } catch (e) {
    statusDiv.textContent = 'Request failed: ' + e.message;
  }
});

// Upload selected folder (from input type=file webkitdirectory)
uploadBtn.addEventListener('click', async () => {
  saveLocal();
  const files = dirPicker.files;
  if (!files || !files.length) { statusDiv.textContent = 'No folder selected.'; return; }
  statusDiv.textContent = 'Uploading files...';
  try {
    const fd = new FormData();
    for (const f of files) {
      // Only append image files
      if (!f.type.startsWith('image/')) continue;
      fd.append('files', f, f.name);
    }
    fd.append('dirName', 'upload_' + Date.now());
    if (overwriteChk.checked) fd.append('overwrite', 'true');
    if (apiKeyInput.value.trim()) fd.append('apiKey', apiKeyInput.value.trim());

    const resp = await fetch('/api/upload-and-translate', { method: 'POST', body: fd });
    const data = await resp.json();
    if (!resp.ok) {
      statusDiv.textContent = 'Upload failed: ' + (data.error || resp.statusText);
      return;
    }
    // Set returned server dir and refresh list
    dirInput.value = data.dir || dirInput.value;
    statusDiv.textContent = `Uploaded and translated ${data.processed || 0} files.`;
    await refreshList();
  } catch (e) {
    statusDiv.textContent = 'Upload error: ' + e.message;
  }
});

loadBtn.addEventListener('click', async () => {
  saveLocal();
  statusDiv.textContent = '';
  await refreshList();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') move(-1);
  if (e.key === 'ArrowRight') move(1);
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    // Scroll only the text pane; keep image fixed
    e.preventDefault();
    const delta = (e.key === 'ArrowDown') ? 60 : -60;
    if (textPaneEl) {
      // Bring focus for screenreaders but avoid jumping
      if (document.activeElement !== textPaneEl) {
        textPaneEl.focus({ preventScroll: true });
      }
      textPaneEl.scrollBy({ top: delta, left: 0, behavior: 'auto' });
    }
  }
});

loadLocal();
