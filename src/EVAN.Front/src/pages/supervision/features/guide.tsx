/**
 * « Comment lire cet écran » pour la supervision : un bloc par zone, dans l'ordre où l'œil les parcourt (phrase du
 * bandeau, repères, plan 3D, panneau, panne simulée, fiche d'alarme), avec deux petits schémas : l'efficacité (TRS)
 * comme un temps qui se découpe en pertes, et les formes des états de machine.
 */
import type { EtatMachine } from '@/domain/types';
import type { GuideEcran } from '@/ui/explain';
import { StatusIcon } from '@/ui/status';
import { ETAT_MOT } from '../lib/atelier';

const ETATS: EtatMachine[] = ['marche', 'attention', 'panne', 'calage', 'arret'];
const FORMES: Record<EtatMachine, string> = {
  marche: 'rond plein vert',
  attention: 'triangle orange',
  panne: 'carré rouge qui clignote',
  calage: 'losange bleu',
  arret: 'rond creux gris',
};

/** Les cinq états d'une machine sur le plan, chacun avec sa forme : la couleur n'est jamais seule. */
function SchemaEtats() {
  return (
    <div className="sv-schema-etats">
      {ETATS.map((e, i) => (
        <p key={e} style={{ ['--i' as string]: i }}>
          <span className={`st st-${e}`}>
            <StatusIcon etat={e} size={14} />
          </span>
          <b>{ETAT_MOT[e]}</b>
          <span className="faint">{FORMES[e]}</span>
        </p>
      ))}
    </div>
  );
}

/** Le TRS en image : le temps où la machine devait produire, puis ce qu'on en retire. Sans chiffres, ce n'est qu'un dessin. */
function SchemaTrs() {
  return (
    <div className="sv-schema-trs" aria-hidden>
      <div className="sv-trs-barre">
        <i className="bon" />
        <i className="arret" />
        <i className="lent" />
        <i className="jete" />
      </div>
      <div className="sv-trs-legende">
        <p>
          <i className="bon" /> Bonnes étiquettes, à vitesse normale : c’est l’efficacité
        </p>
        <p>
          <i className="arret" /> Temps perdu en arrêts (pannes, réglages)
        </p>
        <p>
          <i className="lent" /> Temps perdu à tourner moins vite
        </p>
        <p>
          <i className="jete" /> Étiquettes jetées
        </p>
      </div>
    </div>
  );
}

export const GUIDE_SUPERVISION: GuideEcran = {
  id: 'supervision',
  titre: 'La supervision de l’atelier',
  resume:
    'L’atelier en direct, mis à jour chaque seconde. En haut, une phrase dit si tout va bien et, sinon, où ça coince. Au centre, le plan 3D montre chaque machine à sa place. À droite, les alarmes, les machines et ce qui vient de se passer.',
  blocs: [
    {
      titre: 'La phrase du moment',
      cible: 'sv-verdict',
      texte: (
        <>
          <p>Elle répond à la question qu’on se pose en arrivant : est-ce que tout tourne ?</p>
          <p>
            Rond vert : tout va bien. Triangle orange : un point à surveiller, rien n’est arrêté. Carré rouge qui clignote : une panne. Le
            bouton « Voir la panne » emmène la caméra jusqu’à la pièce en cause. Pendant une panne, une ligne dit si quelqu’un l’a déjà prise
            en charge.
          </p>
        </>
      ),
    },
    {
      titre: 'Trois repères',
      cible: 'sv-reperes',
      schema: <SchemaTrs />,
      texte: (
        <>
          <p>Machines qui produisent : une marque par machine, rangées par état. Les vertes sortent des étiquettes.</p>
          <p>
            Efficacité du moment : la part du temps où l’atelier produit de bonnes étiquettes à vitesse normale. Le petit trait sur la
            jauge marque 85 %, le niveau couramment cité pour une usine de pointe. « Plus de chiffres » la compare à la moyenne des 7
            derniers jours.
          </p>
          <p>Alarmes à traiter : un clic emmène sur la plus urgente. « Plus de chiffres » ouvre aussi la production, les étiquettes jetées et les arrêts du jour.</p>
          <p>Le détail de chaque chiffre (ce qu’il mesure, comment il est calculé) est dans son « ? ».</p>
        </>
      ),
    },
    {
      titre: 'Le plan 3D de l’atelier',
      schema: <SchemaEtats />,
      texte: (
        <>
          <p>Chaque machine est à sa vraie place dans le bâtiment. Quand elle produit, ses rouleaux tournent et la bande défile.</p>
          <p>Sa forme et sa couleur disent son état. Un clic sur une machine ouvre, à droite, ce qui se passe à l’intérieur : ses organes, leurs mesures, sa dernière alarme, son prochain entretien.</p>
        </>
      ),
    },
    {
      titre: 'Le panneau de droite',
      cible: 'sv-panneau',
      texte: (
        <>
          <p>
            Alarmes : une ligne par alarme, la plus urgente en haut. La forme dit la gravité (carré : panne, triangle : à surveiller), puis
            viennent quoi, où, depuis quand et ce qu’il faut faire. Sans alarme, le « ? » dit ce que ferait EVAN.
          </p>
          <p>Machines : groupées par état, avec leur vitesse. Journal : ce qui s’est passé, du plus récent au plus ancien.</p>
        </>
      ),
    },
    {
      titre: 'Simuler une panne',
      texte: (
        <p>
          Le bouton « Simuler une panne », en haut à droite, dérègle une mesure sur une machine prise au hasard. On voit alors ce qu’EVAN fait
          pour de vrai : il repère la mesure qui sort de sa limite, déclenche l’alarme, met la machine en rouge et plonge la caméra sur
          l’organe en cause.
        </p>
      ),
    },
    {
      titre: 'Comment EVAN a repéré la panne',
      cible: 'sv-detection',
      texte: (
        <p>
          Pendant une panne, le panneau raconte la détection en quatre temps : le capteur mesure, la valeur passe sa limite, EVAN déclenche
          l’alarme, l’écran vous prévient. Chaque temps s’allume quand il a eu lieu, avec la vraie valeur, la limite, le code de l’alarme et
          le délai. Le détail technique (automate, passerelle, messages) reste replié en dessous.
        </p>
      ),
    },
    {
      titre: 'La fiche d’alarme',
      texte: (
        <p>
          Elle s’accroche à l’organe en cause, dans la 3D. Elle dit la gravité, ce qui se passe et où, puis la mesure face à sa limite : la
          zone hachurée de la jauge est hors limite. Trois étapes se cochent : prendre l’alarme en charge, aller voir l’organe (la cause
          probable est dans son « ? »), signaler l’intervention terminée. La machine refait alors son réglage et repart.
        </p>
      ),
    },
  ],
  termes: ['trs', 'organe', 'seuil', 'acquittement', 'calage', 'derive', 'defautRepetitif', 'gache'],
};
