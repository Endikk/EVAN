import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('politique de contenu de nginx', () => {
  it('autorise chaque script en ligne de index.html par son empreinte', () => {
    const html = read('../../index.html');
    const conf = read('../../../../infra/nginx/default.conf');
    const csp = conf.match(/Content-Security-Policy "([^"]+)"/)?.[1] ?? '';
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline.length).toBeGreaterThan(0);
    // Un script modifié sans mettre à jour default.conf serait bloqué en production (thème appliqué trop tard).
    for (const js of inline) expect(csp).toContain(`'sha256-${createHash('sha256').update(js).digest('base64')}'`);
  });
});
