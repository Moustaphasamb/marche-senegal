// Serveur statique de développement, accessible uniquement sur cette machine.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
http.createServer((req, res) => {
  let file;
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.split('/').some(part => part.startsWith('.')) || !['GET', 'HEAD'].includes(req.method)) throw new Error('Chemin refusé');
    file = path.resolve(root, '.' + (pathname === '/' ? '/marche-senegal-accueil.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw new Error('Chemin refusé');
  } catch { res.writeHead(400); return res.end('Requête invalide'); }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); return res.end('Fichier introuvable'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}).listen(5500, '127.0.0.1', () => console.log('Marché Sénégal : http://127.0.0.1:5500/marche-senegal-shopvision.html'));
