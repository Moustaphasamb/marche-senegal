// Garantie Achat protégé : ce que les pages acheteur, vendeur et admin disent
// d'un dossier. Le serveur décide ; ce fichier dit en clair ce qu'il a décidé,
// et refuse tôt ce qu'il refuserait (mêmes listes que src/lib/garantie.js).
(function (root) {
  'use strict';
  const H = 3600 * 1000;

  const MOTIFS = {
    NOT_RECEIVED: 'Je n’ai rien reçu',
    DAMAGED: 'Le produit est abîmé',
    WRONG_ITEM: 'Ce n’est pas le bon article',
    INCOMPLETE: 'Il manque un article',
    WRONG_SIZE: 'Ce n’est pas la bonne taille',
    NOT_AS_DESCRIBED: 'Différent de l’annonce',
    NOT_REFUNDED: 'Commande annulée, argent non rendu',
    OTHER: 'Autre problème'
  };
  const MOTIFS_AVEC_PHOTO = ['DAMAGED', 'WRONG_ITEM', 'INCOMPLETE', 'WRONG_SIZE', 'NOT_AS_DESCRIBED'];
  const MOTIFS_TOUTE_LA_COMMANDE = ['NOT_RECEIVED', 'NOT_REFUNDED'];
  const MOTIFS_APRES_RECEPTION = ['DAMAGED', 'WRONG_ITEM', 'INCOMPLETE', 'WRONG_SIZE', 'NOT_AS_DESCRIBED', 'NOT_RECEIVED'];
  const LIMITES = { PHOTO: 5, VIDEO: 1 };
  const OUVERTS = ['OPEN', 'AWAITING_BUYER', 'INVESTIGATING'];

  const ETATS = {
    acheteur: {
      OPEN: 'Le vendeur a 48 h pour vous répondre',
      AWAITING_BUYER: 'Le vendeur vous fait une proposition',
      INVESTIGATING: 'Notre équipe examine le dossier',
      RESOLVED: 'Décision prise : exécution en cours',
      CLOSED: 'Dossier clos'
    },
    vendeur: {
      OPEN: 'À vous de répondre',
      AWAITING_BUYER: 'En attente de la réponse du client',
      INVESTIGATING: 'Notre équipe examine le dossier',
      RESOLVED: 'Décision prise : exécution en cours',
      CLOSED: 'Dossier clos'
    }
  };
  const PROPOSITIONS = {
    REFUND_FULL: 'Rembourser tout',
    REFUND_PARTIAL: 'Rembourser une partie',
    RETURN_AND_REFUND: 'Reprendre le produit puis rembourser',
    EXCHANGE: 'Échanger contre le bon produit',
    CONTEST: 'Contester la réclamation'
  };
  const ISSUES = {
    REFUND_BUYER: 'Remboursement',
    RETURN_AND_REFUND: 'Retour du produit puis remboursement',
    EXCHANGE: 'Échange',
    FAVOR_SELLER: 'Raison donnée au vendeur',
    REJECTED: 'Réclamation refusée'
  };
  const RETOURS = {
    NONE: '',
    AWAITING_PICKUP: 'Produit à collecter',
    IN_TRANSIT: 'Produit en route',
    RECEIVED: 'Produit retourné reçu'
  };
  const EVENEMENTS = {
    OUVERT: 'Réclamation ouverte',
    PREUVE_AJOUTEE: 'Photos ajoutées',
    PROPOSITION: 'Proposition du vendeur',
    CONTESTATION: 'Le vendeur conteste',
    ACCORD: 'Proposition acceptée',
    REFUS_ACHETEUR: 'Proposition refusée',
    RELANCE: 'Rappel envoyé au vendeur',
    ESCALADE: 'Dossier confié à notre équipe',
    DECISION: 'Décision de notre équipe',
    RETOUR_COLLECTE: 'Produit collecté',
    RETOUR_RECU: 'Produit retourné reçu',
    ECHANGE_REMIS: 'Bon produit remis',
    REMBOURSEMENT_EFFECTUE: 'Remboursement effectué',
    CLOS: 'Dossier clos'
  };
  const ACTEURS = { acheteur: 'Client', vendeur: 'Vendeur', plateforme: 'Marché Sénégal', automatique: 'Automatique' };

  function tempsRestant(echeance, maintenant = new Date()) {
    if (!echeance) return null;
    const ms = new Date(echeance).getTime() - maintenant.getTime();
    if (!(ms > 0)) return null;
    const minutes = Math.ceil(ms / 60000);
    const jours = Math.floor(minutes / 1440);
    const heures = Math.floor((minutes % 1440) / 60);
    const reste = minutes % 60;
    if (jours > 0) return `${jours} j ${heures} h`;
    if (heures > 0) return `${heures} h ${String(reste).padStart(2, '0')} min`;
    return `${reste} min`;
  }

  // Dakar vit à l'heure UTC toute l'année : un téléphone réglé sur un autre
  // fuseau doit quand même lire l'heure du marché, comme dans les SMS.
  function dateDakar(valeur) {
    const morceaux = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Africa/Dakar', day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(valeur));
    const p = Object.fromEntries(morceaux.map(m => [m.type, m.value]));
    return `${p.day}/${p.month} à ${p.hour}h${p.minute}`;
  }

  // Ce que la page commande propose pour une commande vendeur. `paye` dit si
  // l'acheteur a réellement payé : une commande annulée sans paiement n'a rien
  // à rembourser.
  function etatGarantie(commande, litiges = [], maintenant = new Date(), { paye = true } = {}) {
    const dossiers = litiges
      .filter(l => l.orderId === commande.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const dernier = dossiers[0] || null;
    const ouvert = dossiers.find(l => OUVERTS.includes(l.status));
    if (ouvert) return { cas: 'DOSSIER', litige: ouvert };
    if (commande.status === 'DELIVERED') {
      if (commande.fundsReleasedAt) return { cas: 'REGLEE', litige: dernier };
      // Sans date de fin (anciennes commandes), le serveur laisse signaler.
      if (!commande.claimDeadlineAt) return { cas: 'FENETRE', reste: null, echeance: null, litige: dernier };
      const reste = tempsRestant(commande.claimDeadlineAt, maintenant);
      if (reste) return { cas: 'FENETRE', reste, echeance: commande.claimDeadlineAt, litige: dernier };
      return { cas: 'FERMEE', litige: dernier };
    }
    if (['READY', 'DELIVERING'].includes(commande.status)) return { cas: 'AVANT_RECEPTION', litige: dernier };
    if (commande.status === 'CANCELLED' && paye) return { cas: 'ANNULEE', litige: dernier };
    return { cas: 'AUCUN', litige: dernier };
  }

  function motifsPossibles(commande) {
    if (commande.status === 'DELIVERED') return MOTIFS_APRES_RECEPTION.slice();
    if (['READY', 'DELIVERING'].includes(commande.status)) return ['NOT_RECEIVED'];
    if (commande.status === 'CANCELLED') return ['NOT_REFUNDED'];
    return [];
  }

  function articlesChoisis(articles) {
    return (articles || []).filter(a => a && a.quantity > 0);
  }

  function validerDossier({ reason, description, articles, preuves }, commande) {
    if (!motifsPossibles(commande).includes(reason)) return 'Choisissez ce qui ne va pas.';
    const texte = String(description || '').trim();
    if (texte.length < 10 || texte.length > 1000) return 'Décrivez le problème en 10 à 1000 caractères.';
    const choisis = articlesChoisis(articles);
    if (!MOTIFS_TOUTE_LA_COMMANDE.includes(reason) && choisis.length === 0) return 'Choisissez au moins un article concerné.';
    for (const a of choisis) {
      const ligne = (commande.items || []).find(i => i.id === a.orderItemId);
      if (!ligne || !Number.isInteger(a.quantity) || a.quantity > ligne.quantity) return 'Vérifiez les quantités.';
    }
    const liste = preuves || [];
    const photos = liste.filter(p => p.kind === 'PHOTO').length;
    const videos = liste.filter(p => p.kind === 'VIDEO').length;
    if (MOTIFS_AVEC_PHOTO.includes(reason) && photos === 0) return 'Ajoutez au moins une photo du problème.';
    if (photos > LIMITES.PHOTO || videos > LIMITES.VIDEO) return '5 photos et 1 vidéo au plus.';
    return null;
  }

  function corpsDossier({ reason, description, articles, preuves }, commande) {
    return {
      orderId: commande.id,
      reason,
      description: String(description || '').trim(),
      items: articlesChoisis(articles).map(a => ({ orderItemId: a.orderItemId, quantity: a.quantity })),
      preuves: (preuves || []).map(p => ({ kind: p.kind, url: p.url }))
    };
  }

  const lienDossier = id => 'marche-senegal-reclamation.html?id=' + encodeURIComponent(id);

  function actionsVendeur(litige) {
    return litige.status === 'OPEN' ? Object.keys(PROPOSITIONS) : [];
  }

  // Mêmes conditions que les routes admin du serveur (remboursementAutorise,
  // retour, échange) : un bouton qui mène à un refus n'a rien à faire là.
  function actionsAdmin(litige, maintenant = new Date()) {
    if (OUVERTS.includes(litige.status)) return ['TRANCHER'];
    if (litige.status !== 'RESOLVED') return [];
    const actions = [];
    if (litige.returnStatus === 'AWAITING_PICKUP') actions.push('COLLECTE');
    if (['AWAITING_PICKUP', 'IN_TRANSIT'].includes(litige.returnStatus)) actions.push('RETOUR_RECU');
    if (litige.outcome === 'EXCHANGE' && litige.returnStatus === 'RECEIVED') actions.push('ECHANGE_REMIS');
    const retourEnRetard = Boolean(litige.resolvedAt)
      && maintenant.getTime() - new Date(litige.resolvedAt).getTime() >= 72 * H;
    const remboursable = litige.outcome === 'REFUND_BUYER'
      || (litige.outcome === 'RETURN_AND_REFUND' && (litige.returnStatus === 'RECEIVED' || retourEnRetard));
    if (!litige.refundedAt && remboursable) actions.push('VIREMENT');
    return actions;
  }

  function resumeVendeur(litige, maintenant = new Date()) {
    const reste = OUVERTS.includes(litige.status) ? tempsRestant(litige.deadlineAt, maintenant) : null;
    const urgent = litige.status === 'OPEN' && Boolean(reste)
      && new Date(litige.deadlineAt).getTime() - maintenant.getTime() <= 12 * H;
    return {
      titre: [litige.number, MOTIFS[litige.reason] || 'Réclamation'].filter(Boolean).join(' · '),
      etat: ETATS.vendeur[litige.status] || litige.status,
      reste,
      urgent,
      lien: lienDossier(litige.id)
    };
  }

  const api = {
    MOTIFS, MOTIFS_AVEC_PHOTO, MOTIFS_TOUTE_LA_COMMANDE, LIMITES, OUVERTS, ETATS,
    PROPOSITIONS, ISSUES, RETOURS, EVENEMENTS, ACTEURS,
    tempsRestant, dateDakar, etatGarantie, motifsPossibles, validerDossier, corpsDossier,
    lienDossier, actionsVendeur, actionsAdmin, resumeVendeur
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Garantie = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
