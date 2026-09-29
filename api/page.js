// Sert /marches/:slug, /boutiques/:id et /produits/:id (réécritures dans
// vercel.json) : la page HTML habituelle, remplie avec les données de l'API
// pour les lecteurs qui n'exécutent pas le JavaScript. En cas de panne de
// l'API, la page d'origine part telle quelle et fonctionne comme avant.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { remplirPage, marquerIntrouvable } = require('./_lib/remplir-page.js');

const API = 'https://marche-senegal-backend-production.up.railway.app/api';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PAGES = {
  marche: { fichier: 'marche-senegal-marche.html', route: 'markets', cle: /^[a-z0-9-]{1,80}$/ },
  boutique: { fichier: 'marche-senegal-boutique.html', route: 'shops', cle: UUID },
  produit: { fichier: 'marche-senegal-produit.html', route: 'products', cle: UUID }
};
const CACHE_LONG = 'public, s-maxage=600, stale-while-revalidate=86400';
const PAGE_VIDE = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/><title>Page introuvable</title></head><body></body></html>';

const dependances = {
  lireModele: fichier => fs.readFileSync(path.join(process.cwd(), fichier), 'utf8'),
  appelerApi: async chemin => {
    const reponse = await fetch(API + chemin, { signal: AbortSignal.timeout(5000) });
    return { statut: reponse.status, corps: await reponse.json().catch(() => ({})) };
  }
};

function envoyer(res, statut, html, cache) {
  res.statusCode = statut;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(html);
}

async function handler(req, res) {
  const { type, cle } = req.query || {};
  const page = Object.prototype.hasOwnProperty.call(PAGES, type) ? PAGES[type] : null;
  if (!page || typeof cle !== 'string' || !page.cle.test(cle)) {
    const modele = page ? dependances.lireModele(page.fichier) : PAGE_VIDE;
    return envoyer(res, 404, marquerIntrouvable(modele), 'public, s-maxage=600');
  }
  const modele = dependances.lireModele(page.fichier);
  try {
    const { statut, corps } = await dependances.appelerApi(`/${page.route}/${cle}`);
    if (statut === 404) return envoyer(res, 404, marquerIntrouvable(modele), 'public, s-maxage=600');
    if (statut !== 200 || !corps || !corps.data) throw new Error(`API ${statut}`);
    return envoyer(res, 200, remplirPage(modele, type, corps.data), CACHE_LONG);
  } catch (erreur) {
    console.error('[page]', type, cle, erreur.message);
    return envoyer(res, 200, modele, 'public, s-maxage=60');
  }
}

handler.dependances = dependances;
module.exports = handler;
