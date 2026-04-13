let snippets = {};
let editingKey = null;

function updateBadge() {
  const n = Object.keys(snippets).length;
  document.getElementById('count-badge').textContent = n === 1 ? '1 atajo' : `${n} atajos`;
}

function renderList(filter = '') {
  const list = document.getElementById('list');
  const entries = Object.entries(snippets).filter(([k, v]) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return k.toLowerCase().includes(q) || (v.name || '').toLowerCase().includes(q) || (v.body || '').toLowerCase().includes(q);
  });

  if (entries.length === 0) {
    list.innerHTML = `<div class="empty">${filter ? 'Sin resultados' : 'No hay atajos aún. ¡Crea el primero!'}</div>`;
    return;
  }

  list.innerHTML = entries.map(([shortcut, snippet]) => `
    <div class="snippet-row" data-key="${shortcut}">
      <span class="shortcut-tag">${escHtml(shortcut)}</span>
      <div class="snippet-info">
        <div class="snippet-name">${escHtml(snippet.name || 'Sin nombre')}</div>
        <div class="snippet-preview">${escHtml(snippet.body || '')}</div>
      </div>
      <div class="row-actions">
        <button class="btn-icon edit-btn" data-key="${shortcut}" title="Editar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon del del-btn" data-key="${shortcut}" title="Eliminar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openEditor(btn.dataset.key); });
  });
  list.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); deleteSnippet(btn.dataset.key); });
  });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function openEditor(key) {
  editingKey = key || null;
  const editor = document.getElementById('editor');
  document.getElementById('editor-title').textContent = key ? 'Editar atajo' : 'Nuevo atajo';
  document.getElementById('f-shortcut').value = key || '';
  document.getElementById('f-name').value = key ? (snippets[key].name || '') : '';
  document.getElementById('f-body').value = key ? (snippets[key].body || '') : '';
  editor.classList.add('active');
  document.getElementById('f-shortcut').focus();
}

function closeEditor() {
  document.getElementById('editor').classList.remove('active');
  editingKey = null;
}

function saveSnippet() {
  const shortcut = document.getElementById('f-shortcut').value.trim();
  const name = document.getElementById('f-name').value.trim();
  const body = document.getElementById('f-body').value;

  if (!shortcut) { alert('El atajo no puede estar vacío.'); return; }
  if (!body.trim()) { alert('El texto expandido no puede estar vacío.'); return; }

  if (editingKey && editingKey !== shortcut) {
    delete snippets[editingKey];
  }

  snippets[shortcut] = { name: name || shortcut, body };
  chrome.storage.sync.set({ snippets }, () => {
    renderList(document.getElementById('search').value);
    updateBadge();
    closeEditor();
  });
}

function deleteSnippet(key) {
  if (!confirm(`¿Eliminar el atajo "${key}"?`)) return;
  delete snippets[key];
  chrome.storage.sync.set({ snippets }, () => {
    renderList(document.getElementById('search').value);
    updateBadge();
  });
}

function exportSnippets() {
  const data = JSON.stringify(snippets, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'snippetblaze-backup.json';
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      snippets = { ...snippets, ...data };
      chrome.storage.sync.set({ snippets }, () => {
        renderList();
        updateBadge();
        alert(`Importados correctamente. Total: ${Object.keys(snippets).length} atajos.`);
      });
    } catch (err) {
      alert('Error al leer el archivo. Asegúrate de que sea un JSON válido.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('btn-new').addEventListener('click', () => openEditor(null));
document.getElementById('btn-cancel-edit').addEventListener('click', closeEditor);
document.getElementById('btn-save').addEventListener('click', saveSnippet);
document.getElementById('btn-export').addEventListener('click', exportSnippets);
document.getElementById('search').addEventListener('input', (e) => renderList(e.target.value));

// Init
chrome.storage.sync.get('snippets', (data) => {
  snippets = data.snippets || {};
  renderList();
  updateBadge();
});
