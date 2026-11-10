/**
 * Les zones de l'espace de travail, que chaque page remplit : panneau latéral, bandeau d'indicateurs, commandes posées
 * sur la carte, écran en pleine page. La mise en page (pages/workspace) place les zones ; une page dit seulement ce
 * qu'elle met dans chacune, par exemple <Zone nom="panneau"><PlanPanel /></Zone>.
 */
import { Suspense, createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router';
import { useProject } from '@/store/project';
import { ErrorBoundary, Indisponible } from '@/ui/ErrorBoundary';

export type NomZone = 'panneau' | 'bandeau' | 'carte' | 'pleine-page';

type Noeuds = Partial<Record<NomZone, HTMLElement>>;

const ZonesContext = createContext<Noeuds>({});

export const ZonesProvider = ZonesContext.Provider;

/** Côté mise en page : les éléments qui reçoivent les zones, et la référence à poser sur chacun. */
export function useZonesHote() {
  const [noeuds, setNoeuds] = useState<Noeuds>({});
  const refs = useMemo(() => {
    const ref = (nom: NomZone) => (el: HTMLElement | null) =>
      setNoeuds((n) => (n[nom] === (el ?? undefined) ? n : { ...n, [nom]: el ?? undefined }));
    return { panneau: ref('panneau'), bandeau: ref('bandeau'), carte: ref('carte'), 'pleine-page': ref('pleine-page') } satisfies Record<
      NomZone,
      (el: HTMLElement | null) => void
    >;
  }, []);
  return { noeuds, refs };
}

/** Un écran en pleine page qui plante laisse les autres onglets utilisables. */
function EcranProtege({ children }: { children: ReactNode }) {
  const activeId = useProject((s) => s.activeId);
  const { pathname } = useLocation();
  return (
    <ErrorBoundary
      label="Écran d’exploitation"
      resetKey={`${activeId}-${pathname}`}
      fallback={(retry) => <Indisponible titre="Écran indisponible" texte="Cet écran a rencontré une erreur. Les autres onglets restent utilisables." retry={retry} />}
    >
      {children}
    </ErrorBoundary>
  );
}

/** Contenu d'une page placé dans une zone de la mise en page (rien tant que la zone n'est pas affichée). */
export function Zone({ nom, children }: { nom: NomZone; children: ReactNode }) {
  const noeud = useContext(ZonesContext)[nom];
  if (!noeud) return null;
  const contenu = <Suspense fallback={null}>{children}</Suspense>;
  return createPortal(nom === 'pleine-page' ? <EcranProtege>{contenu}</EcranProtege> : contenu, noeud);
}
