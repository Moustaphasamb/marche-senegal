// Réponse à une story dans la messagerie : la story est épinglée dans la conversation.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');
const racine = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');
const fenetres = [];
after(() => fenetres.forEach(w => w.close()));

const ID = '74acb0e6-f8f7-4391-8f9e-19e9f6d9a7da';
const story = { id: ID, mediaType: 'VIDEO', mediaUrl: 'https://res.cloudinary.com/d/video/upload/v1/marche-senegal/stories/b1/a.mp4', caption: 'Arrivage de wax', createdAt: new Date().toISOString(), product: null };

// Le démarrage de la page (connexion, socket) n'est pas lancé : seules ses fonctions servent.
function page({ stories = [story], echec = false, role = 'BUYER' } = {}) {
  const dom = new JSDOM(lire('marche-senegal-chat.html'), { url: 'https://marchesenegal.sn/marche-senegal-chat.html?shopId=b1&story=' + ID, runScripts: 'outside-only' });
  const w = dom.window;
  fenetres.push(w);
  const ajouter = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (type, f, o) => { if (type !== 'DOMContentLoaded') ajouter(type, f, o); };
  w.eval(lire('api.js'));
  w.eval(lire('stories.js'));
  w.getShopStories = async () => { if (echec) throw new Error('réseau'); return { success: true, data: stories.length ? { shop: { id: 'b1' }, stories } : null }; };
  // Les « let » de la page ne vivent que dans leur évaluation : un accès y est ajouté.
  const acces = `;window.__t = { get story() { return storyEnReponse; } }; currentUser = { id: 'u1', role: '${role}' }; currentShopId = 'b1';`;
  for (const s of w.document.querySelectorAll('script:not([src])')) w.eval(s.textContent + acces);
  return { w, d: w.document };
}

test('la story est épinglée dans la conversation, avec sa vignette et sa phrase', async () => {
  const { w, d } = page();
  w.eval('renderMessages([], "u1")');
  await w.eval('preparerReponseStory()');
  const carte = d.querySelector('#messages-wrap #story-epinglee');
  assert.ok(carte, 'carte absente de la conversation');
  assert.equal(d.querySelector('.empty-chat'), null);
  assert.equal(carte.querySelector('img').src, 'https://res.cloudinary.com/d/video/upload/so_0,c_fill,w_160,h_160/v1/marche-senegal/stories/b1/a.jpg');
  assert.match(carte.textContent, /Vous répondez à cette story/);
  assert.match(carte.textContent, /« Arrivage de wax »/);
  assert.equal(d.getElementById('msg-input').placeholder, 'Répondre à cette story…');
  assert.equal(w.__t.story, ID);
});

test('la croix retire la story : le message partira sans elle', async () => {
  const { w, d } = page();
  w.eval('renderMessages([], "u1")');
  await w.eval('preparerReponseStory()');
  d.querySelector('.se-fermer').click();
  assert.equal(d.getElementById('story-epinglee'), null);
  assert.equal(w.__t.story, null);
});

test('story terminée : rien n’est épinglé', async () => {
  const { w, d } = page({ stories: [] });
  w.eval('renderMessages([], "u1")');
  await w.eval('preparerReponseStory()');
  assert.equal(d.getElementById('story-epinglee'), null);
  assert.equal(w.__t.story, null);
});

test('réseau coupé : la carte reste, sans image', async () => {
  const { w, d } = page({ echec: true });
  w.eval('renderMessages([], "u1")');
  await w.eval('preparerReponseStory()');
  const carte = d.getElementById('story-epinglee');
  assert.ok(carte);
  assert.equal(carte.querySelector('img'), null);
});

test('un vendeur ne voit pas de carte', async () => {
  const { w, d } = page({ role: 'SELLER' });
  w.eval('renderMessages([], "u1")');
  await w.eval('preparerReponseStory()');
  assert.equal(d.getElementById('story-epinglee'), null);
});

test('message envoyé : la bulle montre la story, des deux côtés', async () => {
  const { w, d } = page();
  w.eval(`renderMessages([{ id: 'm1', senderId: 'u2', content: 'Il reste du wax ?', createdAt: new Date().toISOString(), imageUrl: 'https://res.cloudinary.com/d/video/upload/so_0,c_fill,w_160,h_160/v1/a.jpg', sender: { firstName: 'Fatou' } }], 'u1')`);
  const bulle = d.querySelector('.bubble');
  assert.equal(bulle.querySelector('.bubble-story').textContent, '↩ Réponse à une story');
  assert.ok(bulle.querySelector('img.bubble-img'));
  assert.match(bulle.textContent, /Il reste du wax \?/);
});
