// Panier tout prêt : le vendeur compose un plat ou un ravitaillement, donne la
// liste de ce qu'il contient, et le vend à un prix unique (le prix du produit).
// Le bloc se monte dans #panier-pret-zone des pages d'ajout et de modification ;
// le serveur valide la même chose (src/lib/panier-pret.js du backend).
(function () {
  const TYPES = [
    ['panier-ceebu-jen', 'Ceebu Jën'],
    ['panier-yassa', 'Yassa Poulet'],
    ['panier-mafe', 'Mafé'],
    ['autre-plat', 'Un autre plat'],
    ['ravitaillement-famille', 'Ravitaillement (courses de la maison)']
  ];
  const COMPOSANTS_MAX = 30;

  let zone = null;
  let etaitPanier = false;
  let suggestions = null;

  const echapper = (texte) => String(texte ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function ligneHtml(nom = '', quantite = '') {
    return `<div class="pp-ligne">
      <input class="fi pp-nom" type="text" maxlength="80" placeholder="Ex : Riz brisé" aria-label="Article" value="${echapper(nom)}"/>
      <input class="fi pp-quantite" type="text" maxlength="30" placeholder="2 kg" aria-label="Quantité" value="${echapper(quantite)}"/>
      <button type="button" class="pp-retirer" aria-label="Retirer cet article"><i class="ic" data-ic="trash-2"></i></button>
    </div>`;
  }

  function lignes() { return zone ? [...zone.querySelectorAll('.pp-ligne')] : []; }
  const listeVide = () => lignes().every((l) => !l.querySelector('.pp-nom').value.trim());

  function ajouterLigne(nom, quantite) {
    if (lignes().length >= COMPOSANTS_MAX) return;
    zone.querySelector('.pp-liste').insertAdjacentHTML('beforeend', ligneHtml(nom, quantite));
  }

  // Une liste vide se pré-remplit avec les ingrédients du plat choisi : le
  // vendeur corrige les quantités au lieu de tout taper.
  async function proposerIngredients(service) {
    if (!listeVide() || service === 'autre-plat') return;
    if (!suggestions) {
      try {
        const r = await apiCall('/api/services');
        suggestions = r?.success ? r.data : [];
      } catch (_) { suggestions = []; }
    }
    const trouve = suggestions.find((s) => s.slug === service);
    if (!trouve?.items?.length || !listeVide()) return;
    zone.querySelector('.pp-liste').innerHTML = '';
    trouve.items.forEach((item) => ajouterLigne(item.label, ''));
  }

  function afficherDetails() {
    const actif = zone.querySelector('#pp-actif').checked;
    zone.querySelector('.pp-details').hidden = !actif;
    if (actif && lignes().length === 0) ajouterLigne();
  }

  function monter() {
    zone = document.getElementById('panier-pret-zone');
    if (!zone || zone.dataset.monte) return;
    zone.dataset.monte = '1';
    zone.classList.add('form-card', 'panier-pret-card');
    zone.innerHTML = `
      <div class="fc-title"><span class="fc-icon"><i class="ic" data-ic="shopping-basket"></i></span>Panier tout prêt <span class="pp-option">— Optionnel</span></div>
      <label class="pp-interrupteur"><input type="checkbox" id="pp-actif"/> <span>Ce produit est un panier que j'ai composé (un plat ou des courses)</span></label>
      <div class="pp-details" hidden>
        <p class="pp-aide">L'acheteur le retrouve dans les services du marché. Il paie le prix du produit pour tout le panier, sans retirer d'article.</p>
        <label class="fl" for="pp-type">Ce panier sert à préparer</label>
        <select class="fi" id="pp-type">${TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        <div class="fl pp-titre-liste">Ce que contient le panier <span class="fl-req">*</span></div>
        <div class="pp-entetes" aria-hidden="true"><span>Article</span><span>Quantité</span><span></span></div>
        <div class="pp-liste"></div>
        <button type="button" class="pp-ajouter"><i class="ic" data-ic="plus"></i> Ajouter un article</button>
      </div>`;
    zone.querySelector('#pp-actif').addEventListener('change', () => {
      afficherDetails();
      if (zone.querySelector('#pp-actif').checked) proposerIngredients(zone.querySelector('#pp-type').value);
    });
    zone.querySelector('#pp-type').addEventListener('change', (e) => proposerIngredients(e.target.value));
    zone.querySelector('.pp-ajouter').addEventListener('click', () => ajouterLigne());
    zone.querySelector('.pp-liste').addEventListener('click', (e) => {
      const bouton = e.target.closest('.pp-retirer');
      if (bouton) bouton.closest('.pp-ligne').remove();
    });
  }

  // Page de modification : reprend le panier enregistré.
  function remplir(produit) {
    monter();
    if (!zone || !produit?.packService) return;
    etaitPanier = true;
    zone.querySelector('#pp-actif').checked = true;
    zone.querySelector('#pp-type').value = produit.packService;
    zone.querySelector('.pp-liste').innerHTML = '';
    (Array.isArray(produit.packComposants) ? produit.packComposants : [])
      .forEach((c) => ajouterLigne(c.nom, c.quantite));
    afficherDetails();
  }

  // Ce qu'il faut ajouter au corps envoyé au serveur, ou un message à montrer.
  function lire() {
    if (!zone) return { ok: true, champs: {} };
    if (!zone.querySelector('#pp-actif').checked) {
      return { ok: true, champs: etaitPanier ? { packService: '' } : {} };
    }
    const composants = lignes()
      .map((l) => ({ nom: l.querySelector('.pp-nom').value.trim(), quantite: l.querySelector('.pp-quantite').value.trim() }))
      .filter((c) => c.nom);
    if (!composants.length) return { ok: false, message: 'Indiquez au moins un article du panier' };
    return { ok: true, champs: { packService: zone.querySelector('#pp-type').value, packComposants: composants } };
  }

  window.PanierPretVendeur = { monter, remplir, lire };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', monter);
  else monter();
})();
