// ════════════════════════════════════════
//   MARCHÉ SÉNÉGAL — Questions fréquentes d'un marché
// ════════════════════════════════════════
//
// Chaque réponse vient de la fiche du marché ou de ses boutiques : une question
// sans information sûre n'est pas posée. Le même texte sert à la page (via
// textContent) et à la fonction serveur (api/_lib/remplir-page.js), pour que ce
// que lisent les robots soit exactement ce que voit le visiteur.

(function (racine) {
  const MARQUE = 'Marché Sénégal';
  // Premier mot du nom → genre, pour « le/la », « du/de la », « au/à la ».
  const FEMININS = ['louma'];
  const MASCULINS = ['marché', 'village', 'foirail'];

  function nommer(nom) {
    const premier = String(nom || '').split(/\s+/)[0].toLowerCase();
    if (FEMININS.includes(premier)) return { le: `la ${nom}`, du: `de la ${nom}`, au: `à la ${nom}` };
    if (MASCULINS.includes(premier)) return { le: `le ${nom}`, du: `du ${nom}`, au: `au ${nom}` };
    return { le: nom, du: `de ${nom}`, au: `à ${nom}` };
  }

  const texte = v => (typeof v === 'string' ? v.trim() : '');
  const minuscule = s => s.charAt(0).toLowerCase() + s.slice(1);

  function ceQuOnTrouve(marche, libelles) {
    const categories = Array.isArray(marche.categories) ? marche.categories : [];
    // Un libellé manquant laisserait paraître un code technique : on se tait plutôt.
    if (!categories.length || categories.some(c => !(libelles || {})[c])) return '';
    const specialites = Array.isArray(marche.specialites) ? marche.specialites : [];
    const liste = slugs => slugs.map(s => minuscule(libelles[s])).join(', ');
    const fortes = categories.filter(c => specialites.includes(c));
    const autres = categories.filter(c => !specialites.includes(c));
    if (!fortes.length) return `On y trouve : ${liste(autres)}.`;
    return `Surtout : ${liste(fortes)}.` + (autres.length ? ` On y trouve aussi : ${liste(autres)}.` : '');
  }

  function questionsMarche(marche, libelles) {
    if (!marche || !texte(marche.name)) return [];
    const n = nommer(marche.name);
    const region = texte(marche.region) ? ` (région de ${marche.region})` : '';
    const adresse = texte(marche.address);
    const lieu = adresse ? `${adresse.replace(/\.$/, '')}${region}.` : `À ${marche.city}${region}.`;
    const boutiques = Array.isArray(marche.shops) ? marche.shops.length : 0;
    const trouve = ceQuOnTrouve(marche, libelles);

    return [
      { question: `Où se trouve ${n.le} ?`, reponse: lieu },
      texte(marche.horaires) && { question: `Quels sont les horaires ${n.du} ?`, reponse: texte(marche.horaires) },
      trouve && { question: `Que trouve-t-on ${n.au} ?`, reponse: trouve },
      texte(marche.conseils) && { question: `Quels conseils pour aller ${n.au} ?`, reponse: texte(marche.conseils) },
      {
        question: `Peut-on acheter en ligne ${n.au} ?`,
        reponse: boutiques
          ? `Oui : ${boutiques} boutique${boutiques > 1 ? 's' : ''} de ce marché ${boutiques > 1 ? 'vendent' : 'vend'} sur ${MARQUE}. `
            + 'On peut voir leurs produits, écrire au vendeur et commander.'
          : `Pas encore : aucune boutique de ce marché n'est en ligne sur ${MARQUE} pour le moment.`
      },
      {
        question: `Comment vendre en ligne quand on a un commerce ${n.au} ?`,
        reponse: `En ouvrant une boutique sur ${MARQUE}, rattachée à ce marché : l'inscription est gratuite, `
          + 'depuis la page « Ouvrir une boutique ».'
      }
    ].filter(Boolean);
  }

  function construireFaq(doc, questions) {
    if (!Array.isArray(questions) || !questions.length) return null;
    const bloc = doc.createElement('section');
    bloc.className = 'faq-marche';
    const titre = doc.createElement('h2');
    titre.className = 'faq-titre';
    titre.textContent = 'Questions fréquentes';
    bloc.appendChild(titre);
    questions.forEach(({ question, reponse }) => {
      const details = doc.createElement('details');
      details.className = 'faq-item';
      const resume = doc.createElement('summary');
      resume.textContent = question;
      const corps = doc.createElement('p');
      corps.textContent = reponse;
      details.append(resume, corps);
      bloc.appendChild(details);
    });
    return bloc;
  }

  const exporte = { nommer, questionsMarche, construireFaq };
  if (typeof module !== 'undefined' && module.exports) module.exports = exporte;
  else Object.assign(racine, exporte);
})(typeof window !== 'undefined' ? window : this);
