/**
 * Les phrases de la vue d'ensemble : chaque bloc de l'écran commence par ce qu'il faut en retenir, écrit à partir
 * des chiffres calculés (jamais un texte figé). Fonctions pures, testées dans lecture.test.ts.
 */
import { lireEfficacite, type Ton } from '@/ui/explain';
import type { ComparaisonType } from '@/analytics/organisation';
import { fmtNombre, pct } from '@/ui/format';
import type { ArretLong, DeriveSuivie, EntretienUrgent, EtatMachines } from './donnees';

/** Repère courant du métier : une usine de pointe atteint environ 85 % d'efficacité (TRS). */
export const TRS_POINTE = 0.85;

/**
 * Espaces insécables à l'affichage : les deux-points et le point-virgule ne commencent jamais une ligne, et une unité
 * ne se sépare pas de son nombre (« 4 entretiens… :» restait seul en bout de ligne sur téléphone).
 */
export function fr(s: string): string {
  return s.replace(/ ([:;?!%])/g, '\u00a0$1').replace(/(\d) (h|min|MWh|kWh)\b/g, '$1\u00a0$2');
}

/** « de Tours », « d’Orléans » : élision devant une voyelle. */
export const deNom = (nom: string) => (/^[aeiouyàâéèêîôûœh]/i.test(nom) ? `d’${nom}` : `de ${nom}`);

/** « R03 », « R03 et R05 », « R03, R05 et R07 ». */
export function listeFr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

/** Première lettre en minuscule au milieu d'une phrase, sauf pour un sigle ou un numéro (« UV », « R01 »). */
export function minuscule(s: string): string {
  if (!/^\p{Lu}\p{Ll}/u.test(s)) return s;
  return s[0].toLowerCase() + s.slice(1);
}

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => (n > 1 ? motPluriel : mot);

/** Le mot qui accompagne une efficacité (TRS) : le même sur tous les écrans (ui/explain/lecture). */
export function motEfficacite(trs: number): { mot: string; ton: Ton } {
  return lireEfficacite(trs);
}

/**
 * Ce que font les machines, en une phrase : « 12 machines sur 14 produisent, aucune panne. »
 * Au passé quand l'état vient de l'historique et non du direct.
 */
export function phraseEtat(e: EtatMachines, direct: boolean): string {
  if (!e.total) return 'Aucune machine suivie pour l’instant.';
  const p = e.produisent;
  const verbe = (n: number) => (direct ? pluriel(n, 'produit', 'produisent') : pluriel(n, 'produisait', 'produisaient'));
  const debut =
    p === 0
      ? `Aucune machine ne ${direct ? 'produit' : 'produisait'}`
      : p === e.total
        ? e.total === 1
          ? `La machine ${verbe(1)}`
          : `Les ${e.total} machines ${verbe(e.total)}`
        : `${p} ${pluriel(p, 'machine')} sur ${e.total} ${verbe(p)}`;
  const n = e.panne.length;
  if (!n) return `${debut}, aucune panne.`;
  const etre = direct ? pluriel(n, 'est', 'sont') : pluriel(n, 'était', 'étaient');
  const pannes = n <= 3 ? `${listeFr(e.panne)} ${etre} en panne` : `${n} machines ${etre} en panne`;
  return `${debut} ; ${pannes}.`;
}

/**
 * L'état des machines en quelques mots, à côté d'un repère par machine : « 12 sur 14 produisent », et à part les
 * machines en panne (« R03 en panne »), seules à prendre de la couleur. La phrase entière reste pour les lecteurs
 * d'écran (phraseEtat).
 */
export function motEtat(e: EtatMachines, direct: boolean): { mot: string; panne?: string } {
  if (!e.total) return { mot: 'Aucune machine suivie' };
  const p = e.produisent;
  const verbe = direct ? pluriel(p, 'produit', 'produisent') : pluriel(p, 'produisait', 'produisaient');
  const mot = p === 0 ? `Aucune ne ${direct ? 'produit' : 'produisait'}` : `${p} sur ${e.total} ${verbe}`;
  const n = e.panne.length;
  if (!n) return { mot };
  return { mot, panne: n <= 2 ? `${listeFr(e.panne)} en panne` : `${n} en panne` };
}

/** Une usine tourne quand au moins une de ses machines produit. */
export const tourne = (e: EtatMachines) => e.produisent > 0;

export type ActionAttention = 'supervision' | 'maintenance';

export interface PointAttention {
  ton: Ton;
  /** Ce qui demande de l'attention, sans point final : « 4 entretiens en retard ». */
  titre: string;
  /** Ce qu'il faut savoir de plus : dans le « ? » du point, sauf `detailVisible`. */
  detail?: string;
  /** Le détail sert à agir tout de suite (l'alarme d'une panne en cours) : il reste affiché. */
  detailVisible?: boolean;
  action?: ActionAttention;
}

export interface EntreeAttention {
  /** État en direct, seulement pour l'usine ouverte. */
  direct?: EtatMachines;
  /** Message de l'alarme en cours sur la première machine en panne. */
  alarme?: string;
  retard: number;
  urgent?: EntretienUrgent;
  derives: number;
  derive?: DeriveSuivie;
}

/**
 * Le point qui demande le plus d'attention dans une usine, un seul : une panne en cours d'abord, puis les entretiens
 * en retard, puis une mesure qui glisse vers sa limite, puis une machine à surveiller.
 */
export function pointAttention(p: EntreeAttention): PointAttention {
  const enPanne = p.direct?.panne ?? [];
  if (enPanne.length) {
    return {
      ton: 'crit',
      titre: `${listeFr(enPanne)} ${pluriel(enPanne.length, 'est', 'sont')} en panne`,
      detail: p.alarme ? `Alarme : ${minuscule(p.alarme)}.` : 'La supervision montre l’organe en cause.',
      detailVisible: !!p.alarme,
      action: 'supervision',
    };
  }
  if (p.retard > 0) {
    return {
      ton: 'warn',
      titre: `${p.retard} ${pluriel(p.retard, 'entretien')} en retard`,
      detail: p.urgent ? `Le plus urgent : ${minuscule(p.urgent.tache)}, sur ${p.urgent.numero}.` : undefined,
      action: 'maintenance',
    };
  }
  if (p.derives > 0) {
    return {
      ton: 'warn',
      titre: p.derives > 1 ? `${p.derives} mesures glissent vers leur limite` : '1 mesure glisse vers sa limite',
      detail: p.derive ? `${p.derive.libelle} sur ${p.derive.numero} : un entretien à prévoir avant qu’elle l’atteigne.` : undefined,
      action: 'maintenance',
    };
  }
  const surveiller = p.direct?.surveiller ?? [];
  if (surveiller.length) {
    return {
      ton: 'warn',
      titre: `${listeFr(surveiller)} ${pluriel(surveiller.length, 'est', 'sont')} à surveiller`,
      detail: 'Une mesure a passé son seuil d’attention, sans arrêter la machine.',
      action: 'supervision',
    };
  }
  return { ton: 'ok', titre: 'Rien à signaler' };
}

const RANG: Record<Ton, number> = { crit: 3, warn: 2, neutre: 1, ok: 0 };

/** Le ton le plus grave d'une liste. */
export const pireTon = (tons: Ton[]): Ton => tons.reduce<Ton>((pire, t) => (RANG[t] > RANG[pire] ? t : pire), 'ok');

export interface UsineLue {
  court: string;
  tourne: boolean;
  point: PointAttention;
}

/**
 * La phrase du haut de l'écran : les usines tournent-elles, et laquelle demande de l'attention. Le détail de chaque
 * usine (l'entretien le plus urgent, l'alarme) est sur sa carte, juste dessous : la phrase ne le répète pas.
 */
export function verdictOrganisation(us: UsineLue[]): { verdict: string; ton: Ton; suite?: string } {
  if (!us.length) {
    return { verdict: 'Aucune usine en service pour l’instant.', ton: 'neutre', suite: 'Une usine apparaît ici une fois sa configuration terminée.' };
  }
  const enMarche = us.filter((u) => u.tourne).map((u) => u.court);
  const arretees = us.filter((u) => !u.tourne).map((u) => u.court);
  const seule = us.length === 1;
  const marche = !arretees.length
    ? seule
      ? `${us[0].court} tourne.`
      : `Vos ${us.length} usines tournent.`
    : !enMarche.length
      ? seule
        ? `${us[0].court} est à l’arrêt.`
        : `Vos ${us.length} usines sont à l’arrêt.`
      : `${listeFr(enMarche)} ${pluriel(enMarche.length, 'tourne', 'tournent')}, ${listeFr(arretees)} ${pluriel(arretees.length, 'est', 'sont')} à l’arrêt.`;

  const concernees = us.filter((u) => u.point.ton === 'crit' || u.point.ton === 'warn').sort((a, b) => RANG[b.point.ton] - RANG[a.point.ton]);
  if (!concernees.length) return { verdict: `${marche} Rien ne demande d’attention.`, ton: 'ok' };

  const ton = pireTon(concernees.map((u) => u.point.ton));
  if (concernees.length === 1) {
    const u = concernees[0];
    const verdict = seule ? `${marche} ${u.point.titre}.` : `${marche} ${u.court} demande de l’attention : ${minuscule(u.point.titre)}.`;
    return { verdict, ton };
  }
  return { verdict: `${marche} ${listeFr(concernees.map((u) => u.court))} demandent de l’attention.`, ton };
}

const moyenne = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

/** Écart en dessous duquel deux efficacités moyennes se valent (1,5 point). */
const EGALITE = 0.015;
/** Une usine est plus régulière quand ses jours varient au moins 30 % de moins que ceux des autres, et d'au moins 2 points. */
const REGULARITE = 0.7;
const REGULARITE_MIN = 0.02;

/** Leçon du graphique « jour par jour », en une ligne : qui fait mieux en moyenne, et qui est la plus régulière. */
export function leconEfficacite(usines: { court: string; jours: { trs: number }[] }[]): string {
  const avec = usines
    .filter((u) => u.jours.length)
    .map((u) => {
      const v = u.jours.map((j) => j.trs);
      return { court: u.court, moy: moyenne(v), ecart: Math.max(...v) - Math.min(...v), min: Math.min(...v), max: Math.max(...v) };
    });
  if (!avec.length) return 'Pas encore de journée de production à comparer.';
  if (avec.length === 1) {
    const u = avec[0];
    return `${u.court} : de ${pct(u.min)} à ${pct(u.max)} selon les jours, ${pct(u.moy)} en moyenne.`;
  }
  const parMoy = [...avec].sort((a, b) => b.moy - a.moy);
  const meilleure = parMoy[0];
  const derniere = parMoy[parMoy.length - 1];
  const deux = avec.length === 2;
  const niveau =
    meilleure.moy - derniere.moy < EGALITE
      ? deux
        ? pct(avec[0].moy) === pct(avec[1].moy)
          ? `Les deux usines se valent : ${pct(avec[0].moy)} en moyenne chacune.`
          : `Les deux usines se valent : ${pct(avec[0].moy)} et ${pct(avec[1].moy)} en moyenne.`
        : `Les usines se valent : entre ${pct(derniere.moy)} et ${pct(meilleure.moy)} en moyenne.`
      : deux
        ? `${meilleure.court} fait mieux : ${pct(meilleure.moy)} en moyenne, contre ${pct(derniere.moy)} à ${derniere.court}.`
        : `${meilleure.court} fait le mieux (${pct(meilleure.moy)} en moyenne), ${derniere.court} le moins bien (${pct(derniere.moy)}).`;
  const parEcart = [...avec].sort((a, b) => a.ecart - b.ecart);
  const nette = parEcart[0].ecart <= parEcart[1].ecart * REGULARITE && parEcart[1].ecart - parEcart[0].ecart >= REGULARITE_MIN;
  const reguliere = nette ? parEcart[0] : undefined;
  if (!reguliere) return niveau;
  return `${niveau} ${reguliere.court} a été ${deux ? 'plus' : 'la plus'} régulière.`;
}

/**
 * Leçon des pannes les plus longues, en une ligne. La plus coûteuse est déjà la première ligne de la liste : quand
 * une usine en concentre l'essentiel, c'est ce fait-là qu'on retient.
 */
export function leconArrets(arrets: ArretLong[], nbUsines: number): string {
  if (!arrets.length) return 'Aucune panne sur la période.';
  if (nbUsines > 1) {
    const parUsine = new Map<string, number>();
    for (const x of arrets) parUsine.set(x.court, (parUsine.get(x.court) ?? 0) + 1);
    const [court, n] = [...parUsine.entries()].sort((x, y) => y[1] - x[1])[0];
    if (n >= arrets.length * 0.75) return n === arrets.length ? `Toutes sont à ${court}.` : `${n} sur ${arrets.length} sont à ${court}.`;
  }
  const a = arrets[0];
  return `La plus coûteuse : ${minuscule(a.message)} sur ${a.numero}${nbUsines > 1 ? ` à ${a.court}` : ''}, ${fmtNombre(a.heures, 1)} h en ${a.fois} fois.`;
}

/** Écart d'efficacité (TRS) en dessous duquel les mêmes machines tournent aussi bien d'une usine à l'autre. */
const ECART_NOTABLE = 0.02;

export interface EcartType {
  type: string;
  libelle: string;
  /** Efficacité par usine (identifiant d'usine → TRS). */
  valeurs: { usineId: string; trs: number }[];
  ecart: number;
}

/** Types de machine présents dans au moins deux usines, du plus grand écart au plus petit. */
export function ecartsParType(c: ComparaisonType[]): EcartType[] {
  return c
    .map((t) => {
      const valeurs = Object.entries(t.usines)
        .filter((e): e is [string, NonNullable<(typeof e)[1]>] => !!e[1])
        .map(([usineId, v]) => ({ usineId, trs: v.trs }));
      const trs = valeurs.map((v) => v.trs);
      return { type: t.type, libelle: t.libelle, valeurs, ecart: valeurs.length > 1 ? Math.max(...trs) - Math.min(...trs) : 0 };
    })
    .filter((t) => t.valeurs.length > 1)
    .sort((a, b) => b.ecart - a.ecart);
}

/** Leçon de la comparaison des mêmes machines : le plus grand écart, s'il compte. */
export function leconComparables(ecarts: EcartType[], noms: Record<string, string>): string {
  if (!ecarts.length) return 'Aucun type de machine ne se retrouve dans plusieurs usines : rien à comparer.';
  const t = ecarts[0];
  if (t.ecart < ECART_NOTABLE) return 'Les mêmes machines tournent aussi bien d’une usine à l’autre : moins de 2 points d’écart.';
  const tries = [...t.valeurs].sort((a, b) => b.trs - a.trs);
  const haut = tries[0];
  const bas = tries[tries.length - 1];
  return `Plus grand écart : ${minuscule(t.libelle)}, ${pct(haut.trs)} à ${noms[haut.usineId] ?? '?'} contre ${pct(bas.trs)} à ${noms[bas.usineId] ?? '?'}.`;
}

/** La machine que désigne le plan d'une usine (la lecture du plan est dans son « ? »). */
export function leconPlan(plusTouchee: { numero: string; heures: number } | undefined): string {
  if (!plusTouchee) return 'Aucune panne sur la période : toutes les machines restent grises.';
  return `${plusTouchee.numero} a perdu le plus de temps : ${fmtNombre(plusTouchee.heures, 1)} h.`;
}

/** Mot du temps perdu en pannes d'une usine, comparé à la moyenne de l'organisation (par machine). */
export function motPannes(heuresParMachine: number, moyenneParMachine: number): { mot: string; ton: Ton } | undefined {
  if (!moyenneParMachine) return undefined;
  const r = heuresParMachine / moyenneParMachine;
  if (r > 1.15) return { mot: 'Plus que la moyenne', ton: 'warn' };
  if (r < 0.85) return { mot: 'Moins que la moyenne', ton: 'ok' };
  return { mot: 'Dans la moyenne', ton: 'neutre' };
}

/** Mot du temps perdu en pannes de l'organisation : l'usine qui en perd le plus, rapporté à son nombre de machines. */
export function motPannesOrganisation(usines: { court: string; heures: number; machines: number }[]): { mot: string; ton: Ton } | undefined {
  const avec = usines.filter((u) => u.machines > 0);
  if (avec.length < 2) return undefined;
  const tries = [...avec].sort((a, b) => b.heures / b.machines - a.heures / a.machines);
  const haut = tries[0].heures / tries[0].machines;
  const bas = tries[tries.length - 1].heures / tries[tries.length - 1].machines;
  if (haut < bas * 1.25) return { mot: 'Réparti entre les usines', ton: 'neutre' };
  return { mot: `Surtout à ${tries[0].court}`, ton: 'neutre' };
}

/** Où sont les entretiens en retard : « Tous à Tours. », « 3 à Tours, 1 à Crissey. » */
export function repartitionRetards(usines: { court: string; retard: number }[]): string | undefined {
  const avec = usines.filter((u) => u.retard > 0).sort((a, b) => b.retard - a.retard);
  if (!avec.length || usines.length < 2) return undefined;
  if (avec.length === 1) return avec[0].retard > 1 ? `Tous à ${avec[0].court}.` : `À ${avec[0].court}.`;
  return `${listeFr(avec.map((u) => `${u.retard} à ${u.court}`))}.`;
}
