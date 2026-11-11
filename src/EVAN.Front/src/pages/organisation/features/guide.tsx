/**
 * « Comment lire cet écran » pour la vue d'ensemble : un bloc par zone, dans l'ordre où on les voit, avec de petits
 * schémas pour les notions qui ne se devinent pas (l'efficacité, les formes d'état, le plan des pannes, les écarts).
 * Les schémas n'affichent aucun chiffre : ils montrent une forme, pas une mesure.
 */
import { TonGlyph, type GuideEcran } from '@/ui/explain';

/** L'efficacité (TRS) : le temps d'ouverture, dont on retire trois pertes ; ce qui reste, c'est le temps vraiment utile. */
function SchemaEfficacite() {
  return (
    <div className="org-schema-trs" aria-hidden>
      <div className="org-schema-barre">
        <span className="utile">Bonnes étiquettes</span>
        <span className="perte p1">Arrêts</span>
        <span className="perte p2">Lenteur</span>
        <span className="perte p3">Jetées</span>
      </div>
      <p className="org-schema-legende">
        La barre entière : le temps où l’usine est ouverte. L’efficacité, c’est la part verte : de bonnes étiquettes, faites à vitesse normale, une fois
        retirés les arrêts, la lenteur et les étiquettes jetées.
      </p>
    </div>
  );
}

/**
 * Les trois formes d'état : la couleur n'est jamais seule. Pas de liste HTML ici : le volet du guide numérote
 * chacun de ses éléments de liste.
 */
function SchemaFormes() {
  return (
    <div className="org-schema-formes" aria-hidden>
      <span>
        <TonGlyph ton="ok" /> Tout va bien
      </span>
      <span>
        <TonGlyph ton="warn" /> À surveiller
      </span>
      <span>
        <TonGlyph ton="crit" /> Problème en cours
      </span>
    </div>
  );
}

/** Le plan des pannes : du gris (aucune panne) au rouge vif (la machine qui en a eu le plus). */
function SchemaPlan() {
  return (
    <div className="org-schema-plan" aria-hidden>
      {[0, 0.3, 0.6, 1].map((v) => (
        <span key={v} style={{ ['--v' as string]: v }} />
      ))}
      <p className="org-schema-legende">De gauche à droite : aucune panne, puis de plus en plus d’heures de panne.</p>
    </div>
  );
}

/** Deux usines sur une même règle : plus les points sont loin, plus l'écart est grand. */
function SchemaEcart() {
  return (
    <div className="org-schema-ecart" aria-hidden>
      <div className="org-schema-piste">
        <i />
        <span className="forme-0" />
        <span className="forme-1" />
      </div>
      <p className="org-schema-legende">Un point par usine. Plus ils sont éloignés, plus la même machine tourne différemment d’une usine à l’autre.</p>
    </div>
  );
}

export const GUIDE_ORGANISATION: GuideEcran = {
  id: 'organisation',
  titre: 'Vue d’ensemble des usines',
  resume:
    'Toutes vos usines sur une seule page, calculées de la même façon sur les 7 derniers jours. On lit d’abord la phrase du haut ; les cartes des usines et leur comparaison viennent ensuite.',
  blocs: [
    {
      titre: 'La phrase du haut',
      cible: 'verdict',
      texte: (
        <p>
          Elle dit si vos usines tournent et laquelle demande de l’attention en premier. Une panne en cours passe avant un entretien en retard, qui
          passe avant une mesure qui dérive.
        </p>
      ),
      schema: <SchemaFormes />,
    },
    {
      titre: 'Les chiffres de l’organisation',
      cible: 'org-reperes',
      texte: (
        <>
          <p>
            Le grand chiffre, à gauche, est l’efficacité des machines, toutes usines réunies. La petite barre verticale sur la jauge marque 85 %, le niveau
            d’une usine de pointe.
          </p>
          <p>À côté, le temps perdu en pannes et les entretiens en retard ; dessous, une rangée de chiffres de second rang.</p>
          <p>Un clic sur le nom de chaque chiffre dit ce qu’il mesure.</p>
        </>
      ),
      schema: <SchemaEfficacite />,
    },
    {
      titre: 'Une carte par usine',
      cible: 'org-usine',
      texte: (
        <>
          <p>
            Son nom (le « ? » donne l’adresse et la taille), puis un petit repère par machine, avec les formes de la supervision : rond plein, elle
            produit ; losange, en réglage ; rond creux, à l’arrêt ; carré rouge, elle est en panne. L’usine ouverte est suivie en direct ; pour les
            autres, l’état vient du dernier relevé de l’historique, et une panne de ce relevé reste grise : elle est passée.
          </p>
          <p>
            Une ligne dit ce qui demande de l’attention, avec un bouton qui mène au bon écran. « Ouvrir l’usine » mène à sa supervision. Les autres
            chiffres de l’usine ferment la carte.
          </p>
        </>
      ),
    },
    {
      titre: 'Le plan des pannes',
      cible: 'org-plan',
      texte: (
        <p>
          Le bâtiment vu de dessus, chaque machine à sa place. Plus elle est rouge, plus elle a été en panne cette semaine : une rotative offset rouge
          vif a passé plus de temps arrêtée que la refendeuse grise à côté. Les plans de toutes les usines partagent la même échelle.
        </p>
      ),
      schema: <SchemaPlan />,
    },
    {
      titre: 'L’efficacité jour par jour',
      cible: 'org-trs-jours',
      texte: (
        <p>
          Une ligne par usine. Le trait pointillé marque 85 %. Une ligne qui plonge un jour signale un problème ce jour-là, par exemple une grosse
          panne ou des changements de bobine et de clichés à répétition.
        </p>
      ),
    },
    {
      titre: 'Les pannes qui ont coûté le plus de temps',
      cible: 'org-arrets',
      texte: (
        <p>
          Chaque ligne réunit la même panne sur la même machine ; la forme devant le numéro dit dans quelle usine. La barre donne les heures
          perdues ; le nombre de fois dit si c’est une longue panne ou une petite qui revient souvent.
        </p>
      ),
    },
    {
      titre: 'Mêmes machines, d’une usine à l’autre',
      cible: 'org-comparables',
      texte: (
        <p>
          Les refendeuses de deux usines devraient tourner pareil. Un écart qui dure est une piste : un réglage ou une façon de travailler à
          partager d’une usine à l’autre.
        </p>
      ),
      schema: <SchemaEcart />,
    },
  ],
  termes: ['trs', 'disponibilite', 'mttr', 'preventif', 'derive', 'kwh', 'co2'],
};
