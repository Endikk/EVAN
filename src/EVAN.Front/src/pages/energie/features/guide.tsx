/**
 * « Comment lire cet écran » pour l'énergie : un bloc par zone, dans l'ordre de l'écran, écrit pour quelqu'un qui
 * découvre. Deux petits schémas animés : puissance × temps = énergie, et 100 kWh répartis en carrés.
 */
import type { CSSProperties } from 'react';
import type { EtatEnergie } from '@/analytics/energy';
import { MACHINE_TYPES, profilEnergie } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import type { GuideEcran } from '@/ui/explain';
import { fmtNombre } from '@/ui/format';
import { pourcent } from '../lib/format';
import { ETATS, LIBELLE, SEUIL_ATTENTION, SEUIL_PROBLEME } from '../lib/lecture';

/** Puissance × temps = énergie : l'aire sous la puissance se remplit pendant une heure et devient des kWh. */
function SchemaPuissanceTemps({ kw, nom }: { kw: number; nom: string }) {
  const k = fmtNombre(kw);
  return (
    <figure className="en-schema-pt" role="img" aria-label={`${nom} : ${k} kW pendant une heure font ${k} kWh.`}>
      <svg viewBox="0 0 280 124" aria-hidden>
        <rect className="en-pt-aire" x="48" y="30" width="200" height="70" />
        <line className="en-pt-niveau" x1="48" y1="30" x2="248" y2="30" />
        <line className="en-pt-axe" x1="48" y1="100" x2="258" y2="100" />
        <line className="en-pt-axe" x1="48" y1="14" x2="48" y2="100" />
        <text x="42" y="34" textAnchor="end">
          {k} kW
        </text>
        <text x="48" y="116" textAnchor="middle">
          0
        </text>
        <text x="248" y="116" textAnchor="middle">
          1 h
        </text>
        <text className="en-pt-resultat" x="148" y="71" textAnchor="middle">
          {k} kWh
        </text>
      </svg>
      <figcaption>
        Puissance × temps = énergie. {nom} en production tire {k} kW : en une heure, elle consomme {k} kWh.
      </figcaption>
    </figure>
  );
}

/** Sur 100 kWh : un carré par kWh, coloré selon ce à quoi il a servi. Les carrés se posent un par un. */
function SchemaCent({ cent }: { cent: Record<EtatEnergie, number> }) {
  const carres = ETATS.flatMap((e) => Array.from({ length: cent[e] }, () => e));
  const resume = ETATS.filter((e) => cent[e] > 0)
    .map((e) => `${cent[e]} ${LIBELLE[e].toLowerCase()}`)
    .join(', ');
  return (
    <figure className="en-schema-cent" role="img" aria-label={`Sur 100 kWh : ${resume}.`}>
      <div className="en-cent-grille" aria-hidden>
        {carres.map((e, i) => (
          <i key={i} className={`st st-${e}`} style={{ ['--i' as string]: i } as CSSProperties} />
        ))}
      </div>
      <figcaption>
        {ETATS.filter((e) => cent[e] > 0).map((e) => (
          <span key={e} className={`st st-${e}`}>
            <i aria-hidden /> {cent[e]} {LIBELLE[e].toLowerCase()}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** La machine d'exemple du schéma : une presse flexo s'il y en a une, sinon la première machine de l'usine. */
function machineExemple(machines: Machine[]): { kw: number; nom: string } {
  const type = machines.find((m) => m.type === 'flexo')?.type ?? machines[0]?.type ?? 'flexo';
  return { kw: profilEnergie(type).marche, nom: `Une ${(MACHINE_TYPES[type]?.libelle ?? 'machine').toLowerCase()}` };
}

export function guideEnergie(machines: Machine[], cent: Record<EtatEnergie, number>): GuideEcran {
  const exemple = machineExemple(machines);
  return {
    id: 'energie',
    titre: 'Énergie',
    resume:
      'Cet écran dit combien d’électricité l’usine consomme, à quel moment, et ce qui se dépense sans rien produire. Il finit par les actions qui rapporteraient le plus.',
    blocs: [
      {
        titre: 'La phrase du haut',
        cible: 'verdict',
        texte: (
          <p>
            Elle résume la période choisie (24 heures ou 7 jours) : ce que l’usine, ou la machine choisie, a consommé, ce que ça coûte, et la part dépensée sans rien produire. Où
            cette part est partie se lit sur les barres de « Où part l’énergie ». Au-delà de {pourcent(SEUIL_ATTENTION)} de l’énergie partie ainsi, le repère passe en orange ;
            au-delà de {pourcent(SEUIL_PROBLEME)}, en rouge.
          </p>
        ),
      },
      {
        titre: 'Période et machine',
        cible: 'filtres',
        texte: (
          <p>
            Les mêmes choix que dans l’historique : 24 heures ou 7 jours, et une machine si vous voulez ne regarder qu’elle. Tout l’écran suit, sauf « Par machine », qui
            garde toutes les machines pour situer celle-ci parmi les autres. « Voir son historique » ouvre ses arrêts et ses alarmes.
          </p>
        ),
      },
      {
        titre: 'Les trois repères',
        cible: 'reperes',
        schema: <SchemaPuissanceTemps kw={exemple.kw} nom={exemple.nom} />,
        texte: (
          <>
            <p>
              La consommation se compte en kWh, comme sur une facture. La puissance, en kW, c’est ce que l’usine tire à l’instant : elle change dès qu’une
              presse démarre ou s’arrête.
            </p>
            <p>La part dépensée sans produire regroupe les réglages, la veille et les pannes pendant lesquelles la machine reste sous tension.</p>
            <p>Le détail de chaque repère (son coût, le nombre de machines en production) est dans son « ? ».</p>
          </>
        ),
      },
      {
        titre: 'Émissions et réglages du calcul',
        cible: 'details-haut',
        texte: (
          <p>
            Sous les repères, une rangée : les émissions de CO₂ et l’électricité pour 1 000 étiquettes. Juste dessous, repliés, le prix du kWh et le facteur
            d’émission. Changez le prix de votre contrat : tous les euros de l’écran suivent, et il est retenu pour cette usine d’une visite à l’autre.
          </p>
        ),
      },
      {
        titre: 'La courbe de charge',
        cible: 'courbe-charge',
        texte: (
          <>
            <p>
              Elle suit la puissance tirée, tranche par tranche. Les bandes grisées sont les moments où rien ne produit ni ne se règle : la nuit, le
              week-end. Ce qui reste au-dessus de zéro dans ces bandes, c’est la veille : sécheurs UV, armoires, entraînements restés sous tension.
            </p>
            <p>
              Le pic (le trait fin horizontal, sa valeur dans la légende) est la puissance la plus forte de la période : c’est lui que l’abonnement électrique doit
              couvrir.
            </p>
          </>
        ),
      },
      {
        titre: 'Où part l’énergie',
        cible: 'repartition',
        schema: <SchemaCent cent={cent} />,
        texte: (
          <p>
            Chaque kWh est rangé selon ce que faisait la machine : produire, se régler (changement de clichés, d’encres, de bobine), attendre en veille, ou
            rester en panne sous tension. Les couleurs et les formes sont celles des machines sur la supervision.
          </p>
        ),
      },
      {
        titre: 'Par machine',
        cible: 'par-machine',
        texte: (
          <p>
            Ce que chaque machine a dépensé sans produire (réglages, veille, pannes sous tension), en kWh et en euros, de la plus dépensière à la moins dépensière.
            Au survol, sa consommation totale et son électricité pour 1 000 étiquettes, comparée aux autres machines du même type. Une presse qui consomme plus que
            ses semblables mérite un contrôle du séchage UV. Un clic la choisit pour tout l’écran.
          </p>
        ),
      },
      {
        titre: 'Où économiser',
        cible: 'economies',
        texte: (
          <>
            <p>
              Les actions sont rangées de la plus rentable à la moins rentable. Chaque somme part des 7 derniers jours, quelle que soit la période choisie, et
              se ramène à un an au prix du kWh réglé plus haut.
            </p>
            <p>
              « Jusqu’à » marque un plafond : il faudrait supprimer toute la perte (plus aucun réglage, plus aucune veille) pour l’atteindre. Le volet de chaque
              action dit aussi ce que rapporte un pas plus modeste, comme un réglage évité, refait le calcul et dit comment s’y prendre dans l’atelier.
            </p>
          </>
        ),
      },
      {
        titre: 'Énergie par jour',
        cible: 'par-jour',
        texte: (
          <p>
            Une colonne par jour, de minuit à minuit, découpée comme plus haut, toujours sur les 7 derniers jours. Un jour sans production montre ce que coûte la
            seule veille. La dernière colonne, plus pâle, est le jour en cours : il n’est pas fini.
          </p>
        ),
      },
      {
        titre: 'D’où viennent ces chiffres',
        texte: (
          <p>
            Ici, la puissance de chaque état est estimée par type de machine, à partir du catalogue d’EVAN, et appliquée à l’historique simulé de la semaine.
            Dans une usine équipée, elle vient de compteurs d’énergie lus par la passerelle (Modbus TCP), par la même chaîne que les autres mesures.
          </p>
        ),
      },
    ],
    termes: ['kwh', 'puissance', 'courbeCharge', 'horsProduction', 'veille', 'calage', 'co2'],
  };
}
