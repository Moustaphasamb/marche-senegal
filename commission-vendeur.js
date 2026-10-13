// ════════════════════════════════════════
//   Ce que le vendeur reçoit d'une vente
//   (ajout et modification d'un produit)
// ════════════════════════════════════════
// Le taux vient du serveur (GET /api/shops/me/finances) : null tant que la
// commission n'a pas démarré, le vendeur reçoit alors le prix entier. Si le
// serveur ne répond pas, le taux est inconnu et rien n'est affiché : mieux
// vaut aucun montant qu'un montant faux. L'acheteur ne voit jamais ce calcul.

// Même calcul que le serveur (src/lib/commission.js) : entier inférieur.
function partVendeur(prix, tauxBps) {
  const p = Math.max(0, Math.floor(Number(prix) || 0));
  const commission = tauxBps ? Math.floor((p * tauxBps) / 10000) : 0;
  return { prix: p, commission, net: p - commission };
}

let tauxCommissionEnCours = null;
function chargerTauxCommission() {
  if (!tauxCommissionEnCours) {
    tauxCommissionEnCours = (async () => {
      try {
        const reponse = await apiCall('/api/shops/me/finances', { redirectOnUnauthorized: false });
        if (!reponse || !reponse.success || !reponse.data) return undefined;
        return reponse.data.commissionRateBps ?? null;
      } catch {
        return undefined;
      }
    })();
  }
  return tauxCommissionEnCours;
}

function montantFcfa(n) {
  return n.toLocaleString('fr-FR').replace(/\s/g, ' ') + ' FCFA';
}

function lignePartVendeur(libelle, valeur, total) {
  const ligne = document.createElement('div');
  ligne.className = total ? 'pc-row pc-total' : 'pc-row';
  const l = document.createElement('span'); l.textContent = libelle;
  const v = document.createElement('span'); v.textContent = valeur;
  ligne.append(l, v);
  return ligne;
}

function remplirPartVendeur(conteneur, prix, tauxBps) {
  if (!conteneur) return;
  conteneur.replaceChildren();
  conteneur.hidden = tauxBps === undefined;
  if (conteneur.hidden) return;
  const part = partVendeur(prix, tauxBps);
  if (tauxBps) {
    const pourcent = String(tauxBps / 100).replace('.', ',');
    conteneur.append(
      lignePartVendeur('Prix de vente', montantFcfa(part.prix)),
      lignePartVendeur(`Commission Marché Sénégal (${pourcent} %)`, '− ' + montantFcfa(part.commission))
    );
  }
  const total = lignePartVendeur('Vous recevrez', montantFcfa(part.net), true);
  // Seule ligne : pas de trait de séparation au-dessus.
  if (!tauxBps) total.style.cssText = 'border-top:0;padding-top:0;margin-top:0';
  conteneur.append(total);
}

// Détail d'une commande : la part vient toute calculée du serveur
// (GET /api/orders/:id → partsVendeur). Rien ici ne recalcule. Absente ou
// null (commande annulée, ancien serveur) : le bloc reste caché.
function remplirPartCommande(conteneur, parts) {
  if (!conteneur) return;
  conteneur.replaceChildren();
  conteneur.hidden = !parts;
  if (!parts) return;
  conteneur.append(lignePartVendeur('Prix des articles', montantFcfa(parts.prix)));
  if (parts.remise > 0) conteneur.append(lignePartVendeur('Remise de votre boutique', '− ' + montantFcfa(parts.remise)));
  if (parts.commission > 0) {
    const pourcent = String(parts.tauxBps / 100).replace('.', ',');
    conteneur.append(lignePartVendeur(`Commission Marché Sénégal (${pourcent} %)`, '− ' + montantFcfa(parts.commission)));
  }
  if (parts.livraison > 0) conteneur.append(lignePartVendeur('Livraison', '+ ' + montantFcfa(parts.livraison)));
  conteneur.append(lignePartVendeur('Vous recevez', montantFcfa(parts.recu), true));
}
