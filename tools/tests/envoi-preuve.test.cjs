// Envoi des photos d'une réclamation, sans Cloudinary réel.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../envoi-preuve.js');

const autorisation = async () => ({ success: true, data: {
  cloudName: 'demo', apiKey: 'cle', timestamp: 1760000000, folder: 'preprod/litiges/u1', signature: 'sig' } });
const image = (type = 'image/jpeg') => new Blob([new Uint8Array(2048)], { type });

test('une photo part dans le dossier signé et revient avec son adresse', async () => {
  const appels = [];
  const fetch = async (url, options) => {
    appels.push({ url, dossier: options.body.get('folder'), signature: options.body.get('signature') });
    return { ok: true, json: async () => ({ secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/preprod/litiges/u1/a.jpg' }) };
  };
  const r = await E.envoyerPreuve(image(), { obtenirAutorisation: autorisation, fetch });
  assert.deepEqual(r, { success: true, preuve: { kind: 'PHOTO', url: 'https://res.cloudinary.com/demo/image/upload/v1/preprod/litiges/u1/a.jpg' } });
  assert.deepEqual(appels, [{ url: 'https://api.cloudinary.com/v1_1/demo/image/upload', dossier: 'preprod/litiges/u1', signature: 'sig' }]);
});

test('un fichier qui n’est ni photo ni vidéo est refusé sans rien envoyer', async () => {
  const r = await E.envoyerPreuve(image('application/pdf'), { obtenirAutorisation: () => assert.fail('pas d’autorisation') });
  assert.equal(r.success, false);
  assert.match(r.message, /photo/);
});

test('une photo trop lourde est refusée', async () => {
  const r = await E.envoyerPreuve({ type: 'image/jpeg', size: 11 * 1024 * 1024 }, { obtenirAutorisation: autorisation });
  assert.deepEqual(r, { success: false, message: 'Photo trop lourde (10 Mo au plus).' });
});

test('une vidéo passe par l’envoi par morceaux', async () => {
  const r = await E.envoyerPreuve({ type: 'video/mp4', size: 5000 }, {
    obtenirAutorisation: autorisation,
    envoyerVideo: async () => ({ success: true, url: 'https://res.cloudinary.com/demo/video/upload/v1/preprod/litiges/u1/v.mp4' })
  });
  assert.deepEqual(r.preuve, { kind: 'VIDEO', url: 'https://res.cloudinary.com/demo/video/upload/v1/preprod/litiges/u1/v.mp4' });
});

test('autorisation refusée : le message du serveur est rendu', async () => {
  const r = await E.envoyerPreuve(image(), { obtenirAutorisation: async () => ({ success: false, message: 'L’envoi de photos est indisponible pour le moment.' }) });
  assert.deepEqual(r, { success: false, message: 'L’envoi de photos est indisponible pour le moment.' });
});

test('réseau coupé ou refus de Cloudinary : message clair, pas d’adresse', async () => {
  const coupe = await E.envoyerPreuve(image(), { obtenirAutorisation: autorisation, fetch: async () => { throw new Error('réseau'); } });
  assert.deepEqual(coupe, { success: false, message: 'Réseau coupé : la photo n’est pas partie. Réessayez.' });
  const refus = await E.envoyerPreuve(image(), { obtenirAutorisation: autorisation, fetch: async () => ({ ok: false, json: async () => ({ error: { message: 'x' } }) }) });
  assert.deepEqual(refus, { success: false, message: 'La photo n’a pas pu être envoyée. Réessayez.' });
});
