import { useEffect, useId, useRef, useState } from 'react';
import { Building2, Loader2, MapPin, Search, Globe2, Crosshair, SearchX, WifiOff, CloudOff, RotateCw } from 'lucide-react';
import { communeDe, PRECISION_LIBELLE, RechercheIndisponible, search, type Precision, type SaisieVisite, type SearchResult } from '@/geo/search';
import { useProject } from '@/store/project';
import { isReducedMotion } from '@/store/ui';
import { mapHandle } from '@/widgets/carte/mapState';
import { decalageCarte } from '@/widgets/carte/marges';
import { chooseCandidate, fitLocalisation, locate } from '@/widgets/carte/localisation';

/** Ce que le résultat désigne vraiment (le mot vient de PRECISION_LIBELLE, partagé avec la carte des bâtiments proposés). */
const BADGE: Record<Precision, { tone: 'ok' | 'mid' | 'low'; sens: string }> = {
  gps: { tone: 'ok', sens: 'Le bâtiment sous ce point sera retenu d’office.' },
  numero: { tone: 'ok', sens: 'L’adresse tombe sur un bâtiment précis.' },
  rue: { tone: 'mid', sens: 'Seule la rue est connue : EVAN proposera les bâtiments qui la bordent.' },
  entreprise: { tone: 'mid', sens: 'Adresse déclarée de l’entreprise : EVAN proposera les bâtiments autour.' },
  lieu: { tone: 'mid', sens: 'Lieu connu d’OpenStreetMap : EVAN proposera les bâtiments autour.' },
  commune: { tone: 'low', sens: 'Seule la commune est connue : zoomez ensuite et cliquez sur le bâtiment.' },
};

/** Nombre de lettres à partir duquel la recherche part : en dessous, les résultats seraient trop vagues. */
const LETTRES_MIN = 3;
/** Attente après la dernière lettre tapée, pour ne pas lancer une recherche par touche. */
const ATTENTE_MS = 220;

type Etat = 'vide' | 'court' | 'recherche' | 'resultats' | 'aucun' | 'indisponible';

/**
 * Recherche d'adresse ou d'entreprise avec autocomplétion, puis vol vers le site et détection du bâtiment.
 * Chaque état se voit : quelques lettres de plus à taper, recherche en cours, rien trouvé (et quoi faire alors).
 */
export function SearchBox({ autoFocus, onSaisie }: { autoFocus?: boolean; onSaisie?: (active: boolean) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [etat, setEtat] = useState<Etat>('vide');
  const [active, setActive] = useState(0);
  /** Relance la même recherche après une panne du service (« Réessayer »). */
  const [essai, setEssai] = useState(0);
  const ctrl = useRef<AbortController | null>(null);
  /** Résultats fournis par la visite guidée : ils remplacent la recherche réelle tant que la saisie vient d'elle. */
  const resultatsVisite = useRef<SearchResult[] | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const listeId = useId();

  useEffect(() => {
    const h = (e: Event) => {
      const { q: saisie, resultats } = (e as CustomEvent<SaisieVisite>).detail;
      resultatsVisite.current = resultats;
      setQ(saisie);
      setOpen(saisie.length > 0);
    };
    window.addEventListener('evan:search-type', h);
    return () => window.removeEventListener('evan:search-type', h);
  }, []);

  useEffect(() => onSaisie?.(open && q.trim().length > 0), [open, q, onSaisie]);

  useEffect(() => {
    const t = q.trim();
    if (t.length < LETTRES_MIN) {
      ctrl.current?.abort();
      setResults([]);
      setEtat(t.length ? 'court' : 'vide');
      return;
    }
    if (resultatsVisite.current) {
      ctrl.current?.abort();
      setResults(resultatsVisite.current);
      setActive(0);
      setEtat('resultats');
      return;
    }
    setEtat('recherche');
    const timer = window.setTimeout(async () => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      const c0 = mapHandle.map?.getCenter();
      try {
        const r = await search(q, c.signal, c0 ? [c0.lng, c0.lat] : undefined);
        if (c.signal.aborted) return;
        setResults(r);
        setActive(0);
        setEtat(r.length ? 'resultats' : 'aucun');
      } catch (e) {
        if (!c.signal.aborted) setEtat(e instanceof RechercheIndisponible ? 'indisponible' : 'aucun');
      }
    }, ATTENTE_MS);
    return () => window.clearTimeout(timer);
  }, [q, essai]);

  const choisir = (r: SearchResult) => {
    void pick(r);
    setOpen(false);
    inputRef.current?.blur();
  };

  const listeOuverte = open && etat === 'resultats' && results.length > 0;

  return (
    <div className="searchbox loc-recherche" data-guide="recherche">
      <Search />
      <input
        ref={inputRef}
        className="input glass"
        value={q}
        autoFocus={autoFocus}
        placeholder="Adresse, entreprise, SIRET ou coordonnées GPS…"
        aria-label="Rechercher l’usine : adresse, entreprise, SIRET ou coordonnées GPS"
        role="combobox"
        aria-expanded={listeOuverte}
        aria-controls={listeId}
        aria-autocomplete="list"
        aria-activedescendant={listeOuverte ? `${listeId}-${active}` : undefined}
        aria-busy={etat === 'recherche'}
        onChange={(e) => {
          resultatsVisite.current = undefined;
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 160)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && results[active] && etat === 'resultats') {
            choisir(results[active]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {etat === 'recherche' && <Loader2 className="spin loc-recherche-roue" aria-hidden />}
      <div id={listeId} className="suggest glass" role="listbox" aria-label="Résultats de la recherche" hidden={!listeOuverte}>
        {listeOuverte &&
          results.map((r, i) => (
            <button
              key={r.id}
              id={`${listeId}-${i}`}
              role="option"
              type="button"
              tabIndex={-1}
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choisir(r)}
            >
              <span className="ic">{r.kind === 'entreprise' ? <Building2 /> : r.kind === 'lieu' ? <Globe2 /> : r.kind === 'gps' ? <Crosshair /> : <MapPin />}</span>
              <span className="truncate grow">
                <b className="truncate">{r.label}</b>
                <small className="truncate" style={{ display: 'block' }}>
                  {r.kind === 'entreprise' ? 'Entreprise · ' : ''}
                  {r.sub}
                </small>
              </span>
              <span className={`prec-badge ${BADGE[r.precision].tone}`} title={BADGE[r.precision].sens}>
                {PRECISION_LIBELLE[r.precision]}
              </span>
            </button>
          ))}
      </div>
      {open && etat !== 'vide' && etat !== 'resultats' && (
        <EtatRecherche
          etat={etat}
          q={q.trim()}
          reessayer={() => {
            setEssai((n) => n + 1);
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/** Ce qui se passe quand il n'y a pas (encore) de résultat à montrer. */
function EtatRecherche({ etat, q, reessayer }: { etat: Etat; q: string; reessayer: () => void }) {
  if (etat === 'court') {
    return (
      <div className="suggest glass loc-recherche-etat" role="status">
        <p>Encore {LETTRES_MIN - q.length > 1 ? `${LETTRES_MIN - q.length} lettres` : 'une lettre'} et la recherche démarre.</p>
      </div>
    );
  }
  if (etat === 'recherche') {
    return (
      <div className="suggest glass loc-recherche-etat" role="status">
        <p className="row">
          <Loader2 className="spin" aria-hidden /> Recherche de « {q} »…
        </p>
      </div>
    );
  }
  const horsLigne = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (etat === 'indisponible' && !horsLigne) {
    // Le service n'a pas répondu : l'orthographe n'y est pour rien. On le dit, et on propose de relancer.
    return (
      <div className="suggest glass loc-recherche-etat erreur" role="status">
        <p className="row">
          <CloudOff aria-hidden />
          <b>Le service d’adresse ne répond pas.</b>
        </p>
        <p>Réessayez dans un instant. En attendant, vous pouvez zoomer sur la carte et cliquer sur le toit de l’usine.</p>
        {/* Le clic ne doit pas ôter le focus du champ : la liste se fermerait avant que la relance parte. */}
        <button type="button" className="btn sm loc-recherche-relance" onMouseDown={(e) => e.preventDefault()} onClick={reessayer}>
          <RotateCw aria-hidden /> Réessayer
        </button>
      </div>
    );
  }
  return (
    <div className="suggest glass loc-recherche-etat erreur" role="status">
      <p className="row">
        {horsLigne ? <WifiOff aria-hidden /> : <SearchX aria-hidden />}
        <b>{horsLigne ? 'Pas de connexion à internet.' : `Rien trouvé pour « ${q} ».`}</b>
      </p>
      <p>
        {horsLigne
          ? 'La recherche d’adresse en a besoin. Vous pouvez quand même zoomer sur la carte et cliquer sur le bâtiment.'
          : 'Vérifiez l’orthographe, ou tapez seulement la rue et la commune. Sinon, zoomez sur la carte et cliquez sur le toit de l’usine.'}
      </p>
    </div>
  );
}

/**
 * Vol vers le résultat et, en parallèle, recherche des bâtiments qu'il désigne.
 * Un point qui tombe dans un bâtiment (GPS, numéro de rue) le retient d'office ; sinon (rue entière, position SIRENE)
 * les bâtiments candidats sont proposés, lettrés, et l'utilisateur confirme le sien.
 */
export async function pick(r: SearchResult, opts: { detect?: boolean } = {}) {
  const map = mapHandle.map;
  const project = useProject.getState();
  if (project.mode === 'assistant') {
    // L'usine porte le nom de sa commune : une organisation peut en compter plusieurs.
    const commune = communeDe(r.kind === 'entreprise' ? r.adresse : r.label);
    project.setSite({
      id: project.activeId,
      organisationId: project.organisation.id,
      nom: commune ?? r.entreprise ?? (r.kind === 'gps' ? 'Mon usine' : r.label),
      adresse: r.kind === 'entreprise' ? (r.adresse ?? r.label) : r.kind === 'gps' ? `Point GPS ${r.label}` : `${r.label}${r.sub ? `, ${r.sub}` : ''}`,
      coordonnees: r.coords,
      repere: { origin: r.coords, angleDeg: 0 },
      siret: r.siret,
    });
    if (r.entreprise && !project.organisation.nom) project.setOrganisationNom(r.entreprise);
  }
  const loc = locate(r);
  if (!map) return;
  await new Promise<void>((resolve) => {
    map.once('moveend', () => resolve());
    // L'adresse arrive au centre de ce qui se voit, sous la barre de recherche, pas au milieu de la toile.
    map.flyTo({ center: r.coords, zoom: Math.min(r.zoom, 17.5), offset: decalageCarte(map), speed: 1.4, curve: 1.6, essential: false, duration: isReducedMotion() ? 0 : undefined });
  });
  const res = await loc;
  if (!res) return;
  const auto = opts.detect ?? (useProject.getState().mode === 'assistant' && useProject.getState().batiments.length === 0);
  if (res.auto && auto) await chooseCandidate(res.auto);
  if (res.candidates.length > (res.auto && auto ? 1 : 0)) fitLocalisation(res);
}
