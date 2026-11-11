/**
 * Le journal de l'atelier raconté au passé : « R06 a commencé un réglage », « EVAN a déclenché l'alarme MS-03 ».
 * Les messages bruts viennent du simulateur ou du back, sous une forme courte pensée pour les techniciens. On en
 * reconnaît les tournures connues pour les redire en phrases ; un message inconnu s'affiche tel quel, sans perte.
 */
import type { Evenement, Gravite, TypeEvenement } from '@/domain/types';
import { minusculeInitiale } from './atelier';

export interface LigneJournal {
  /** Sujet de la phrase, mis en avant en tête de ligne : une machine, une personne ou EVAN. */
  sujet?: string;
  texte: string;
}

interface Tournure {
  type?: TypeEvenement;
  re: RegExp;
  /** `sujet` absent : la personne qui a agi (auteur de l'événement) devient le sujet. */
  phrase: (m: RegExpMatchArray, gravite?: Gravite) => LigneJournal;
}

const TOURNURES: Tournure[] = [
  {
    type: 'alarme',
    re: /^(\S+) · (\S+)[^·]* · (.+)$/,
    phrase: (m, gravite) =>
      gravite === 'attention'
        ? { sujet: 'EVAN', texte: `a signalé un point à surveiller sur ${m[2]}, ${m[1]} (${minusculeInitiale(m[3])}).` }
        : { sujet: 'EVAN', texte: `a déclenché l’alarme ${m[1]} sur ${m[2]} (${minusculeInitiale(m[3])}).` },
  },
  { re: /^(\S+) · Calage d’un nouveau travail$/, phrase: (m) => ({ sujet: m[1], texte: 'a commencé le réglage (calage) d’un nouveau travail.' }) },
  { re: /^(\S+) · Fin de calage, production lancée$/, phrase: (m) => ({ sujet: m[1], texte: 'a fini son réglage et a repris la production.' }) },
  { re: /^(\S+) · (.+) : changement de bobine$/, phrase: (m) => ({ sujet: m[1], texte: `a changé de bobine (${minusculeInitiale(m[2])}).` }) },
  { re: /^Panne simulée injectée sur (\S+) · (.+)$/, phrase: (m) => ({ sujet: m[1], texte: `a reçu une panne simulée, côté ${minusculeInitiale(m[2])}.` }) },
  { re: /^Alarme (\S+) acquittée$/, phrase: (m) => ({ texte: `a pris en charge l’alarme ${m[1]}.` }) },
  {
    re: /^Intervention terminée, (\S+) résolue\. Redémarrage\.$/,
    phrase: (m) => ({ texte: `a terminé l’intervention : l’alarme ${m[1]} est close, la machine redémarre.` }),
  },
  { re: /^Clôture annulée, (\S+) rouverte\.$/, phrase: (m) => ({ texte: `a annulé la clôture : l’alarme ${m[1]} est de nouveau ouverte.` }) },
  { re: /^Intervention consignée · (.+?) · (.+)$/, phrase: (m) => ({ texte: `a consigné une intervention sur ${m[1]} : ${minusculeInitiale(m[2])}.` }) },
  { re: /^Configuration de l’usine ouverte$/, phrase: () => ({ texte: 'a ouvert la configuration de l’usine.' }) },
  { re: /^Configuration enregistrée \((\d+) machines?\)$/, phrase: (m) => ({ texte: `a enregistré la configuration (${m[1]} machines).` }) },
];

/**
 * La ligne du journal en clair. `gravite` : celle de l'alarme levée par l'événement, quand on la connaît (une même
 * alarme peut être signalée « à surveiller », puis déclenchée en panne).
 */
export function ligneJournal(e: Evenement, gravite?: Gravite): LigneJournal {
  for (const t of TOURNURES) {
    if (t.type && t.type !== e.type) continue;
    const m = e.message.match(t.re);
    if (!m) continue;
    const ligne = t.phrase(m, gravite);
    return ligne.sujet ? ligne : { sujet: e.auteur ?? 'Quelqu’un', texte: ligne.texte };
  }
  return { texte: e.auteur ? `${e.message} (${e.auteur})` : e.message };
}
