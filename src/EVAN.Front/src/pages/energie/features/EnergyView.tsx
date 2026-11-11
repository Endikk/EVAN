/**
 * Énergie (espace d'exploitation) : d'abord la phrase qui répond à « combien, et combien pour rien ? », puis la même
 * barre de filtres que l'historique (période et machine), les repères (la consommation mène, la part sans produire et
 * la puissance du moment suivent en compact) et, juste dessous, la rangée des émissions et de l'électricité par
 * étiquette. Viennent la courbe de charge, où part l'énergie, ce que chaque machine dépense sans produire, où économiser
 * et l'énergie jour par jour. Seuls les réglages du calcul restent repliés.
 *
 * Chaque bloc montre un titre, son « ? » (définition, méthode) et au plus une ligne de leçon.
 *
 * La machine choisie pilote tout l'écran sauf le bloc « Par machine », qui garde toutes les machines pour la situer
 * parmi les autres (comme le graphique des arrêts de l'historique). « Où économiser » et « Énergie par jour » partent
 * toujours des 7 derniers jours : une somme par an ne change pas avec le bouton de période.
 *
 * Puissances par état estimées par type de machine ; facteur d'émission et prix modifiables, retenus par usine
 * (lib/reglages.ts). Les agrégats sont mémorisés : l'écran ne recalcule l'historique qu'à la minute, au changement de
 * période, de machine ou de réglage.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { History as IconeHistorique, Zap } from 'lucide-react';
import { bilanUsine, energieParJour } from '@/analytics/energy';
import { getHistory } from '@/sim/history';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { AnimatedNumber } from '@/ui/anim';
import { Details, PageIntro, Repere } from '@/ui/explain';
import { fmtNombre } from '@/ui/format';
import { useNow } from '@/ui/useNow';
import { Filtres } from '@/widgets/charts/Filtres';
import { openPage } from '@/widgets/shell/navigation';
import { courbeParActivite, lireCourbe } from '../lib/courbe';
import { economiesSur7Jours } from '../lib/economies';
import { euros, kwh, pourcent, prixKwh } from '../lib/format';
import { LIBELLE_PERIODE, MOT_HORS_PRODUCTION, leconCourbe, phraseCourbe, surCent, tonHorsProduction, verdictEnergie, type Periode } from '../lib/lecture';
import { parametres, REGLAGES_DEFAUT, saisieDe, useReglagesEnergie, type SaisieReglages } from '../lib/reglages';
import { CourbeCharge } from './CourbeCharge';
import { Economies } from './Economies';
import { Emissions } from './Emissions';
import { EnergieParJour } from './EnergieParJour';
import { guideEnergie } from './guide';
import { ParMachine } from './ParMachine';
import { PuissanceDirect } from './PuissanceDirect';
import { Reglages } from './Reglages';
import { Repartition } from './Repartition';

const MIN = 60_000;
const H = 60 * MIN;
const DAY = 24 * H;
/** Étape de l'énergie dans la navigation (openPage(9, …)). */
const ETAPE_ENERGIE = 9;

/** Rang de chaque bloc dans l'entrée de l'écran, du haut vers le bas. */
const rang = (i: number) => ({ ['--i' as string]: i }) as CSSProperties;

export function EnergyView() {
  const machines = useProject((s) => s.machines);
  const activeId = useProject((s) => s.activeId);
  const now = useNow(MIN);
  const [periode, setPeriode] = useState<Periode>('7j');
  const [machineId, setMachineId] = useState('');

  // Machine désignée par un autre écran (« Voir son énergie ») ou par la visite guidée : l'écran se filtre sur elle.
  const pageMachineId = useUi((s) => s.pageMachineId);
  useEffect(() => {
    // « Voir son historique » pose la machine pour l'historique pendant que l'énergie est encore affichée : l'écran ne la
    // prend que s'il est bien l'écran ouvert.
    if (!pageMachineId || useUi.getState().step !== ETAPE_ENERGIE) return;
    setMachineId(pageMachineId);
    useUi.getState().setPageMachineId(undefined);
  }, [pageMachineId]);
  // Une autre usine n'a pas les mêmes machines : le filtre repart de toute l'usine (au changement, pas à l'ouverture,
  // où une machine désignée par un autre écran vient d'être choisie).
  const usineVue = useRef(activeId);
  useEffect(() => {
    if (usineVue.current === activeId) return;
    usineVue.current = activeId;
    setMachineId('');
  }, [activeId]);

  // Réglages du calcul, propres à l'usine : ce qui est tapé, sinon le dernier réglage valable, sinon le défaut.
  const saisie = useReglagesEnergie((s) => saisieDe(s, activeId));
  const retenu = useReglagesEnergie((s) => s.retenus[activeId] ?? REGLAGES_DEFAUT);
  const regler = useCallback((x: SaisieReglages) => useReglagesEnergie.getState().regler(activeId, x), [activeId]);
  const params = useMemo(() => parametres(saisie, retenu), [saisie, retenu]);

  const machine = machines.find((m) => m.id === machineId);
  const h = useMemo(() => getHistory(machines), [machines]);
  const avecHistorique = useMemo(() => machines.filter((m) => !m.creeLe), [machines]);
  const vues = useMemo(() => (machineId ? avecHistorique.filter((m) => m.id === machineId) : avecHistorique), [avecHistorique, machineId]);
  const from = periode === '24h' ? now - DAY : h.debut;
  const pas = periode === '24h' ? 10 * MIN : 30 * MIN;

  const bilan = useMemo(() => bilanUsine(h, vues, from, now, params), [h, vues, from, now, params]);
  // Toutes les machines, pour le bloc « Par machine » : la machine choisie s'y situe parmi les autres.
  const bilanTous = useMemo(
    () => (machineId ? bilanUsine(h, avecHistorique, from, now, params) : bilan),
    [machineId, h, avecHistorique, from, now, params, bilan],
  );
  // Tranches calées sur l'horloge (05:00, 05:10…), pas sur l'instant d'ouverture de l'écran.
  const debutCourbe = Math.floor(from / pas) * pas;
  const points = useMemo(() => courbeParActivite(h, vues, debutCourbe, now, pas), [h, vues, debutCourbe, now, pas]);
  const lecture = useMemo(() => lireCourbe(points, pas), [points, pas]);
  // La veille des 7 derniers jours, pour « Où économiser » : sur 7 jours, c'est la courbe affichée.
  const talon7 = useMemo(() => {
    if (periode === '7j') return lecture.talon;
    const pas7 = 30 * MIN;
    return lireCourbe(courbeParActivite(h, vues, Math.floor(h.debut / pas7) * pas7, now, pas7), pas7).talon;
  }, [periode, lecture.talon, h, vues, now]);
  const parJour = useMemo(() => energieParJour(h, vues, h.debut, now), [h, vues, now]);
  const aujourdhui = useMemo(() => new Date(now).setHours(0, 0, 0, 0), [now]);
  const actions = useMemo(() => economiesSur7Jours(h, machines, machineId, now, params, talon7), [h, machines, machineId, now, params, talon7]);
  const cent = useMemo(() => surCent(bilan), [bilan]);
  const guide = useMemo(() => guideEnergie(machines, cent), [machines, cent]);

  /** Clic sur une machine dans « Par machine » : la choisir, ou revenir à toute l'usine. */
  const basculer = useCallback((id: string) => setMachineId((cur) => (cur === id ? '' : id)), []);

  const { verdict, suite, ton } = verdictEnergie(bilan, periode, machine?.numero);
  // Une seule machine : son unité de production et son électricité par unité, pas celles des étiquettes imprimées.
  const total = machine ? (bilan.parMachine[0]?.bilan ?? bilan.total) : bilan.total;
  const horsProduction = total.total - total.kwh.marche;
  const tonPerte = total.total > 0 ? tonHorsProduction(bilan.horsProduction) : 'neutre';
  const enMWh = total.total >= 10_000;
  const libellePeriode = LIBELLE_PERIODE[periode];
  const lienHistorique = machine && (
    <button type="button" className="btn sm ghost hf-lien" onClick={() => void openPage(7, machine.id)}>
      <IconeHistorique aria-hidden /> Voir son historique
    </button>
  );

  return (
    <div className="history energie">
      <PageIntro titre="Énergie" icone={Zap} verdict={verdict} ton={ton} suite={total.total > 0 ? undefined : suite} guide={guide} simule />
      <Filtres periode={periode} onPeriode={setPeriode} machineId={machineId} onMachine={setMachineId} machines={machines} rang={1} lien={lienHistorique} />

      <div className="reperes en-reperes entree" data-guide="reperes" style={rang(1)}>
        <Repere
          titre={machine ? `Consommation de ${machine.numero}` : 'Consommation'}
          className="rp-mene"
          noteVisible
          terme="kwh"
          valeur={enMWh ? total.total / 1000 : total.total}
          format={(v) => fmtNombre(v, enMWh ? 1 : 0)}
          unite={enMWh ? 'MWh' : 'kWh'}
          note={
            <>
              Soit{' '}
              <b className="en-note-fort">
                <AnimatedNumber value={total.cout} format={euros} />
              </b>{' '}
              au prix de {prixKwh(params.prixKwh)} le kWh.
            </>
          }
          guide="consommation"
        />
        <Repere
          titre="Part dépensée sans produire"
          className="rp-compact"
          terme="horsProduction"
          valeur={bilan.horsProduction}
          format={(v) => pourcent(v)}
          ton={tonPerte}
          mot={MOT_HORS_PRODUCTION[tonPerte] || undefined}
          jauge={bilan.horsProduction}
          note={`${kwh(horsProduction)}, soit ${euros(horsProduction * params.prixKwh)}. ${total.total > 0 && suite ? suite : 'Réglages, veille et pannes sous tension.'}`}
          guide="sans-produire"
        />
        <PuissanceDirect key={activeId} machines={machine ? [machine] : machines} pic={lecture.pic?.kw} libellePeriode={libellePeriode} />
      </div>

      <div className="en-plus entree" data-guide="details-haut" style={rang(2)}>
        <Emissions total={total} facteurCo2={params.facteurCo2} />
        <Details titre="Réglages du calcul" apercu={`${prixKwh(params.prixKwh)}/kWh · ${fmtNombre(params.facteurCo2 * 1000)} g CO₂e/kWh`}>
          <Reglages
            saisie={saisie}
            onChange={regler}
            prixUtilise={params.prixKwh}
            facteurUtiliseG={params.facteurCo2 * 1000}
            cout={total.cout}
            co2Kg={total.co2}
            libellePeriode={libellePeriode}
          />
        </Details>
      </div>

      <div className="history-grid">
        <CourbeCharge
          points={points}
          lecture={lecture}
          phrase={phraseCourbe(lecture, periode, params.prixKwh, machine?.numero)}
          lecon={leconCourbe(lecture, periode, params.prixKwh, machine?.numero)}
          surPlusieursJours={periode === '7j'}
          style={rang(3)}
        />
        <Repartition bilan={bilan} style={rang(4)} />
        <ParMachine bilan={bilanTous} prix={params.prixKwh} selectedId={machineId || undefined} onChoisir={basculer} style={rang(5)} />
        <Economies actions={actions} prix={params.prixKwh} perimetre={machine ? machine.numero : 'l’usine'} style={rang(6)} />
        <EnergieParJour jours={parJour} enCours={now - aujourdhui > MIN ? aujourdhui : undefined} style={rang(7)} />
      </div>
    </div>
  );
}
