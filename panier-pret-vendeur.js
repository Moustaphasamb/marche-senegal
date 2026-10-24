// Panier tout prêt : le vendeur compose un plat ou un ravitaillement, donne la
// liste de ce qu'il contient, et le vend à un prix unique (le prix du produit).
// Le bloc se monte dans #panier-pret-zone des pages d'ajout et de modification ;
// le serveur valide la même chose (src/lib/panier-pret.js du backend).
(function () {
  const PLATS = [
    ['panier-ceebu-jen', 'Ceebu Jën'],
    ['panier-yassa', 'Yassa Poulet'],
    ['panier-mafe', 'Mafé'],
    ['autre-plat', 'Un autre plat']
  ];
  const RAVITAILLEMENT = 'ravitaillement-famille';
  const COMPOSANTS_MAX = 30;

  let zone = null;
  let etaitPanier = false;
  let suggestions = null;
  // Vrai tant que la liste affichée est celle proposée, sans retouche du
  // vendeur : changer de plat ou de genre peut alors la remplacer.
  let listeProposee = false;

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

  const genre = () => zone.querySelector('input[name="pp-genre"]:checked')?.value || 'plat';
  const service = () => (genre() === 'ravitaillement' ? RAVITAILLEMENT : zone.querySelector('#pp-type').value);

  // Un plat ou un ravitaillement : le choix du plat n'a de sens que pour un plat.
  function afficherGenre() {
    const ravitaillement = genre() === 'ravitaillement';
    zone.querySelector('.pp-plat').hidden = ravitaillement;
    zone.querySelector('.pp-titre-liste-texte').textContent = ravitaillement
      ? 'Ce que contient le ravitaillement'
      : 'Ce que contient le panier';
  }

  // La liste se pré-remplit avec les ingrédients du plat, ou les courses du
  // ravitaillement : le vendeur corrige les quantités au lieu de tout taper.
  async function proposerIngredients() {
    const voulu = service();
    if (!listeVide() && !listeProposee) return;
    if (voulu === 'autre-plat') {
      if (listeProposee) { zone.querySelector('.pp-liste').innerHTML = ''; ajouterLigne(); listeProposee = false; }
      return;
    }
    if (!suggestions) {
      try {
        const r = await apiCall('/api/services');
        suggestions = r?.success ? r.data : [];
      } catch (_) { suggestions = []; }
    }
    const trouve = suggestions.find((s) => s.slug === voulu);
    if (!trouve?.items?.length || service() !== voulu || (!listeVide() && !listeProposee)) return;
    zone.querySelector('.pp-liste').innerHTML = '';
    trouve.items.forEach((item) => ajouterLigne(item.label, ''));
    listeProposee = true;
  }

  function afficherDetails() {
    const actif = zone.querySelector('#pp-actif').checked;
    zone.querySelector('.pp-details').hidden = !actif;
    if (actif && lignes().length === 0) ajouterLigne();
  }

  // « Créer un panier » (menu vendeur) ouvre la page d'ajout avec ?panier=1,
  // et &type=ravitaillement pour commencer par un ravitaillement.
  // Sans ce paramètre, « Ajouter un produit » reste un produit ordinaire.
  const parametres = () => new URLSearchParams(window.location.search);
  const modeCreation = () => parametres().get('panier') === '1';

  // La page d'ajout devient « Créer un panier » : le panier en tête, les
  // tailles et couleurs cachées, le rayon Alimentation choisi d'avance.
  function preparerPageCreation() {
    zone.querySelector('#pp-actif').checked = true;
    zone.querySelector('.pp-interrupteur').hidden = true;
    zone.querySelector('.pp-option').hidden = true;
    if (parametres().get('type') === 'ravitaillement') {
      zone.querySelector('input[name="pp-genre"][value="ravitaillement"]').checked = true;
    }
    afficherGenre();
    afficherDetails();
    proposerIngredients();

    document.title = 'Créer un panier — Marché Sénégal';
    const titre = document.querySelector('.tb-title');
    if (titre) titre.innerHTML = '<i class="ic" data-ic="shopping-basket"></i> Créer un panier';
    const premiere = document.querySelector('.form-card:not(#panier-pret-zone)');
    if (premiere) premiere.parentNode.insertBefore(zone, premiere);
    const variantes = document.querySelector('.vrow')?.closest('.form-card');
    if (variantes) variantes.hidden = true;
    const publier = document.querySelector('.publish-btn');
    if (publier) publier.innerHTML = '<i class="ic" data-ic="rocket"></i> Publier le panier';

    const rayons = document.getElementById('cat-grid');
    if (!rayons) return;
    const choisirAlimentation = () => {
      const boutons = [...rayons.querySelectorAll('.cg-btn')];
      if (!boutons.length) return false;
      const alimentation = boutons.find((b) => /alimentation/i.test(b.textContent));
      if (alimentation && !rayons.querySelector('.cg-btn.sel')) alimentation.click();
      return true;
    };
    if (choisirAlimentation()) return;
    const observateur = new MutationObserver(() => { if (choisirAlimentation()) observateur.disconnect(); });
    observateur.observe(rayons, { childList: true, subtree: true });
  }

  function monter() {
    zone = document.getElementById('panier-pret-zone');
    if (!zone || zone.dataset.monte) return;
    const page = zone.dataset.page;
    if (page === 'ajout' && !modeCreation()) { zone.hidden = true; zone = null; return; }
    // Modification : le bloc n'apparaît que pour un produit déjà panier (remplir).
    if (page === 'modifier') zone.hidden = true;
    zone.dataset.monte = '1';
    zone.classList.add('form-card', 'panier-pret-card');
    zone.innerHTML = `
      <div class="fc-title"><span class="fc-icon"><i class="ic" data-ic="shopping-basket"></i></span>Panier tout prêt <span class="pp-option">— Optionnel</span></div>
      <label class="pp-interrupteur"><input type="checkbox" id="pp-actif"/> <span>Ce produit est un panier que j'ai composé (un plat ou des courses)</span></label>
      <div class="pp-details" hidden>
        <div class="fl">Que voulez-vous vendre ?</div>
        <div class="pp-genre" role="radiogroup" aria-label="Que voulez-vous vendre ?">
          <label class="pp-genre-choix"><input type="radio" name="pp-genre" value="plat" checked/><span><strong>Un plat</strong><small>Tous les ingrédients d'un repas</small></span></label>
          <label class="pp-genre-choix"><input type="radio" name="pp-genre" value="ravitaillement"/><span><strong>Un ravitaillement</strong><small>Les courses de la maison, pour la semaine ou le mois</small></span></label>
        </div>
        <div class="pp-plat">
          <label class="fl" for="pp-type">Quel plat ?</label>
          <select class="fi" id="pp-type">${PLATS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        </div>
        <p class="pp-aide">L'acheteur le retrouve dans les services du marché. Il paie votre prix pour tout le panier, sans retirer d'article.</p>
        <div class="fl pp-titre-liste"><span class="pp-titre-liste-texte">Ce que contient le panier</span> <span class="fl-req">*</span></div>
        <div class="pp-entetes" aria-hidden="true"><span>Article</span><span>Quantité</span><span></span></div>
        <div class="pp-liste"></div>
        <button type="button" class="pp-ajouter"><i class="ic" data-ic="plus"></i> Ajouter un article</button>
      </div>`;
    zone.querySelector('#pp-actif').addEventListener('change', () => {
      afficherDetails();
      if (zone.querySelector('#pp-actif').checked) proposerIngredients();
    });
    zone.querySelectorAll('input[name="pp-genre"]').forEach((choix) => choix.addEventListener('change', () => {
      afficherGenre();
      proposerIngredients();
    }));
    zone.querySelector('#pp-type').addEventListener('change', proposerIngredients);
    zone.querySelector('.pp-ajouter').addEventListener('click', () => { ajouterLigne(); listeProposee = false; });
    zone.querySelector('.pp-liste').addEventListener('input', () => { listeProposee = false; });
    zone.querySelector('.pp-liste').addEventListener('click', (e) => {
      const bouton = e.target.closest('.pp-retirer');
      if (!bouton) return;
      bouton.closest('.pp-ligne').remove();
      listeProposee = false;
    });
    afficherGenre();
    if (page === 'ajout') preparerPageCreation();
  }

  // Page de modification : reprend le panier enregistré.
  function remplir(produit) {
    monter();
    if (!zone || !produit?.packService) return;
    zone.hidden = false;
    etaitPanier = true;
    zone.querySelector('#pp-actif').checked = true;
    const ravitaillement = produit.packService === RAVITAILLEMENT;
    zone.querySelector(`input[name="pp-genre"][value="${ravitaillement ? 'ravitaillement' : 'plat'}"]`).checked = true;
    if (!ravitaillement) zone.querySelector('#pp-type').value = produit.packService;
    afficherGenre();
    zone.querySelector('.pp-liste').innerHTML = '';
    (Array.isArray(produit.packComposants) ? produit.packComposants : [])
      .forEach((c) => ajouterLigne(c.nom, c.quantite));
    listeProposee = false;
    afficherDetails();
  }

  // Ce qu'il faut ajouter au corps envoyé au serveur, ou un message à montrer.
  function lire() {
    if (!zone || zone.hidden) return { ok: true, champs: {} };
    if (!zone.querySelector('#pp-actif').checked) {
      return { ok: true, champs: etaitPanier ? { packService: '' } : {} };
    }
    const composants = lignes()
      .map((l) => ({ nom: l.querySelector('.pp-nom').value.trim(), quantite: l.querySelector('.pp-quantite').value.trim() }))
      .filter((c) => c.nom);
    if (!composants.length) return { ok: false, message: 'Indiquez au moins un article du panier' };
    return { ok: true, champs: { packService: service(), packComposants: composants } };
  }

  window.PanierPretVendeur = { monter, remplir, lire };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', monter);
  else monter();
})();
