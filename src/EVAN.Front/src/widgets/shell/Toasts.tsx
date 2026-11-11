import { useLayoutEffect, useRef, type RefObject } from 'react';
import { AlertOctagon, AlertTriangle, Check, Info, LocateFixed, X } from 'lucide-react';
import { useLive, type Toast } from '@/store/live';
import { useUi, type CameraFocus } from '@/store/ui';
import { StatusIcon } from '@/ui/status';
import type { Alarme, EtatMachine } from '@/domain/types';
import { estExercice } from '@/widgets/pannes/exercice';
import { focusAlarm } from './navigation';

/**
 * Ce qui vient de se passer, dit avant le détail : le titre d'un avis est souvent technique (« EM-01 · R04 Gallus »),
 * cette ligne le traduit selon sa gravité. Une alarme se repère par la forme de l'état qu'elle donne à la machine
 * (carré pour une panne, triangle pour une mesure à surveiller), comme sur la scène ; les autres avis gardent une
 * icône neutre.
 */
const QUOI: Record<Toast['gravite'], { mot: string; alarme?: string; etat?: EtatMachine; icone: typeof Info }> = {
  critique: { mot: 'Problème', alarme: 'Panne détectée', etat: 'panne', icone: AlertOctagon },
  attention: { mot: 'À surveiller', alarme: 'Mesure hors de sa plage', etat: 'attention', icone: AlertTriangle },
  succes: { mot: 'C’est fait', icone: Check },
  info: { mot: 'Pour information', icone: Info },
};

/** Temps d'affichage d'un avis (miroir de store/live.ts) : le trait du bas se vide pendant ce temps. */
const DUREE_S: Record<Toast['gravite'], number> = { critique: 12, attention: 6, succes: 6, info: 6 };

/**
 * L'avis d'une alarme dont la fiche est déjà ouverte sur la pièce, dans la supervision : il redirait la même chose,
 * par-dessus la fiche, et ses boutons cachaient les siens.
 */
export function avisRedondant(t: Pick<Toast, 'alarmeId'>, alarme: Pick<Alarme, 'organeId' | 'statut'> | undefined, step: number, focus: CameraFocus): boolean {
  if (!t.alarmeId || !alarme || alarme.statut === 'resolue') return false;
  return step === 6 && focus.kind === 'organe' && focus.organeId === alarme.organeId;
}

/** Première ligne de l'avis d'une alarme : une dérive n'est pas encore hors de sa plage, elle y va. */
export function quoiAlarme(t: Pick<Toast, 'gravite'>, a: Pick<Alarme, 'regle'> | undefined): string | undefined {
  if (a?.regle === 'derive') return 'Dérive repérée';
  return QUOI[t.gravite].alarme;
}

/** Ce que dit la première ligne d'un avis d'exercice : une mesure hors plage n'est pas encore une panne. */
function quoiExercice(t: Toast): string {
  return t.gravite === 'critique' ? 'Panne d’exercice' : 'Exercice, mesure hors plage';
}

/**
 * Place les avis en haut à droite de la scène : ils sont rendus hors d'elle (la scène isole ses calques, un avis
 * rendu dedans passerait sous les fenêtres), à la position qu'elle occupe, tenue à jour quand le bandeau du haut
 * change de hauteur.
 */
function useSurScene(ref: RefObject<HTMLDivElement | null>, actif: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    const scene = document.querySelector<HTMLElement>('main.stage');
    if (!actif || !el || !scene) return;
    const placer = () => {
      const r = scene.getBoundingClientRect();
      el.style.setProperty('--scene-haut', `${Math.round(r.top + 12)}px`);
      el.style.setProperty('--scene-droite', `${Math.round(window.innerWidth - r.right + 12)}px`);
    };
    placer();
    const ro = new ResizeObserver(placer);
    ro.observe(scene);
    window.addEventListener('resize', placer);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', placer);
    };
  }, [ref, actif]);
}

/**
 * Avis du coin de l'écran : en haut à droite de la scène en supervision et en configuration (loin de la fiche de la
 * pièce), en bas à droite sur les écrans en pleine page, en haut à droite de l'écran par-dessus une fenêtre ouverte
 * (un « Annuler » poussé pendant qu'elle est ouverte restait caché dessous). Une panne s'annonce tout de suite (role
 * alert) ; les autres avis attendent que le lecteur d'écran ait fini sa phrase (région polie).
 */
export function Toasts({ surScene = false }: { surScene?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useSurScene(ref, surScene);
  const toasts = useLive((s) => s.toasts);
  const dismiss = useLive((s) => s.dismissToast);
  const alarms = useLive((s) => s.alarms);
  const step = useUi((s) => s.step);
  const focus = useUi((s) => s.focus);
  return (
    <div ref={ref} className={`toasts ${surScene ? 'sur-scene' : ''}`} aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => {
        const q = QUOI[t.gravite];
        const Icone = q.icone;
        const alarme = !!t.alarmeId && !!q.etat;
        const a = t.alarmeId ? alarms.find((x) => x.id === t.alarmeId) : undefined;
        if (avisRedondant(t, a, step, focus)) return null;
        // Une panne d'exercice garde son pointillé et reste neutre : le cramoisi est réservé aux pannes réelles.
        const exercice = t.exercice ?? estExercice(a);
        return (
          <div key={t.id} className={`avis ${t.gravite} ${exercice ? 'exercice' : ''}`} role={t.gravite === 'critique' ? 'alert' : undefined}>
            <span className="avis-forme" aria-hidden>
              {alarme ? <StatusIcon etat={q.etat!} size={12} animate={false} /> : <Icone />}
            </span>
            <div>
              <span className="avis-quoi">{exercice ? quoiExercice(t) : alarme ? (quoiAlarme(t, a) ?? q.mot) : q.mot}</span>
              <b>{t.titre}</b>
              {t.texte && <p>{t.texte}</p>}
              {t.action && (
                <button
                  className="btn sm"
                  onClick={() => {
                    t.action!.faire();
                    dismiss(t.id);
                  }}
                >
                  {t.action.libelle}
                </button>
              )}
              {/* « Voir la pièce en cause » : inutile quand la caméra y est déjà. */}
              {t.alarmeId && !t.action && !(focus.kind === 'organe' && a && focus.organeId === a.organeId) && (
                <button
                  className="btn sm"
                  onClick={() => {
                    focusAlarm(t.alarmeId!);
                    dismiss(t.id);
                  }}
                  title="Amène la vue 3D jusqu’à la pièce de la machine qui a déclenché l’alarme"
                >
                  <LocateFixed aria-hidden /> Voir la pièce en cause
                </button>
              )}
            </div>
            <button className="btn sm icon ghost" onClick={() => dismiss(t.id)} aria-label="Fermer cet avis" title="Fermer">
              <X />
            </button>
            <i className="avis-temps" aria-hidden style={{ ['--duree' as string]: `${(t.duree ?? (t.action ? 10000 : DUREE_S[t.gravite] * 1000)) / 1000}s` }} />
          </div>
        );
      })}
    </div>
  );
}
