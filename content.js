(() => {
  let snippets = {};
  let buffer = '';
  let isModalOpen = false;
  let pendingSnippet = null;
  let pendingTarget = null;

  function loadSnippets() {
    chrome.storage.sync.get('snippets', (data) => {
      snippets = data.snippets || {};
    });
  }

  loadSnippets();
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.snippets) snippets = changes.snippets.newValue || {};
  });

  function getDate(fmt) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    if (fmt === 'dd/mm/yyyy') return `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}`;
    if (fmt === 'yyyy-mm-dd') return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    if (fmt === 'time') return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    return now.toLocaleDateString('es-CO');
  }

  function processTemplate(template, fields) {
    let result = template;
    // Replace {fecha} and {date} with today
    result = result.replace(/\{fecha\}/gi, getDate('dd/mm/yyyy'));
    result = result.replace(/\{date\}/gi, getDate('yyyy-mm-dd'));
    result = result.replace(/\{hora\}/gi, getDate('time'));
    result = result.replace(/\{time\}/gi, getDate('time'));
    // Replace dynamic fields
    if (fields) {
      Object.entries(fields).forEach(([key, val]) => {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'gi'), val);
      });
    }
    return result;
  }

  function getDynamicFields(template) {
    const systemKeys = ['fecha', 'date', 'hora', 'time'];
    const matches = [...template.matchAll(/\{([^}]+)\}/g)];
    return matches
      .map(m => m[1])
      .filter(k => !systemKeys.includes(k.toLowerCase()));
  }

  function insertText(target, text) {
    if (!target) return;
    target.focus();
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
    if (isInput) {
      const start = target.selectionStart - buffer.length;
      const end = target.selectionEnd;
      target.value = target.value.substring(0, start) + text + target.value.substring(end);
      target.selectionStart = target.selectionEnd = start + text.length;
    } else if (target.isContentEditable) {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      // Delete the buffer text
      for (let i = 0; i < buffer.length; i++) {
        document.execCommand('delete', false);
      }
      // Insert new text preserving line breaks
      const lines = text.split('\n');
      lines.forEach((line, idx) => {
        if (idx > 0) document.execCommand('insertParagraph', false);
        if (line) document.execCommand('insertText', false, line);
      });
    }
    buffer = '';
  }

  function showDynamicModal(snippet, target, fields) {
    if (document.getElementById('snb-modal')) return;
    isModalOpen = true;
    pendingSnippet = snippet;
    pendingTarget = target;

    const overlay = document.createElement('div');
    overlay.id = 'snb-modal';
    overlay.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:rgba(0,0,0,0.45);z-index:2147483647;
      display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      background:#fff;border-radius:12px;padding:24px;
      min-width:320px;max-width:480px;width:90%;
      box-shadow:0 8px 32px rgba(0,0,0,0.18);
    `;

    card.innerHTML = `
      <h3 style="margin:0 0 4px;font-size:16px;font-weight:500;color:#111;">Completar atajo</h3>
      <p style="margin:0 0 20px;font-size:13px;color:#666;">${snippet.name || 'Snippet'}</p>
      <div id="snb-fields"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
        <button id="snb-cancel" style="padding:8px 16px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;font-size:14px;color:#444;">Cancelar</button>
        <button id="snb-confirm" style="padding:8px 16px;border:none;background:#4F46E5;color:#fff;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;">Insertar</button>
      </div>
    `;

    const fieldsDiv = card.querySelector('#snb-fields');
    fields.forEach(field => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin-bottom:14px;';
      wrap.innerHTML = `
        <label style="display:block;font-size:12px;color:#888;margin-bottom:4px;text-transform:capitalize;">${field}</label>
        <input data-field="${field}" type="text" placeholder="${field}" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none;" />
      `;
      fieldsDiv.appendChild(wrap);
    });

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const firstInput = card.querySelector('input');
    if (firstInput) firstInput.focus();

    function confirm() {
      const vals = {};
      card.querySelectorAll('input[data-field]').forEach(inp => {
        vals[inp.dataset.field] = inp.value;
      });
      const expanded = processTemplate(snippet.body, vals);
      overlay.remove();
      isModalOpen = false;
      insertText(pendingTarget, expanded);
    }

    card.querySelector('#snb-confirm').onclick = confirm;
    card.querySelector('#snb-cancel').onclick = () => {
      overlay.remove();
      isModalOpen = false;
      buffer = '';
    };
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirm(); }
      if (e.key === 'Escape') { overlay.remove(); isModalOpen = false; buffer = ''; }
    });
    overlay.addEventListener('mousedown', e => {
      if (e.target === overlay) { overlay.remove(); isModalOpen = false; buffer = ''; }
    });
  }

  function tryExpand(target) {
    for (const [shortcut, snippet] of Object.entries(snippets)) {
      if (buffer.endsWith(shortcut)) {
        const dynamicFields = getDynamicFields(snippet.body);
        if (dynamicFields.length > 0) {
          showDynamicModal(snippet, target, dynamicFields);
        } else {
          const expanded = processTemplate(snippet.body, {});
          insertText(target, expanded);
        }
        return true;
      }
    }
    return false;
  }

  document.addEventListener('keydown', (e) => {
    if (isModalOpen) return;
    const target = e.target;
    const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    if (!isEditable) return;

    if (e.key === 'Backspace') { buffer = buffer.slice(0, -1); return; }
    if (e.key.length > 1) { buffer = ''; return; }

    buffer += e.key;
    if (buffer.length > 60) buffer = buffer.slice(-60);

    setTimeout(() => tryExpand(target), 0);
  }, true);
})();
