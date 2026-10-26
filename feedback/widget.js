/*!
 * Client Feedback widget v1.1.0 (MIT licence)
 * Click-to-comment layer for HTML review sites: comments, replies, close and delete.
 * The button clients see is labelled "Review Comments".
 * Comments are saved as flat files on the server (no database) by save.php.
 *
 * Loaded by feedback.js (the small loader the pages include). Edit THIS file for changes.
 * Install: add ONE line before </body> on every page:
 *   <script src="feedback/feedback.js" defer></script>
 * (adjust the path for pages in sub-folders, e.g. ../feedback/feedback.js)
 *
 * Remove that line from every page before go-live.
 */
(function () {
  'use strict';
  if (window.__nlFeedbackLoaded) return;
  window.__nlFeedbackLoaded = true;

  // ---------- config ----------
  var thisScript = document.currentScript || (function () {
    var s = document.querySelectorAll('script[src*="widget.js"]');
    return s[s.length - 1];
  })();
  var BASE = thisScript ? thisScript.src.replace(/(feedback|widget)\.js(\?.*)?$/, '') : 'feedback/';
  var ENDPOINT = (thisScript && thisScript.getAttribute('data-endpoint')) || (BASE + 'save.php');
  var SCREENSHOTS = !(thisScript && thisScript.getAttribute('data-screenshots') === 'off');
  var H2C_URL = BASE + 'html2canvas.min.js'; // bundled locally, loaded only when a screenshot is taken
  var SHOT_TIMEOUT = 12000; // never let a slow screenshot block saving the comment

  var LS_NAME = 'nlfb_name';
  var LS_PINS = 'nlfb_pins';
  var SS_PW = 'nlfb_pw';
  function ssGet(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function ssSet(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  // ---------- styles ----------
  var css = [
    '#nlfb-root, #nlfb-root *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:normal;text-transform:none}',
    '#nlfb-bar{position:fixed;right:16px;bottom:16px;z-index:2147483600;display:flex;gap:6px;align-items:center;transition:bottom .2s ease}',
    '#nlfb-bar button{all:unset;cursor:pointer;background:#111827;color:#fff;font-size:14px;font-weight:600;padding:10px 14px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.25);line-height:1}',
    '#nlfb-bar button:hover{background:#000}',
    '#nlfb-bar button.nlfb-on{background:#ea580c}',
    '#nlfb-bar .nlfb-small{background:#fff;color:#111827;font-weight:500;font-size:13px;padding:9px 12px}',
    '#nlfb-bar .nlfb-small:hover{background:#f3f4f6}',
    '#nlfb-count{display:inline-block;min-width:20px;margin-left:6px;padding:2px 6px;border-radius:999px;background:#ea580c;color:#fff;font-size:12px;text-align:center}',
    '.nlfb-on #nlfb-count{background:#111827}',
    '#nlfb-hint{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483600;background:#ea580c;color:#fff;font-size:14px;font-weight:600;padding:8px 14px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.2);display:none;max-width:calc(100vw - 32px);text-align:center;pointer-events:none;opacity:.95}',
    '#nlfb-hl{position:absolute;z-index:2147483500;pointer-events:none;border:2px solid #ea580c;background:rgba(234,88,12,.08);border-radius:3px;display:none}',
    // Crosshair only while choosing an element; our own panels and buttons keep normal cursors.
    'body.nlfb-picking, body.nlfb-picking *{cursor:crosshair !important}',
    'body.nlfb-mode #nlfb-root, body.nlfb-mode #nlfb-root *{cursor:default !important}',
    'body.nlfb-mode #nlfb-root button, body.nlfb-mode #nlfb-root select, body.nlfb-mode #nlfb-root label.nlfb-check, body.nlfb-mode #nlfb-root input[type=checkbox]{cursor:pointer !important}',
    'body.nlfb-mode #nlfb-root textarea, body.nlfb-mode #nlfb-root input:not([type=checkbox]){cursor:text !important}',
    '#nlfb-root .nlfb-panel{position:absolute;z-index:2147483601;width:320px;max-width:calc(100vw - 24px);background:#fff;color:#111827;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.28);padding:14px;display:none}',
    '#nlfb-root .nlfb-panel h4{margin:0 0 4px;font-size:15px;font-weight:700;color:#111827}',
    '#nlfb-root .nlfb-panel .nlfb-target{font-size:12px;color:#6b7280;margin:0 0 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#nlfb-root .nlfb-panel label{display:block;font-size:12px;font-weight:600;color:#374151;margin:8px 0 4px}',
    '#nlfb-root .nlfb-panel input,#nlfb-root .nlfb-panel textarea,#nlfb-root .nlfb-panel select{width:100%;font-size:14px;color:#111827;background:#fff;border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;outline:none;margin:0}',
    '#nlfb-root .nlfb-panel textarea{min-height:90px;resize:vertical}',
    '#nlfb-root .nlfb-panel input:focus,#nlfb-root .nlfb-panel textarea:focus,#nlfb-root .nlfb-panel select:focus{border-color:#ea580c;box-shadow:0 0 0 3px rgba(234,88,12,.15)}',
    '#nlfb-root .nlfb-panel .nlfb-row{display:flex;gap:8px;margin-top:12px;justify-content:flex-end;align-items:center}',
    '#nlfb-root .nlfb-panel .nlfb-row label.nlfb-check{flex:1;display:flex;align-items:center;gap:6px;margin:0;font-weight:500;color:#6b7280}',
    '#nlfb-root .nlfb-panel .nlfb-row label.nlfb-check input{width:auto}',
    '#nlfb-root .nlfb-panel button{all:unset;cursor:pointer;font-size:14px;font-weight:600;padding:8px 14px;border-radius:8px}',
    '#nlfb-root .nlfb-panel .nlfb-send{background:#ea580c;color:#fff}',
    '#nlfb-root .nlfb-panel .nlfb-send[disabled]{opacity:.6;cursor:wait}',
    '#nlfb-root .nlfb-panel .nlfb-cancel{color:#374151;background:#f3f4f6}',
    '#nlfb-root .nlfb-panel .nlfb-err{color:#b91c1c;font-size:13px;margin-top:8px;display:none}',
    '#nlfb-root .nlfb-panel .nlfb-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}',
    '.nlfb-pin{position:absolute;z-index:2147483400;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#ea580c;color:#fff;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '.nlfb-pin span{transform:rotate(45deg);font-size:11px;font-weight:700;font-family:system-ui,sans-serif}',
    '.nlfb-pin.nlfb-resolved{background:#16a34a;z-index:2147483399}',
    '.nlfb-pin.nlfb-progress{background:#2563eb}',
    '#nlfb-root .nlfb-badge{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;vertical-align:2px}',
    '#nlfb-root .nlfb-badge.nlfb-b-open{background:#fff1e6;color:#c2410c}',
    '#nlfb-root .nlfb-badge.nlfb-b-progress{background:#e8efff;color:#1d4ed8}',
    '#nlfb-root .nlfb-badge.nlfb-b-closed{background:#e7f6ec;color:#15803d}',
    '#nlfb-root .nlfb-closed-note{font-size:13px;color:#15803d;background:#f0fdf4;border-left:3px solid #16a34a;padding:6px 10px;margin:6px 0 0;border-radius:4px}',
    'body.nlfb-mode .nlfb-pin{pointer-events:none;opacity:.45}',
    '#nlfb-tip{position:absolute;z-index:2147483602;max-width:280px;background:#111827;color:#fff;font-size:13px;line-height:1.4;padding:10px 12px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.3);display:none;white-space:pre-wrap;font-family:system-ui,sans-serif}',
    '#nlfb-tip b{display:block;font-size:12px;color:#fdba74;margin-bottom:4px}',
    '#nlfb-toast{position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:2147483603;background:#16a34a;color:#fff;font-size:14px;font-weight:600;padding:10px 16px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.2);display:none;font-family:system-ui,sans-serif}',
    '#nlfb-root .nlfb-panel .nlfb-x{position:absolute;top:8px;right:8px;padding:2px 8px;color:#6b7280;font-size:18px;font-weight:400;line-height:1}',
    '#nlfb-root .nlfb-panel .nlfb-meta{font-size:12px;color:#6b7280;margin:0 0 8px;padding-right:24px}',
    '#nlfb-root .nlfb-panel .nlfb-body{font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;margin:0 0 10px;color:#111827}',
    '#nlfb-root .nlfb-replies{max-height:220px;overflow:auto;border-left:2px solid #e5e7eb;padding-left:10px;margin:0 0 6px}',
    '#nlfb-root .nlfb-reply{margin:0 0 8px;font-size:13px;line-height:1.4;color:#111827}',
    '#nlfb-root .nlfb-reply b{font-weight:600}',
    '#nlfb-root .nlfb-reply span{color:#6b7280;font-size:11px}',
    '#nlfb-root .nlfb-reply div{white-space:pre-wrap;word-wrap:break-word}',
    '#nlfb-root .nlfb-panel textarea.nlfb-short{min-height:56px}',
    '#nlfb-root .nlfb-actions{display:flex;gap:12px;justify-content:flex-start;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid #e5e7eb}',
    '#nlfb-root .nlfb-panel .nlfb-link{padding:4px 2px;font-size:13px;color:#15803d}',
    '#nlfb-root .nlfb-panel .nlfb-link.nlfb-danger{color:#b91c1c;margin-left:auto}',
    '#nlfb-root .nlfb-pw{display:none;margin-top:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px}',
    '#nlfb-root .nlfb-pw label{margin-top:0}',
    '#nlfb-root .nlfb-panel .nlfb-ok{background:#15803d;color:#fff}',
    '#nlfb-root .nlfb-panel .nlfb-ok.nlfb-danger{background:#b91c1c}',
    '#nlfb-root .nlfb-panel .nlfb-ok[disabled],#nlfb-root .nlfb-panel .nlfb-reply-send[disabled]{opacity:.6;cursor:wait}',
    '#nlfb-root .nlfb-panel .nlfb-reply-send{background:#111827;color:#fff}',
    '@media print{#nlfb-root,.nlfb-pin,#nlfb-hl{display:none !important}}'
  ].join('\n');

  // ---------- helpers ----------
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isOurs(node) {
    while (node && node !== document.body) {
      if (node.id && node.id.indexOf('nlfb-') === 0) return true;
      if (node.classList && node.classList.contains('nlfb-pin')) return true;
      node = node.parentNode;
    }
    return false;
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/([^\w-])/g, '\\$1'); }
  function uniq(sel) { try { return document.querySelectorAll(sel).length === 1; } catch (e) { return false; } }

  // Stable CSS selector: nearest ancestor with an id, then tag:nth-of-type down to the element.
  function selectorFor(node) {
    if (!node || node.nodeType !== 1) return '';
    if (node.id && uniq('#' + cssEsc(node.id))) return '#' + cssEsc(node.id);
    var parts = [];
    var cur = node;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      if (cur !== node && cur.id && uniq('#' + cssEsc(cur.id))) { parts.unshift('#' + cssEsc(cur.id)); break; }
      var tag = cur.tagName.toLowerCase();
      if (tag === 'body') { parts.unshift('body'); break; }
      var i = 1, sib = cur;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === cur.tagName) i++;
      var hasSame = false, n = cur.nextElementSibling;
      while (n) { if (n.tagName === cur.tagName) { hasSame = true; break; } n = n.nextElementSibling; }
      parts.unshift((i > 1 || hasSame) ? tag + ':nth-of-type(' + i + ')' : tag);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }
  function textOf(node, max) {
    var t = (node.innerText || node.textContent || node.getAttribute('alt') || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max) + '…' : t;
  }
  function htmlOf(node, max) {
    var h = node.outerHTML || '';
    return h.length > max ? h.slice(0, max) + '…' : h;
  }
  // Nearest heading above the element, gives context like "Plans" or "How it works".
  function nearestHeading(node) {
    var hs = document.querySelectorAll('h1,h2,h3'), best = null;
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i];
      if (isOurs(h)) continue;
      if (h === node || h.contains(node)) return textOf(h, 120);
      if (h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) best = h; else break;
    }
    return best ? textOf(best, 120) : '';
  }
  function nearestSection(node) {
    var cur = node;
    while (cur && cur !== document.body) {
      if (cur.id && /^(section|main|header|footer|article|aside|nav|div)$/i.test(cur.tagName)) return '#' + cur.id;
      cur = cur.parentElement;
    }
    return '';
  }
  // "/site/" and "/site/index.html" are the same page.
  function pageKey() { return location.pathname.replace(/\/index\.html?$/i, '/'); }
  function absPos(node) {
    var r = node.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 };
  }

  // ---------- UI ----------
  var root, bar, btnMode, btnPins, hint, hl, pop, thread, tip, toast;
  var mode = false, pinsOn = lsGet(LS_PINS, '1') === '1', target = null, click = null, comments = [];
  var features = { close: false, delete: false }, current = null;

  function build() {
    var style = el('style', { id: 'nlfb-style' }, css);
    document.head.appendChild(style);

    root = el('div', { id: 'nlfb-root' });
    bar = el('div', { id: 'nlfb-bar' });
    btnPins = el('button', { type: 'button', 'class': 'nlfb-small', title: 'Show or hide comment pins' });
    btnMode = el('button', { type: 'button', title: 'Turn on comment mode, then click anything on the page to comment on it' });
    bar.appendChild(btnPins);
    bar.appendChild(btnMode);
    hint = el('div', { id: 'nlfb-hint' }, 'Click any part of the page to leave a comment &nbsp;·&nbsp; Esc to exit');
    hl = el('div', { id: 'nlfb-hl' });
    tip = el('div', { id: 'nlfb-tip' });
    toast = el('div', { id: 'nlfb-toast' });
    thread = el('div', { id: 'nlfb-thread', 'class': 'nlfb-panel', role: 'dialog', 'aria-label': 'Comment' });
    pop = el('div', { id: 'nlfb-pop', 'class': 'nlfb-panel', role: 'dialog', 'aria-label': 'Leave a comment' }, [
      '<h4>Leave a comment</h4>',
      '<p class="nlfb-target"></p>',
      '<label for="nlfb-text">Your comment</label>',
      '<textarea id="nlfb-text" maxlength="3000" placeholder="e.g. Make this heading shorter, change the button colour to blue…"></textarea>',
      '<label for="nlfb-type">Type</label>',
      '<select id="nlfb-type"><option>Design</option><option>Content / text</option><option>Bug / not working</option><option>Question</option><option>Other</option></select>',
      '<label for="nlfb-name">Your name</label>',
      '<input id="nlfb-name" maxlength="80" placeholder="Name">',
      '<input class="nlfb-hp" id="nlfb-web" tabindex="-1" autocomplete="off" aria-hidden="true">',
      '<div class="nlfb-err"></div>',
      '<div class="nlfb-row">',
      SCREENSHOTS ? '<label class="nlfb-check"><input type="checkbox" id="nlfb-shot" checked> Include a screenshot for our team</label>' : '',
      '<button type="button" class="nlfb-cancel">Cancel</button>',
      '<button type="button" class="nlfb-send">Send</button>',
      '</div>'
    ].join(''));

    root.appendChild(bar); root.appendChild(hint); root.appendChild(pop); root.appendChild(thread); root.appendChild(tip); root.appendChild(toast);
    document.body.appendChild(root);
    document.body.appendChild(hl);

    btnMode.addEventListener('click', function (e) { e.stopPropagation(); setMode(!mode); });
    btnPins.addEventListener('click', function (e) { e.stopPropagation(); pinsOn = !pinsOn; lsSet(LS_PINS, pinsOn ? '1' : '0'); renderPins(); renderBar(); });
    pop.querySelector('.nlfb-cancel').addEventListener('click', closePop);
    pop.querySelector('.nlfb-send').addEventListener('click', send);
    pop.querySelector('#nlfb-name').value = lsGet(LS_NAME, '');
    pop.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send();
    });

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (thread.style.display === 'block') closeThread();
        else if (pop.style.display === 'block') closePop();
        else if (mode) setMode(false);
      }
    });
    // Clicking anywhere outside an open thread closes it.
    document.addEventListener('mousedown', function (e) {
      if (thread.style.display === 'block' && !thread.contains(e.target) && !(e.target.closest && e.target.closest('.nlfb-pin'))) closeThread();
    }, true);
    window.addEventListener('resize', debounce(renderPins, 150));
    window.addEventListener('hashchange', function () { setTimeout(renderPins, 300); });
    // Re-place pins when the page changes (tabs, demo views, accordions).
    if (window.MutationObserver) {
      var replace = debounce(function () { if (pinsOn) renderPins(); }, 400);
      var ours = function (n) { return n && (n === root || n === hl || (root && root.contains(n)) || (n.classList && n.classList.contains('nlfb-pin'))); };
      new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var m = list[i], j;
          if (ours(m.target)) continue;
          if (m.type === 'attributes' && m.target === document.body) continue; // our comment-mode class
          var foreign = m.type === 'attributes';
          for (j = 0; !foreign && j < m.addedNodes.length; j++) if (!ours(m.addedNodes[j])) foreign = true;
          for (j = 0; !foreign && j < m.removedNodes.length; j++) if (!ours(m.removedNodes[j])) foreign = true;
          if (foreign) return replace();
        }
      }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    }
    if (LEFT) { bar.style.right = 'auto'; bar.style.left = '16px'; }
    renderBar();
    placeBar();
    var placeSoon = debounce(placeBar, 200);
    window.addEventListener('scroll', placeSoon, { passive: true });
    window.addEventListener('resize', placeSoon);
    setTimeout(placeBar, 1200);
    load();
  }

  // Keep our button clear of the site's own fixed corner items (back-to-top, chat bubbles, cookie bars).
  var LEFT = thisScript && thisScript.getAttribute('data-position') === 'left';
  function placeBar() {
    if (!bar) return;
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var zone = { left: LEFT ? 0 : vw - 300, right: LEFT ? 300 : vw, top: vh - 140, bottom: vh };
    var lift = 0;
    var all = document.body.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (e === root || root.contains(e) || e === hl || (e.classList && e.classList.contains('nlfb-pin'))) continue;
      var s = window.getComputedStyle(e);
      if (s.position !== 'fixed' && s.position !== 'sticky') continue;
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) continue;
      var r = e.getBoundingClientRect();
      if (!r.width || !r.height || r.height > vh * 0.5) continue; // ignore full-height sidebars
      if (r.right > zone.left && r.left < zone.right && r.bottom > zone.top && r.top < zone.bottom) {
        lift = Math.max(lift, vh - r.top);
      }
    }
    bar.style.bottom = (lift ? lift + 10 : 16) + 'px';
  }

  function renderBar() {
    var open = comments.filter(function (c) { return c.status !== 'resolved'; }).length;
    btnMode.innerHTML = (mode ? 'Done commenting' : 'Review Comments') + (open ? '<span id="nlfb-count">' + open + '</span>' : '');
    btnMode.className = mode ? 'nlfb-on' : '';
    btnPins.textContent = pinsOn ? 'Hide pins' : 'Show pins';
    btnPins.style.display = comments.length ? '' : 'none';
  }

  function setMode(on) {
    mode = on;
    if (on) closeThread();
    document.body.classList.toggle('nlfb-mode', on);
    hint.style.display = on ? 'block' : 'none';
    if (!on) { hl.style.display = 'none'; hovered = null; closePop(); }
    setPicking();
    renderBar();
  }

  // "Picking" = comment mode is on and no comment box is open.
  function setPicking() {
    document.body.classList.toggle('nlfb-picking', mode && pop.style.display !== 'block');
  }

  function outline(node) {
    var p = absPos(node);
    hl.style.display = 'block';
    hl.style.left = p.x + 'px'; hl.style.top = p.y + 'px';
    hl.style.width = p.w + 'px'; hl.style.height = p.h + 'px';
  }

  // Move the outline only when the pointer is over a different element, at most once per frame.
  var hovered = null, moveQueued = false, lastMoveTarget = null;
  function onMove(e) {
    if (!mode || pop.style.display === 'block') return;
    lastMoveTarget = e.target;
    if (moveQueued) return;
    moveQueued = true;
    requestAnimationFrame(function () {
      moveQueued = false;
      if (!mode || pop.style.display === 'block') return;
      var t = lastMoveTarget;
      if (!t || isOurs(t) || t === document.body || t === document.documentElement) {
        if (hovered) { hl.style.display = 'none'; hovered = null; }
        return;
      }
      if (t === hovered) return;
      hovered = t;
      outline(t);
    });
  }

  function onClick(e) {
    if (!mode) return;
    if (isOurs(e.target)) return;
    // Block the site's own click (links, buttons) while commenting.
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (pop.style.display === 'block') return;
    target = e.target;
    var p = absPos(target);
    click = {
      pageX: Math.round(e.pageX), pageY: Math.round(e.pageY),
      xPct: p.w ? Math.round(((e.pageX - p.x) / p.w) * 1000) / 10 : 50,
      yPct: p.h ? Math.round(((e.pageY - p.y) / p.h) * 1000) / 10 : 50
    };
    openPop(e.pageX, e.pageY);
  }

  function openPop(x, y) {
    var label = target.tagName.toLowerCase() + (textOf(target, 1) ? ': "' + textOf(target, 50) + '"' : '');
    pop.querySelector('.nlfb-target').textContent = 'On ' + label;
    pop.querySelector('#nlfb-text').value = '';
    pop.querySelector('.nlfb-err').style.display = 'none';
    pop.style.display = 'block';
    hint.style.display = 'none';
    outline(target); // keep the chosen element outlined while typing
    setPicking();
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.min(Math.max(window.scrollX + 12, x + 12), window.scrollX + document.documentElement.clientWidth - w - 12);
    var top = y + 12;
    if (top + h > window.scrollY + window.innerHeight - 12) top = Math.max(window.scrollY + 12, y - h - 12);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    setTimeout(function () { pop.querySelector('#nlfb-text').focus(); }, 30);
  }

  function closePop() {
    pop.style.display = 'none'; target = null; hovered = null;
    if (hl) hl.style.display = 'none';
    if (mode) hint.style.display = 'block';
    if (document.body) setPicking();
  }

  function showError(msg) {
    var e = pop.querySelector('.nlfb-err');
    e.textContent = msg; e.style.display = 'block';
  }

  function showToast(msg) {
    toast.textContent = msg; toast.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.style.display = 'none'; }, 2600);
  }

  function loadH2C() {
    return new Promise(function (resolve, reject) {
      if (window.html2canvas) return resolve(window.html2canvas);
      var s = document.createElement('script');
      s.src = H2C_URL; s.async = true;
      s.onload = function () { resolve(window.html2canvas); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // Screenshot of the visible screen with the clicked element outlined.
  function screenshot() {
    return loadH2C().then(function (h2c) {
      pop.style.visibility = 'hidden'; hint.style.display = 'none'; bar.style.visibility = 'hidden';
      var p = absPos(target);
      hl.style.display = 'block';
      hl.style.left = p.x + 'px'; hl.style.top = p.y + 'px'; hl.style.width = p.w + 'px'; hl.style.height = p.h + 'px';
      hl.style.border = '3px solid #ea580c';
      return h2c(document.body, {
        x: window.scrollX, y: window.scrollY,
        width: document.documentElement.clientWidth, height: window.innerHeight,
        windowWidth: document.documentElement.clientWidth, windowHeight: window.innerHeight,
        scale: Math.min(1, 1400 / document.documentElement.clientWidth),
        useCORS: true, logging: false,
        ignoreElements: function (n) { return n.id === 'nlfb-root' || (n.classList && n.classList.contains('nlfb-pin')); }
      });
    }).then(function (canvas) {
      return canvas.toDataURL('image/jpeg', 0.72);
    }).finally(function () {
      pop.style.visibility = ''; bar.style.visibility = ''; hl.style.border = '';
    });
  }

  function send() {
    var btn = pop.querySelector('.nlfb-send');
    if (btn.disabled || !target) return;
    var text = pop.querySelector('#nlfb-text').value.trim();
    var name = pop.querySelector('#nlfb-name').value.trim();
    if (!text) return showError('Please type your comment.');
    if (!name) return showError('Please add your name so we know who it is from.');
    if (location.protocol === 'file:') return showError('This page is opened from your computer. Comments can only be saved once the site is uploaded to the web server.');
    lsSet(LS_NAME, name);

    var payload = {
      comment: text,
      author: name,
      type: pop.querySelector('#nlfb-type').value,
      website: pop.querySelector('#nlfb-web').value, // honeypot, must stay empty
      page: pageKey(),
      url: location.href,
      hash: location.hash,
      title: document.title,
      selector: selectorFor(target),
      section: nearestSection(target),
      heading: nearestHeading(target),
      element: {
        tag: target.tagName.toLowerCase(),
        id: target.id || '',
        classes: (typeof target.className === 'string' ? target.className : '').trim(),
        text: textOf(target, 200),
        html: htmlOf(target, 800)
      },
      click: click,
      viewport: { w: document.documentElement.clientWidth, h: window.innerHeight, scrollY: Math.round(window.scrollY) },
      device: navigator.userAgent
    };

    btn.disabled = true; btn.textContent = 'Sending…';
    var shotBox = pop.querySelector('#nlfb-shot');
    var wantShot = SCREENSHOTS && shotBox && shotBox.checked;
    var shotP = wantShot ? Promise.race([
      screenshot().catch(function () { return null; }),
      new Promise(function (r) { setTimeout(function () { r(null); }, SHOT_TIMEOUT); })
    ]) : Promise.resolve(null);

    shotP.then(function (shot) {
      if (shot) payload.screenshot = shot;
      return fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }).then(function (r) {
      return r.json().catch(function () {
        return { ok: false, error: r.status === 404
          ? 'Review Comments is not set up on the server yet (feedback folder missing).'
          : 'Server error (' + r.status + '). Please try again.' };
      });
    }).then(function (res) {
      btn.disabled = false; btn.textContent = 'Send';
      if (!res || !res.ok) return showError((res && res.error) || 'Could not save. Please try again.');
      comments.push(res.item);
      if (res.features) features = res.features;
      closePop();
      renderPins(); renderBar();
      showToast('Thanks! Comment ' + res.item.id + ' saved.');
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Send';
      showError('Could not reach the server. Please check your connection and try again.');
    });
  }

  // ---------- pins ----------
  function load() {
    fetch(ENDPOINT + '?action=list&page=' + encodeURIComponent(pageKey()), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) return;
        comments = res.items || [];
        if (res.features) features = res.features;
        renderPins(); renderBar();
      })
      .catch(function () { /* list is optional */ });
  }

  function renderPins() {
    var old = document.querySelectorAll('.nlfb-pin');
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    tip.style.display = 'none';
    if (!pinsOn) return;
    comments.forEach(function (c) {
      var node = null;
      try { node = c.selector ? document.querySelector(c.selector) : null; } catch (e) { node = null; }
      var x, y;
      if (node) {
        var p = absPos(node);
        if (!p.visible) return; // element is hidden in the current view
        x = p.x + (p.w * ((c.click && c.click.xPct != null ? c.click.xPct : 50) / 100));
        y = p.y + (p.h * ((c.click && c.click.yPct != null ? c.click.yPct : 50) / 100));
      } else return; // element not on screen in this view
      var closed = c.status === 'resolved';
      var pin = el('div', { 'class': 'nlfb-pin' + (closed ? ' nlfb-resolved' : c.status === 'in-progress' ? ' nlfb-progress' : ''), title: c.id + ' · ' + statusLabel(c) },
        '<span>' + (closed ? '✓' : esc(String(c.id).replace(/^FB-0*/, ''))) + '</span>');
      pin.style.left = x + 'px'; pin.style.top = y + 'px';
      pin.addEventListener('mouseenter', function () { showTip(c, x, y); });
      pin.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
      pin.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); tip.style.display = 'none'; openThread(c, x, y); });
      document.body.appendChild(pin);
    });
  }

  function showTip(c, x, y) {
    if (thread.style.display === 'block') return;
    var n = (c.replies || []).length;
    tip.innerHTML = '<b>' + esc(c.id) + ' · ' + esc(statusLabel(c)) + ' · ' + esc(c.author) + '</b>' + esc(c.comment) +
      '\n<span style="color:#9ca3af;font-size:12px">' + (n ? n + (n === 1 ? ' reply' : ' replies') + ' · ' : '') + 'click to open</span>';
    tip.style.display = 'block';
    var left = Math.min(x + 16, window.scrollX + document.documentElement.clientWidth - tip.offsetWidth - 12);
    tip.style.left = Math.max(window.scrollX + 8, left) + 'px';
    tip.style.top = (y + 16) + 'px';
  }

  // ---------- comment thread: replies, close, delete ----------
  function api(payload) {
    return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Server error (' + r.status + '). Please try again.' }; }); })
      .catch(function () { return { ok: false, error: 'Could not reach the server. Please check your connection and try again.' }; });
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function statusLabel(c) { return c.status === 'resolved' ? 'Closed' : c.status === 'in-progress' ? 'In progress' : 'Open'; }

  function openThread(c, x, y) {
    current = c;
    renderThread();
    thread.style.display = 'block';
    var w = thread.offsetWidth, h = thread.offsetHeight;
    var left = Math.min(Math.max(window.scrollX + 12, x + 16), window.scrollX + document.documentElement.clientWidth - w - 12);
    var top = y + 16;
    if (top + h > window.scrollY + window.innerHeight - 12) top = Math.max(window.scrollY + 12, y - h - 16);
    thread.style.left = left + 'px'; thread.style.top = top + 'px';
  }

  function closeThread() { if (thread) { thread.style.display = 'none'; thread.innerHTML = ''; } current = null; }

  function renderThread() {
    var c = current; if (!c) return;
    var replies = c.replies || [];
    var closed = c.status === 'resolved';
    var html = [
      '<button type="button" class="nlfb-x" aria-label="Close panel">×</button>',
      '<h4>' + esc(c.id) + ' · ' + esc(c.type) + '<span class="nlfb-badge ' +
        (closed ? 'nlfb-b-closed' : c.status === 'in-progress' ? 'nlfb-b-progress' : 'nlfb-b-open') + '">' + esc(statusLabel(c)) + '</span></h4>',
      '<p class="nlfb-meta">' + esc(c.author) + (c.created ? ' · ' + esc(fmtDate(c.created)) : '') + '</p>',
      '<div class="nlfb-body">' + esc(c.comment) + '</div>'
    ];
    if (replies.length) {
      html.push('<div class="nlfb-replies">');
      replies.forEach(function (r) {
        html.push('<div class="nlfb-reply"><b>' + esc(r.author) + '</b> <span>· ' + esc(fmtDate(r.created)) + '</span><div>' + esc(r.comment) + '</div></div>');
      });
      html.push('</div>');
    }
    if (closed) {
      html.push('<div class="nlfb-closed-note">✓ Closed' + (c.closed_by ? ' by ' + esc(c.closed_by) : '') +
        (c.closed_at ? ' · ' + esc(fmtDate(c.closed_at)) : '') + '</div>',
        '<input id="nlfb-reply-name" type="hidden">', '<div class="nlfb-err"></div>');
    } else {
      html.push(
        '<label for="nlfb-reply-text">Reply</label>',
        '<textarea id="nlfb-reply-text" class="nlfb-short" maxlength="3000" placeholder="Write a reply…"></textarea>',
        '<label for="nlfb-reply-name">Your name</label>',
        '<input id="nlfb-reply-name" maxlength="80" placeholder="Name">',
        '<div class="nlfb-err"></div>',
        '<div class="nlfb-row"><button type="button" class="nlfb-reply-send">Reply</button></div>'
      );
    }
    if ((features.close && !closed) || features.delete) {
      html.push('<div class="nlfb-actions">',
        features.close && !closed ? '<button type="button" class="nlfb-link" data-act="close">✓ Close comment</button>' : '',
        features.delete ? '<button type="button" class="nlfb-link nlfb-danger" data-act="delete">Delete</button>' : '',
        '</div>',
        '<div class="nlfb-pw">',
        '<label for="nlfb-pw-input"></label>',
        '<input id="nlfb-pw-input" type="password" autocomplete="off" placeholder="Password">',
        '<div class="nlfb-row"><button type="button" class="nlfb-cancel nlfb-pw-cancel">Cancel</button><button type="button" class="nlfb-ok"></button></div>',
        '</div>');
    }
    thread.innerHTML = html.join('');
    var $ = function (s) { return thread.querySelector(s); };
    $('#nlfb-reply-name').value = lsGet(LS_NAME, '');
    $('.nlfb-x').addEventListener('click', closeThread);
    if ($('.nlfb-reply-send')) $('.nlfb-reply-send').addEventListener('click', sendReply);
    if ($('#nlfb-reply-text')) $('#nlfb-reply-text').addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendReply(); });
    var acts = thread.querySelectorAll('[data-act]');
    for (var i = 0; i < acts.length; i++) acts[i].addEventListener('click', function () { askPassword(this.getAttribute('data-act')); });
    if ($('.nlfb-pw-cancel')) $('.nlfb-pw-cancel').addEventListener('click', function () { $('.nlfb-pw').style.display = 'none'; threadError(''); });
    if ($('.nlfb-ok')) $('.nlfb-ok').addEventListener('click', confirmAction);
    if ($('#nlfb-pw-input')) $('#nlfb-pw-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmAction(); });
  }

  function threadError(msg) {
    var e = thread.querySelector('.nlfb-err'); if (!e) return;
    e.textContent = msg; e.style.display = msg ? 'block' : 'none';
  }

  var pendingAct = '';
  function askPassword(act) {
    pendingAct = act;
    var box = thread.querySelector('.nlfb-pw');
    box.querySelector('label').textContent = act === 'delete'
      ? 'Team password to delete ' + current.id + ' permanently'
      : 'Password to close ' + current.id;
    var ok = box.querySelector('.nlfb-ok');
    ok.textContent = act === 'delete' ? 'Delete permanently' : 'Close comment';
    ok.className = 'nlfb-ok' + (act === 'delete' ? ' nlfb-danger' : '');
    var input = box.querySelector('#nlfb-pw-input');
    input.value = ssGet(SS_PW);
    box.style.display = 'block';
    threadError('');
    setTimeout(function () { input.focus(); }, 30);
  }

  function confirmAction() {
    var c = current; if (!c || !pendingAct) return;
    var ok = thread.querySelector('.nlfb-ok');
    var pw = thread.querySelector('#nlfb-pw-input').value;
    if (!pw) return threadError('Please enter the password.');
    if (ok.disabled) return;
    var act = pendingAct;
    ok.disabled = true;
    api({ action: act, id: c.id, password: pw, author: thread.querySelector('#nlfb-reply-name').value.trim() || lsGet(LS_NAME, '') })
      .then(function (res) {
        if (!thread.querySelector('.nlfb-ok')) return;
        ok.disabled = false;
        if (!res || !res.ok) {
          if (res && res.badPassword) ssSet(SS_PW, '');
          return threadError((res && res.error) || 'Something went wrong. Please try again.');
        }
        ssSet(SS_PW, pw); // remember for this browser tab session only
        if (act === 'delete') comments = comments.filter(function (x) { return x.id !== c.id; });
        else { c.status = 'resolved'; c.closed_at = new Date().toISOString(); c.closed_by = (thread.querySelector('#nlfb-reply-name').value.trim() || lsGet(LS_NAME, '') || 'Unknown'); }
        closeThread(); renderPins(); renderBar();
        showToast(c.id + (act === 'delete' ? ' deleted.' : ' closed.'));
      });
  }

  function sendReply() {
    var c = current; if (!c) return;
    var btn = thread.querySelector('.nlfb-reply-send');
    var text = thread.querySelector('#nlfb-reply-text').value.trim();
    var name = thread.querySelector('#nlfb-reply-name').value.trim();
    if (!text) return threadError('Please type your reply.');
    if (!name) return threadError('Please add your name.');
    if (location.protocol === 'file:') return threadError('This page is opened from your computer. Replies can only be saved on the web server.');
    if (btn.disabled) return;
    lsSet(LS_NAME, name);
    btn.disabled = true; btn.textContent = 'Sending…';
    api({ action: 'reply', id: c.id, author: name, comment: text, website: '' }).then(function (res) {
      if (!thread.querySelector('.nlfb-reply-send')) return;
      btn.disabled = false; btn.textContent = 'Reply';
      if (!res || !res.ok) return threadError((res && res.error) || 'Could not save the reply.');
      for (var i = 0; i < comments.length; i++) if (comments[i].id === c.id) comments[i] = res.item;
      current = res.item;
      renderPins();
      renderThread();
      var list = thread.querySelector('.nlfb-replies'); if (list) list.scrollTop = list.scrollHeight;
      showToast('Reply added to ' + c.id + '.');
    });
  }

  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
