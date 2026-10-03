// Ce que lit un moteur de recherche ou un robot IA, qui n'exécute pas le
// JavaScript, quand il ouvre /marches/<slug>, /boutiques/<id> ou /produits/<id>.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { remplirPage, marquerIntrouvable, urlPropre, echapper } = require('../../api/_lib/remplir-page.js');

const MODELE = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>' +
  '<title>Boutique — Marché Sénégal</title><meta name="description" content="générique"/>' +
  '</head><body class="x"><p>page</p></body></html>';

const MARCHE = { id: 'm1', slug: 'sandaga', name: 'Marché Sandaga', city: 'Dakar', region: 'Dakar',
  address: 'Plateau, Dakar', latitude: 14.66996, longitude: -17.43792,
  description: 'Le marché le plus connu du pays.', horaires: '8 h – 20 h', conseils: 'Attention aux pickpockets.',
  imageUrl: 'assets/marches/sandaga.jpg', shops: [{ id: 's1', name: 'Mode Fatou Ndoye' }] };
const BOUTIQUE = { id: 's1', name: 'Mode Fatou Ndoye', description: 'Wax et bazin.', locationType: 'MARKET',
  market: { id: 'm1', slug: 'sandaga', name: 'Marché Sandaga', city: 'Dakar' }, avatarUrl: null, bannerUrl: null,
  products: [{ id: 'p1', name: 'Tissu wax', price: 4500 }] };
const PRODUIT = { id: 'p1', name: 'Tissu wax hollandais', description: '100% coton.', price: 4500, stock: 35, images: [],
  shop: { id: 's1', name: 'Mode Fatou Ndoye', market: { id: 'm1', name: 'Marché Sandaga', city: 'Dakar' } } };

const jsonLd = html => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const texte = html => html.replace(/<script[\s\S]*?<\/script>/g, '');

test('marché : titre, description, canonique, base, identifiant injecté', () => {
  const html = remplirPage(MODELE, 'marche', MARCHE);
  assert.match(html, /<title>Marché Sandaga, Dakar — Marché Sénégal<\/title>/);
  assert.match(html, /<meta name="description" content="Le marché le plus connu du pays\."/);
  assert.match(html, /<link rel="canonical" href="https:\/\/marchesenegal.sn\/marches\/sandaga">/);
  assert.match(html, /<head><base href="\/">/);
  assert.match(html, /window\.__MS_PAGE__=\{"type":"marche","id":"m1"\}/);
  assert.match(html, /property="og:image" content="https:\/\/marchesenegal.sn\/assets\/marches\/sandaga\.jpg"/);
  assert.equal(jsonLd(html)['@type'], 'Place');
  assert.equal(jsonLd(html).geo.latitude, 14.67);
  assert.equal(jsonLd(html).geo.longitude, -17.438);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.equal((html.match(/name="description"/g) || []).length, 1);
});

test('marché : contenu lisible avec horaires et liens vers les boutiques, en fin de page', () => {
  const html = remplirPage(MODELE, 'marche', MARCHE);
  const bloc = html.match(/<section data-ssr>[\s\S]*?<\/section>/)[0];
  assert.match(bloc, /<h1>Marché Sandaga<\/h1>/);
  assert.match(bloc, /8 h – 20 h/);
  assert.match(bloc, /href="\/boutiques\/s1"/);
  assert.ok(html.indexOf('data-ssr') > html.indexOf('<p>page</p>'), 'bloc placé après le contenu de la page');
  assert.match(html, /<\/section><script>document\.querySelector\("\[data-ssr\]"\)\.remove\(\)<\/script><\/body>/);
});

test('boutique : Store, lien vers son marché et ses produits', () => {
  const html = remplirPage(MODELE, 'boutique', BOUTIQUE);
  assert.match(html, /<title>Mode Fatou Ndoye — Marché Sandaga, Dakar — Marché Sénégal<\/title>/);
  assert.equal(jsonLd(html)['@type'], 'Store');
  assert.match(html, /href="\/marches\/sandaga"/);
  assert.match(html, /href="\/produits\/p1">Tissu wax — 4 500 FCFA/);
  assert.match(html, /<link rel="canonical" href="https:\/\/marchesenegal.sn\/boutiques\/s1">/);
});

test('produit : Product avec offre en XOF, sans image', () => {
  const html = remplirPage(MODELE, 'produit', PRODUIT);
  assert.match(html, /<title>Tissu wax hollandais — 4 500 FCFA — Marché Sénégal<\/title>/);
  const ld = jsonLd(html);
  assert.equal(ld['@type'], 'Product');
  assert.equal(ld.offers.priceCurrency, 'XOF');
  assert.equal(ld.offers.price, 4500);
  assert.equal(ld.offers.availability, 'https://schema.org/InStock');
  assert.equal(ld.image, undefined);
  assert.doesNotMatch(html, /og:image/);
  assert.doesNotMatch(texte(html), /undefined|null/);
});

test('produit épuisé : OutOfStock', () => {
  const html = remplirPage(MODELE, 'produit', { ...PRODUIT, stock: 0 });
  assert.equal(jsonLd(html).offers.availability, 'https://schema.org/OutOfStock');
});

// Forme réelle d'une boutique « Autre lieu » : rattachée au pseudo-marché du même nom.
const AUTRE_LIEU = { id: '00000000-0000-0000-0000-000000000001', slug: null, name: 'Autre lieu', city: 'Hors marché' };

test('boutique hors marché sans description : son quartier, jamais « Autre lieu »', () => {
  const html = remplirPage(MODELE, 'boutique', { id: 's2', name: 'Chez Awa', locationType: 'CUSTOM',
    locationName: 'Parcelles', locationCity: 'Dakar', market: AUTRE_LIEU, products: [] });
  assert.match(html, /<title>Chez Awa — Parcelles, Dakar — Marché Sénégal<\/title>/);
  assert.doesNotMatch(texte(html), /undefined|null|href="\/marches\/|Autre lieu|Hors marché/);
  assert.match(html, /<meta name="description" content="Chez Awa, Parcelles, Dakar/);
  assert.equal(jsonLd(html).address.addressLocality, 'Dakar');
});

test('produit d une boutique hors marché : vendu à son quartier', () => {
  const html = remplirPage(MODELE, 'produit', { ...PRODUIT, shop: { id: 's2', name: 'Chez Awa', locationType: 'CUSTOM',
    locationName: 'Parcelles', locationCity: 'Dakar', market: AUTRE_LIEU } });
  assert.match(html, /Vendu par <a href="\/boutiques\/s2">Chez Awa<\/a>, Parcelles, Dakar/);
  assert.doesNotMatch(texte(html), /Autre lieu|Hors marché/);
});

test('marché sans description ni boutique : description de repli', () => {
  const html = remplirPage(MODELE, 'marche', { id: 'm9', slug: 'tilene', name: 'Marché Tilène', city: 'Dakar', shops: [] });
  assert.match(html, /<meta name="description" content="Boutiques et produits du Marché Tilène à Dakar/);
  assert.doesNotMatch(texte(html), /undefined|null/);
});

test('texte vendeur piégé : échappé partout, JSON-LD non refermable', () => {
  const piege = 'Awa "<script>alert(1)</script>';
  const html = remplirPage(MODELE, 'boutique', { ...BOUTIQUE, name: piege, description: piege });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /Awa &quot;&lt;script&gt;/);
  assert.equal(jsonLd(html).name, piege);
});

test('description longue : coupée à 155 caractères au mot', () => {
  const long = 'mot '.repeat(60);
  const html = remplirPage(MODELE, 'marche', { ...MARCHE, description: long });
  const d = html.match(/<meta name="description" content="([^"]*)"/)[1];
  assert.ok(d.length <= 155, `longueur ${d.length}`);
  assert.match(d, /mot…$/);
});

test('marché sans slug : pas d adresse propre', () => {
  assert.equal(urlPropre('marche', { id: 'x' }), null);
  assert.equal(urlPropre('produit', { id: 'p1' }), 'https://marchesenegal.sn/produits/p1');
});

test('introuvable : noindex', () => {
  assert.match(marquerIntrouvable(MODELE), /<meta name="robots" content="noindex"><\/head>/);
});

test('echapper', () => {
  assert.equal(echapper(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  assert.equal(echapper(null), '');
});

test('marché : FAQ lisible et balisage FAQPage identique', () => {
  const html = remplirPage(MODELE, 'marche', MARCHE, { libelles: {} });
  const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const faq = lds.find(l => l['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage absent');
  assert.equal(faq.mainEntity[0].name, 'Où se trouve le Marché Sandaga ?');
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, 'Plateau, Dakar (région de Dakar).');
  const bloc = html.match(/<section data-ssr>[\s\S]*?<\/section>/)[0];
  assert.match(bloc, /<h2>Questions fréquentes<\/h2>/);
  assert.match(bloc, /<h3>Quels sont les horaires du Marché Sandaga \?<\/h3><p>8 h – 20 h<\/p>/);
});

test('marché réel sans description : indexé quand même (décision de Moustapha)', () => {
  const html = remplirPage(MODELE, 'marche', { id: 'm9', slug: 'bakel', name: 'Marché de Bakel', city: 'Bakel', region: 'Tambacounda', shops: [] });
  assert.doesNotMatch(html, /noindex/);
  assert.ok(html.includes('<link rel="canonical" href="https://marchesenegal.sn/marches/bakel">'));
});

test('marché sans slug (Autre lieu ouvert par son identifiant) : non indexé', () => {
  const html = remplirPage(MODELE, 'marche', { id: '00000000-0000-0000-0000-000000000001', slug: null, name: 'Autre lieu', city: 'Hors marché', shops: [] });
  assert.match(html, /<meta name="robots" content="noindex">/);
});
