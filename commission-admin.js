// ════════════════════════════════════════
//   Réglage de la commission (page admin)
// ════════════════════════════════════════
// Le serveur garde le taux et sa date de départ (GET/PATCH
// /api/admin/finances/reglages). Le taux est figé sur chaque commande à sa
// création : un changement ne touche que les commandes suivantes. Rien n'est
// envoyé sans une confirmation qui dit en clair ce qui va changer.

function pourcentCommission(bps) {
  return String(bps / 100).replace('.', ',') + ' %';
}

function dateCommission(iso) {
  return new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Dakar', day: 'numeric', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function texteEtat(d, maintenant = new Date()) {
  if (d.tauxEnVigueur != null) {
    return `Commission de ${pourcentCommission(d.tauxEnVigueur)} en vigueur depuis le ${dateCommission(d.commissionStartAt)}.`;
  }
  if (d.commissionStartAt && new Date(d.commissionStartAt) > maintenant) {
    return `Commission de ${pourcentCommission(d.commissionRateBps)} prévue à partir du ${dateCommission(d.commissionStartAt)}. Pour l'instant, aucune commission : les vendeurs reçoivent le prix entier.`;
  }
  return 'Aucune commission pour l\'instant : les vendeurs reçoivent le prix entier.';
}

function corpsDepuisFormulaire({ pourcent, mode, date }, maintenant = new Date()) {
  if (mode === 'aucune') return { corps: { commissionStartAt: null } };
  const valeur = Number(String(pourcent ?? '').trim().replace(',', '.'));
  if (String(pourcent ?? '').trim() === '' || !Number.isFinite(valeur) || valeur < 0 || valeur > 30) {
    return { erreur: 'Le taux doit être entre 0 et 30 %' };
  }
  const commissionRateBps = Math.round(valeur * 100);
  if (mode === 'maintenant') return { corps: { commissionRateBps, commissionStartAt: maintenant.toISOString() } };
  if (!date) return { erreur: 'Choisissez la date de départ' };
  const depart = new Date(date);
  if (Number.isNaN(depart.valueOf())) return { erreur: 'Choisissez la date de départ' };
  if (depart < maintenant) return { erreur: 'La date de départ ne peut pas être dans le passé' };
  return { corps: { commissionRateBps, commissionStartAt: depart.toISOString() } };
}

function resumeChangement(corps, maintenant = new Date()) {
  if (corps.commissionStartAt === null) {
    return 'Les nouvelles commandes n\'auront plus aucune commission : les vendeurs recevront le prix entier. Les commandes déjà passées ne changent pas.';
  }
  const quand = new Date(corps.commissionStartAt) - maintenant < 60000 ? 'dès maintenant'
    : `à partir du ${dateCommission(corps.commissionStartAt)}`;
  return `Les nouvelles commandes paieront ${pourcentCommission(corps.commissionRateBps)} de commission ${quand}. Les commandes déjà passées ne changent pas.`;
}

function ligneHistorique(h) {
  const c = h.changements || {};
  const morceaux = [];
  if ('commissionRateBps' in c) morceaux.push(`taux ${pourcentCommission(c.commissionRateBps)}`);
  if ('commissionStartAt' in c) morceaux.push(c.commissionStartAt === null ? 'commission arrêtée' : `départ le ${dateCommission(c.commissionStartAt)}`);
  const li = document.createElement('li');
  li.textContent = `${dateCommission(h.date)} — ${h.auteur || 'admin'} : ${morceaux.join(', ') || 'autre réglage'}`;
  return li;
}

let corpsEnAttente = null;

function erreurCommission(texte) {
  document.getElementById('com-erreur').textContent = texte || '';
}

async function chargerCommission() {
  const etat = document.getElementById('com-etat');
  const bouton = document.getElementById('com-enregistrer');
  let reponse;
  try { reponse = await apiCall('/api/admin/finances/reglages'); } catch { reponse = null; }
  if (!reponse || !reponse.success || !reponse.data) {
    etat.textContent = 'Réglage de la commission impossible à lire pour le moment. Rechargez la page dans quelques minutes.';
    bouton.disabled = true;
    return;
  }
  const d = reponse.data;
  bouton.disabled = false;
  etat.textContent = texteEtat(d);
  document.getElementById('com-taux').value = String((d.commissionRateBps ?? 500) / 100);
  const liste = document.getElementById('com-historique');
  liste.replaceChildren(...(d.historique || []).map(ligneHistorique));
  if (!d.historique?.length) {
    const vide = document.createElement('li');
    vide.textContent = 'Aucun changement pour l\'instant.';
    liste.append(vide);
  }
}

function demanderConfirmation() {
  erreurCommission('');
  const mode = document.querySelector('input[name="com-mode"]:checked')?.value;
  if (!mode) { erreurCommission('Choisissez quand la commission s\'applique'); return; }
  const { corps, erreur } = corpsDepuisFormulaire({ pourcent: document.getElementById('com-taux').value, mode,
    date: document.getElementById('com-date').value });
  if (erreur) { erreurCommission(erreur); return; }
  corpsEnAttente = corps;
  document.getElementById('com-resume').textContent = resumeChangement(corps);
  document.getElementById('com-confirmation').hidden = false;
}

function annulerConfirmation() {
  corpsEnAttente = null;
  document.getElementById('com-confirmation').hidden = true;
}

async function confirmerCommission() {
  if (!corpsEnAttente) return;
  const corps = corpsEnAttente;
  annulerConfirmation();
  let reponse;
  try {
    reponse = await apiCall('/api/admin/finances/reglages', { method: 'PATCH', body: JSON.stringify(corps) });
  } catch { reponse = null; }
  if (!reponse || !reponse.success) {
    erreurCommission(reponse?.message || 'Enregistrement impossible, réessayez');
    return;
  }
  if (typeof showToast === 'function') showToast('✓ Commission enregistrée');
  await chargerCommission();
}
