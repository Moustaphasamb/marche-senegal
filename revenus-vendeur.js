// ════════════════════════════════════════
//   L'argent du vendeur, lu dans le registre
//   (page « Mes revenus »)
// ════════════════════════════════════════
// Les trois montants viennent de GET /api/shops/me/finances, c'est-à-dire du
// grand livre du serveur : aucun calcul ici. Si le serveur ne répond pas, on
// affiche « — » plutôt qu'un montant faux.

const ETATS_VERSEMENT = {
  SUCCEEDED: { libelle: 'Versé', ton: 'vert' },
  FAILED: { libelle: 'Échoué', ton: 'rouge' },
  CANCELLED: { libelle: 'Annulé', ton: 'neutre' }
};

function fcfa(n) {
  return (Number(n) || 0).toLocaleString('fr-FR').replace(/\s/g, ' ') + ' FCFA';
}

function cellule(tag, cls, texte) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

function remplirArgent(data) {
  const ok = Boolean(data);
  document.getElementById('total-bloque').textContent = ok ? fcfa(data.bloque) : '—';
  document.getElementById('total-disponible').textContent = ok ? fcfa(data.disponible) : '—';
  document.getElementById('total-verse').textContent = ok ? fcfa(data.verse) : '—';
  document.getElementById('argent-indisponible').hidden = ok;
  const envoi = document.getElementById('en-versement');
  envoi.hidden = !(ok && data.enVersement > 0);
  envoi.textContent = envoi.hidden ? '' : `+ ${fcfa(data.enVersement)} en cours d’envoi`;
}

function remplirVersements(versements) {
  const carte = document.getElementById('carte-versements');
  carte.hidden = !versements?.length;
  if (carte.hidden) return;
  const frag = document.createDocumentFragment();
  for (const v of versements) {
    const etat = ETATS_VERSEMENT[v.status] || { libelle: 'En cours', ton: 'or' };
    const tr = cellule('tr');
    tr.append(
      cellule('td', 'td-cmd', v.numero || '—'),
      cellule('td', 'td-date', v.regleLe
        ? new Date(v.regleLe).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'),
      cellule('td', 'td-montant', fcfa(v.montant)),
      cellule('td', 'td-date', v.waveId || '—')
    );
    const td = cellule('td');
    td.append(cellule('span', 'etat ton-' + etat.ton, etat.libelle));
    tr.append(td);
    frag.append(tr);
  }
  document.getElementById('versements').replaceChildren(frag);
}

async function chargerFinances() {
  let data;
  try {
    const reponse = await apiCall('/api/shops/me/finances', { redirectOnUnauthorized: false });
    if (reponse && reponse.success && reponse.data) data = reponse.data;
  } catch { /* data reste vide : « — » affiché */ }
  remplirArgent(data);
  remplirVersements(data?.versements);
  return data;
}

// ── Relevé CSV ──
// Le Sénégal est à l'heure UTC toute l'année : la date du jour en UTC est
// celle de Dakar.
function periodeParDefaut(aujourdhui = new Date()) {
  const au = aujourdhui.toISOString().slice(0, 10);
  return { du: au.slice(0, 8) + '01', au };
}

function erreurPeriode(du, au) {
  if (!du || !au) return 'Choisissez les deux dates du relevé';
  const ecart = Date.parse(au) - Date.parse(du);
  if (ecart < 0) return 'La date de début doit être avant la date de fin';
  if (ecart > 92 * 86400000) return 'Un relevé couvre 92 jours au plus';
  return null;
}

async function telechargerReleve(du, au) {
  const reponse = await fetch(`${API_URL}/api/shops/me/releve?du=${encodeURIComponent(du)}&au=${encodeURIComponent(au)}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });
  if (!reponse.ok) {
    let message = 'Relevé indisponible pour le moment, réessayez plus tard';
    try { message = (await reponse.json()).message || message; } catch { /* corps illisible */ }
    throw new Error(message);
  }
  const nom = `releve-marche-senegal-${du}-au-${au}.csv`;
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(await reponse.blob());
  lien.download = nom;
  document.body.append(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(lien.href);
  return nom;
}
