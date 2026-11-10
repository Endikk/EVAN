import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { partageAbsolu, urlPublique } from './publication';

const front = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(front, 'index.html'), 'utf8');
const publicDir = path.join(front, 'public');

describe('adresse publique', () => {
  it('absente ou vide : balises de partage relatives', () => {
    expect(urlPublique(undefined)).toBeNull();
    expect(urlPublique('  ')).toBeNull();
  });

  it('gardée sans barre finale', () => {
    expect(urlPublique('https://evan.exemple.fr/')).toBe('https://evan.exemple.fr');
  });

  it('mal formée, avec un chemin ou hors http(s) : le build s’arrête', () => {
    expect(() => urlPublique('evan.exemple.fr')).toThrow();
    expect(() => urlPublique('https://exemple.fr/evan')).toThrow();
    expect(() => urlPublique('ftp://evan.exemple.fr')).toThrow();
  });
});

describe('outil interne, fermé aux moteurs de recherche', () => {
  it('robots.txt interdit tout, sans ligne Sitemap', () => {
    const robots = readFileSync(path.join(publicDir, 'robots.txt'), 'utf8');
    expect(robots).toMatch(/^Disallow: \/$/m);
    expect(robots).not.toMatch(/^Sitemap:/m);
  });

  it('index.html demande à ne pas être indexé', () => {
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
  });
});

describe('balises de partage et icônes', () => {
  it('chaque fichier cité par index.html et le manifeste existe dans public/', () => {
    const manifeste = JSON.parse(readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8')) as { icons: { src: string }[] };
    const cites = [
      ...[...html.matchAll(/(?:href|content)="(\/[^"/][^"]*\.(?:png|svg|jpg|webmanifest))"/g)].map((m) => m[1]),
      ...manifeste.icons.map((i) => i.src),
    ];
    expect(cites.length).toBeGreaterThanOrEqual(7);
    for (const fichier of cites) expect(existsSync(path.join(publicDir, fichier)), fichier).toBe(true);
  });

  it('avec l’adresse publique, image et page de partage en adresses absolues', () => {
    const absolu = partageAbsolu(html, 'https://evan.exemple.fr');
    expect(absolu).toContain('<meta property="og:image" content="https://evan.exemple.fr/partage.jpg" />');
    expect(absolu).toContain('<meta name="twitter:image" content="https://evan.exemple.fr/partage.jpg" />');
    expect(absolu).toContain('<meta property="og:url" content="https://evan.exemple.fr/" />');
    // Le script en ligne (thème) ne bouge pas : son empreinte reste celle de la politique de contenu.
    expect(absolu.match(/<script>[\s\S]*?<\/script>/)?.[0]).toBe(html.match(/<script>[\s\S]*?<\/script>/)?.[0]);
  });
});
