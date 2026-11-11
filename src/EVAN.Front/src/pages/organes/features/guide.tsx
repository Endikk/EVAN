/**
 * « Comment lire cet écran » pour l'étape 4, avec deux petits schémas : comment une machine se découpe en organes
 * le long de la bande, et comment se lit la bande des seuils d'une mesure.
 */
import type { GuideEcran } from '@/ui/explain';

/** Une machine vue comme une suite d'organes que la bande traverse ; sur le premier, un point de mesure. */
function SchemaOrganes() {
  const organes = [
    { x: 16, n: 1, nom: 'Dérouleur' },
    { x: 112, n: 2, nom: 'Impression' },
    { x: 208, n: 3, nom: 'Rembobineur' },
  ];
  return (
    <svg className="og-schema-organes" viewBox="0 0 300 116" role="img" aria-label="Une machine découpée en trois organes que la bande traverse dans l’ordre ; sur le dérouleur, un point de mesure lit la tension de la bande.">
      {organes.map((o) => (
        <g key={o.n} className="og-so-organe">
          <rect x={o.x} y={44} width={76} height={40} rx={8} />
          <text className="og-so-num" x={o.x + 10} y={59}>
            #{o.n}
          </text>
          <text className="og-so-nom" x={o.x + 38} y={102} textAnchor="middle">
            {o.nom}
          </text>
        </g>
      ))}
      <line className="og-so-bande" x1={6} y1={72} x2={294} y2={72} />
      <g className="og-so-point">
        <line x1={54} y1={44} x2={54} y2={26} />
        <circle className="og-so-onde" cx={54} cy={44} r={4} />
        <circle cx={54} cy={44} r={4} />
        <rect x={20} y={6} width={68} height={20} rx={10} />
        <text x={54} y={20} textAnchor="middle">
          Tension
        </text>
      </g>
    </svg>
  );
}

/** La bande des seuils, avec un repère qui passe de la plage normale à l'attention puis à l'alarme. */
function SchemaBande() {
  const segments: [string, number, number][] = [
    ['alarme', 0, 10],
    ['attention', 10, 22],
    ['normal', 22, 68],
    ['attention', 68, 84],
    ['alarme', 84, 100],
  ];
  return (
    <div className="og-schema-bande" role="img" aria-label="Une mesure qui sort de sa plage normale : d’abord attention, puis alarme.">
      <div className="og-bande">
        <span className="og-bande-fond">
          {segments.map(([p, a, b], i) => (
            <i key={i} className={`og-seg og-${p}`} style={{ left: `${a}%`, width: `${b - a}%` }} />
          ))}
        </span>
        <span className="og-curseur-piste">
          <span className="og-curseur og-sb-curseur" />
        </span>
      </div>
      <p className="og-sb-mots" aria-hidden>
        <span className="og-sb-mot og-sb-normal ton-ok">Normal : rien à faire</span>
        <span className="og-sb-mot og-sb-attention ton-warn">Attention : à surveiller</span>
        <span className="og-sb-mot og-sb-alarme ton-crit">Alarme : EVAN prévient</span>
      </p>
    </div>
  );
}

export const GUIDE_ORGANES: GuideEcran = {
  id: 'organes',
  titre: 'Ce qu’on surveille sur chaque machine',
  resume:
    'Une machine se surveille partie par partie. Ici, vous relisez les parties de chaque machine (ses organes) et ce qu’EVAN mesure sur chacune, avec les limites qui déclenchent une alerte. En cas de panne, EVAN dira quel organe lâche, et sur quelle machine.',
  blocs: [
    {
      titre: 'À faire ici',
      cible: 'a-faire',
      texte: <p>La liste se coche seule. Une machine compte comme vérifiée quand vous cochez la case en bas de ses organes.</p>,
    },
    {
      titre: 'La fiche du modèle',
      cible: 'organes-fiche',
      texte: (
        <p>
          Le modèle du kit dont la machine reprend les organes : une référence pour ce type de machine, pas forcément la vôtre. « Organes types, à
          adapter » le rappelle : relisez la liste et ajustez les seuils. « À confirmer sur place » signale une machine supposée, dont la présence
          reste à vérifier. « Ce n’est pas ma machine » ramène à l’étape 3 pour la changer.
        </p>
      ),
    },
    {
      titre: 'Les organes',
      cible: 'organes-liste',
      schema: <SchemaOrganes />,
      texte: (
        <p>
          Chaque organe porte un numéro dans l’ordre de passage de la bande : le dérouleur d’abord, le rembobineur à la fin. Les petits points à droite
          de son nom sont ses mesures : gris quand tout est normal, en couleur quand une mesure sort de sa plage. Dépliez un organe pour voir ses
          mesures ; le chiffre « Pannes » dit ce qui lâche d’habitude et comment remonter à la cause. Le viseur à droite place la caméra dessus.
        </p>
      ),
    },
    {
      titre: 'Les limites d’une mesure',
      cible: 'organes-liste',
      schema: <SchemaBande />,
      texte: (
        <p>
          Chaque mesure a sa bande : la plage normale au milieu, l’attention de part et d’autre, l’alarme hachurée aux bouts. Le petit trait vertical montre
          la valeur du moment. Les nombres exacts s’affichent au survol, et se règlent dans « Voir les chiffres et régler les seuils ».
        </p>
      ),
    },
    {
      titre: 'Vérifier, puis passer à la suivante',
      cible: 'organes-verifier',
      texte: <p>Quand la liste correspond à votre machine, cochez la case : EVAN propose aussitôt la machine suivante qui reste à vérifier.</p>,
    },
  ],
  termes: ['organe', 'pointMesure', 'seuil'],
};

/** Le même guide, sans bouton « Montrer » pour les blocs absents de l'écran en ce moment (usine encore vide). */
export function guideSelon(guide: GuideEcran, presents: Record<string, boolean>): GuideEcran {
  return { ...guide, blocs: guide.blocs.map((b) => (b.cible && presents[b.cible] === false ? { ...b, cible: undefined } : b)) };
}
