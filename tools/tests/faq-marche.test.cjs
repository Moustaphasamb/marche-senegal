// Questions fréquentes d'un marché : construites seulement à partir de la fiche,
// jamais inventées, et identiques dans la page et pour les robots.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');
const { questionsMarche, construireFaq, nommer } = require('../../faq-marche.js');

const LIBELLES = { tissus: 'Tissus et pagnes', 'legumes-fruits': 'Légumes et fruits', bijoux: 'Bijoux' };
const SANDAGA = {
  name: 'Marché Sandaga', city: 'Dakar', region: 'Dakar', address: 'Plateau, Dakar',
  horaires: 'Environ 8 h – 20 h.', conseils: 'Attention aux pickpockets.',
  categories: ['bijoux', 'tissus'], specialites: ['tissus'], shops: [{ id: 's1' }]
};
const questions = (m, l = LIBELLES) => questionsMarche(m, l).map(q => q.question);
const reponse = (m, debut) => questionsMarche(m, LIBELLES).find(q => q.question.startsWith(debut)).reponse;

test('marché complet : six questions, dans l ordre utile', () => {
  assert.deepEqual(questions(SANDAGA), [
    'Où se trouve le Marché Sandaga ?',
    'Quels sont les horaires du Marché Sandaga ?',
    'Que trouve-t-on au Marché Sandaga ?',
    'Quels conseils pour aller au Marché Sandaga ?',
    'Peut-on acheter en ligne au Marché Sandaga ?',
    'Comment vendre en ligne quand on a un commerce au Marché Sandaga ?'
  ]);
});

test('réponses tirées de la fiche, spécialités d abord', () => {
  assert.equal(reponse(SANDAGA, 'Où'), 'Plateau, Dakar (région de Dakar).');
  assert.equal(reponse(SANDAGA, 'Quels sont'), 'Environ 8 h – 20 h.');
  assert.equal(reponse(SANDAGA, 'Que trouve'), 'Surtout : tissus et pagnes. On y trouve aussi : bijoux.');
  assert.match(reponse(SANDAGA, 'Peut-on'), /^Oui : 1 boutique de ce marché vend sur Marché Sénégal/);
});

test('fiche vide : seulement ce qui est sûr, rien d inventé', () => {
  const bakel = { name: 'Marché de Bakel', city: 'Bakel', region: 'Tambacounda', categories: [], shops: [] };
  assert.deepEqual(questions(bakel), [
    'Où se trouve le Marché de Bakel ?',
    'Peut-on acheter en ligne au Marché de Bakel ?',
    'Comment vendre en ligne quand on a un commerce au Marché de Bakel ?'
  ]);
  assert.equal(reponse(bakel, 'Où'), 'À Bakel (région de Tambacounda).');
  assert.match(reponse(bakel, 'Peut-on'), /^Pas encore/);
});

test('plusieurs boutiques : pluriel', () => {
  assert.match(reponse({ ...SANDAGA, shops: [{}, {}, {}] }, 'Peut-on'), /^Oui : 3 boutiques de ce marché vendent/);
});

test('catégorie sans libellé connu : question omise plutôt qu un code', () => {
  assert.ok(!questions(SANDAGA, {}).some(q => q.startsWith('Que trouve')));
});

test('articles : le, la, et nom sans article', () => {
  assert.deepEqual(nommer('Marché Sandaga'), { le: 'le Marché Sandaga', du: 'du Marché Sandaga', au: 'au Marché Sandaga' });
  assert.deepEqual(nommer('Louma de Diaobé'), { le: 'la Louma de Diaobé', du: 'de la Louma de Diaobé', au: 'à la Louma de Diaobé' });
  assert.deepEqual(nommer('Village artisanal de Soumbédioune'),
    { le: 'le Village artisanal de Soumbédioune', du: 'du Village artisanal de Soumbédioune', au: 'au Village artisanal de Soumbédioune' });
  assert.deepEqual(nommer('Soumbédioune'), { le: 'Soumbédioune', du: 'de Soumbédioune', au: 'à Soumbédioune' });
});

test('construireFaq : accordéons en texte pur', () => {
  const doc = new JSDOM('').window.document;
  const bloc = construireFaq(doc, [{ question: 'Q <b>1</b> ?', reponse: 'R <img src=x onerror=alert(1)>' }]);
  assert.equal(bloc.querySelector('h2').textContent, 'Questions fréquentes');
  const details = bloc.querySelectorAll('details');
  assert.equal(details.length, 1);
  assert.equal(details[0].querySelector('summary').textContent, 'Q <b>1</b> ?');
  assert.equal(bloc.querySelector('img'), null);
  assert.equal(construireFaq(doc, []), null);
});
