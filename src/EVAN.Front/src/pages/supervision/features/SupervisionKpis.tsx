/**
 * Bandeau de la supervision : d'abord la phrase qui dit si l'atelier tourne et, sinon, où ça coince (pendant une
 * panne, une ligne dit si quelqu'un s'en occupe) ; puis trois repères qui se lisent d'un coup d'œil, sans phrase sous les
 * valeurs : machines qui produisent (une forme par machine), efficacité du moment (une jauge face au repère de
 * 85 %), alarmes à traiter. Le détail de chaque chiffre est dans son « ? ». Les autres chiffres (production,
 * étiquettes jetées, arrêts du jour, tendance) passent dans un volet, « Plus de chiffres ».
 * Le bandeau reste bas : il est posé au-dessus de la 3D.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, LocateFixed } from 'lucide-react';
import { useProject } from '@/store/project';
import { useLive } from '@/store/live';
import { StatusIcon } from '@/ui/status';
import { PixelField } from '@/ui/PixelField';
import { EFFICACITE_REFERENCE, GuideButton, Repere, lireEfficacite } from '@/ui/explain';
import { getHistory } from '@/sim/history';
import { focusAlarm } from '@/widgets/shell/navigation';
import { etatAtelier, nonProductives, parUrgence, trsInstantane, verdictAtelier, ETAT_MOT, MOT_HORS_LIGNE, type EtatAtelier, type Ton } from '../lib/atelier';
import { lieuAlarme } from '../lib/lieu';
import { GUIDE_SUPERVISION } from './guide';
import { ChiffresVolet, type PointTendance } from './ChiffresVolet';
import { GLYPHE } from './Mot';

/** Fenêtre de la tendance du TRS : 10 minutes à une mesure par seconde. */
const FENETRE = 600;
/** Fenêtre de la cadence de production : la dernière minute. */
const FENETRE_CADENCE = 60;

/** Une durée ne se coupe pas en fin de ligne (« 1 » d'un côté, « s » de l'autre). */
const insecable = (s: string) => s.replace(/(\d) (s|min|h)\b/g, '$1\u00a0$2');

const TON_LU: Record<Ton, string> = {
  ok: 'Tout va bien.',
  warn: 'À surveiller.',
  crit: 'Panne en cours.',
  neutre: '',
};

/** Une marque par machine, rangées par état : forme et couleur, et le nom de la machine au survol. */
function BandeMachines({ atelier }: { atelier: EtatAtelier }) {
  return (
    <span className="sv-bande" role="img" aria-label={atelier.bande.map((b) => `${b.machine.numero} : ${b.horsLigne ? MOT_HORS_LIGNE : ETAT_MOT[b.etat]}`).join(', ')}>
      {atelier.bande.map((b) => (
        <span key={b.machine.id} className={`st st-${b.etat} ${b.horsLigne ? 'hors-ligne' : ''}`} title={`${b.machine.numero} · ${b.horsLigne ? MOT_HORS_LIGNE : ETAT_MOT[b.etat]}`}>
          <StatusIcon etat={b.etat} size={11} />
        </span>
      ))}
    </span>
  );
}

/** Ce que dit la bande, pour le « ? » : quelles machines ne produisent pas. */
function aideMachines(atelier: EtatAtelier): string {
  const horsLigne = atelier.horsLigne.length ? ` Sans nouvelles : ${atelier.horsLigne.map((m) => m.numero).join(', ')}.` : '';
  const reste = nonProductives(atelier) ?? (horsLigne ? '' : 'Toutes produisent.');
  return `Une forme par machine, rangées par état. ${reste}${horsLigne}`.trim();
}

/** Le mot à côté du compte d'alarmes : rien quand tout est calme, la gravité sinon (la répartition s'il y a les deux). */
function motAlarmes(pannes: number, aSurveiller: number): string | undefined {
  if (pannes && aSurveiller) return `${pannes} panne${pannes > 1 ? 's' : ''}, ${aSurveiller} à surveiller`;
  if (pannes) return pannes > 1 ? 'Pannes' : 'Panne';
  return aSurveiller ? 'À surveiller' : undefined;
}

export function SupervisionKpis() {
  const machines = useProject((s) => s.machines);
  const perso = useProject((s) => s.perso);
  const live = useLive((s) => s.machines);
  const alarms = useLive((s) => s.alarms);
  const tick = useLive((s) => s.tick);
  const [trend, setTrend] = useState<PointTendance[]>([]);
  const [volet, setVolet] = useState(false);
  // Fonction stable : le volet s'abonne au clavier une fois, pas à chaque seconde.
  const fermerVolet = useCallback(() => setVolet(false), []);
  const prod = useRef<{ t: number; v: number }[]>([]);

  const atelier = useMemo(() => etatAtelier(machines, live), [machines, live]);
  const stats = useMemo(() => trsInstantane(machines, live), [machines, live]);
  const actives = useMemo(() => parUrgence(alarms), [alarms]);

  // Tendance du TRS instantané sur les 10 dernières minutes, et cadence de production sur la dernière minute.
  useEffect(() => {
    if (!machines.length || !Object.keys(useLive.getState().machines).length) return;
    const now = Date.now();
    setTrend((s) => [...s.slice(-(FENETRE - 1)), { t: now, v: Math.round(stats.trs * 1000) / 10 }]);
    prod.current = [...prod.current.slice(-FENETRE_CADENCE), { t: now, v: stats.bonnes }];
  }, [tick]);

  // Référence : TRS moyen des 7 derniers jours (pondéré par le temps d'ouverture), et arrêts sur panne du jour.
  const { trs7j, arretsJour } = useMemo(() => {
    const h = getHistory(machines);
    let num = 0;
    let den = 0;
    for (const jours of Object.values(h.trs)) for (const j of jours) if (j.ouvertureMin > 0) (num += j.trs * j.ouvertureMin), (den += j.ouvertureMin);
    const minuit = new Date();
    minuit.setHours(0, 0, 0, 0);
    let ms = 0;
    for (const list of Object.values(h.periodes)) {
      for (const p of list) if (p.etat === 'panne' && p.fin > minuit.getTime()) ms += p.fin - Math.max(p.debut, minuit.getTime());
    }
    return { trs7j: den ? num / den : 0, arretsJour: ms };
  }, [machines]);

  const now = Date.now();
  const verdict = verdictAtelier(atelier, actives, (a) => lieuAlarme(a, machines, perso), now);
  const enDirect = atelier.suivies > 0;
  // Le mot de l'efficacité est le même sur tous les écrans ; sans données, on ne qualifie rien.
  const trs = lireEfficacite(enDirect ? stats.trs : Number.NaN);
  const pannes = actives.filter((a) => a.gravite === 'critique').length;
  const aSurveiller = actives.length - pannes;
  const tonAlarmes: Ton = pannes ? 'crit' : aSurveiller ? 'warn' : 'ok';
  const premier = prod.current[0];
  const dernier = prod.current[prod.current.length - 1];
  const cadence = premier && dernier && dernier.t > premier.t ? ((dernier.v - premier.v) / (dernier.t - premier.t)) * 3_600_000 : 0;
  const glyphe = GLYPHE[verdict.ton];

  return (
    <section className={`sv-bandeau ton-${verdict.ton}`} aria-label="L’atelier en ce moment">
      <PixelField placement="bas-droite" intensite={0.5} />
      <div className="sv-verdict entree" data-guide="sv-verdict" style={{ ['--i' as string]: 0 }}>
        <p className="sv-phrase" key={verdict.ton}>
          <span className={`sv-glyphe st st-${glyphe}`}>
            <StatusIcon etat={glyphe} size={15} animate={verdict.ton === 'crit'} />
          </span>
          <span>{insecable(verdict.texte)}</span>
        </p>
        <p className="sr-only" aria-live="polite">
          {TON_LU[verdict.ton]} {verdict.annonce ?? verdict.texte}
        </p>
        <div className="sv-verdict-bas">
          {verdict.suite && <p className="sv-suite">{verdict.suite}</p>}
          <div className="sv-actions">
            {verdict.alarmeId && (
              <button className={`btn sm ${verdict.ton === 'crit' ? 'danger' : ''}`} onClick={() => focusAlarm(verdict.alarmeId!)}>
                <LocateFixed /> {verdict.action}
              </button>
            )}
            <button className="btn sm ghost" onClick={() => setVolet(true)} aria-haspopup="dialog" disabled={!enDirect}>
              <BarChart3 /> Plus de chiffres
            </button>
            <GuideButton guide={GUIDE_SUPERVISION} compact />
          </div>
        </div>
      </div>

      {atelier.total > 0 && (
        <div className="sv-reperes entree" data-guide="sv-reperes" style={{ ['--i' as string]: 1 }}>
          <Repere
            className="sv-rep"
            titre="Machines qui produisent"
            aide={aideMachines(atelier)}
            valeur={atelier.produisent}
            unite={`sur ${atelier.total}`}
            note={<BandeMachines atelier={atelier} />}
            noteVisible
          />
          <Repere
            className="sv-rep"
            titre="Efficacité du moment"
            terme="trs"
            aide={`Le petit trait marque ${Math.round(EFFICACITE_REFERENCE * 100)} %, le niveau d’une usine de pointe.`}
            valeur={enDirect ? Math.round(stats.trs * 100) : '…'}
            unite="%"
            ton={trs.ton}
            mot={enDirect ? trs.mot : undefined}
            jauge={enDirect ? stats.trs : undefined}
            cible={EFFICACITE_REFERENCE}
          />
          <Repere
            className="sv-rep"
            titre="Alarmes à traiter"
            aide="Les pannes et les points à surveiller pas encore réglés."
            valeur={actives.length}
            ton={tonAlarmes}
            mot={motAlarmes(pannes, aSurveiller)}
            onClick={actives.length ? () => focusAlarm(actives[0].id) : undefined}
          />
        </div>
      )}

      {volet && (
        <ChiffresVolet
          fermer={fermerVolet}
          atelier={atelier}
          bonnes={stats.bonnes}
          gache={stats.gache}
          cadence={cadence}
          arretsJour={arretsJour}
          trs={stats.trs}
          trs7j={trs7j}
          tendance={trend}
        />
      )}
    </section>
  );
}
