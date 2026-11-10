import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('..', import.meta.url));

function fichiers(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dir, e.name);
    if (e.isDirectory()) return fichiers(chemin);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [relative(src, chemin)] : [];
  });
}

/** Pages importées par un fichier (« plan » pour @/pages/plan/PlanPanel). */
function pagesImportees(fichier: string): string[] {
  const texte = readFileSync(join(src, fichier), 'utf8');
  return [...texte.matchAll(/(?:from\s+|import\s*\(\s*)['"]@\/pages\/([^/'"]+)/g)].map((m) => m[1]);
}

const tous = fichiers(src);

describe('découpage du front', () => {
  it('une page n’importe jamais une autre page', () => {
    const fautes = tous
      .filter((f) => f.startsWith('pages/'))
      .flatMap((f) => pagesImportees(f).filter((p) => p !== f.split('/')[1]).map((p) => `${f} importe pages/${p}`));
    expect(fautes).toEqual([]);
  });

  it('seul le routeur importe les pages', () => {
    const fautes = tous
      .filter((f) => !f.startsWith('pages/') && f !== 'app/router.tsx')
      .flatMap((f) => pagesImportees(f).map((p) => `${f} importe pages/${p}`));
    expect(fautes).toEqual([]);
  });

  it('chaque page a son index.tsx', () => {
    const dossiers = readdirSync(join(src, 'pages'), { withFileTypes: true }).filter((e) => e.isDirectory());
    const sansIndex = dossiers.map((d) => d.name).filter((d) => !tous.includes(join('pages', d, 'index.tsx')));
    expect(sansIndex).toEqual([]);
  });

  it('styles/app.css ne fait qu’importer, et chaque fichier de styles/ est importé et reste sous 800 lignes', () => {
    const dir = join(src, 'styles');
    const sansCommentaires = readFileSync(join(dir, 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const lignes = sansCommentaires.split('\n').map((l) => l.trim()).filter(Boolean);
    const importes = lignes.map((l) => l.match(/^@import '\.\/([\w-]+\.css)';$/)?.[1] ?? `règle hors import : ${l}`);
    const presents = readdirSync(dir).filter((f) => f.endsWith('.css') && f !== 'app.css');
    expect([...importes].sort()).toEqual([...presents].sort());
    const tropLongs = presents.filter((f) => readFileSync(join(dir, f), 'utf8').split('\n').length > 800);
    expect(tropLongs).toEqual([]);
  });

  it('à la racine d’une page, seulement index.tsx et index.css : le reste va dans des sous-dossiers', () => {
    const dossiers = readdirSync(join(src, 'pages'), { withFileTypes: true }).filter((e) => e.isDirectory());
    const enTrop = dossiers.flatMap((d) =>
      readdirSync(join(src, 'pages', d.name), { withFileTypes: true })
        .filter((e) => e.isFile() && e.name !== 'index.tsx' && e.name !== 'index.css')
        .map((e) => `pages/${d.name}/${e.name}`),
    );
    expect(enTrop).toEqual([]);
  });
});
