/**
 * Fiche d'alarme, accrochée à l'organe dans la 3D (ou posée dans le panneau de la machine, en version compacte).
 * Elle se lit d'un coup d'œil : la gravité (forme et mot) et depuis quand, ce qui se passe, où, la mesure face à sa
 * limite dans une jauge (la zone hors limite est marquée), puis les trois étapes qui se cochent : prendre l'alarme en
 * charge, aller voir l'organe (ce qu'il faut y vérifier est écrit en clair), signaler l'intervention terminée. Une
 * seule action en vermillon : celle de l'étape en cours. Le reste (règle qui a levé l'alarme, heure exacte, réparation
 * type) est dans les bulles d'aide.
 *
 * Une fois l'alarme close, la fiche propose de consigner l'intervention au carnet (bon prérempli) et de revoir la panne.
 *
 * Le cramoisi (bord, valeur, zone hors limite) est réservé à la panne réelle. Une panne d'exercice (« Simuler une
 * panne ») garde sa forme d'état, mais sa fiche est bordée d'un pointillé et dit « exercice » à côté de son code.
 */
import { ClipboardCheck, Hand, History as HistoryIcon, Ruler, Wrench } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useLive } from '@/store/live';
import { useCarnet } from '@/store/carnet';
import type { Alarme } from '@/domain/types';
import { useProject } from '@/store/project';
import { machineModel } from '@/domain/catalog';
import { getSource } from '@/realtime/source';
import { StatusIcon } from '@/ui/status';
import { InfoTip } from '@/ui/InfoTip';
import { fmtDuration, fmtHM, fmtValue } from '@/ui/format';
import { estExercice } from './exercice';
import './AlarmCard.css';

/** Libellé court de la règle qui a levé l'alarme (aussi utilisé par l'historique : ne pas le modifier ici). */
export const REGLE_LIBELLE: Record<Alarme['regle'], string> = {
  seuil: 'Seuil',
  derive: 'Dérive',
  repetitif: 'Défaut répétitif',
  automate: 'Automate',
};

/** La même règle dite en clair, pour le « ? » de la fiche. */
const REGLE_EN_CLAIR: Record<Alarme['regle'], string> = {
  seuil: 'une limite dépassée',
  derive: 'une dérive vers la limite',
  repetitif: 'un défaut répétitif',
  automate: 'un signal de l’automate',
};

/** Un bon daté à moins de dix minutes de la panne la consigne. */
const AUTOUR_PANNE_MS = 10 * 60_000;

/** Marge au-dessus de la plus grande des deux valeurs, pour que la limite ne colle pas au bord de la jauge. */
const MARGE_JAUGE = 1.25;

/** Valeur et unité ne se séparent pas en fin de ligne (« 1,3 » d'un côté, « D » de l'autre). */
const insecable = (s: string) => s.replace(/ (?=\S+$)/, ' ');

const minuscule = (s: string) => (s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s);

/**
 * La mesure au déclenchement face à sa limite : la valeur, la limite (max ou min), et une jauge où la zone hors limite
 * est hachurée. La barre qui entre dans cette zone se lit sans mot.
 */
function MesureLimite({ a, libelle }: { a: Alarme; libelle?: string }) {
  if (a.valeur === undefined) return null;
  const v = a.valeur;
  const s = a.seuil;
  const dessus = s !== undefined && v >= s;
  const max = s !== undefined && v >= 0 && s > 0 ? Math.max(v, s) * MARGE_JAUGE : undefined;
  const limite = s !== undefined ? s / (max ?? 1) : 0;
  return (
    <div className="af-mesure">
      <p>
        <span className="af-mesure-nom">{libelle ?? 'Mesure'}</span>
        <b className="af-valeur">{insecable(fmtValue(v, a.unite))}</b>
        {s !== undefined && (
          <span className="af-limite">
            limite {dessus ? 'max' : 'min'} {insecable(fmtValue(s, a.unite))}
          </span>
        )}
      </p>
      {max !== undefined && s !== undefined && (
        <span className="af-jauge" aria-hidden>
          <em style={dessus ? { left: `${limite * 100}%`, right: 0 } : { left: 0, width: `${limite * 100}%` }} />
          <i style={{ transform: `scaleX(${v / max})` }} />
          <u style={{ left: `${limite * 100}%` }} />
        </span>
      )}
    </div>
  );
}

function Coche({ faite }: { faite: boolean }) {
  return (
    <svg className={`af-coche ${faite ? 'faite' : ''}`} viewBox="0 0 20 20" width="20" height="20" aria-hidden>
      <circle cx="10" cy="10" r="8.5" />
      <path d="M6 10.4 8.7 13 14 7.4" />
    </svg>
  );
}

/** Bon d'intervention prérempli d'après l'alarme close (même préremplissage que le rejeu). */
function consigner(a: Alarme, compteRendu: string | undefined) {
  useUi.getState().setSaisie({
    machineId: a.machineId,
    organeId: a.organeId,
    type: 'curative',
    date: a.horodatage,
    // Une panne de la démo se règle en quelques secondes : le bon part d'une minute au moins.
    duree: a.finLe ? Math.max(1, Math.round((a.finLe - a.horodatage) / 60_000)) : 30,
    titre: `${a.code} · ${a.message}`,
    compteRendu,
  });
}

/** Fiche d'alarme : gravité, quoi, où, la mesure face à sa limite et les étapes à cocher. */
export function AlarmCard({ a, compact, now: nowProp }: { a: Alarme; compact?: boolean; now?: number }) {
  const machine = useProject((s) => s.machines.find((m) => m.id === a.machineId));
  const perso = useProject((s) => (machine ? s.perso[machine.id] : undefined));
  // « 2 min » avance avec le flux temps réel, sauf si l'appelant fixe l'heure.
  useLive((s) => (nowProp === undefined ? s.tick : 0));
  const now = nowProp ?? Date.now();
  const model = machine ? machineModel(machine, perso) : undefined;
  const organe = model?.organes.find((o) => o.id === a.organeId);
  const point = model?.points.find((p) => p.id === a.pointId);
  const panneType = model?.defs[a.organeId]?.panne;
  const reparation = panneType && point && panneType.mesure === point.cle ? panneType.action : undefined;
  const crit = a.gravite === 'critique';
  const prise = a.statut === 'acquittee';
  const ouvert = a.statut !== 'resolue';
  const aideOrgane = !crit || reparation || a.regle === 'repetitif';
  const exercice = estExercice(a);
  // Déjà au carnet : un bon de la même machine, titré du code de l'alarme, daté autour de la panne (le bon arrondit
  // l'heure à la minute, ou la recule de la durée de l'intervention).
  const consignee = useCarnet(
    (s) =>
      !ouvert &&
      s.saisies.some(
        (x) => x.machineId === a.machineId && x.titre.startsWith(a.code) && x.date >= a.horodatage - AUTOUR_PANNE_MS && x.date <= (a.finLe ?? a.horodatage) + AUTOUR_PANNE_MS,
      ),
  );
  // Une seule action vermillon : l'étape en cours. Avant la prise en charge, c'est elle ; ensuite, « Trouver la pièce »
  // pour un défaut qui revient, sinon la fin de l'intervention.
  const principale: 'prise' | 'piece' | 'fin' = !prise ? 'prise' : a.regle === 'repetitif' ? 'piece' : 'fin';

  return (
    <article
      className={`alarm-fiche ${compact ? 'compact' : 'organ-card'} ${crit ? 'crit' : 'warn'} ${exercice ? 'exercice' : ''}`}
      aria-label={`Alarme ${a.code}${exercice ? ' (exercice)' : ''} : ${a.message}`}
    >
      <div className="af-tete">
        <span className={`af-gravite st st-${crit ? 'panne' : 'attention'}`}>
          {/* Immobile : en panne, l'étiquette de la 3D et la phrase du bandeau battent déjà. */}
          <StatusIcon etat={crit ? 'panne' : 'attention'} size={11} animate={false} />
          {crit ? 'Panne' : 'À surveiller'}
        </span>
        <span className="af-code mono">{a.code}</span>
        {exercice && <span className="af-exercice">exercice</span>}
        {a.repetitions ? <span className="af-fois">{a.repetitions}ᵉ fois</span> : null}
        <span className="af-depuis num" title={`Levée à ${fmtHM(a.horodatage)}`}>
          {ouvert ? fmtDuration(now - a.horodatage) : `levée à ${fmtHM(a.horodatage)}`}
        </span>
      </div>

      <h3 className="af-titre">
        <span>{a.message}</span>
        <InfoTip label={`Comprendre l’alarme ${a.code}`}>
          <p>
            Levée à {fmtHM(a.horodatage)} par {REGLE_EN_CLAIR[a.regle]}
            {a.repetitions ? `, pour la ${a.repetitions}ᵉ fois` : ''}.
          </p>
          {!ouvert && a.cause && <p>Cause probable : {a.cause}</p>}
        </InfoTip>
      </h3>
      <p className="af-ou">
        {machine ? `${machine.numero} ${machine.nom}` : a.machineId}
        {organe && (
          <>
            , côté <b>{minuscule(organe.nom)}</b>
          </>
        )}
      </p>

      {!compact && <p className="af-mobile">Que faire : dans le panneau, sous le plan.</p>}

      {point?.type === 'alarme' ? (
        <p className="af-mesure af-signal">
          <span className="af-mesure-nom">{point.libelle}</span> signal de l’automate
        </p>
      ) : (
        <MesureLimite a={a} libelle={point?.libelle} />
      )}

      {ouvert ? (
        <div className="af-faire">
          <b className="af-faire-titre">
            Que faire
            <InfoTip label="Comprendre : que faire">
              <p>Prendre en charge, c’est acquitter l’alarme : l’équipe voit que quelqu’un s’en occupe.</p>
              <p>Une fois l’intervention signalée, la machine refait son réglage puis repart.</p>
            </InfoTip>
          </b>
          <ol>
            <li className={prise ? 'fait' : 'actuel'}>
              <Coche faite={prise} />
              <div>
                <span className="af-etape">Prendre en charge</span>
                {prise ? (
                  <span className="af-fait">
                    {a.acquitteePar ?? 'Fait'}
                    {a.acquitteeLe ? `, ${fmtHM(a.acquitteeLe)}` : ''}
                  </span>
                ) : (
                  <button className={`btn sm ${principale === 'prise' ? 'primary' : ''}`} onClick={() => void getSource()?.acknowledge(a.id)}>
                    <Hand /> Je m’en occupe
                  </button>
                )}
              </div>
            </li>
            <li className={prise ? 'actuel' : ''}>
              <Coche faite={false} />
              <div>
                {/* Une étape, pas un titre : son libellé ouvre lui-même la bulle, au lieu d'un « ? » de plus. */}
                <span className="af-etape">
                  {aideOrgane ? (
                    <InfoTip texte="Aller voir l’organe" label="Comprendre : aller voir l’organe">
                      {!crit && <p>Avant que la mesure atteigne sa limite d’alarme.</p>}
                      {reparation && <p>Réparation type : {reparation}</p>}
                      {a.regle === 'repetitif' && <p>La même panne revient : « Trouver la pièce » mesure l’écart entre deux défauts sur la bande.</p>}
                    </InfoTip>
                  ) : (
                    'Aller voir l’organe'
                  )}
                </span>
                {a.cause && (
                  <span className="af-verifier">
                    <b>À vérifier :</b> {a.cause}
                  </span>
                )}
                {a.regle === 'repetitif' && (
                  <button
                    className={`btn sm ${principale === 'piece' ? 'primary' : ''}`}
                    onClick={() => {
                      useUi.getState().selectMachine(a.machineId);
                      useUi.getState().setDiagnosticMachineId(a.machineId);
                    }}
                  >
                    <Ruler /> Trouver la pièce
                  </button>
                )}
              </div>
            </li>
            <li>
              <Coche faite={false} />
              <div>
                <span className="af-etape">Une fois réparé</span>
                <button className={`btn sm ${principale === 'fin' ? 'primary' : ''}`} onClick={() => void getSource()?.resolve(a.id)}>
                  <Wrench /> Intervention terminée
                </button>
              </div>
            </li>
          </ol>
        </div>
      ) : (
        <div className="af-cloture">
          <p className="af-close">
            <Coche faite /> Réglée{a.finLe ? ` à ${fmtHM(a.finLe)}, en ${fmtDuration(a.finLe - a.horodatage)}` : ''}.
          </p>
          <div className="af-cloture-actions">
            {consignee ? (
              <span className="af-fait">Intervention consignée au carnet</span>
            ) : (
              <button className="btn sm primary" onClick={() => consigner(a, panneType?.action)}>
                <ClipboardCheck /> Consigner l’intervention
              </button>
            )}
            <button className="btn sm" onClick={() => useUi.getState().setReplay(a)}>
              <HistoryIcon /> Revoir la panne
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
