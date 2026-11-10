/**
 * Une usine en une carte, lisible en cinq secondes : son nom, l'état de ses machines (un repère par machine et
 * quelques mots), trois repères, le point qui demande de l'attention et son bouton. Le plan dit où se sont produites
 * les pannes ; les chiffres de second rang ferment la carte, en une rangée. L'adresse, la méthode et le détail de
 * chaque chiffre sont dans les « ? ».
 */
import { memo, useId, type CSSProperties } from 'react';
import { ArrowRight, Factory } from 'lucide-react';
import { ChiffresSecondaires, Repere, TonGlyph } from '@/ui/explain';
import { HeatPlan } from '@/widgets/charts/HeatPlan';
import { InfoTip } from '@/ui/InfoTip';
import { formatArea } from '@/geo/geodesy';
import { fmtDuration, fmtNombre, pct } from '@/ui/format';
import { machineLaPlusTouchee, type EtatMachines, type Ligne } from '../lib/donnees';
import { deNom, fr, leconPlan, motEfficacite, motEtat, motPannes, phraseEtat, TRS_POINTE, type PointAttention } from '../lib/lecture';
import { ouvrirUsine } from './ouvrir';
import type { Direct } from './useDirect';

interface Props {
  l: Ligne;
  /** État en direct, seulement pour l'usine ouverte. */
  direct?: Direct;
  point: PointAttention;
  /** Heures de panne par machine, moyenne de l'organisation (absente avec une seule usine). */
  moyennePannes?: number;
  /** Première carte : c'est elle que le guide désigne. */
  premiere: boolean;
  /** Rang dans l'entrée de l'écran. */
  rang: number;
}

const heure = (t: number) => `${new Date(t).getHours()} h`;

const ACTION_LIBELLE = { supervision: 'Voir la supervision', maintenance: 'Voir l’entretien' } as const;

type EtatPastille = 'panne' | 'surveiller' | 'produit' | 'reglage' | 'arret';

/** Un repère par machine, les anomalies d'abord : seules la panne (carré cramoisi) et l'alerte (triangle ambre) colorent. */
function pastilles(e: EtatMachines): EtatPastille[] {
  const surveiller = Math.min(e.surveiller.length, e.produisent);
  const arret = Math.max(0, e.total - e.produisent - e.reglage - e.panne.length);
  return [
    ...Array<EtatPastille>(e.panne.length).fill('panne'),
    ...Array<EtatPastille>(surveiller).fill('surveiller'),
    ...Array<EtatPastille>(e.produisent - surveiller).fill('produit'),
    ...Array<EtatPastille>(e.reglage).fill('reglage'),
    ...Array<EtatPastille>(arret).fill('arret'),
  ];
}

/** L'état des machines : la source (direct ou dernier relevé), un repère par machine, quelques mots, son « ? ». */
function EtatUsine({ etat, direct, releve }: { etat: EtatMachines; direct: boolean; releve: number }) {
  const mot = motEtat(etat, direct);
  return (
    <div className="org-usine-etat">
      {direct ? (
        <span className="org-direct">
          <i aria-hidden /> En direct
        </span>
      ) : (
        <span className="org-releve">À {heure(releve)}</span>
      )}
      <span className="org-pips" role="img" aria-label={fr(phraseEtat(etat, direct))}>
        {pastilles(etat).map((p, i) => (
          <i key={i} className={p} />
        ))}
      </span>
      {/* Les mots et leur « ? » restent ensemble quand la ligne passe à la suivante. */}
      <span className="org-etat-texte">
        <span aria-hidden>{fr(mot.mot)}</span>
        {mot.panne && (
          <span className="org-etat-panne" aria-hidden>
            <TonGlyph ton="crit" />
            {mot.panne}
          </span>
        )}
        <InfoTip label="Lire l’état des machines">
          <p>Un repère par machine : rond plein, elle produit ; anneau, en réglage ; rond pâle, à l’arrêt ; carré rouge, en panne ; triangle, à surveiller.</p>
          <p>
            {direct
              ? 'Suivi en direct : l’état change dès qu’une machine change.'
              : `Dernier relevé de l’historique, à ${heure(releve)}. Le direct s’ouvre avec l’usine.`}
          </p>
        </InfoTip>
      </span>
    </div>
  );
}

/** Le point qui demande de l'attention : la forme, le titre, son détail dans le « ? » (sauf l'alarme d'une panne), le bouton. */
function Attention({ point, onAgir }: { point: PointAttention; onAgir: () => void }) {
  const detailVisible = point.detailVisible ? point.detail : undefined;
  return (
    <div className={`org-attention ton-${point.ton}`}>
      <TonGlyph ton={point.ton} />
      <div className="org-attention-texte">
        <b>
          {fr(point.titre)}
          {point.detail && !point.detailVisible && (
            <InfoTip label={`Détail : ${point.titre}`}>
              <p>{fr(point.detail)}</p>
            </InfoTip>
          )}
        </b>
        {detailVisible && <span>{fr(detailVisible)}</span>}
      </div>
      {point.action && (
        <button type="button" className="btn sm" onClick={onAgir}>
          {ACTION_LIBELLE[point.action]}
        </button>
      )}
    </div>
  );
}

/** Le plan ne dépend que de l'historique : mémorisé, il ne se redessine pas avec le direct. */
const PlanPannes = memo(function PlanPannes({ l, premiere }: { l: Ligne; premiere: boolean }) {
  return (
    <div className="org-usine-plan" data-guide={premiere ? 'org-plan' : undefined}>
      <h4 className="tc-titre">
        Plan des pannes
        <InfoTip label="Comprendre : plan des pannes">
          <p>Le bâtiment vu de dessus : plus une machine est rouge, plus elle a été en panne en 7 jours.</p>
          <p>{fr(leconPlan(machineLaPlusTouchee(l)))}</p>
        </InfoTip>
      </h4>
      <HeatPlan heat={l.heat} usine={l.u} />
    </div>
  );
});

export const UsineCard = memo(function UsineCard({ l, direct, point, moyennePannes, premiere, rang }: Props) {
  const titreId = useId();
  const efficacite = motEfficacite(l.r.trs);
  const machines = l.u.machines.length;
  const pannes = moyennePannes !== undefined && machines ? motPannes(l.r.panneH / machines, moyennePannes) : undefined;
  const etat = direct?.etat ?? l.derniereHeure;
  const style = { '--usine': l.couleur, '--i': rang } as CSSProperties;
  const nbPannes = `${l.r.alarmes} ${l.r.alarmes > 1 ? 'pannes' : 'panne'}`;

  return (
    <article className="card org-usine entree" style={style} data-tour={`usine-${l.u.id}`} data-guide={premiere ? 'org-usine' : undefined} aria-labelledby={titreId}>
      <header className="org-usine-tete">
        <span className="org-usine-icone" aria-hidden>
          <Factory />
        </span>
        <div className="org-usine-nom">
          <h3>
            <span id={titreId}>{l.nom}</span>
            <InfoTip label={`Adresse et taille ${deNom(l.court)}`}>
              {l.u.site?.adresse && <p>{l.u.site.adresse}</p>}
              <p>
                {machines} {machines > 1 ? 'machines' : 'machine'} sur {formatArea(l.surface)} de bâtiments.
              </p>
            </InfoTip>
          </h3>
        </div>
        <button type="button" className="btn sm primary org-ouvrir" onClick={() => void ouvrirUsine(l.u.id)} aria-label={`Ouvrir l’usine ${l.court}`}>
          Ouvrir l’usine <ArrowRight aria-hidden />
        </button>
      </header>

      <EtatUsine etat={etat} direct={!!direct} releve={l.heureReleve} />

      <div className="reperes org-usine-reperes">
        <Repere
          className="compact"
          titre="Efficacité"
          terme="trs"
          aide="Sur 7 jours. Le trait sur la jauge marque 85 %, une usine de pointe."
          valeur={Math.round(l.r.trs * 100)}
          unite="%"
          mot={efficacite.mot}
          ton={efficacite.ton}
          jauge={l.r.trs}
          cible={TRS_POINTE}
        />
        <Repere
          className="compact"
          titre="Temps en panne"
          aide={`Sur 7 jours, en ${nbPannes}.${pannes ? ' Le mot compare les heures par machine à la moyenne des usines.' : ''}`}
          valeur={l.r.panneH}
          format={(v) => fmtNombre(v, 1)}
          unite="h"
          mot={pannes?.mot}
          ton={pannes?.ton}
        />
        <Repere
          className="compact"
          titre="Entretiens en retard"
          aide="Les entretiens prévus dont la date est passée."
          valeur={l.retard}
          mot={l.retard ? 'À rattraper' : 'À jour'}
          ton={l.retard ? 'warn' : 'ok'}
        />
      </div>

      <Attention point={point} onAgir={() => void ouvrirUsine(l.u.id, point.action)} />

      <PlanPannes l={l} premiere={premiere} />

      <ChiffresSecondaires
        className="org-usine-chiffres"
        label={`Autres chiffres ${deNom(l.court)}, sur 7 jours`}
        items={[
          { label: 'Disponibilité', terme: 'disponibilite', valeur: pct(l.r.disponibilite) },
          {
            label: 'Réparation',
            terme: 'mttr',
            aide: l.r.mttr ? `${nbPannes} en 7 jours, réparées en ${fmtDuration(l.r.mttr)} en moyenne.` : 'Aucune panne en 7 jours.',
            valeur: l.r.mttr ? fmtDuration(l.r.mttr) : 'Aucune panne',
          },
          { label: 'Électricité', aide: 'Consommée en 7 jours, toute l’usine.', valeur: fmtNombre(l.r.energie.total.total / 1000, 1), unite: 'MWh' },
          {
            label: 'Par 1 000 étiquettes',
            terme: 'intensite',
            valeur: l.r.energie.total.intensite !== undefined ? fmtNombre(l.r.energie.total.intensite, 2) : 'Pas de production',
            unite: l.r.energie.total.intensite !== undefined ? 'kWh' : undefined,
          },
          { label: 'Dérives', terme: 'derive', valeur: l.r.previsions, ton: l.r.previsions ? 'warn' : undefined },
        ]}
      />
    </article>
  );
});
