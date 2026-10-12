// Photos et vidéo d'une réclamation, envoyées vers Cloudinary.
// Le serveur signe l'envoi dans un dossier propre à l'auteur et refuse toute
// adresse qui n'en vient pas ; ici on refuse tôt ce qui n'est ni une photo ni
// une vidéo raisonnable, pour ne pas faire attendre l'acheteur pour rien.
(function (root) {
  'use strict';
  const PHOTO_MAX = 10 * 1024 * 1024;
  const VIDEO_MAX = 60 * 1024 * 1024;
  const TYPES_PHOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  const TYPES_VIDEO = ['video/mp4', 'video/quicktime'];

  function genre(fichier) {
    if (!fichier) return null;
    if (TYPES_PHOTO.includes(fichier.type)) return 'PHOTO';
    if (TYPES_VIDEO.includes(fichier.type)) return 'VIDEO';
    return null;
  }

  async function envoyerPreuve(fichier, options) {
    const kind = genre(fichier);
    if (!kind) return { success: false, message: 'Choisissez une photo (JPG, PNG) ou une vidéo MP4.' };
    if (kind === 'PHOTO' && fichier.size > PHOTO_MAX) return { success: false, message: 'Photo trop lourde (10 Mo au plus).' };
    if (kind === 'VIDEO' && fichier.size > VIDEO_MAX) return { success: false, message: 'Vidéo trop lourde : 30 secondes suffisent.' };

    if (kind === 'VIDEO') {
      const r = await options.envoyerVideo(fichier, { obtenirAutorisation: options.obtenirAutorisation, suivi: options.suivi });
      return r && r.success ? { success: true, preuve: { kind, url: r.url } } : { success: false, message: (r && r.message) || 'La vidéo n’a pas pu être envoyée. Réessayez.' };
    }

    const autorisation = await options.obtenirAutorisation();
    if (!autorisation || !autorisation.success) {
      return { success: false, message: (autorisation && autorisation.message) || 'L’envoi de photos est indisponible pour le moment.' };
    }
    const a = autorisation.data;
    const corps = new FormData();
    corps.append('file', fichier);
    corps.append('api_key', a.apiKey);
    corps.append('timestamp', a.timestamp);
    corps.append('folder', a.folder);
    corps.append('signature', a.signature);
    const envoi = options.fetch || ((...x) => root.fetch(...x));
    try {
      const reponse = await envoi(`https://api.cloudinary.com/v1_1/${a.cloudName}/image/upload`, { method: 'POST', body: corps });
      let donnees = null;
      try { donnees = await reponse.json(); } catch { /* réponse coupée en route */ }
      if (!reponse.ok || !donnees || typeof donnees.secure_url !== 'string') {
        return { success: false, message: 'La photo n’a pas pu être envoyée. Réessayez.' };
      }
      return { success: true, preuve: { kind, url: donnees.secure_url } };
    } catch {
      return { success: false, message: 'Réseau coupé : la photo n’est pas partie. Réessayez.' };
    }
  }

  const api = { envoyerPreuve, genre, PHOTO_MAX, VIDEO_MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EnvoiPreuve = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
