/**
 * Les écrans de l'espace de travail et leur adresse : /demo/plan, /assistant/supervision…
 * Un écran est une étape du parcours (1 à 9) ou la vue d'ensemble de l'organisation.
 */
import type { Step } from '@/store/ui';
import type { ProjectMode } from '@/store/project';
import { CONFIG_STEPS, EXPLOIT_TABS, STEPS } from './steps';

export type Ecran = Step | 'organisation';

const SLUG_ETAPE = {
  1: 'localiser',
  2: 'plan',
  3: 'machines',
  4: 'organes',
  5: 'connexion',
  6: 'supervision',
  7: 'historique',
  8: 'maintenance',
  9: 'energie',
} as const satisfies Record<Step, string>;

export type Slug = (typeof SLUG_ETAPE)[Step] | 'organisation';

const ETAPE_SLUG = new Map<string, Step>(Object.entries(SLUG_ETAPE).map(([n, slug]) => [slug, Number(n) as Step]));

const MODES: readonly ProjectMode[] = ['demo', 'assistant'];

export function slugDe(e: Ecran): Slug {
  return e === 'organisation' ? e : SLUG_ETAPE[e];
}

export function ecranDe(slug: string): Ecran | undefined {
  return slug === 'organisation' ? slug : ETAPE_SLUG.get(slug);
}

export function chemin(mode: ProjectMode, e: Ecran): string {
  return `/${mode}/${slugDe(e)}`;
}

/** Écran d'une adresse de l'espace de travail : `ecran` absent pour /demo seul, null hors de l'espace de travail. */
export function lireChemin(pathname: string): { mode: ProjectMode; ecran?: Ecran } | null {
  const [mode, slug, ...reste] = pathname.split('/').filter(Boolean);
  if (!MODES.includes(mode as ProjectMode) || reste.length) return null;
  if (!slug) return { mode: mode as ProjectMode };
  const ecran = ecranDe(slug);
  return ecran === undefined ? null : { mode: mode as ProjectMode, ecran };
}

/** Écran de paramétrage (étapes 1 à 5), derrière l'accès protégé une fois l'usine configurée. */
export function estConfiguration(e: Ecran): e is Step {
  return CONFIG_STEPS.some((s) => s.n === e);
}

/** Titre de l'écran, repris dans l'onglet du navigateur. */
export function titreEcran(e: Ecran): string {
  if (e === 'organisation') return 'Toutes les usines';
  return [...STEPS, ...EXPLOIT_TABS].find((s) => s.n === e)?.titre ?? 'EVAN';
}
