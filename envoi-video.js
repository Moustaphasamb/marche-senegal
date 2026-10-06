// Envoi d'une vidéo du téléphone vers Cloudinary, par morceaux de 6 Mo.
// Une vidéo pèse 30 à 60 Mo : chaque morceau porte le même identifiant et
// Cloudinary les recolle. En 4G, une coupure ne fait renvoyer que le morceau en
// cours, dès que le réseau revient. Le serveur ne fait que signer l'envoi.
// Utilisé par la vidéo de boutique (Ma vitrine) et par les stories.
(function (root) {
  'use strict';
  const MORCEAU = 6 * 1024 * 1024;

  const attendreReseau = ms => new Promise(ok => {
    const fin = () => { clearTimeout(minuterie); root.removeEventListener('online', fin); ok(); };
    const minuterie = setTimeout(fin, ms);
    root.addEventListener('online', fin);
  });

  // Rejoue une étape tant que le réseau coupe (~3 min au plus) ; un refus ne se rejoue pas.
  async function avecReprise(etape, suivi, texteCoupure, attendre) {
    for (let essai = 1; ; essai++) {
      try { return await etape(); } catch (erreur) {
        if ((erreur && erreur.refus) || essai >= 9) throw erreur;
        if (suivi) suivi(texteCoupure);
        await attendre(Math.min(2000 * 2 ** (essai - 1), 30000));
      }
    }
  }

  async function envoyer(fichier, options) {
    const { obtenirAutorisation, suivi } = options;
    const envoi = options.fetch || ((...a) => root.fetch(...a));
    const attendre = options.attendre || attendreReseau;
    try {
      const autorisation = await avecReprise(async () => {
        const r = await obtenirAutorisation();
        if (r && r.success) return r.data;
        if (r && r.message && r.message !== 'Erreur de connexion au serveur') throw { refus: true, message: r.message };
        throw new Error('réseau');
      }, suivi, 'Réseau coupé : l’envoi de la vidéo commencera dès que la connexion revient…', attendre);

      const adresse = `https://api.cloudinary.com/v1_1/${autorisation.cloudName}/video/upload`;
      const identifiant = (root.crypto && root.crypto.randomUUID && root.crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
      let resultat = null;
      for (let debut = 0; debut < fichier.size; debut += MORCEAU) {
        const fin = Math.min(debut + MORCEAU, fichier.size);
        const pourcent = Math.round((debut / fichier.size) * 100);
        if (suivi) suivi(`Envoi de la vidéo : ${pourcent} %`);
        resultat = await avecReprise(async () => {
          const corps = new FormData();
          corps.append('file', fichier.slice(debut, fin), fichier.name || 'video.mp4');
          corps.append('api_key', autorisation.apiKey);
          corps.append('timestamp', autorisation.timestamp);
          corps.append('folder', autorisation.folder);
          corps.append('signature', autorisation.signature);
          const reponse = await envoi(adresse, {
            method: 'POST',
            headers: { 'X-Unique-Upload-Id': identifiant, 'Content-Range': `bytes ${debut}-${fin - 1}/${fichier.size}` },
            body: corps
          });
          let d = null;
          try { d = await reponse.json(); } catch { /* réponse coupée en route */ }
          if (reponse.ok) return d || {};
          if (reponse.status >= 400 && reponse.status < 500 && reponse.status !== 408 && reponse.status !== 429) {
            console.error('Cloudinary a refusé la vidéo :', d && d.error && d.error.message);
            throw { refus: true, message: 'Cette vidéo n’a pas pu être envoyée. Filmez en mode vidéo normal, puis réessayez.' };
          }
          throw new Error('serveur ' + reponse.status);
        }, suivi, `Réseau coupé à ${pourcent} % : l’envoi reprendra là où il s’est arrêté dès que la connexion revient…`, attendre);
      }
      if (!resultat || typeof resultat.secure_url !== 'string') {
        return { success: false, message: 'L’envoi de la vidéo n’a pas abouti. Réessayez.' };
      }
      if (suivi) suivi('Envoi de la vidéo : 100 %');
      return { success: true, url: resultat.secure_url };
    } catch (erreur) {
      return {
        success: false,
        message: erreur && erreur.refus ? erreur.message
          : 'La connexion est coupée depuis trop longtemps. Réessayez quand le réseau revient.'
      };
    }
  }

  const api = { envoyer, MORCEAU };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EnvoiVideo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
