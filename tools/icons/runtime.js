/*!
 * Marché Sénégal — jeu d'icônes vectorielles
 * Icônes : Lucide (https://lucide.dev) — licence ISC.
 * Fichier généré : ne pas éditer à la main, régénérer via le script de build.
 *
 * USAGE
 *   HTML : <i class="ic" data-ic="shopping-cart"></i>
 *          La taille suit la font-size du parent (1em), la couleur suit currentColor.
 *          Modificateurs : data-ic-fill (icône pleine),
 *                          class ic-gold / ic-red / ic-ok / ic-warn / ic-err,
 *                          class ic-lg / ic-xl (agrandissement).
 *   JS   : msIcon('trash-2')  → chaîne HTML prête à injecter dans un template.
 *   Filet : tout emoji connu resté dans un nœud texte est converti à l'affichage.
 *           Cela couvre le contenu injecté via textContent, où du HTML serait ignoré.
 */
(function (root) {
  'use strict';

  var PATHS = {
/*__PATHS__*/
  };

  var EMOJI = {
/*__EMOJI__*/
  };

  var NS = 'http://www.w3.org/2000/svg';
  var STROKE = 1.75;
  var SKIP_TAGS = /^(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION|SELECT|CODE|PRE|TITLE|svg|path|circle)$/;

  var CSS = [
    '.ic{display:inline-flex;align-items:center;justify-content:center;',
    'width:1em;height:1em;flex:0 0 auto;vertical-align:-.14em;line-height:1}',
    '.ic>svg{width:100%;height:100%;display:block}',
    '.ic-gold{color:#E8B53A}.ic-red{color:#E24A3B}.ic-ok{color:#1B9C5A}',
    '.ic-warn{color:#E08A1E}.ic-err{color:#E24A3B}',
    '.ic-lg{font-size:1.35em}.ic-xl{font-size:2em}'
  ].join('');

  function injectCss() {
    if (!document.head && !document.documentElement) return;
    if (document.getElementById('ms-icons-css')) return;
    var s = document.createElement('style');
    s.id = 'ms-icons-css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /** Construit l'élément <svg> d'une icône. Renvoie null si le nom est inconnu. */
  function buildSvg(name, filled) {
    var body = PATHS[name];
    if (!body) return null;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', filled ? 'currentColor' : 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', filled ? 1 : STROKE);
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    // Contenu de confiance : PATHS est une constante figée à la génération,
    // aucune donnée extérieure n'y transite.
    svg.innerHTML = body;
    return svg;
  }

  /** Chaîne HTML d'une icône, pour l'injection depuis un template JS. */
  function msIcon(name, opts) {
    opts = opts || {};
    if (!PATHS[name]) return '';
    var cls = 'ic' + (opts.className ? ' ' + opts.className : '');
    return '<i class="' + cls + '" data-ic="' + name + '"' +
      (opts.fill ? ' data-ic-fill' : '') + '></i>';
  }

  /** Remplit tous les <i data-ic> pas encore rendus. */
  function hydrate(scope) {
    if (!scope || !scope.querySelectorAll) return;
    var nodes = scope.querySelectorAll('[data-ic]:not([data-ic-ready])');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var svg = buildSvg(el.getAttribute('data-ic'), el.hasAttribute('data-ic-fill'));
      el.setAttribute('data-ic-ready', '');
      if (!svg) continue;
      if (el.className.indexOf('ic') === -1) el.className = ('ic ' + el.className).trim();
      el.textContent = '';
      el.appendChild(svg);
    }
    if (scope.nodeType === 1 && scope.hasAttribute('data-ic') &&
        !scope.hasAttribute('data-ic-ready')) {
      var s = buildSvg(scope.getAttribute('data-ic'), scope.hasAttribute('data-ic-fill'));
      scope.setAttribute('data-ic-ready', '');
      if (s) { scope.textContent = ''; scope.appendChild(s); }
    }
  }

  // --- Filet : emojis restés dans des nœuds texte -----------------------------
  var keys = Object.keys(EMOJI).sort(function (a, b) { return b.length - a.length; });
  var RE = new RegExp('(' + keys.map(function (k) {
    return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('|') + ')', 'g');

  function iconFromEmoji(e) {
    var spec = EMOJI[e].split('|');
    var mods = spec[1] ? spec[1].split(' ') : [];
    var filled = mods.indexOf('fill') !== -1;
    var svg = buildSvg(spec[0], filled);
    if (!svg) return null;
    var box = document.createElement('i');
    box.className = 'ic';
    for (var i = 0; i < mods.length; i++) {
      if (mods[i] !== 'fill') box.className += ' ic-' + mods[i];
    }
    box.setAttribute('data-ic', spec[0]);
    box.setAttribute('data-ic-ready', '');
    box.appendChild(svg);
    return box;
  }

  function replaceInText(node) {
    var text = node.nodeValue, frag = document.createDocumentFragment();
    var last = 0, m, done = false;
    RE.lastIndex = 0;
    while ((m = RE.exec(text))) {
      var box = iconFromEmoji(m[0]);
      if (!box) continue;
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      frag.appendChild(box);
      last = m.index + m[0].length;
      done = true;
    }
    if (!done || !node.parentNode) return;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  function sweepText(scope) {
    if (!scope) return;
    if (scope.nodeType === 3) {
      RE.lastIndex = 0;
      if (scope.parentNode && !SKIP_TAGS.test(scope.parentNode.nodeName) &&
          RE.test(scope.nodeValue || '')) replaceInText(scope);
      return;
    }
    if (scope.nodeType !== 1 && scope.nodeType !== 9) return;
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null);
    var hits = [], n;
    while ((n = walker.nextNode())) {
      var v = n.nodeValue;
      if (!v || v.length > 4000) continue;
      var p = n.parentNode;
      if (!p || SKIP_TAGS.test(p.nodeName)) continue;
      RE.lastIndex = 0;
      if (RE.test(v)) hits.push(n);
    }
    for (var i = 0; i < hits.length; i++) replaceInText(hits[i]);
  }

  // --- Rendu initial + suivi du contenu injecté dynamiquement -----------------
  function refresh(scope) {
    scope = scope || document.body || document.documentElement;
    hydrate(scope);
    sweepText(scope);
  }

  var queue = [], pending = false;
  function flush() {
    pending = false;
    var batch = queue.splice(0, queue.length);
    for (var i = 0; i < batch.length; i++) {
      if (batch[i].parentNode || batch[i] === document.body) refresh(batch[i]);
    }
  }

  /** Observe le document : les icônes sont rendues au fil du parsing, sans clignotement. */
  function observe() {
    if (!root.MutationObserver || !document.documentElement) return;
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1 || added[j].nodeType === 3) queue.push(added[j]);
        }
      }
      // setTimeout plutôt que requestAnimationFrame : ce dernier est gelé dans un
      // onglet d'arrière-plan, ce qui laisserait les emojis visibles jusqu'à son
      // activation. Le délai 0 regroupe malgré tout les mutations du même tick.
      if (queue.length && !pending) {
        pending = true;
        setTimeout(flush, 0);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  injectCss();
  observe();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      injectCss();
      refresh(document.body);
    });
  } else {
    refresh(document.body || document.documentElement);
  }

  root.msIcon = msIcon;
  root.msIcons = { render: refresh, svg: buildSvg, names: Object.keys(PATHS) };
})(window);
