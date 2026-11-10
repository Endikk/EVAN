/**
 * Export du journal d'alarmes pour un tableur : une ligne par alarme, séparateur point-virgule (Excel en français),
 * marque d'ordre des octets en tête pour que les accents s'ouvrent correctement.
 */
import type { Alarme, Machine } from '@/domain/types';
import type { MachineModel } from '@/domain/catalog';
import { REGLE_LIBELLE } from '@/widgets/pannes/AlarmCard';

const STATUT: Record<Alarme['statut'], string> = { active: 'Active', acquittee: 'Vue, pas encore résolue', resolue: 'Résolue' };

function enCsv(lignes: string[][]): string {
  return lignes.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
}

export function journalCsv(alarmes: Alarme[], machines: Machine[], modeles: ReadonlyMap<string, MachineModel>): string {
  const tete = ['Horodatage', 'Machine', 'Organe', 'Code', 'Message', 'Valeur', 'Unité', 'Règle', 'Gravité', 'Statut', 'Durée (min)', 'Cause probable'];
  const corps = alarmes.map((a) => {
    const m = machines.find((x) => x.id === a.machineId);
    const o = modeles.get(a.machineId)?.organes.find((x) => x.id === a.organeId);
    return [
      new Date(a.horodatage).toISOString(),
      `${m?.numero ?? ''} ${m?.nom ?? ''}`.trim(),
      o?.nom ?? '',
      a.code,
      a.message,
      a.valeur?.toString() ?? '',
      a.unite ?? '',
      REGLE_LIBELLE[a.regle],
      a.gravite,
      STATUT[a.statut],
      a.finLe ? String(Math.round((a.finLe - a.horodatage) / 60_000)) : '',
      a.cause ?? '',
    ];
  });
  return '﻿' + enCsv([tete, ...corps]);
}

/** Propose le fichier au téléchargement. */
export function telecharger(nom: string, texte: string) {
  const url = URL.createObjectURL(new Blob([texte], { type: 'text/csv;charset=utf-8' }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  lien.click();
  URL.revokeObjectURL(url);
}
