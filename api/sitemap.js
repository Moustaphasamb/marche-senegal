// Sitemap construit depuis l'API : chaque marché (avec slug), boutique et
// produit public a son adresse propre, servie par api/page.js.
'use strict';

const { SITE, urlPropre } = require('./_lib/remplir-page.js');

const API = 'https://marche-senegal-backend-production.up.railway.app/api';
// La page marché sans identifiant affiche le premier marché : un doublon de sa page /marches/.
const FIXES = ['/', '/marche-senegal-recherche.html'];

const dependances = {
  appelerApi: async chemin => {
    const reponse = await fetch(API + chemin, { signal: AbortSignal.timeout(5000) });
    return { statut: reponse.status, corps: await reponse.json() };
  }
};

async function liste(chemin) {
  const { statut, corps } = await dependances.appelerApi(chemin);
  if (statut !== 200 || !corps || !Array.isArray(corps.data)) throw new Error(`API ${chemin} ${statut}`);
  return corps.data;
}

async function handler(req, res) {
  try {
    const [marches, boutiques, produits] = await Promise.all([
      liste('/markets'), liste('/shops?limit=500'), liste('/products?limit=500')
    ]);
    // Les id et slugs sont des UUID ou [a-z0-9-] : rien à échapper en XML.
    const urls = [
      ...FIXES.map(u => SITE + u),
      ...marches.map(m => urlPropre('marche', m)),
      ...boutiques.map(b => urlPropre('boutique', b)),
      ...produits.map(p => urlPropre('produit', p))
    ].filter(Boolean);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') + '\n</urlset>\n');
  } catch (erreur) {
    // Un 503 fait revenir Google plus tard ; un sitemap vide lui ferait oublier les pages.
    console.error('[sitemap]', erreur.message);
    res.statusCode = 503;
    res.setHeader('Retry-After', '3600');
    res.setHeader('Cache-Control', 'no-store');
    res.end('Sitemap momentanément indisponible');
  }
}

handler.dependances = dependances;
module.exports = handler;
