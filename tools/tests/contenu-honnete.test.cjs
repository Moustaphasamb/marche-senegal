// Contenu de démonstration servi comme s'il était réel.
//
// Les pages ont été écrites autour d'une fiche produit d'exemple — un boubou
// wax de « Mode Fatou Ndoye » — puis branchées sur l'API par-dessus. Le
// contenu d'exemple n'a jamais été retiré du HTML. Il en reste trois couches,
// de la moins à la plus grave :
//
//   1. Ce que le JavaScript remplace au chargement (note, nombre d'avis,
//      cartes d'avis). Visible le temps que l'API réponde, et indéfiniment si
//      elle échoue ou si le visiteur lit la source.
//   2. Ce que le JavaScript ne remplace JAMAIS : l'onglet « Caractéristiques »
//      et le Q&A de la fiche produit. Ces blocs s'affichent tels quels sur
//      toutes les fiches, quel que soit le produit réellement chargé.
//   3. Des engagements commerciaux attribués à un vendeur réel : « je livre
//      dans toutes les 14 régions », « frais entre 2 500 et 5 000 FCFA »,
//      « Garantie 7 jours retour ». Le vendeur affiché n'a jamais écrit cela
//      et n'est pas tenu de l'honorer.
//
// Le décret 2008-718 impose une information exacte, et la loi 2021-25 punit
// la pratique commerciale trompeuse. Des avis fabriqués marqués « ✓ Achat
// vérifié » en sont l'exemple le plus net.
//
// Ce test lit le HTML *servi*, pas le DOM après exécution : ce qui compte est
// ce qu'un visiteur reçoit avant que le moindre script ne tourne.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');

const racine = path.resolve(__dirname, '../..');
const pages = fs
  .readdirSync(racine)
  .filter((f) => f.endsWith('.html'));

const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const doc = (f) => new JSDOM(lire(f)).window.document;

// Le balisage seul, scripts retirés.
//
// La distinction est essentielle : « ✓ Achat vérifié » écrit dans le HTML est
// une certification fabriquée, alors que le même texte dans buildReviewCard()
// est le code qui appose le badge sur un avis réellement vérifié. Le premier
// est interdit, le second est exactement ce qu'on veut garder.
const balisage = (f) => lire(f).replace(/<script[\s\S]*?<\/script>/gi, '');

// Le texte visible d'un élément, espaces normalisés. Un bloc que l'on a vidé
// mais dont il reste l'ossature (<div class="rv-name"></div>) rend '' et passe.
const texte = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();

// Un gabarit vide est légitime : le JavaScript a besoin de l'ossature pour y
// écrire les vraies données. Ce qui est interdit, c'est qu'il porte déjà un
// contenu qui se lit comme une information réelle.
function contenusDe(fichier, selecteur) {
  return [...doc(fichier).querySelectorAll(selecteur)]
    .map(texte)
    .filter((t) => t.length > 0);
}

// ── 1. Avis fabriqués ────────────────────────────────────────────────────────

test('aucune page ne sert un avis client ecrit en dur', () => {
  const fautifs = [];
  for (const page of pages) {
    for (const selecteur of ['.rv-name', '.rv-text', '.rv-date']) {
      for (const contenu of contenusDe(page, selecteur)) {
        fautifs.push(`${page} → ${selecteur} : « ${contenu.slice(0, 60)} »`);
      }
    }
  }
  assert.deepEqual(
    fautifs,
    [],
    'Un avis présent dans le HTML servi n\'a pas été écrit par un acheteur :\n' + fautifs.join('\n')
  );
});

test('aucune page ne certifie un achat qui n a pas eu lieu', () => {
  const fautifs = pages.filter((page) => balisage(page).includes('Achat vérifié'));
  assert.deepEqual(
    fautifs,
    [],
    '« ✓ Achat vérifié » sur un avis fabriqué est la mention la plus trompeuse du lot : ' +
      fautifs.join(', ')
  );
});

// Les noms des personnes inventées pour la démonstration. Ils ne doivent plus
// apparaître nulle part : ce sont des témoignages attribués à des gens qui
// n'existent pas.
const PERSONNES_INVENTEES = [
  'Moussa Sow',
  'Aissatou Ba',
  'Rokhaya Fall',
  'Ibrahima Diallo',
  'Ousmane Fall'
];

test('les temoins inventes ont disparu de toutes les pages', () => {
  const fautifs = [];
  for (const page of pages) {
    const html = balisage(page);
    for (const nom of PERSONNES_INVENTEES) {
      if (html.includes(nom)) fautifs.push(`${page} → ${nom}`);
    }
  }
  assert.deepEqual(fautifs, [], 'Témoignages attribués à des personnes inventées :\n' + fautifs.join('\n'));
});

// ── 2. Blocs que le JavaScript ne remplace jamais ────────────────────────────

test('la fiche produit ne decrit pas un produit d exemple', () => {
  // L'onglet « Caractéristiques » n'est réécrit par aucun script : ce qu'il
  // contient s'affiche à l'identique sur chaque produit du catalogue.
  const lignes = contenusDe('marche-senegal-produit.html', '.spec-table td');
  assert.deepEqual(
    lignes,
    [],
    'Ces caractéristiques s\'affichent sur TOUTES les fiches produits :\n' + lignes.join('\n')
  );
});

test('la fiche produit ne fait pas parler le vendeur a sa place', () => {
  // Même problème pour le Q&A : quatre réponses signées du vendeur, dont des
  // engagements de livraison et de prix qu'il n'a jamais pris.
  const reponses = contenusDe('marche-senegal-produit.html', '.qa-a');
  assert.deepEqual(
    reponses,
    [],
    'Réponses attribuées au vendeur sans qu\'il les ait écrites :\n' + reponses.join('\n')
  );
});

// ── 3. Chiffres commerciaux fabriqués ────────────────────────────────────────

test('aucun chiffre de vente ou de notation n est ecrit en dur', () => {
  const gabarits = {
    'marche-senegal-produit.html': ['.pi-rating-num', '.pi-rating-count', '.pi-sales', '.rs-num', '.rs-count'],
    'marche-senegal-boutique.html': ['.sh-rating-num', '.sh-reviews-count']
  };
  const fautifs = [];
  for (const [page, selecteurs] of Object.entries(gabarits)) {
    if (!pages.includes(page)) continue;
    for (const selecteur of selecteurs) {
      for (const contenu of contenusDe(page, selecteur)) {
        fautifs.push(`${page} → ${selecteur} : « ${contenu} »`);
      }
    }
  }
  assert.deepEqual(fautifs, [], 'Chiffres inventés servis avant toute réponse de l\'API :\n' + fautifs.join('\n'));
});

test('aucune fausse reduction n est affichee', () => {
  // Un prix barré que rien ne justifie est une réduction fictive : le prix de
  // référence n'a jamais été pratiqué. C'est le cas d'école de la pratique
  // commerciale trompeuse.
  const fautifs = [];
  for (const selecteur of ['.pi-old', '.pi-discount']) {
    for (const contenu of contenusDe('marche-senegal-produit.html', selecteur)) {
      fautifs.push(`${selecteur} : « ${contenu} »`);
    }
  }
  assert.deepEqual(fautifs, [], 'Réduction affichée sans prix de référence réel :\n' + fautifs.join('\n'));
});

test('aucune rarete artificielle n est affichee', () => {
  // « Il ne reste que 4 pièces » écrit en dur ne décrit aucun stock réel : la
  // phrase est la même quel que soit le produit et quel que soit l'inventaire.
  const stock = contenusDe('marche-senegal-produit.html', '.stock-row');
  assert.deepEqual(stock, [], 'Urgence fabriquée, identique sur toutes les fiches : ' + stock.join(' | '));
});

// ── 4. Allégations que rien ne garantit ──────────────────────────────────────

// Chaque entrée dit ce qui est promis et pourquoi la promesse n'est pas tenue.
const ALLEGATIONS_NON_TENUES = [
  ['Livreur certifié', 'aucune certification de livreur n\'existe dans le modèle de données'],
  ['100% coton certifié', 'aucun certificat de composition n\'est collecté'],
  ['7 jours retour · Échange ou remboursement', 'promesse du vendeur, pas de la plateforme, et hors périssables']
];

test('aucune page ne promet ce que le code ne tient pas', () => {
  const fautifs = [];
  for (const page of pages) {
    const html = balisage(page);
    for (const [phrase, raison] of ALLEGATIONS_NON_TENUES) {
      if (html.includes(phrase)) fautifs.push(`${page} → « ${phrase} » (${raison})`);
    }
  }
  assert.deepEqual(fautifs, [], 'Allégations sans contrepartie dans le code :\n' + fautifs.join('\n'));
});

// ── 5. Catalogues d'exemple servis avant l'API ───────────────────────────────

// Une grille remplie côté serveur avec des produits ou des boutiques inventés
// est toujours un catalogue faux : elle s'affiche avant que le script ne
// tourne, elle reste si l'API échoue, et c'est elle que lit un moteur de
// recherche. Le correctif du panier fantôme avait traité le clic ; celui-ci
// traite le contenu lui-même.
const GRILLES_A_VIDER = [
  ['marche-senegal-accueil.html', '#products-grid .prod-card', 'produits d\'exemple de l\'accueil'],
  ['marche-senegal-accueil.html', '#shops-grid .shop-card',    'boutiques vedettes d\'exemple'],
  ['marche-senegal-marche.html',  '#shops-view .shop-card',    'boutiques d\'exemple de la page marché'],
  ['marche-senegal-marche.html',  '#shops-view .prod-card',    'produits d\'exemple de la page marché']
];

test('aucune grille ne part du serveur avec un catalogue invente', () => {
  const fautifs = [];
  for (const [page, selecteur, quoi] of GRILLES_A_VIDER) {
    if (!pages.includes(page)) continue;
    const combien = doc(page).querySelectorAll(selecteur).length;
    if (combien > 0) fautifs.push(`${page} → ${combien} ${quoi}`);
  }
  assert.deepEqual(fautifs, [], 'Catalogues fabriqués servis par le serveur :\n' + fautifs.join('\n'));
});

test('aucun badge verifie n est appose avant de connaitre la boutique', () => {
  // Le badge n'a de sens que lu depuis shop.isVerified. Écrit dans le
  // balisage, il certifie une boutique que la page n'a pas encore chargée —
  // y compris une boutique en attente de validation.
  const fautifs = [];
  for (const page of pages) {
    const d = doc(page);
    for (const el of d.querySelectorAll('.sh-verified, .shop-verified, .prod-shop')) {
      const t = texte(el);
      if (t.includes('Vérifié')) fautifs.push(`${page} → « ${t.slice(0, 50)} »`);
    }
  }
  assert.deepEqual(fautifs, [], 'Badge « Vérifié » apposé sans donnée :\n' + fautifs.join('\n'));
});

test('aucune page n annonce un moyen de paiement que le serveur n a pas confirme', () => {
  // /api/payments/methods existe pour n'annoncer que ce qui encaisse
  // vraiment : en production sans clé Wave, elle renvoie une liste vide.
  // Lister « Wave · Orange Money · Free Money » dans le balisage contourne
  // cette vérification et promet trois encaissements dont aucun n'est actif.
  const fautifs = [];
  for (const page of pages) {
    if (/Wave\s*·\s*Orange Money/.test(balisage(page))) fautifs.push(page);
  }
  assert.deepEqual(fautifs, [], 'Moyens de paiement listés en dur : ' + fautifs.join(', '));
});
