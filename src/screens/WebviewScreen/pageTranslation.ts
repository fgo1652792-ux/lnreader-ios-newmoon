// src/screens/WebviewScreen/pageTranslation.ts
//
// Port of Zeus Ascent Edition: Resources/translation.js — the in-page half of
// Page Translation for the WebviewScreen.
//
// The exported string is a FUNCTION EXPRESSION source; the screen appends it
// to the existing injectedJavaScript as `existing + ';(' + JS + ')();'`. The
// installer is idempotent (guarded by __moonPageTranslate) and only registers
// listeners — always injecting it is safe.
//
// Protocol — every page → RN message carries { __moonTr: 1, documentID }:
//   page → RN : ready-installed | ready | changed | viewport | collect | applied | restored
//   RN  → page: start | collect | apply | restore | stop   (window.__moonTrReceive)
//
// NOTE: this is plain browser JS inside a template literal. No TS, no
// backticks, no ${…}; every backslash inside a regex is doubled so it
// survives string escaping.

export const PAGE_TRANSLATION_JS = `function () {
  var root = typeof globalThis !== 'undefined' ? globalThis : window;
  if (root.__moonPageTranslate) return;
  root.__moonPageTranslate = true;

  var SKIP_SELECTOR = 'script,style,noscript,pre,code,kbd,samp,svg,math,textarea,input,select,option,[contenteditable]:not([contenteditable="false"]),[translate="no"],.notranslate,[aria-hidden="true"],[hidden]';
  var CONTAINER_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,td,th,dd,dt,article,section,div';
  var RTL_LANGUAGES = ['ar', 'fa', 'he', 'ur', 'ps', 'yi'];
  var SAMPLE_LIMIT = 3500;

  var documentID = makeDocumentID();
  var nodes = new Map();
  var nodeIDs = new WeakMap();
  var savedStyles = new Map();
  var serial = 0;
  var active = false;
  var applying = false;
  var targetLanguage = 'ar';
  var rootState = { lang: null };
  var rootLangApplied = false;
  var changeTimer = 0;
  var scrollTimer = 0;
  var lastApplyEndedAt = 0;

  function makeDocumentID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      try {
        return crypto.randomUUID();
      } catch (error) {
        // fall through to the manual generator
      }
    }
    var parts = [];
    for (var i = 0; i < 4; i += 1) {
      parts.push(Math.floor(Math.random() * 0x100000000).toString(16));
    }
    return parts.join('-');
  }

  function post(msg) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify(Object.assign({ __moonTr: 1, documentID: documentID }, msg))
    );
  }

  function isRTLLanguage(language) {
    return RTL_LANGUAGES.indexOf(String(language || '').split('-')[0]) !== -1;
  }

  function eligible(node) {
    if (!node || node.nodeType !== 3) return false;
    var parent = node.parentElement;
    if (!parent || typeof parent.closest !== 'function') return false;
    if (parent.closest(SKIP_SELECTOR)) return false;
    var value = node.nodeValue || '';
    var trimmed = value.trim();
    if (trimmed.length === 0) return false;
    if (/^(https?:\\/\\/|www\\.)\\S+$/i.test(trimmed)) return false;
    if (!/\\p{L}/u.test(value)) return false;
    var style = window.getComputedStyle(parent);
    if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
    return true;
  }

  // Stable per-node identity: the WeakMap survives re-collections, the nodes
  // map keeps { node, original, translated, complete } for apply/restore.
  function entryIDFor(node, value) {
    var id = nodeIDs.get(node);
    if (id === undefined) {
      serial += 1;
      id = 'seg' + serial;
      nodeIDs.set(node, id);
    }
    var entry = nodes.get(id);
    if (!entry) {
      nodes.set(id, { node: node, original: value, translated: null, complete: false });
    } else if (entry.complete === false && entry.original !== value) {
      entry.original = value;
    }
    return id;
  }

  function viewportMetrics() {
    var vv = window.visualViewport;
    return {
      top: vv ? vv.offsetTop : (window.pageYOffset || 0),
      height: vv ? vv.height : (window.innerHeight || 800),
    };
  }

  // tier 0 = intersecting the visual viewport, 1 = within 2 viewport heights,
  // 2 = far. distance is 0 exactly when the rect intersects the viewport.
  function rankOf(rect, metrics) {
    var distance = Math.max(
      rect.top - (metrics.top + metrics.height),
      metrics.top - rect.bottom,
      0
    );
    if (distance === 0) return { tier: 0, distance: 0 };
    return { tier: distance <= metrics.height * 2 ? 1 : 2, distance: distance };
  }

  // Walks body text nodes (plus open shadow roots), skips translated ones,
  // sorts by (tier, distance, DOM order) and cuts at the budget. Prioritized
  // (viewport) rounds only take the lowest tier with the wider visible budget.
  // Returns an object — the dispatcher posts it.
  function collect(maxCharacters, maxSegments, prioritize) {
    var metrics = viewportMetrics();
    var candidates = [];
    var totalEligible = 0;

    function visitRoot(rootNode) {
      if (!rootNode) return;
      var walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null, false);
      var current;
      while ((current = walker.nextNode())) {
        if (!eligible(current)) continue;
        var existingID = nodeIDs.get(current);
        var existing = existingID === undefined ? null : nodes.get(existingID);
        if (existing && existing.complete) continue;
        totalEligible += 1;
        var rect = current.parentElement.getBoundingClientRect();
        var rank = rankOf(rect, metrics);
        candidates.push({
          node: current,
          tier: rank.tier,
          distance: rank.distance,
          order: candidates.length,
        });
      }
      var elementWalker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT, null, false);
      var element;
      while ((element = elementWalker.nextNode())) {
        if (element.shadowRoot) visitRoot(element.shadowRoot);
      }
    }

    visitRoot(document.body);

    candidates.sort(function (a, b) {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.order - b.order;
    });

    var budgetCharacters = prioritize ? Math.max(24000, maxCharacters) : maxCharacters;
    var budgetSegments = prioritize ? Math.max(256, maxSegments) : maxSegments;
    var segments = [];
    var size = 0;
    var batchTier = -1;
    for (var i = 0; i < candidates.length; i += 1) {
      if (segments.length >= budgetSegments) break;
      var candidate = candidates[i];
      var value = candidate.node.nodeValue || '';
      var trimmed = value.trim();
      if (segments.length > 0 && size + trimmed.length > budgetCharacters) break;
      if (segments.length === 0) batchTier = candidate.tier;
      segments.push({ id: entryIDFor(candidate.node, value), text: trimmed });
      size += trimmed.length;
    }
    return { segments: segments, tier: batchTier, more: totalEligible > segments.length };
  }

  function directionalContainer(parent) {
    if (!parent) return null;
    var container =
      typeof parent.closest === 'function'
        ? (parent.closest(CONTAINER_SELECTOR) || parent)
        : parent;
    if (!savedStyles.has(container)) {
      savedStyles.set(container, {
        dir: container.getAttribute('dir'),
        textAlign: container.style.textAlign || null,
        direction: container.style.direction || null,
      });
    }
    return container;
  }

  function applyDirectionality(container) {
    if (!container || !isRTLLanguage(targetLanguage)) return;
    container.setAttribute('dir', 'rtl');
    container.style.setProperty('direction', 'rtl', 'important');
    container.style.setProperty('text-align', 'start', 'important');
  }

  function apply(items, expected) {
    if (expected !== documentID) return { applied: 0, ids: [] };
    applying = true;
    var appliedCount = 0;
    var appliedIDs = [];
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i] || {};
      var entry = nodes.get(item.id);
      if (!entry) continue;
      var node = entry.node;
      if (!node || !node.isConnected) continue;
      var current = node.nodeValue;
      var replaceable =
        current === entry.original ||
        (entry.complete === false && entry.translated !== null && current === entry.translated);
      if (!replaceable) continue;
      var trimmed = String(item.text === undefined ? '' : item.text).trim();
      if (trimmed.length === 0) continue;
      // Preserve the original node's surrounding whitespace verbatim.
      var match = entry.original.match(/^(\s*)[\s\S]*?(\s*)$/);
      var leading = match ? match[1] : '';
      var trailing = match ? match[2] : '';
      var written = leading + trimmed + trailing;
      node.nodeValue = written;
      // Store the full written value: restore() matches nodeValue against it.
      entry.translated = written;
      entry.complete = true;
      applyDirectionality(directionalContainer(node.parentElement));
      if (rootLangApplied === false) {
        if (rootState.lang === null) {
          rootState.lang = document.documentElement.getAttribute('lang');
        }
        document.documentElement.setAttribute('lang', targetLanguage);
        rootLangApplied = true;
      }
      appliedCount += 1;
      appliedIDs.push(item.id);
    }
    applying = false;
    lastApplyEndedAt = Date.now();
    return { applied: appliedCount, ids: appliedIDs };
  }

  function restore() {
    active = false;
    var restored = 0;
    nodes.forEach(function (entry) {
      var node = entry.node;
      if (
        node &&
        node.isConnected &&
        entry.translated !== null &&
        node.nodeValue === entry.translated
      ) {
        node.nodeValue = entry.original;
        restored += 1;
      }
    });
    savedStyles.forEach(function (saved, element) {
      if (!element.isConnected) return;
      if (saved.dir === null) element.removeAttribute('dir');
      else element.setAttribute('dir', saved.dir);
      if (saved.direction === null) element.style.removeProperty('direction');
      else element.style.setProperty('direction', saved.direction);
      if (saved.textAlign === null) element.style.removeProperty('text-align');
      else element.style.setProperty('text-align', saved.textAlign);
    });
    if (rootState.lang === null) document.documentElement.removeAttribute('lang');
    else document.documentElement.setAttribute('lang', rootState.lang);
    rootState.lang = null;
    rootLangApplied = false;
    nodes.clear();
    savedStyles.clear();
    return restored;
  }

  function start(language) {
    active = true;
    targetLanguage = String(language || 'ar');
    if (rootState.lang === null) {
      rootState.lang = document.documentElement.getAttribute('lang');
    }
  }

  function pruneDisconnected() {
    var doomed = [];
    nodes.forEach(function (entry, id) {
      if (!entry.node || !entry.node.isConnected) doomed.push(id);
    });
    for (var i = 0; i < doomed.length; i += 1) nodes.delete(doomed[i]);
  }

  function sampleText() {
    var sample = '';
    if (!document.body) return sample;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var current;
    while ((current = walker.nextNode())) {
      if (!eligible(current)) continue;
      var text = (current.nodeValue || '').trim();
      if (text.length === 0) continue;
      if (sample.length > 0) sample += ' ';
      sample += text;
      if (sample.length >= SAMPLE_LIMIT) break;
    }
    return sample.slice(0, SAMPLE_LIMIT);
  }

  function notify(kind) {
    post({
      kind: kind,
      lang: document.documentElement.getAttribute('lang') || '',
      sample: sampleText(),
    });
  }

  var observer = new MutationObserver(function () {
    if (applying) return;
    // Our own apply() writes queue observer records that fire AFTER the flag
    // cleared (microtask timing) — never echo them back as page changes.
    if (Date.now() - lastApplyEndedAt < 1000) return;
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(function () {
      changeTimer = 0;
      pruneDisconnected();
      notify('changed');
    }, 800);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener(
    'scroll',
    function () {
      if (!active) return;
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        scrollTimer = 0;
        notify('viewport');
      }, 120);
    },
    { passive: true }
  );

  function receive(cmd) {
    if (!cmd || typeof cmd !== 'object') return;
    switch (cmd.kind) {
      case 'start':
        start(cmd.language);
        break;
      case 'collect': {
        var batch = collect(
          cmd.maxCharacters || 10000,
          cmd.maxSegments || 64,
          cmd.prioritize === true
        );
        post({
          kind: 'collect',
          segments: batch.segments,
          tier: batch.tier,
          more: batch.more,
          token: cmd.token,
        });
        break;
      }
      case 'apply': {
        var outcome = apply(cmd.items || [], cmd.expected);
        post({ kind: 'applied', applied: outcome.applied, ids: outcome.ids, token: cmd.token });
        break;
      }
      case 'restore':
        restore();
        post({ kind: 'restored' });
        break;
      case 'stop':
        active = false;
        break;
      default:
        break;
    }
  }

  root.__moonTrReceive = receive;
  post({ kind: 'ready-installed' });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      notify('ready');
    });
  } else {
    notify('ready');
  }

  // Back/forward cache resurrection: the document came back with translated
  // text but a dead RN state — restore the original, then re-offer.
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      restore();
      notify('ready');
    }
  });
}`;
