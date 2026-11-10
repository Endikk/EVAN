/**
 * Contrat commun front / back : l'historique simulé et ce qu'on en tire (maintenance, énergie, chronologie d'une panne)
 * doivent donner exactement les mêmes résultats dans le navigateur (démo hors ligne) et dans EVAN.Api (assistant,
 * serveur MCP). Ce test fige le résumé de référence dans data/tests/historique.json ; le back rejoue le même fichier
 * (tests/EVAN.Infrastructure.Tests/SimulatedHistoryContractTests.cs).
 *
 * Régénérer après un changement voulu : EVAN_VECTEURS=1 npx vitest run src/sim/history.contract.test.ts
 */
/// <reference types="node" />
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import demo from '@data/demo.json';
import { machineModel } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import { bilanUsine, courbeDeCharge } from '@/analytics/energy';
import { echeances, previsions } from '@/analytics/maintenance';
import { chronologie } from '@/analytics/timeline';
import { getHistory, historicValue, H } from './history';

const FICHIER = fileURLToPath(new URL('../../../../data/tests/historique.json', import.meta.url));
const MAINTENANT = Date.parse('2026-10-08T08:30:00Z');

function resumer() {
  const usines = (demo as unknown as { usines: { site: { id: string }; machines: Machine[] }[] }).usines;
  return {
    description:
      'Résumé de référence de l’historique simulé (7 jours) et des analyses qui en dérivent, pour un instant et un fuseau fixés. Produit par src/EVAN.Front/src/sim/history.contract.test.ts, rejoué par tests/EVAN.Infrastructure.Tests/SimulatedHistoryContractTests.cs.',
    maintenant: MAINTENANT,
    fuseau: 'Europe/Paris',
    usines: usines.map(({ site, machines }) => {
      const h = getHistory(machines, MAINTENANT);
      const valeurs: { point: string; t: number; v: number }[] = [];
      for (const m of machines) {
        const model = machineModel(m);
        for (const p of model.points.filter((x) => x.type !== 'alarme').slice(0, 3)) {
          const def = model.defs[p.organeId];
          const md = def.mesures.find((x) => x.cle === p.cle)!;
          for (const k of [5, 29, 53, 101]) valeurs.push({ point: p.id, t: h.debut + k * H, v: historicValue(h, m, p, md, def.panne, h.debut + k * H) });
        }
      }
      // Autour des deux pannes les plus récentes : glissement vers le seuil puis valeur de défaut.
      for (const a of h.alarmes.slice(0, 2)) {
        const m = machines.find((x) => x.id === a.machineId)!;
        const model = machineModel(m);
        const p = model.points.find((x) => x.id === a.pointId);
        if (!p) continue;
        const def = model.defs[p.organeId];
        const md = def.mesures.find((x) => x.cle === p.cle)!;
        for (const dt of [-180_000, -1000, 10_000]) valeurs.push({ point: p.id, t: a.horodatage + dt, v: historicValue(h, m, p, md, def.panne, a.horodatage + dt) });
      }
      const energie = bilanUsine(h, machines, h.debut, MAINTENANT);
      const charge = courbeDeCharge(h, machines, h.debut, MAINTENANT, 30 * 60_000);
      const pic = charge.reduce((a, b) => (b.kw > a.kw ? b : a));
      return {
        id: site.id,
        debut: h.debut,
        fin: h.fin,
        alarmes: h.alarmes.map((a) => ({
          id: a.id,
          code: a.code,
          machineId: a.machineId,
          organeId: a.organeId,
          pointId: a.pointId ?? null,
          horodatage: a.horodatage,
          finLe: a.finLe,
          acquitteeLe: a.acquitteeLe,
          acquitteePar: a.acquitteePar,
          valeur: a.valeur ?? null,
          seuil: a.seuil ?? null,
          regle: a.regle,
        })),
        periodes: Object.fromEntries(
          machines.map((m) => {
            const list = h.periodes[m.id] ?? [];
            const somme = (e: string) => list.filter((p) => p.etat === e).reduce((s, p) => s + (p.fin - p.debut), 0);
            return [m.id, { n: list.length, marche: somme('marche'), calage: somme('calage'), panne: somme('panne'), arret: somme('arret') }];
          }),
        ),
        trs: Object.fromEntries(machines.map((m) => [m.id, (h.trs[m.id] ?? []).map((j) => j.trs)])),
        valeurs,
        maintenance: {
          echeances: machines.flatMap((m) =>
            echeances(h, m, MAINTENANT).map((e) => ({ id: e.id, compteur: e.compteur, statut: e.statut, echeance: e.echeance ?? null })),
          ),
          previsions: machines.flatMap((m) =>
            previsions(h, m, MAINTENANT).map((p) => ({ pointId: p.pointId, valeur: p.valeur, pente: p.pente, niveau: p.niveau, franchissement: p.franchissement })),
          ),
        },
        energie: { kwh: energie.total.kwh, production: energie.total.production, pic: { t: pic.t, kw: pic.kw } },
        chronologies: h.alarmes.slice(0, 3).map((a) => {
          const c = chronologie(h, machines.find((m) => m.id === a.machineId)!, a)!;
          return { alarme: a.id, debut: c.debut, fin: c.fin, pas: c.pas, evenements: c.evenements.map((e) => ({ etape: e.etape, t: e.t })) };
        }),
      };
    }),
  };
}

describe('contrat de l’historique simulé (front = back)', () => {
  it('reproduit le résumé de référence', () => {
    const resume = JSON.parse(JSON.stringify(resumer()));
    if (process.env.EVAN_VECTEURS) fs.writeFileSync(FICHIER, JSON.stringify(resume, null, 1) + '\n');
    const reference = JSON.parse(fs.readFileSync(FICHIER, 'utf-8'));
    expect(resume).toEqual(reference);
  });
});
