/**
 * Les trois repères de l'historique : l'efficacité des machines, le temps perdu en pannes, le temps pour réparer.
 * Les autres chiffres (disponibilité, vitesse, qualité, alarmes) suivent en une rangée toujours visible : rien à
 * ouvrir, et ce que veut dire chacun est dans son « ? ».
 */
import type { CSSProperties } from 'react';
import { ChiffresSecondaires, EFFICACITE_REFERENCE, Repere, lireEfficacite, type ChiffreSecondaire } from '@/ui/explain';
import { fmtDuration } from '@/ui/format';
import type { Machine } from '@/domain/types';
import type { Bilan, BilanAlarmes } from '../lib/calculs';
import { dureeEnMots, heures, minusculeInitiale, niveauPannes, pourcent, pourcentFin } from '../lib/phrases';

const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const H = 3_600_000;
const MIN = 60_000;

interface Props {
  b: Bilan;
  /** Machine choisie : les repères parlent d'elle, plus « des machines ». */
  machine?: Machine;
  ba: BilanAlarmes;
  machines: Machine[];
  /** Nom de l'organe d'une alarme, pour situer la réparation la plus longue. */
  organeDe(machineId: string, organeId: string): string | undefined;
  rang: number;
}

export function Reperes({ b, machine, ba, machines, organeDe, rang }: Props) {
  const niveau = b.trs !== undefined ? lireEfficacite(b.trs) : undefined;
  const partPanne = b.ouverture ? b.panne / b.ouverture : 0;
  const niveauP = b.ouverture ? niveauPannes(partPanne) : undefined;
  const longue = ba.plusLongue;
  const mLongue = longue && machines.find((m) => m.id === longue.machineId);
  const enHeures = ba.mttr !== undefined && ba.mttr >= H;
  const organeLongue = longue && organeDe(longue.machineId, longue.organeId);
  const noteMttr =
    longue && mLongue
      ? `En moyenne, de l’alarme à la remise en route. La plus longue : ${dureeEnMots(longue.finLe! - longue.horodatage)} sur ${mLongue.numero}${organeLongue ? ` (${minusculeInitiale(organeLongue)})` : ''}.`
      : 'En moyenne, de l’alarme à la remise en route.';
  const repetitifs = ba.nRepetitifs
    ? `Dont ${ba.nRepetitifs} ${ba.nRepetitifs > 1 ? 'défauts répétitifs' : 'défaut répétitif'} : la même panne, revenue plusieurs fois en peu de temps.`
    : 'Aucun défaut répétitif.';
  const autres: ChiffreSecondaire[] = [
    { label: 'Disponibilité', valeur: b.D !== undefined ? pourcent(b.D) : 'Pas de mesure', terme: 'disponibilite' },
    { label: 'Vitesse', valeur: b.P !== undefined ? pourcent(b.P) : 'Pas de mesure', terme: 'performance' },
    { label: 'Bonnes étiquettes', valeur: b.Q !== undefined ? pourcent(b.Q) : 'Pas de mesure', terme: 'qualite' },
    { label: 'Réglages', valeur: heures(b.calage), terme: 'calage', aide: 'Le temps total passé en réglages sur la période.' },
    { label: 'Alarmes critiques', valeur: String(ba.critiques.length), aide: `Une alarme critique arrête la machine. ${repetitifs}` },
    {
      label: 'Délai de réaction',
      valeur: ba.acquittement !== undefined ? fmtDuration(ba.acquittement) : 'Aucune alarme',
      terme: 'acquittement',
      aide: 'En moyenne sur la période, de l’alarme à sa prise en charge.',
    },
    { label: 'Machines comptées', valeur: String(b.lignes.length), aide: 'Celles ajoutées récemment n’ont pas encore d’historique.' },
  ];

  return (
    <>
      <div className="reperes hist-reperes entree" style={{ '--i': rang } as CSSProperties}>
        <Repere
          titre={machine ? `Efficacité de ${machine.numero}` : 'Efficacité des machines'}
          terme="trs"
          guide="rep-trs"
          valeur={b.trs !== undefined ? b.trs * 100 : 'Pas mesurée'}
          format={(v) => String(Math.round(v))}
          unite={b.trs !== undefined ? '%' : undefined}
          ton={niveau?.ton}
          mot={niveau?.mot}
          jauge={b.trs}
          cible={b.trs !== undefined ? EFFICACITE_REFERENCE : undefined}
          note={b.trs !== undefined ? 'Le trait marque 85\u00a0%, un repère souvent cité pour les usines les plus performantes.' : 'Aucune machine n’a tourné sur la période.'}
        />
        <Repere
          titre="Temps perdu en pannes"
          guide="rep-panne"
          valeur={b.panne / H}
          format={(v) => nf1.format(v)}
          unite="h"
          ton={niveauP?.ton}
          mot={niveauP?.mot}
          note={
            b.nPannes
              ? `${pourcentFin(partPanne)} du temps d’ouverture, en ${b.nPannes} arrêt${b.nPannes > 1 ? 's' : ''}.`
              : 'Aucune panne sur la période.'
          }
        />
        <Repere
          titre="Temps pour réparer"
          terme="mttr"
          guide="rep-mttr"
          valeur={ba.mttr === undefined ? 'Aucune panne' : enHeures ? ba.mttr / H : ba.mttr / MIN}
          format={(v) => (enHeures ? nf1.format(v) : String(Math.round(v)))}
          unite={ba.mttr === undefined ? undefined : enHeures ? 'h' : 'min'}
          note={noteMttr}
        />
      </div>
      <div className="entree" style={{ '--i': rang + 1 } as CSSProperties} data-guide="autres-chiffres">
        <ChiffresSecondaires items={autres} className="hist-autres" />
      </div>
    </>
  );
}
