(() => {
  let snippets = {};
  let isModalOpen = false;

  chrome.storage.sync.get('snippets', (data) => { snippets = data.snippets || {}; });
  chrome.storage.onChanged.addListener((c) => { if (c.snippets) snippets = c.snippets.newValue || {}; });

  function getDate(fmt) {
    const now = new Date(), pad = n => String(n).padStart(2,'0');
    if (fmt==='dd/mm/yyyy') return `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}`;
    if (fmt==='time') return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  function processTemplate(tpl, fields) {
    let r = tpl;
    r = r.replace(/\{fecha\}/gi, getDate('dd/mm/yyyy'));
    r = r.replace(/\{date\}/gi,  getDate('dd/mm/yyyy'));
    r = r.replace(/\{hora\}/gi,  getDate('time'));
    r = r.replace(/\{time\}/gi,  getDate('time'));
    if (fields) Object.entries(fields).forEach(([k,v]) => r = r.replace(new RegExp(`\\{${k}\\}`,'gi'), v));
    return r;
  }

  function getDynamicFields(tpl) {
    const sys = ['fecha','date','hora','time'];
    return [...tpl.matchAll(/\{([^}]+)\}/g)].map(m=>m[1]).filter(k=>!sys.includes(k.toLowerCase()));
  }

  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
      const blocked = ['checkbox','radio','submit','button','reset','file','image','range','color'];
      return !blocked.includes((el.type||'').toLowerCase());
    }
    return el.isContentEditable || el.getAttribute('role') === 'textbox';
  }

  function getTarget(el) {
    let node = el;
    for (let i = 0; i < 8; i++) {
      if (!node) break;
      if (isEditable(node)) return node;
      node = node.parentElement;
    }
    return null;
  }

  // Get current text before cursor from any editable
  function getTextBeforeCursor(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return el.value.slice(0, el.selectionStart);
    }
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return el.textContent || '';
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    range.setStart(el, 0);
    return range.toString();
  }

  function insertExpanded(el, text, bufLen) {
    el.focus();
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const start = el.selectionStart - bufLen;
      el.value = el.value.slice(0, start) + text + el.value.slice(el.selectionEnd);
      el.selectionStart = el.selectionEnd = start + text.length;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    } else {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        for (let i = 0; i < bufLen; i++) sel.modify('extend', 'backward', 'character');
        sel.getRangeAt(0).deleteContents();
        const lines = text.split('\n');
        const frag = document.createDocumentFragment();
        lines.forEach((line, idx) => {
          if (idx > 0) frag.appendChild(document.createElement('br'));
          if (line) frag.appendChild(document.createTextNode(line));
        });
        const r = sel.getRangeAt(0);
        r.insertNode(frag);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, composed: true }));
    }
  }

  function showModal(snippet, target, fields, bufLen) {
    if (document.getElementById('rt-modal')) return;
    isModalOpen = true;
    const overlay = document.createElement('div');
    overlay.id = 'rt-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:12px;padding:24px;min-width:320px;max-width:480px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,0.2)';
    card.innerHTML = `<p style="margin:0 0 4px;font-size:16px;font-weight:500;color:#111;">Completar atajo</p><p style="margin:0 0 20px;font-size:13px;color:#666;">${snippet.name||''}</p><div id="rt-fields"></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;"><button id="rt-cancel" style="padding:8px 16px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;font-size:14px;">Cancelar</button><button id="rt-confirm" style="padding:8px 16px;border:none;background:#4F46E5;color:#fff;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;">Insertar</button></div>`;
    fields.forEach(f => {
      const w = document.createElement('div');
      w.style.marginBottom = '14px';
      w.innerHTML = `<label style="display:block;font-size:12px;color:#888;margin-bottom:4px;">${f}</label><input data-field="${f}" type="text" placeholder="${f}" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none;">`;
      card.querySelector('#rt-fields').appendChild(w);
    });
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    card.querySelector('input').focus();
    function confirm() {
      const vals = {};
      card.querySelectorAll('input[data-field]').forEach(i => vals[i.dataset.field] = i.value);
      overlay.remove(); isModalOpen = false;
      insertExpanded(target, processTemplate(snippet.body, vals), bufLen);
    }
    function cancel() { overlay.remove(); isModalOpen = false; }
    card.querySelector('#rt-confirm').onclick = confirm;
    card.querySelector('#rt-cancel').onclick = cancel;
    card.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();confirm();} if(e.key==='Escape')cancel(); });
    overlay.addEventListener('mousedown', e => { if(e.target===overlay)cancel(); });
  }

  // ─── Use INPUT event — fires AFTER DOM is updated, solves WhatsApp timing ────
  document.addEventListener('input', (e) => {
    if (isModalOpen) return;
    const target = getTarget(e.target);
    if (!target) return;

    const textBefore = getTextBeforeCursor(target);

    for (const [shortcut, snippet] of Object.entries(snippets)) {
      if (textBefore.endsWith(shortcut)) {
        const fields = getDynamicFields(snippet.body);
        if (fields.length > 0) showModal(snippet, target, fields, shortcut.length);
        else insertExpanded(target, processTemplate(snippet.body, {}), shortcut.length);
        return;
      }
    }
  }, true);

})();
