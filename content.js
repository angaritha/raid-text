(() => {
  let snippets = {};
  let buffer = '';
  let isModalOpen = false;
  let pendingSnippet = null;
  let pendingTarget = null;
  let pendingBufferLen = 0;

  // ─── Load & sync snippets ────────────────────────────────────────────────────
  function loadSnippets() {
    chrome.storage.sync.get('snippets', (data) => {
      snippets = data.snippets || {};
    });
  }
  loadSnippets();
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.snippets) snippets = changes.snippets.newValue || {};
  });

  // ─── Date/time helpers ───────────────────────────────────────────────────────
  function getDate(fmt) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    if (fmt === 'dd/mm/yyyy') return `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}`;
    if (fmt === 'yyyy-mm-dd') return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    if (fmt === 'time')       return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    return now.toLocaleDateString('es-CO');
  }

  function processTemplate(template, fields) {
    let result = template;
    result = result.replace(/\{fecha\}/gi, getDate('dd/mm/yyyy'));
    result = result.replace(/\{date\}/gi,  getDate('yyyy-mm-dd'));
    result = result.replace(/\{hora\}/gi,  getDate('time'));
    result = result.replace(/\{time\}/gi,  getDate('time'));
    if (fields) {
      Object.entries(fields).forEach(([key, val]) => {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'gi'), val);
      });
    }
    return result;
  }

  function getDynamicFields(template) {
    const systemKeys = ['fecha', 'date', 'hora', 'time'];
    return [...template.matchAll(/\{([^}]+)\}/g)]
      .map(m => m[1])
      .filter(k => !systemKeys.includes(k.toLowerCase()));
  }

  // ─── Editable element detection ─────────────────────────────────────────────
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag === 'INPUT') {
      const type = (el.type || '').toLowerCase();
      const blocked = ['checkbox','radio','submit','button','reset','file','image','range','color'];
      return !blocked.includes(type);
    }
    if (tag === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    if (el.getAttribute('role') === 'textbox') return true;
    if (el.getAttribute('contenteditable') === 'true') return true;
    return false;
  }

  function getEditableAncestor(el) {
    let node = el;
    for (let i = 0; i < 8; i++) {
      if (!node) break;
      if (isEditable(node)) return node;
      node = node.parentElement;
    }
    return null;
  }

  // ─── Core insertion — works everywhere ──────────────────────────────────────
  // Strategy: use execCommand('insertText') as primary method.
  // It works in Chrome for input, textarea, AND contentEditable (Gmail, WhatsApp, Notion, etc.)
  // and preserves undo history. Falls back to direct DOM for edge cases.
  function deleteChars(el, count) {
    for (let i = 0; i < count; i++) {
      const ok = document.execCommand('delete', false);
      if (!ok) {
        // Fallback for plain inputs/textareas
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          const pos = el.selectionStart;
          if (pos > 0) {
            el.value = el.value.slice(0, pos - 1) + el.value.slice(pos);
            el.selectionStart = el.selectionEnd = pos - 1;
          }
        }
      }
    }
  }

  function insertExpanded(el, text, bufferLen) {
    el.focus();

    // Delete the shortcut characters
    deleteChars(el, bufferLen);

    // Insert the expanded text — execCommand works in Chrome for all editable types
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        // Insert newline: use insertParagraph for contentEditable, \n for inputs
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          document.execCommand('insertText', false, '\n');
        } else {
          document.execCommand('insertParagraph', false);
        }
      }
      if (lines[i]) {
        document.execCommand('insertText', false, lines[i]);
      }
    }

    // Fire input event so React/Vue/Angular apps update their state
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, composed: true }));

    buffer = '';
  }

  // ─── Dynamic fields modal ────────────────────────────────────────────────────
  function showDynamicModal(snippet, target, fields, bufferLen) {
    if (document.getElementById('rt-modal')) return;
    isModalOpen = true;
    pendingSnippet = snippet;
    pendingTarget = target;
    pendingBufferLen = bufferLen;

    const overlay = document.createElement('div');
    overlay.id = 'rt-modal';
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'background:rgba(0,0,0,0.5)', 'z-index:2147483647',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    ].join(';');

    const card = document.createElement('div');
    card.style.cssText = [
      'background:#fff', 'border-radius:12px', 'padding:24px',
      'min-width:320px', 'max-width:480px', 'width:90%',
      'box-shadow:0 8px 40px rgba(0,0,0,0.2)'
    ].join(';');

    card.innerHTML = `
      <p style="margin:0 0 4px;font-size:16px;font-weight:500;color:#111;">Completar atajo</p>
      <p style="margin:0 0 20px;font-size:13px;color:#666;">${snippet.name || ''}</p>
      <div id="rt-fields"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
        <button id="rt-cancel" style="padding:8px 16px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;font-size:14px;color:#444;">Cancelar</button>
        <button id="rt-confirm" style="padding:8px 16px;border:none;background:#4F46E5;color:#fff;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;">Insertar</button>
      </div>
    `;

    const fieldsDiv = card.querySelector('#rt-fields');
    fields.forEach(field => {
      const wrap = document.createElement('div');
      wrap.style.marginBottom = '14px';
      wrap.innerHTML = `
        <label style="display:block;font-size:12px;color:#888;margin-bottom:4px;text-transform:capitalize;">${field}</label>
        <input data-field="${field}" type="text" placeholder="${field}"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none;" />
      `;
      fieldsDiv.appendChild(wrap);
    });

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    card.querySelector('input').focus();

    function confirm() {
      const vals = {};
      card.querySelectorAll('input[data-field]').forEach(inp => {
        vals[inp.dataset.field] = inp.value;
      });
      const expanded = processTemplate(pendingSnippet.body, vals);
      overlay.remove();
      isModalOpen = false;
      insertExpanded(pendingTarget, expanded, pendingBufferLen);
    }

    function cancel() {
      overlay.remove();
      isModalOpen = false;
      buffer = '';
    }

    card.querySelector('#rt-confirm').onclick = confirm;
    card.querySelector('#rt-cancel').onclick = cancel;
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirm(); }
      if (e.key === 'Escape') cancel();
    });
    overlay.addEventListener('mousedown', e => {
      if (e.target === overlay) cancel();
    });
  }

  // ─── Try to expand buffer ─────────────────────────────────────────────────
  function tryExpand(target) {
    for (const [shortcut, snippet] of Object.entries(snippets)) {
      if (buffer.endsWith(shortcut)) {
        const fields = getDynamicFields(snippet.body);
        if (fields.length > 0) {
          showDynamicModal(snippet, target, fields, shortcut.length);
        } else {
          insertExpanded(target, processTemplate(snippet.body, {}), shortcut.length);
        }
        return true;
      }
    }
    return false;
  }

  // ─── Key listener ─────────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (isModalOpen) return;

    const target = getEditableAncestor(e.target);
    if (!target) return;

    if (e.key === 'Backspace') {
      buffer = buffer.slice(0, -1);
      return;
    }

    // Reset buffer on navigation keys, Enter, Tab, Escape
    if (e.key.length > 1) {
      if (!['Shift','Control','Alt','Meta','CapsLock'].includes(e.key)) {
        buffer = '';
      }
      return;
    }

    // Ignore shortcuts with modifier keys (Ctrl+C, etc.)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    buffer += e.key;
    if (buffer.length > 80) buffer = buffer.slice(-80);

    setTimeout(() => tryExpand(target), 0);
  }

  // Reset buffer when user clicks somewhere else
  function onMouseDown(e) {
    const target = getEditableAncestor(e.target);
    if (!target) buffer = '';
  }

  // ─── Attach to main document and all iframes ──────────────────────────────
  function attachToDocument(doc) {
    try {
      doc.addEventListener('keydown', onKeyDown, true);
      doc.addEventListener('mousedown', onMouseDown, true);
    } catch (err) {
      // Cross-origin iframe — skip silently
    }
  }

  attachToDocument(document);

  // Watch for iframes added dynamically (Gmail uses them heavily)
  function attachToIframe(iframe) {
    try {
      const iDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (iDoc) attachToDocument(iDoc);
    } catch (err) {
      // Cross-origin — skip
    }
    iframe.addEventListener('load', () => {
      try {
        attachToDocument(iframe.contentDocument || iframe.contentWindow.document);
      } catch (err) {}
    });
  }

  // Attach to any existing iframes
  document.querySelectorAll('iframe').forEach(attachToIframe);

  // Observe for new iframes (Gmail, Salesforce, etc. inject them dynamically)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'IFRAME') attachToIframe(node);
        node.querySelectorAll && node.querySelectorAll('iframe').forEach(attachToIframe);
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

})();
