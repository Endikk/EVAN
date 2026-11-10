/**
 * Horloge du film d'ouverture : la seule source du temps. Elle compte des images (60 par seconde) ; tout le reste
 * (page, carte, 3D) lit `image()` et en déduit son état par timeline.ts. Pas de minuterie : le compte avance d'une
 * image d'affichage à l'autre et saute à la fin au premier geste du visiteur.
 *
 * La presse 3D se charge pendant que le titre est à l'écran, et sa première image (analyse du modèle, compilation des
 * shaders) bloque le navigateur plusieurs dixièmes de seconde. Tant qu'elle n'est pas dessinée, le film respire sur sa
 * première image (il avance quatre fois moins vite, sans dépasser ATTENTE_TITRE) ; au-delà de 3 s, il repart et
 * attend la presse sur l'image ATTENTE, où le point est prêt à partir.
 *
 * En relecture (`?film=capture`), rien n'avance seul : `aller(f)` place le film sur l'image f, fait dessiner la 3D à
 * cette image et réécrit la page. Un script rend ainsi le film image par image (tests/e2e/film/).
 */
import { ATTENTE, ATTENTE_TITRE, FIN, FPS, canaux, type Canaux, type Phase } from './timeline';
import type { Ancres } from './geometrie';

export type Mode = 'lecture' | 'capture';

/** Au-delà, la presse ne viendra pas (réseau lent, WebGL absent) : la page se pose sans le film. */
const ATTENTE_MAX_MS = 6000;
/** Le titre n'attend pas la presse plus longtemps : il se range, le point attendra sur son image. */
const ATTENTE_TITRE_MS = 3000;
/** Pendant l'attente sur la première image, le film avance à ce rythme : le titre respire sans rien révéler. */
const RALENTI = 0.25;
/** Un onglet repris après un long arrêt reprend le film où il était, sans sauter d'un coup. */
const PAS_MAX_S = 1 / 20;

export interface Horloge {
  readonly mode: Mode;
  image(): number;
  canaux(): Canaux;
  /** Canaux à une autre image (l'historique des écrans de la presse). */
  canauxA(f: number): Canaux;
  phase(): Phase;
  /** Ancres écrites par la 3D, lues par la page. */
  ancres: Ancres;
  /** La 3D est prête : modèle chargé, ancres calculées. */
  pret(): boolean;
  signalerPret(): void;
  /** La 3D se branche ici : en relecture, dessiner l'image demandée (secondes). */
  brancher3D(dessiner: ((t: number) => void) | null): void;
  demarrer(): void;
  /** Saute à la fin : la page se pose, l'action du visiteur suit. */
  passer(): void;
  aller(f: number): void;
  abonner(cb: () => void): () => void;
  /** Promesse tenue quand la 3D est prête (relecture). */
  readonly pretPromesse: Promise<void>;
  arreter(): void;
}

export function creerHorloge(mode: Mode): Horloge {
  let f = 0;
  let cache: { f: number; c: Canaux } | null = null;
  let estPret = false;
  let dessiner3D: ((t: number) => void) | null = null;
  let raf = 0;
  let avant = 0;
  let debut = 0;
  let attenteDepuis = 0;
  let resoudre: () => void = () => {};
  const pretPromesse = new Promise<void>((r) => (resoudre = r));
  const abonnes = new Set<() => void>();

  const notifier = () => abonnes.forEach((cb) => cb());
  const lire = (): Canaux => {
    if (!cache || cache.f !== f) cache = { f, c: canaux(f) };
    return cache.c;
  };

  const tic = (maintenant: number) => {
    const dt = avant ? Math.min(PAS_MAX_S, (maintenant - avant) / 1000) : 0;
    avant = maintenant;
    debut ||= maintenant;
    const titreAttend = !estPret && maintenant - debut < ATTENTE_TITRE_MS;
    let suivante = f + dt * FPS * (titreAttend ? RALENTI : 1);
    if (titreAttend) suivante = Math.min(suivante, ATTENTE_TITRE);
    if (!estPret && suivante >= ATTENTE) {
      suivante = ATTENTE;
      attenteDepuis ||= maintenant;
      if (maintenant - attenteDepuis > ATTENTE_MAX_MS) suivante = FIN;
    }
    f = Math.min(FIN, suivante);
    notifier();
    if (f < FIN) raf = requestAnimationFrame(tic);
  };

  return {
    mode,
    ancres: { rouleau: null, point: null, pin: null },
    image: () => f,
    canaux: lire,
    canauxA: (image) => canaux(Math.max(0, image)),
    phase: () => lire().phase,
    pret: () => estPret,
    pretPromesse,
    signalerPret() {
      if (estPret) return;
      estPret = true;
      resoudre();
    },
    brancher3D(dessiner) {
      dessiner3D = dessiner;
    },
    demarrer() {
      if (mode !== 'lecture' || raf) return;
      raf = requestAnimationFrame(tic);
    },
    passer() {
      if (f >= FIN) return;
      cancelAnimationFrame(raf);
      f = FIN;
      notifier();
    },
    aller(image) {
      f = Math.max(0, Math.min(FIN, image));
      dessiner3D?.(f / FPS);
      notifier();
    },
    abonner(cb) {
      abonnes.add(cb);
      return () => abonnes.delete(cb);
    },
    arreter() {
      cancelAnimationFrame(raf);
      raf = 0;
      avant = 0;
      debut = 0;
      abonnes.clear();
    },
  };
}
