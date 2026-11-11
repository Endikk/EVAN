/**
 * Sélecteur d'usine de la barre du haut. Le bouton dit où l'on est (l'organisation, l'usine ouverte ou la vue
 * d'ensemble) et l'état de l'usine ouverte, en forme et en mot. Le menu liste la vue d'ensemble, chaque usine avec son
 * adresse et son état, et l'ajout d'une usine dans l'assistant.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Building2, Check, ChevronDown, LayoutGrid, Pencil, Plus } from 'lucide-react';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { useLive } from '@/store/live';
import { TonGlyph, type Ton } from '@/ui/explain';
import type { BrandStatus } from '@/ui/brand';
import { usePlantStatus } from '@/widgets/shell/Brand';
import { stopTour } from '@/widgets/tour/tour';
import { openOrganisation } from '@/widgets/shell/navigation';
import { formatArea } from '@/geo/geodesy';
import { addUsine, openUsine, resumeUsines } from './usines';
import './usines.css';

/** L'état de l'usine ouverte, tel que le direct le donne : une forme et un mot, jamais la couleur seule. */
const ETAT_DIRECT: Record<BrandStatus, { ton: Ton; mot: string }> = {
  ok: { ton: 'ok', mot: 'En marche' },
  warn: { ton: 'warn', mot: 'À surveiller' },
  crit: { ton: 'crit', mot: 'Panne en cours' },
};

/** État en direct de l'usine ouverte, ou rien tant qu'elle n'est pas en service ou que le flux n'a rien envoyé. */
export function useEtatOuverte() {
  const configure = useProject((s) => s.configure);
  const recu = useLive((s) => Object.keys(s.machines).length > 0);
  const status = usePlantStatus();
  // Une panne d'exercice (« Simuler une panne ») ne fait pas passer l'usine au cramoisi : le cramoisi reste aux
  // pannes réelles, comme sur la fiche et dans les avis.
  const exerciceSeul = useLive((s) => {
    const ouvertes = s.alarms.filter((a) => a.statut !== 'resolue' && a.gravite === 'critique');
    return ouvertes.length > 0 && ouvertes.every((a) => a.exercice);
  });
  if (!configure || !recu) return undefined;
  if (status === 'crit' && exerciceSeul) return { ton: 'neutre' as Ton, mot: 'Exercice de panne' };
  return ETAT_DIRECT[status];
}

/** Ouvre une usine de l'organisation ; depuis la vue d'ensemble, choisir l'usine active revient simplement sur elle. */
export function choisirUsine(id: string) {
  stopTour();
  const ui = useUi.getState();
  if (id === useProject.getState().activeId) {
    if (ui.vueOrganisation) ui.setVueOrganisation(false);
    return;
  }
  ui.setVueOrganisation(false);
  void openUsine(id);
}

export function UsineMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const organisation = useProject((s) => s.organisation.nom);
  const site = useProject((s) => s.site?.nom);
  const count = useProject((s) => s.usines.length);
  const vueOrganisation = useUi((s) => s.vueOrganisation);
  const etat = useEtatOuverte();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const orgNom = organisation || 'Organisation';
  const ici = vueOrganisation ? 'Vue d’ensemble' : (site ?? 'Nouvelle usine');
  // L'état ne concerne que l'usine ouverte : la vue d'ensemble a sa propre phrase.
  const etatAffiche = vueOrganisation ? undefined : etat;
  const lu = `${orgNom}, ${ici}${etatAffiche ? `, ${etatAffiche.mot.toLowerCase()}` : ''}. ${count > 1 ? `Changer d’usine (${count} usines)` : 'Organisation et usines'}`;

  return (
    <div className="usine-menu" ref={root}>
      <button
        ref={button}
        className="usine-switch"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={lu}
        onClick={() => setOpen((v) => !v)}
        title={count > 1 ? `Changer d’usine (${count} usines)` : 'Organisation et usines'}
      >
        <span className="usine-switch-icone" aria-hidden>
          {vueOrganisation ? <LayoutGrid /> : <Building2 />}
          {etatAffiche && (
            <span className="usine-switch-badge">
              <TonGlyph ton={etatAffiche.ton} />
            </span>
          )}
        </span>
        <span className="usine-switch-txt hide-md" aria-hidden>
          <small className="truncate">{orgNom}</small>
          <b className="truncate">{ici}</b>
        </span>
        {etatAffiche && (
          <span className={`usine-switch-etat ton-${etatAffiche.ton} hide-lg`} aria-hidden>
            {etatAffiche.mot}
          </span>
        )}
        <ChevronDown className="usine-chevron" aria-hidden />
      </button>
      {open && <UsinePanel onClose={() => setOpen(false)} />}
    </div>
  );
}

function UsinePanel({ onClose }: { onClose: () => void }) {
  const mode = useProject((s) => s.mode);
  const organisation = useProject((s) => s.organisation.nom);
  const activeId = useProject((s) => s.activeId);
  // Dépendances stables : la liste est recalculée quand une usine change, sans recréer d'objet à chaque rendu.
  const usinesStore = useProject((s) => s.usines);
  const site = useProject((s) => s.site);
  const batiments = useProject((s) => s.batiments);
  const machines = useProject((s) => s.machines);
  const configure = useProject((s) => s.configure);
  const usines = useMemo(() => resumeUsines(useProject.getState()), [usinesStore, activeId, site, batiments, machines, configure]);
  const etat = useEtatOuverte();
  const totalMachines = usines.reduce((s, u) => s + u.machines, 0);
  const totalSurface = usines.reduce((s, u) => s + u.surface, 0);
  const vueOrganisation = useUi((s) => s.vueOrganisation);
  const enExploitation = usines.some((u) => u.configure);
  const assistant = mode === 'assistant';
  // Le nom de l'organisation d'un compte vient du serveur : il ne se renomme pas depuis ce navigateur.
  const serveur = useProject((s) => s.serveur);
  const renommable = assistant && !serveur;
  // Entrée du menu en cascade, du haut vers le bas : l'organisation, la vue d'ensemble, chaque usine, le pied.
  const debutListe = enExploitation ? 2 : 1;
  const entree = (i: number) => ({ '--i': i }) as CSSProperties;

  const choose = (id: string) => {
    onClose();
    choisirUsine(id);
  };

  return (
    <div className="usine-panel" role="dialog" aria-label="Organisation et usines">
      <div className="usine-org usine-entree" style={entree(0)}>
        <div style={{ minWidth: 0 }}>
          <span className="usine-kicker">Organisation</span>
          <b className="truncate">{organisation || 'Sans nom'}</b>
          <span className="muted num">
            {usines.length} {usines.length > 1 ? 'usines' : 'usine'}, {totalMachines} {totalMachines > 1 ? 'machines' : 'machine'}
            {assistant && totalSurface > 0 && `, ${formatArea(totalSurface)}`}
          </span>
        </div>
        {renommable && (
          <button
            className="btn sm icon ghost"
            title="Renommer l’organisation"
            aria-label="Renommer l’organisation"
            onClick={() => (onClose(), useUi.getState().setOrganisationEdit(true))}
          >
            <Pencil />
          </button>
        )}
      </div>
      {enExploitation && (
        <button
          className={`usine-item usine-all usine-entree ${vueOrganisation ? 'on' : ''}`}
          style={entree(1)}
          aria-current={vueOrganisation ? 'true' : undefined}
          onClick={() => {
            onClose();
            stopTour();
            openOrganisation();
          }}
        >
          <LayoutGrid className="usine-all-icon" aria-hidden />
          <span className="usine-item-txt">
            <b>Vue d’ensemble</b>
            <span className="muted">
              {usines.length > 1 ? 'Toutes vos usines côte à côte' : 'Votre usine en un coup d’œil'} : ce qui tourne, ce qui demande de l’attention.
            </span>
          </span>
          {vueOrganisation && <Check className="usine-check" aria-hidden />}
        </button>
      )}
      <ul className="usine-list">
        {usines.map((u, i) => {
          const active = u.id === activeId;
          const ici = active && !vueOrganisation;
          const direct = active && u.configure ? etat : undefined;
          const ton: Ton = direct?.ton ?? 'neutre';
          const situation = !u.configure ? 'configuration à terminer' : direct ? direct.mot.toLowerCase() : 'le direct s’affiche à l’ouverture';
          return (
            <li key={u.id} className="usine-entree" style={entree(debutListe + i)}>
              <button className={`usine-item ${ici ? 'on' : ''}`} aria-current={ici ? 'true' : undefined} onClick={() => choose(u.id)}>
                {/* Pas de repère pour une usine fermée : son état n'est connu qu'à l'ouverture (voir UsinesListe). */}
                <span className="usine-item-glyphe">{direct && <TonGlyph ton={ton} />}</span>
                <span className="usine-item-txt">
                  <b className="truncate">{u.nom}</b>
                  {u.adresse && <span className="muted truncate">{u.adresse}</span>}
                  <span className={`usine-item-etat ton-${ton}`}>
                    {u.machines} {u.machines > 1 ? 'machines' : 'machine'}
                    {assistant && u.surface > 0 && `, ${formatArea(u.surface)}`} · {situation}
                  </span>
                </span>
                {ici && <Check className="usine-check" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      {assistant ? (
        <button
          className="btn sm subtle usine-add usine-entree"
          style={entree(debutListe + usines.length)}
          onClick={() => {
            onClose();
            stopTour();
            void addUsine();
          }}
        >
          <Plus /> Ajouter une usine
        </button>
      ) : (
        <p className="usine-note faint usine-entree" style={entree(debutListe + usines.length)}>
          Démonstration : deux usines d’exemple, chacune avec son plan, ses machines et son propre direct.
        </p>
      )}
    </div>
  );
}
