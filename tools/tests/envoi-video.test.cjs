// Envoi d'une vidéo par morceaux de 6 Mo, avec reprise après coupure.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const EnvoiVideo = require('../../envoi-video.js');

const MO = 1024 * 1024;
const fichier = taille => ({ size: taille, name: 'v.mp4', slice: (a, b) => ({ a, b }) });
const autorisation = async () => ({ success: true, data: { cloudName: 'demo', apiKey: 'k', timestamp: 1, folder: 'marche-senegal/stories/b1', signature: 's' } });
const repondre = (status, corps) => ({ ok: status >= 200 && status < 300, status, json: async () => corps });
global.FormData = class { constructor() { this.champs = {}; } append(k, v) { this.champs[k] = v; } };

test('13 Mo partent en 3 morceaux, avec le même identifiant et les bonnes plages', async () => {
  const envois = [];
  const r = await EnvoiVideo.envoyer(fichier(13 * MO), {
    obtenirAutorisation: autorisation,
    fetch: async (url, o) => { envois.push({ url, o }); return repondre(200, envois.length === 3 ? { secure_url: 'https://res.cloudinary.com/demo/video/upload/v1/marche-senegal/stories/b1/v.mp4' } : {}); },
    attendre: async () => {}
  });
  assert.equal(r.success, true);
  assert.equal(envois.length, 3);
  assert.equal(envois[0].url, 'https://api.cloudinary.com/v1_1/demo/video/upload');
  assert.equal(envois[2].o.headers['Content-Range'], `bytes ${12 * MO}-${13 * MO - 1}/${13 * MO}`);
  assert.equal(new Set(envois.map(e => e.o.headers['X-Unique-Upload-Id'])).size, 1);
  assert.equal(envois[0].o.body.champs.folder, 'marche-senegal/stories/b1');
});

test('une coupure ne fait renvoyer que le morceau en cours', async () => {
  let n = 0;
  const textes = [];
  const r = await EnvoiVideo.envoyer(fichier(7 * MO), {
    obtenirAutorisation: autorisation,
    suivi: t => textes.push(t),
    fetch: async () => { n++; if (n === 2) throw new Error('réseau'); return repondre(200, n === 3 ? { secure_url: 'u' } : {}); },
    attendre: async () => {}
  });
  assert.equal(r.success, true);
  assert.equal(n, 3);
  assert.ok(textes.some(t => t.startsWith('Réseau coupé à')));
});

test('un refus de Cloudinary ne se rejoue pas ; une autorisation refusée non plus', async () => {
  let n = 0;
  const r = await EnvoiVideo.envoyer(fichier(MO), {
    obtenirAutorisation: autorisation,
    fetch: async () => { n++; return repondre(400, { error: { message: 'bad' } }); },
    attendre: async () => {}
  });
  assert.equal(r.success, false);
  assert.equal(n, 1);
  assert.match(r.message, /Filmez en mode vidéo normal/);
  const refus = await EnvoiVideo.envoyer(fichier(MO), {
    obtenirAutorisation: async () => ({ success: false, message: 'Votre boutique doit être validée' }),
    fetch: async () => { throw new Error('ne doit pas être appelé'); },
    attendre: async () => {}
  });
  assert.deepEqual(refus, { success: false, message: 'Votre boutique doit être validée' });
});
