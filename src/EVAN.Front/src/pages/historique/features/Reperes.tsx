/**
 * Les repères de l'historique. L'efficacité des machines mène : c'est le chiffre du verdict, en grand, avec sa jauge.
 * Les deux façons de perdre du temps à l'arrêt suivent en compact à côté d'elle, la plus lourde en premier : les
 * réglages et les pannes. Un atelier qui perd sept fois plus en réglages qu'en pannes ne doit pas lire d'abord
 * « pannes : faible » en vert. Les autres chiffres (disponibilité, vitesse, qualité, temps pour réparer, alarmes)
 * viennent en une rangée toujours visible : rien à ouvrir, et ce que veut dire chacun est dans son « ? ».
 */
import type { CSSProperties } from 'react';
import { ChiffresSecondaires, EFFICACITE_REFERENCE, Repere, lireEfficacite, type ChiffreSecondaire } from '@/ui/explain';
import { fmtDuration } from '@/ui/format';
import type { Machine } from '@/domain/types';
import type { Bilan, BilanAlarmes } from '../lib/calculs';
import { dureeEnMots, minusculeInitiale, niveauPannes, pourcent, pourcentFin, reglageMoyen } from '../lib/phrases';

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
  const partCalage = b.ouverture ? b.calage / b.ouverture : 0;
  const niveauP = b.ouverture ? niveauPannes(partPanne) : undefined;
  const moyenCalage = reglageMoyen(b);
  const reglagesDabord = b.calage >= b.panne;
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
    {
      label: 'Temps pour réparer',
      valeur: ba.mttr === undefined ? 'Aucune panne' : enHeures ? nf1.format(ba.mttr / H) : String(Math.round(ba.mttr / MIN)),
      unite: ba.mttr === undefined ? undefined : enHeures ? 'h' : 'min',
      terme: 'mttr',
      aide: noteMttr,
    },
    { label: 'Alarmes critiques', valeur: String(ba.critiques.length), aide: `Une alarme critique arrête la machine. ${repetitifs}` },
    {
      label: 'Délai de réaction',
      valeur: ba.acquittement !== undefined ? fmtDuration(ba.acquittement) : 'Aucune alarme',
      terme: 'acquittement',
      aide: 'En moyenne sur la période, de l’alarme à sa prise en charge.',
    },
    { label: 'Machines comptées', valeur: String(b.lignes.length), aide: 'Celles ajoutées récemment n’ont pas encore d’historique.' },
  ];

  const pannes = (
    <Repere
      key="pannes"
      titre="Temps perdu en pannes"
      className="rp-compact"
      guide="rep-panne"
      valeur={b.panne / H}
      format={(v) => nf1.format(v)}
      unite="h"
      ton={niveauP?.ton}
      mot={niveauP?.mot}
      note={b.nPannes ? `${pourcentFin(partPanne)} du temps d’ouverture, en ${b.nPannes} arrêt${b.nPannes > 1 ? 's' : ''}.` : 'Aucune panne sur la période.'}
    />
  );
  // Pas de verdict en couleur pour les réglages : il n'existe pas de seuil partagé, seulement la comparaison avec les
  // pannes (l'ordre des deux repères) et la durée moyenne d'un réglage.
  const reglages = (
    <Repere
      key="reglages"
      titre="Temps perdu en réglages"
      className="rp-compact"
      terme="calage"
      guide="rep-reglages"
      valeur={b.calage / H}
      format={(v) => nf1.format(v)}
      unite="h"
      note={
        moyenCalage !== undefined
          ? `${pourcentFin(partCalage)} du temps d’ouverture, en ${b.nCalages} réglage${b.nCalages > 1 ? 's' : ''} de ${dureeEnMots(moyenCalage)} en moyenne.`
          : 'Aucun réglage sur la période.'
      }
    />
  );

  return (
    <>
      <div className="reperes hist-reperes entree" style={{ '--i': rang } as CSSProperties}>
        <Repere
          titre={machine ? `Efficacité de ${machine.numero}` : 'Efficacité des machines'}
          className="rp-mene"
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
        {reglagesDabord ? [reglages, pannes] : [pannes, reglages]}
      </div>
      <div className="entree" style={{ '--i': rang + 1 } as CSSProperties} data-guide="autres-chiffres">
        <ChiffresSecondaires items={autres} className="hist-autres" />
      </div>
    </>
  );
}
