// ══════════════════════════════════════════════════════════════════
// PLAN VENDEUR — ce que le plan autorise encore, annoncé à l'avance
// ══════════════════════════════════════════════════════════════════
//
// Le plan gratuit s'arrête à dix produits. La règle était appliquée par le
// serveur mais annoncée nulle part : le vendeur la découvrait dans un message
// d'erreur, après avoir rempli tout le formulaire et envoyé ses photos.
//
// Le chiffre n'est jamais écrit ici : il arrive du serveur avec les produits
// (`meta.limiteProduits`). Deux copies d'une limite finissent toujours par
// diverger.

// Rend le bandeau dans l'élément voulu. `meta` vient de GET /api/shops/products.
// Un plan payant n'a pas de plafond : on n'affiche rien du tout plutôt qu'une
// limite inventée.
function afficherPlanVendeur(idElement, meta) {
  const hote = document.getElementById(idElement);
  if (!hote) return;

  if (!meta || meta.limiteProduits == null) {
    hote.style.display = 'none';
    return;
  }

  const limite = meta.limiteProduits;
  const restantes = Number(meta.placesRestantes) || 0;
  const utilises = limite - restantes;
  const plein = restantes === 0;

  hote.style.display = '';
  hote.className = plein ? 'plan-bandeau plan-plein' : 'plan-bandeau';
  hote.replaceChildren();

  const compte = document.createElement('strong');
  compte.textContent = `${utilises} / ${limite} produits`;
  hote.appendChild(compte);

  const suite = document.createElement('span');
  suite.textContent = plein
    ? ' — limite du plan Gratuit atteinte. Passez au plan Pro pour en publier davantage.'
    : ` — plan Gratuit. Il vous reste ${restantes} ${restantes > 1 ? 'places' : 'place'}.`;
  hote.appendChild(suite);
}

// Désactive un bouton d'ajout quand le plan est plein, en disant pourquoi :
// un bouton qui refuse sans expliquer vaut à peine mieux qu'une erreur.
function majBoutonAjout(idBouton, meta) {
  const bouton = document.getElementById(idBouton);
  if (!bouton) return;

  const plein = meta && meta.limiteProduits != null && Number(meta.placesRestantes) === 0;
  bouton.disabled = plein;
  bouton.style.opacity = plein ? '.5' : '';
  bouton.style.cursor = plein ? 'not-allowed' : 'pointer';
  bouton.title = plein ? 'Limite du plan Gratuit atteinte' : '';
}
