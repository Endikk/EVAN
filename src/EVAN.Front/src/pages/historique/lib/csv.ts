/**
 * Export du journal d'alarmes pour un tableur : une ligne par alarme, séparateur point-virgule (Excel en français),
 * marque d'ordre des octets en tête pour que les accents s'ouvrent correctement.
 *
 * Le fichier dit les choses comme l'écran : la date et l'heure locales en deux colonnes (un tableur français les lit
 * comme une date et une heure), la virgule décimale, la gravité, le type et le statut avec les mots du journal.
 */
import type { Alarme, Machine } from '@/domain/types';
import type { MachineModel } from '@/domain/catalog';
import { ETAT_ALARME, GRAVITE_ALARME, TYPE_ALARME } from './libelles';

const date = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

function enCsv(lignes: string[][]): string {
  return lignes.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
}

/** Un nombre à la française, sans séparateur de milliers (un tableur le lirait comme du texte) : « 235,4 ». */
export function nombreCsv(v: number): string {
  return String(Math.round(v * 100) / 100).replace('.', ',');
}

export function journalCsv(alarmes: Alarme[], machines: Machine[], modeles: ReadonlyMap<string, MachineModel>): string {
  const tete = ['Date', 'Heure', 'Machine', 'Organe', 'Code', 'Message', 'Valeur', 'Unité', 'Type', 'Gravité', 'Statut', 'Durée (min)', 'Cause probable'];
  const corps = alarmes.map((a) => {
    const m = machines.find((x) => x.id === a.machineId);
    const o = modeles.get(a.machineId)?.organes.find((x) => x.id === a.organeId);
    return [
      date.format(a.horodatage),
      heure.format(a.horodatage),
      `${m?.numero ?? ''} ${m?.nom ?? ''}`.trim(),
      o?.nom ?? '',
      a.code,
      a.message,
      a.valeur !== undefined ? nombreCsv(a.valeur) : '',
      a.unite ?? '',
      TYPE_ALARME[a.regle],
      GRAVITE_ALARME[a.gravite],
      ETAT_ALARME[a.statut],
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
