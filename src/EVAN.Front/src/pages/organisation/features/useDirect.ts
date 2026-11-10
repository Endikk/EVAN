/**
 * État en direct de l'usine ouverte, résumé pour la vue d'ensemble. Le flux temps réel bat chaque seconde : on n'en
 * garde qu'une clé courte (comptes et numéros), si bien que l'écran ne se redessine que quand un état change vraiment.
 */
import { useMemo } from 'react';
import type { Machine } from '@/domain/types';
import { useLive } from '@/store/live';
import { etatAffiche } from '@/ui/status';
import type { EtatMachines } from '../lib/donnees';

export interface Direct {
  etat: EtatMachines;
  /** Message de l'alarme en cours sur la première machine en panne. */
  alarme?: string;
}

/** `machines` : celles de l'usine ouverte, ou rien quand elle n'est pas dans la vue. */
export function useDirect(machines: Machine[] | undefined): Direct | undefined {
  const cle = useLive((s) => {
    if (!machines?.length || !Object.keys(s.machines).length) return '';
    let produisent = 0;
    let reglage = 0;
    const panne: string[] = [];
    const surveiller: string[] = [];
    for (const m of machines) {
      const e = etatAffiche(s.machines[m.id]);
      if (e === 'marche') produisent += 1;
      else if (e === 'attention') {
        produisent += 1;
        surveiller.push(m.numero);
      } else if (e === 'calage') reglage += 1;
      else if (e === 'panne') panne.push(m.numero);
    }
    const premiere = machines.find((m) => m.numero === panne[0]);
    const alarme = premiere ? s.alarms.find((a) => a.machineId === premiere.id && a.statut !== 'resolue')?.message : undefined;
    return JSON.stringify({ t: machines.length, produisent, reglage, panne, surveiller, alarme });
  });

  return useMemo(() => {
    if (!cle) return undefined;
    const v = JSON.parse(cle) as { t: number; produisent: number; reglage: number; panne: string[]; surveiller: string[]; alarme?: string };
    return { etat: { total: v.t, produisent: v.produisent, reglage: v.reglage, panne: v.panne, surveiller: v.surveiller }, alarme: v.alarme };
  }, [cle]);
}
