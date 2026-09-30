// Vue 360° d'une photo de boutique (image équirectangulaire, deux fois plus large que haute).
// Un point de la photo garde ses coordonnées 0-1 : x fait le tour (0 = derrière à gauche,
// 0,5 = droit devant), y va du plafond (0) au sol (1). Les points posés sur une photo
// classique et ceux posés dans la vue 360° sont donc stockés de la même façon.
// Adapté du prototype ShopVision de Codex (moteur WebGL sans dépendance).
(function (root) {
  'use strict';
  const RAD = Math.PI / 180;
  const FOV = { defaut: 80, min: 35, max: 100 };

  // ── Calculs, testés sans navigateur ──
  const estPanorama = (w, h) => w > 0 && h > 0 && Math.abs(w / h - 2) <= 0.04;
  const versAngles = (x, y) => ({ yaw: (x - 0.5) * 360, pitch: (0.5 - y) * 180 });
  const arrondi = v => Number(v.toFixed(4));

  function versPhoto(yaw, pitch) {
    let x = arrondi((((yaw / 360 + 0.5) % 1) + 1) % 1);
    if (x >= 1) x = 0;
    return { x, y: arrondi(Math.min(1, Math.max(0, 0.5 - pitch / 180))) };
  }

  // vue : { yaw, pitch, fov (vertical, en degrés), aspect (largeur / hauteur) }.
  // Renvoie la position à l'écran en fraction (px, py) et si le point est devant nous.
  function projeter(pt, vue) {
    const a = versAngles(pt.x, pt.y);
    const d = (a.yaw - vue.yaw) * RAD, ph = a.pitch * RAD, p = vue.pitch * RAD;
    const x = Math.sin(d) * Math.cos(ph), z0 = Math.cos(d) * Math.cos(ph), y0 = Math.sin(ph);
    const y = y0 * Math.cos(p) - z0 * Math.sin(p);
    const z = z0 * Math.cos(p) + y0 * Math.sin(p);
    if (z <= 1e-6) return { px: 0, py: 0, devant: false };
    const t = Math.tan(vue.fov * RAD / 2);
    return { px: 0.5 + x / (z * t * vue.aspect) / 2, py: 0.5 - y / (z * t) / 2, devant: true };
  }

  // Inverse de projeter : l'endroit touché à l'écran → le point de la photo.
  function deprojeter(px, py, vue) {
    const t = Math.tan(vue.fov * RAD / 2);
    let x = (px - 0.5) * 2 * vue.aspect * t, y = (0.5 - py) * 2 * t, z = 1;
    const n = Math.hypot(x, y, z);
    x /= n; y /= n; z /= n;
    const cp = Math.cos(vue.pitch * RAD), sp = Math.sin(vue.pitch * RAD);
    const y1 = y * cp + z * sp, z1 = z * cp - y * sp;
    const cy = Math.cos(vue.yaw * RAD), sy = Math.sin(vue.yaw * RAD);
    const x2 = x * cy + z1 * sy, z2 = z1 * cy - x * sy;
    return versPhoto(Math.atan2(x2, z2) / RAD, Math.asin(Math.max(-1, Math.min(1, y1))) / RAD);
  }

  // Écart a − b ramené entre -180 et 180 degrés.
  const ecartAngle = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

  // Cloudinary sert une version réduite à la demande : d'abord une image légère (4G),
  // puis la pleine définition. Une adresse déjà transformée ou étrangère reste telle quelle.
  function urlTaille(url, largeur) {
    const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/.exec(url || '');
    return m ? `${m[1]}w_${largeur},c_limit,q_auto/${m[2]}` : url;
  }

  // ── Navigateur ──
  const detectes = new Map();
  function chargerImage(url) {
    return new Promise((ok, ko) => {
      const img = new root.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => ok(img);
      img.onerror = () => ko(new Error('Photo inaccessible'));
      img.src = url;
    });
  }
  // La vignette suffit à mesurer la photo : quelques Ko au lieu de la photo entière.
  function detecter(url) {
    if (!detectes.has(url)) {
      detectes.set(url, chargerImage(urlTaille(url, 512))
        .then(img => estPanorama(img.naturalWidth, img.naturalHeight))
        .catch(() => { detectes.delete(url); return false; }));
    }
    return detectes.get(url);
  }

  const VERTEX = 'attribute vec2 position;varying vec2 uv;void main(){uv=position;gl_Position=vec4(position,0.,1.);}';
  // highp quand le téléphone le permet : en mediump, une photo de 4 096 px s'affiche en escalier.
  const FRAGMENT = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n'
    + 'varying vec2 uv;uniform sampler2D image;uniform float yaw,pitch,aspect,tanFov;'
    + 'void main(){vec3 d=normalize(vec3(uv.x*aspect*tanFov,uv.y*tanFov,1.));'
    + 'float cp=cos(pitch),sp=sin(pitch);d=vec3(d.x,d.y*cp+d.z*sp,d.z*cp-d.y*sp);'
    + 'float cy=cos(yaw),sy=sin(yaw);d=vec3(d.x*cy+d.z*sy,d.y,d.z*cy-d.x*sy);'
    + 'vec2 t=vec2(atan(d.x,d.z)/6.2831853+.5,.5-asin(clamp(d.y,-1.,1.))/3.14159265);'
    + 'gl_FragColor=texture2D(image,t);}';

  // o : { libelle, surToucher(pt), auto (rotation lente au départ) }.
  // Renvoie null si l'appareil ne sait pas afficher la vue : la photo classique prend le relais.
  function creer(o = {}) {
    const doc = root.document;
    const el = (tag, cls, texte) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (texte != null) e.textContent = texte; return e; };
    const bouton = (cls, label, texte) => { const b = el('button', cls, texte); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; return b; };

    const racine = el('div', 'v360');
    const canvas = el('canvas', 'v360-canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', (o.libelle || 'Vue 360° de la boutique') + '. Glissez ou utilisez les flèches pour regarder autour.');
    const calque = el('div', 'v360-points');
    const statut = el('p', 'v360-status');
    statut.hidden = true;
    const outils = el('div', 'v360-tools');
    racine.append(canvas, calque, statut, outils);

    let gl;
    try { gl = canvas.getContext('webgl', { antialias: false }); } catch { gl = null; }
    if (!gl) return null;
    let program, texture, uniforms;
    try {
      const shader = (type, source) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      program = gl.createProgram();
      gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('programme');
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      uniforms = Object.fromEntries(['yaw', 'pitch', 'aspect', 'tanFov'].map(k => [k, gl.getUniformLocation(program, k)]));
    } catch { return null; }
    const tailleMax = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048);

    const vue = { yaw: 0, pitch: 0, fov: FOV.defaut };
    let points = [], pret = false, image = 0, cadre = 0, detruit = false, fovRegle = false;

    function limiter() {
      vue.pitch = Math.max(-85, Math.min(85, vue.pitch));
      vue.fov = Math.max(FOV.min, Math.min(FOV.max, vue.fov));
      vue.yaw = ((vue.yaw % 360) + 540) % 360 - 180;
    }
    function demander() { if (!cadre && !detruit) cadre = root.requestAnimationFrame(dessiner); }
    function dessiner() {
      cadre = 0;
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(root.devicePixelRatio || 1, 2);
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      // Sur un écran large, 80° en hauteur feraient 116° en largeur : bords déformés.
      // L'angle de départ est ramené à 100° de large au plus.
      if (!fovRegle) {
        fovRegle = true;
        vue.fov = Math.max(FOV.min, Math.min(FOV.defaut, 2 * Math.atan(Math.tan(50 * RAD) / (r.width / r.height)) / RAD));
      }
      if (pret) {
        gl.viewport(0, 0, w, h);
        gl.uniform1f(uniforms.yaw, vue.yaw * RAD);
        gl.uniform1f(uniforms.pitch, vue.pitch * RAD);
        gl.uniform1f(uniforms.aspect, r.width / r.height);
        gl.uniform1f(uniforms.tanFov, Math.tan(vue.fov * RAD / 2));
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      const v = { ...vue, aspect: r.width / r.height };
      for (const pt of points) {
        const p = projeter(pt, v);
        const visible = pret && p.devant && p.px > -0.02 && p.px < 1.02 && p.py > -0.02 && p.py < 1.02;
        pt.noeud.style.visibility = visible ? '' : 'hidden';
        if (visible) { pt.noeud.style.left = p.px * r.width + 'px'; pt.noeud.style.top = p.py * r.height + 'px'; }
      }
      if (typeof o.surVue === 'function') o.surVue({ ...vue });
    }

    function envoyerTexture(img) {
      let source = img;
      if (img.naturalWidth > tailleMax) {
        source = doc.createElement('canvas');
        source.width = tailleMax;
        source.height = Math.round(img.naturalHeight * tailleMax / img.naturalWidth);
        source.getContext('2d').drawImage(img, 0, 0, source.width, source.height);
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      pret = true;
      demander();
    }
    function montrerStatut(texte) { statut.textContent = texte || ''; statut.hidden = !texte; }

    // Image légère d'abord, pleine définition ensuite ; une nouvelle photo annule la précédente.
    async function charger(url) {
      const n = ++image;
      pret = false;
      demander();
      montrerStatut('Chargement de la vue 360°…');
      let legere = false;
      try {
        const petite = await chargerImage(urlTaille(url, 1024));
        if (n !== image || detruit) return;
        envoyerTexture(petite);
        legere = true;
        montrerStatut('');
      } catch { /* on tente la pleine définition */ }
      try {
        const grande = await chargerImage(urlTaille(url, tailleMax));
        if (n !== image || detruit) return;
        envoyerTexture(grande);
        montrerStatut('');
      } catch (e) {
        if (n !== image || legere) return;
        montrerStatut('');
        throw e;
      }
    }

    // ── Rotation lente au départ : montre que la photo tourne ──
    let auto = !!o.auto && !(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let autoFin = 0;
    function tourneSeule(t) {
      if (!auto || detruit) return;
      if (!autoFin) autoFin = t + 25000;
      if (t > autoFin) { auto = false; return; }
      if (pret && !doc.hidden) { vue.yaw += 0.06; limiter(); dessiner(); }
      root.requestAnimationFrame(tourneSeule);
    }
    const arreterAuto = () => { auto = false; };
    if (auto) root.requestAnimationFrame(tourneSeule);

    // ── Doigt, souris, pincement ──
    const doigts = new Map();
    let depart = null, pince = null;
    canvas.addEventListener('pointerdown', ev => {
      arreterAuto();
      doigts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      try { canvas.setPointerCapture(ev.pointerId); } catch { /* sans importance */ }
      if (doigts.size === 1) depart = { t: Date.now(), bouge: 0 };
      if (doigts.size === 2) {
        const [a, b] = [...doigts.values()];
        pince = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, fov: vue.fov };
        depart = null;
      }
      racine.classList.add('v360-glisse');
    });
    canvas.addEventListener('pointermove', ev => {
      const avant = doigts.get(ev.pointerId);
      if (!avant) return;
      const maintenant = { x: ev.clientX, y: ev.clientY };
      doigts.set(ev.pointerId, maintenant);
      if (pince && doigts.size === 2) {
        const [a, b] = [...doigts.values()];
        vue.fov = pince.fov * pince.d / (Math.hypot(a.x - b.x, a.y - b.y) || 1);
      } else if (doigts.size === 1) {
        const k = vue.fov / (canvas.getBoundingClientRect().height || 1);
        vue.yaw -= (maintenant.x - avant.x) * k;
        vue.pitch += (maintenant.y - avant.y) * k;
        if (depart) depart.bouge += Math.abs(maintenant.x - avant.x) + Math.abs(maintenant.y - avant.y);
      }
      limiter();
      demander();
    });
    const lever = ev => {
      doigts.delete(ev.pointerId);
      if (doigts.size < 2) pince = null;
      if (!doigts.size) racine.classList.remove('v360-glisse');
      // Un toucher bref sans glisser pose un point (éditeur du vendeur).
      if (ev.type === 'pointerup' && depart && depart.bouge < 8 && Date.now() - depart.t < 600 && typeof o.surToucher === 'function' && pret) {
        const r = canvas.getBoundingClientRect();
        o.surToucher(deprojeter((ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height, { ...vue, aspect: r.width / r.height }));
      }
      if (!doigts.size) depart = null;
    };
    canvas.addEventListener('pointerup', lever);
    canvas.addEventListener('pointercancel', lever);
    canvas.addEventListener('keydown', ev => {
      const pas = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, 10], ArrowDown: [0, -10] }[ev.key];
      if (pas) { vue.yaw += pas[0]; vue.pitch += pas[1]; }
      else if (ev.key === '+' || ev.key === '=') vue.fov -= 10;
      else if (ev.key === '-') vue.fov += 10;
      else return;
      ev.preventDefault();
      arreterAuto();
      limiter();
      demander();
    });

    // ── Boutons ──
    const plus = bouton('v360-tool', 'Zoomer', '+');
    const moins = bouton('v360-tool', 'Dézoomer', '−');
    plus.onclick = () => { arreterAuto(); vue.fov -= 12; limiter(); demander(); };
    moins.onclick = () => { arreterAuto(); vue.fov += 12; limiter(); demander(); };
    outils.append(plus, moins);
    if (racine.requestFullscreen) {
      const plein = bouton('v360-tool', 'Plein écran', '⛶');
      plein.onclick = async () => {
        try { if (doc.fullscreenElement) await doc.exitFullscreen(); else await racine.requestFullscreen(); } catch { /* refus du navigateur */ }
      };
      outils.appendChild(plein);
    }
    // Tourner le téléphone pour regarder autour : seulement sur écran tactile, après accord.
    let capteurs = false, origine = null;
    function orientation(ev) {
      if (!capteurs || ev.alpha == null || ev.beta == null) return;
      if (!origine) origine = { alpha: ev.alpha, beta: ev.beta, yaw: vue.yaw, pitch: vue.pitch };
      vue.yaw = origine.yaw - ecartAngle(ev.alpha, origine.alpha);
      vue.pitch = origine.pitch + (ev.beta - origine.beta);
      limiter();
      demander();
    }
    const tactile = root.matchMedia && root.matchMedia('(pointer: coarse)').matches;
    if (tactile && root.DeviceOrientationEvent && root.isSecureContext) {
      const b = bouton('v360-tool', 'Tourner avec le téléphone', '📱');
      b.setAttribute('aria-pressed', 'false');
      b.onclick = async () => {
        arreterAuto();
        if (capteurs) {
          capteurs = false;
          root.removeEventListener('deviceorientation', orientation);
        } else {
          try {
            const D = root.DeviceOrientationEvent;
            if (typeof D.requestPermission === 'function' && await D.requestPermission() !== 'granted') throw new Error();
            capteurs = true;
            origine = null;
            root.addEventListener('deviceorientation', orientation);
          } catch {
            montrerStatut('Capteurs indisponibles : glissez le doigt pour tourner.');
            root.setTimeout(() => montrerStatut(''), 3500);
          }
        }
        b.setAttribute('aria-pressed', String(capteurs));
      };
      outils.appendChild(b);
    }

    const observateur = root.ResizeObserver ? new root.ResizeObserver(demander) : null;
    if (observateur) observateur.observe(racine);
    canvas.addEventListener('webglcontextlost', ev => { ev.preventDefault(); pret = false; montrerStatut('La vue 360° s’est interrompue. Rechargez la page.'); });

    return {
      racine,
      charger,
      // liste : [{ x, y, noeud }] ; les nœuds sont replacés dans la vue à chaque image.
      points(liste) {
        points = liste.filter(p => p && p.noeud);
        calque.replaceChildren(...points.map(p => p.noeud));
        demander();
      },
      regarder(pt) { const a = versAngles(pt.x, pt.y); vue.yaw = a.yaw; vue.pitch = a.pitch * 0.6; arreterAuto(); limiter(); demander(); },
      tourner(degres) { vue.yaw += degres; arreterAuto(); limiter(); demander(); },
      etat: () => ({ ...vue }),
      restaurer(e) { if (e) { Object.assign(vue, { yaw: e.yaw, pitch: e.pitch, fov: e.fov }); fovRegle = true; arreterAuto(); limiter(); demander(); } },
      demander,
      detruire() {
        detruit = true;
        capteurs = false;
        root.removeEventListener('deviceorientation', orientation);
        if (observateur) observateur.disconnect();
        if (cadre) root.cancelAnimationFrame(cadre);
        const perte = gl.getExtension('WEBGL_lose_context');
        if (perte) perte.loseContext();
        racine.remove();
      }
    };
  }

  const api = { estPanorama, versAngles, versPhoto, projeter, deprojeter, ecartAngle, urlTaille, detecter, creer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Vue360 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
