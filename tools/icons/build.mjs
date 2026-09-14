/**
 * Génère ../../icons.js à partir de runtime.js, emoji-map.json et lucide-paths.json.
 *
 * Usage : node tools/icons/build.mjs   (depuis le dossier marche-senegal)
 *
 * Aucune dépendance : les tracés Lucide sont figés dans lucide-paths.json.
 * Pour AJOUTER une icône : ajouter l'entrée dans emoji-map.json, puis son tracé
 * dans lucide-paths.json (contenu interne du <svg> pris sur lucide.dev), et relancer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJET = path.resolve(HERE, '../..');

const map = JSON.parse(fs.readFileSync(path.join(HERE, 'emoji-map.json'), 'utf8'));
const tous = JSON.parse(fs.readFileSync(path.join(HERE, 'lucide-paths.json'), 'utf8'));
const names = [...new Set(Object.values(map).map(v => v[0]))].sort();

const bodies = {};
for (const n of names) {
  if (!tous[n]) throw new Error(`Tracé absent de lucide-paths.json : ${n}`);
  bodies[n] = tous[n];
}

const q = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const pathsSrc = names.map(n => `    ${q(n)}: ${q(bodies[n])}`).join(',\n');
const emojiSrc = Object.entries(map)
  .map(([e, [nom, mod]]) => `    ${q(e)}: ${q(mod ? nom + '|' + mod : nom)}`)
  .join(',\n');

const sortie = fs.readFileSync(path.join(HERE, 'runtime.js'), 'utf8')
  .replace('/*__PATHS__*/', pathsSrc)
  .replace('/*__EMOJI__*/', emojiSrc);

const cible = path.join(PROJET, 'icons.js');
fs.writeFileSync(cible, sortie, 'utf8');
console.log(`icons.js généré : ${names.length} icônes, ${Object.keys(map).length} emojis, ${(sortie.length / 1024).toFixed(1)} Ko`);
