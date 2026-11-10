/**
 * Frontière d'erreur : une panne d'affichage (modèle 3D illisible, WebGL refusé, carte) reste locale au lieu de vider
 * toute la page. `resetKey` relance l'affichage quand le contexte change (autre usine, autre modèle).
 */
import { Component, type ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

interface Props {
  /** Affiché à la place du contenu en erreur ; reçoit de quoi réessayer. */
  fallback: ReactNode | ((retry: () => void) => ReactNode);
  resetKey?: unknown;
  /** Nom de la zone dans le journal de la console. */
  label: string;
  children: ReactNode;
}

interface State {
  error?: Error;
  key?: unknown;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { key: props.resetKey, error: undefined } : null;
  }

  componentDidCatch(error: Error) {
    console.error(`[EVAN] ${this.props.label} indisponible :`, error);
  }

  /**
   * Réessayer. Un module chargé à la demande qui a échoué (fichier disparu après un déploiement) reste en échec dans le
   * cache de React.lazy : seul un rechargement de la page récupère la nouvelle version.
   */
  private retry = () => {
    if (isChunkError(this.state.error)) location.reload();
    else this.setState({ error: undefined });
  };

  render() {
    if (!this.state.error) return this.props.children;
    const { fallback } = this.props;
    return typeof fallback === 'function' ? fallback(this.retry) : fallback;
  }
}

/** Échec de chargement d'un module JavaScript (nom de fichier périmé après une mise à jour, réseau coupé). */
export function isChunkError(error: unknown): boolean {
  return error instanceof Error && /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(error.message);
}

/**
 * Encart affiché à la place d'une vue en erreur : ce qui ne s'affiche pas, ce qui marche encore, et de quoi réessayer.
 * Même allure que les pages d'erreur du routeur, à l'échelle d'une zone.
 */
export function Indisponible({ titre, texte, retry }: { titre: string; texte: string; retry?: () => void }) {
  return (
    <div role="alert" className="indispo">
      <div className="indispo-carte">
        <span className="indispo-icone" aria-hidden>
          <TriangleAlert />
        </span>
        <h3>{titre}</h3>
        <p>{texte}</p>
        {retry && (
          <button className="btn sm" onClick={retry}>
            <RefreshCw aria-hidden /> Réessayer
          </button>
        )}
      </div>
    </div>
  );
}
