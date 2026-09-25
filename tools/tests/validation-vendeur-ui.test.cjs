const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');

const script = fs.readFileSync(path.resolve(__dirname, '../../marche-senegal-dashboard-script.js'), 'utf8');
const adminHtml = fs.readFileSync(path.resolve(__dirname, '../../marche-senegal-admin.html'), 'utf8');

function page() {
  const dom = new JSDOM('<div id="page-dashboard"></div>', { runScripts: 'outside-only' });
  dom.window.eval(script);
  return dom;
}

test('une boutique validée garde une confirmation visible sans SMS', () => {
  const dom = page();
  dom.window.afficherBandeauValidation({ id: 'shop-test', status: 'ACTIVE' });
  const bandeau = dom.window.document.getElementById('bandeau-validation');
  assert.ok(bandeau);
  assert.match(bandeau.textContent, /boutique est validée/i);
  assert.equal(bandeau.getAttribute('role'), 'status');
  assert.ok(bandeau.classList.contains('vert'));
  dom.window.close();
});

test('un changement de statut remplace le bandeau précédent', () => {
  const dom = page();
  dom.window.afficherBandeauValidation({ status: 'PENDING' }, { manquant: [] });
  dom.window.afficherBandeauValidation({ status: 'ACTIVE' }, { manquant: [] });
  assert.equal(dom.window.document.querySelectorAll('#bandeau-validation').length, 1);
  assert.match(dom.window.document.getElementById('bandeau-validation').textContent, /validée/i);
  dom.window.close();
});

test('l’admin distingue les canaux réellement acceptés des canaux indisponibles', () => {
  const fonction = adminHtml.match(/function messageEtatNotifications\(notification\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(fonction);
  const dom = new JSDOM('', { runScripts: 'outside-only' });
  dom.window.eval(fonction);
  assert.match(dom.window.messageEtatNotifications({ sms: 'submitted', email: 'not_configured' }), /SMTP non configuré/);
  assert.match(dom.window.messageEtatNotifications({ sms: 'no_phone', email: 'submitted' }), /numéro absent/);
  assert.match(dom.window.messageEtatNotifications({ sms: 'failed', email: 'failed' }), /e-mail non envoyé/);
  dom.window.close();
});
