// Calculs de la vue 360° : sans navigateur ni WebGL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../../vue-360');

const proche = (a, b, e = 1e-3) => assert.ok(Math.abs(a - b) <= e, `${a} ≠ ${b}`);

test('une photo 360° est deux fois plus large que haute', () => {
  assert.equal(V.estPanorama(4096, 2048), true);
  assert.equal(V.estPanorama(5760, 2880), true);
  assert.equal(V.estPanorama(2400, 1210), true);
  assert.equal(V.estPanorama(2400, 1800), false); // photo 4:3
  assert.equal(V.estPanorama(1920, 1080), false); // 16:9
  assert.equal(V.estPanorama(8000, 2000), false); // panorama partiel du téléphone
  assert.equal(V.estPanorama(0, 0), false);
});

test('le centre de la photo est droit devant, le bord gauche derrière', () => {
  const c = V.versAngles(0.5, 0.5);
  proche(c.yaw, 0); proche(c.pitch, 0);
  proche(V.versAngles(0.75, 0.5).yaw, 90);
  proche(V.versAngles(0, 0.5).yaw, -180);
  proche(V.versAngles(0.5, 0).pitch, 90);
});

test('angles → photo est l’inverse, et fait le tour', () => {
  for (const [x, y] of [[0.1, 0.2], [0.5, 0.5], [0.93, 0.71]]) {
    const a = V.versAngles(x, y);
    const p = V.versPhoto(a.yaw, a.pitch);
    proche(p.x, x); proche(p.y, y);
  }
  proche(V.versPhoto(360 + 45, 0).x, 0.625);
  proche(V.versPhoto(-90, 0).x, 0.25);
  assert.equal(V.versPhoto(0, 120).y, 0);
});

test('un point droit devant apparaît au centre de l’écran', () => {
  const vue = { yaw: 0, pitch: 0, fov: 80, aspect: 16 / 9 };
  const r = V.projeter({ x: 0.5, y: 0.5 }, vue);
  assert.equal(r.devant, true);
  proche(r.px, 0.5); proche(r.py, 0.5);
});

test('un point derrière n’est pas visible', () => {
  const r = V.projeter({ x: 0, y: 0.5 }, { yaw: 0, pitch: 0, fov: 80, aspect: 1 });
  assert.equal(r.devant, false);
});

test('regarder à droite fait glisser le point vers la gauche', () => {
  const r = V.projeter({ x: 0.5, y: 0.5 }, { yaw: 10, pitch: 0, fov: 80, aspect: 1 });
  assert.ok(r.px < 0.5);
  proche(r.py, 0.5);
});

test('regarder en haut fait descendre le point', () => {
  const r = V.projeter({ x: 0.5, y: 0.5 }, { yaw: 0, pitch: 15, fov: 80, aspect: 1 });
  assert.ok(r.py > 0.5);
});

test('toucher l’écran retrouve le point de la photo (aller-retour)', () => {
  const vues = [
    { yaw: 0, pitch: 0, fov: 85, aspect: 16 / 9 },
    { yaw: 137, pitch: -20, fov: 60, aspect: 0.8 },
    { yaw: -170, pitch: 35, fov: 100, aspect: 1.3 }
  ];
  for (const vue of vues) {
    for (const [px, py] of [[0.5, 0.5], [0.2, 0.3], [0.8, 0.75]]) {
      const pt = V.deprojeter(px, py, vue);
      assert.ok(pt.x >= 0 && pt.x < 1 && pt.y >= 0 && pt.y <= 1);
      const r = V.projeter(pt, vue);
      assert.equal(r.devant, true);
      proche(r.px, px, 2e-3); proche(r.py, py, 2e-3);
    }
  }
});

test('le toucher au centre donne la direction regardée', () => {
  const pt = V.deprojeter(0.5, 0.5, { yaw: 90, pitch: 0, fov: 80, aspect: 1 });
  proche(pt.x, 0.75); proche(pt.y, 0.5);
});

test('versPhoto arrondit à 4 décimales, comme les points du serveur', () => {
  const p = V.versPhoto(12.3456789, -7.654321);
  assert.equal(p.x, Number(p.x.toFixed(4)));
  assert.equal(p.y, Number(p.y.toFixed(4)));
});

test('image allégée : seule une adresse Cloudinary sans transformation est modifiée', () => {
  const u = 'https://res.cloudinary.com/demo/image/upload/v17/marche-senegal/showcase/a.jpg';
  assert.equal(V.urlTaille(u, 1024), 'https://res.cloudinary.com/demo/image/upload/w_1024,c_limit,q_auto/v17/marche-senegal/showcase/a.jpg');
  assert.equal(V.urlTaille('https://ex.test/a.jpg', 1024), 'https://ex.test/a.jpg');
  assert.equal(V.urlTaille('https://res.cloudinary.com/demo/image/upload/w_500/a.jpg', 1024), 'https://res.cloudinary.com/demo/image/upload/w_500/a.jpg');
});

test('écart d’angle ramené entre -180 et 180 (capteurs qui passent le nord)', () => {
  assert.equal(V.ecartAngle(1, 359), 2);
  assert.equal(V.ecartAngle(359, 1), -2);
  assert.equal(V.ecartAngle(10, 350), 20);
  assert.equal(V.ecartAngle(350, 10), -20);
});
