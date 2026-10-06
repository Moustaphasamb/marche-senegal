// Réponse à une story (messagerie) et modération (admin) : vérifications du code des pages.
// Le comportement réel de la réponse est testé côté serveur (messages-routes.test.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const racine = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');

test('messagerie : le premier message part avec storyId, une seule fois', () => {
  const chat = lire('marche-senegal-chat.html');
  assert.match(chat, /<script src="stories\.js"><\/script>/);
  assert.match(chat, /JSON\.stringify\(storyEnReponse \? \{ content, storyId: storyEnReponse \} : \{ content \}\)/);
  assert.match(chat, /retirerStoryEpinglee\(\);\s+appendMessage\(result\.data\);/);
  assert.match(chat, /preparerReponseStory\(\);/);
});

test('messagerie : une bulle n’affiche qu’une image Cloudinary', () => {
  const chat = lire('marche-senegal-chat.html');
  assert.match(chat, /\/\^https:\\\/\\\/res\\\.cloudinary\\\.com\\\/\//);
});

test('admin : section, entrée de menu, chargement et retrait', () => {
  const admin = lire('marche-senegal-admin.html');
  assert.match(admin, /showPage\('stories',this\)/);
  assert.match(admin, /id="ps-stories"/);
  assert.match(admin, /if \(id === 'stories'\)\s+loadStoriesAdmin\(\);/);
  assert.match(admin, /apiCall\('\/api\/stories\/admin\/en-cours'\)/);
  assert.match(admin, /apiCall\('\/api\/stories\/admin\/' \+ encodeURIComponent\(id\), \{ method: 'DELETE' \}\)/);
});
