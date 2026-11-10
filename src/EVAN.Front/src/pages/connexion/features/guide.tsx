/** « Comment lire cet écran » pour l'étape 5, avec le trajet des valeurs de l'automate jusqu'à EVAN. */
import { Cpu, Monitor, Router } from 'lucide-react';
import type { GuideEcran } from '@/ui/explain';

/** Les valeurs remontent de l'automate vers EVAN, par la passerelle : jamais dans l'autre sens. */
function SchemaTrajet() {
  const troncon = (
    <span className="cx-troncon encours retour" aria-hidden>
      <svg viewBox="0 0 100 12" preserveAspectRatio="none">
        <line className="cx-t-fond" x1="0" y1="6" x2="100" y2="6" vectorEffect="non-scaling-stroke" />
        <line className="cx-t-trait" x1="0" y1="6" x2="100" y2="6" pathLength={100} vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
  return (
    <div className="cx-lien cx-schema" role="img" aria-label="Les valeurs partent de l’automate, passent par la passerelle de l’usine et arrivent dans EVAN.">
      <span className="cx-noeud ok">
        <span className="cx-noeud-icone">
          <Monitor aria-hidden />
        </span>
        <span className="cx-noeud-nom">EVAN</span>
      </span>
      {troncon}
      <span className="cx-noeud ok">
        <span className="cx-noeud-icone">
          <Router aria-hidden />
        </span>
        <span className="cx-noeud-nom">Passerelle</span>
      </span>
      {troncon}
      <span className="cx-noeud ok">
        <span className="cx-noeud-icone">
          <Cpu aria-hidden />
        </span>
        <span className="cx-noeud-nom">Automate</span>
      </span>
    </div>
  );
}

export const GUIDE_CONNEXION: GuideEcran = {
  id: 'connexion',
  titre: 'Brancher les machines à EVAN',
  resume:
    'EVAN lit les valeurs dans l’automate de chaque machine : vitesse, tensions, températures, alarmes. Ici, on lui dit comment joindre cet automate, on vérifie que la liaison passe, puis on relie chaque valeur lue à l’organe qui lui correspond.',
  blocs: [
    {
      titre: 'À faire ici',
      cible: 'a-faire',
      texte: <p>La liste se coche seule : une machine compte comme branchée une fois sa connexion enregistrée.</p>,
    },
    {
      titre: 'Les quatre temps',
      cible: 'connexion-etapes',
      texte: (
        <p>
          Protocole, adresse, test, variables : dans cet ordre, pour chaque machine. Un temps déjà fait se rouvre d’un clic sur son numéro. Une machine
          déjà branchée s’ouvre directement sur ses variables.
        </p>
      ),
    },
    {
      titre: 'Le test de liaison',
      cible: 'connexion-test',
      schema: <SchemaTrajet />,
      texte: (
        <>
          <p>
            EVAN ne parle pas directement à la machine : il passe par la passerelle de l’usine, un boîtier sur votre réseau. Le test vérifie les deux
            tronçons, l’un après l’autre.
          </p>
          <p>Un tronçon qui passe se trace en vert. S’il casse, l’écran dit ce qui bloque, par exemple une passerelle éteinte ou une adresse fausse, et quoi vérifier.</p>
        </>
      ),
    },
    {
      titre: 'Les variables',
      cible: 'connexion-variables',
      texte: (
        <p>
          Une variable, c’est une valeur que l’automate publie : DeviceStatus dit si la presse tourne, Speed donne sa vitesse. « Associer
          automatiquement » rapproche les noms ; vérifiez la liste, corrigez au besoin, puis enregistrez.
        </p>
      ),
    },
    {
      titre: 'L’accès à l’automate',
      cible: 'connexion-acces',
      texte: (
        <p>
          Par défaut, EVAN lit sans jamais commander la machine. Autoriser l’écriture reste possible pour un besoin précis : il faut donner une raison,
          inscrite au journal, et l’on peut revenir en lecture seule à tout moment.
        </p>
      ),
    },
  ],
  termes: ['automate', 'protocole', 'variable', 'pointMesure'],
};

/** Le même guide, sans bouton « Montrer » pour les blocs absents de l'écran en ce moment (usine encore vide). */
export function guideSelon(guide: GuideEcran, presents: Record<string, boolean>): GuideEcran {
  return { ...guide, blocs: guide.blocs.map((b) => (b.cible && presents[b.cible] === false ? { ...b, cible: undefined } : b)) };
}
