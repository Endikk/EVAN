/**
 * Énergie (espace d'exploitation) : d'abord la phrase qui répond à « combien, et combien pour rien ? », puis trois
 * repères et, juste dessous, la rangée des émissions et de l'électricité par étiquette. Viennent la courbe de charge, où
 * part l'énergie et où économiser. Seuls les réglages du calcul et le détail par machine restent repliés.
 *
 * Chaque bloc montre un titre, son « ? » (définition, méthode) et au plus une ligne de leçon.
 *
 * Puissances par état estimées par type de machine ; facteur d'émission et prix modifiables. Les agrégats sont
 * mémorisés : l'écran ne recalcule l'historique qu'à la minute, au changement de période ou de réglage.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Zap } from 'lucide-react';
import { bilanUsine, energieParJour, gisements } from '@/analytics/energy';
import { ENERGIE_DEFAUT } from '@/domain/catalog';
import { getHistory } from '@/sim/history';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { AnimatedNumber } from '@/ui/anim';
import { Details, PageIntro, Repere } from '@/ui/explain';
import { fmtNombre } from '@/ui/format';
import { useNow } from '@/ui/useNow';
import { courbeParActivite, lireCourbe } from '../lib/courbe';
import { actionsEconomie, compterPeriodes } from '../lib/economies';
import { euros, kwh, pourcent, prixKwh } from '../lib/format';
import { LIBELLE_PERIODE, MOT_HORS_PRODUCTION, leconCourbe, phraseCourbe, surCent, tonHorsProduction, verdictEnergie, type Periode } from '../lib/lecture';
import { CourbeCharge } from './CourbeCharge';
import { DetailParMachine } from './DetailParMachine';
import { Economies } from './Economies';
import { Emissions } from './Emissions';
import { EnergieParJour } from './EnergieParJour';
import { guideEnergie } from './guide';
import { PuissanceDirect } from './PuissanceDirect';
import { Reglages, REGLAGES_DEFAUT, lireNombre, type SaisieReglages } from './Reglages';
import { Repartition } from './Repartition';

const MIN = 60_000;
const H = 60 * MIN;
const DAY = 24 * H;

/** Rang de chaque bloc dans l'entrée de l'écran, du haut vers le bas. */
const rang = (i: number) => ({ ['--i' as string]: i }) as CSSProperties;

export function EnergyView() {
  const machines = useProject((s) => s.machines);
  const activeId = useProject((s) => s.activeId);
  const now = useNow(MIN);
  const [periode, setPeriode] = useState<Periode>('7j');
  const [saisie, setSaisie] = useState<SaisieReglages>(REGLAGES_DEFAUT);
  // Machine choisie depuis un autre écran : son détail s'ouvre et elle ressort dans le graphique par machine.
  const [selectedId] = useState(() => useUi.getState().pageMachineId);
  useEffect(() => useUi.getState().setPageMachineId(undefined), []);

  // Une saisie illisible garde la valeur par défaut : l'écran ne montre jamais un calcul faux.
  const params = useMemo(
    () => ({
      prixKwh: lireNombre(saisie.prix) ?? ENERGIE_DEFAUT.prixKwh,
      facteurCo2: (lireNombre(saisie.facteurG) ?? ENERGIE_DEFAUT.facteurCo2 * 1000) / 1000,
    }),
    [saisie],
  );

  const h = useMemo(() => getHistory(machines), [machines]);
  const avecHistorique = useMemo(() => machines.filter((m) => !m.creeLe), [machines]);
  const from = periode === '24h' ? now - DAY : h.debut;
  const jours = (now - from) / DAY;
  const pas = periode === '24h' ? 10 * MIN : 30 * MIN;

  const bilan = useMemo(() => bilanUsine(h, avecHistorique, from, now, params), [h, avecHistorique, from, now, params]);
  // Tranches calées sur l'horloge (05:00, 05:10…), pas sur l'instant d'ouverture de l'écran.
  const debutCourbe = Math.floor(from / pas) * pas;
  const points = useMemo(() => courbeParActivite(h, avecHistorique, debutCourbe, now, pas), [h, avecHistorique, debutCourbe, now, pas]);
  const lecture = useMemo(() => lireCourbe(points, pas), [points, pas]);
  const parJour = useMemo(() => energieParJour(h, avecHistorique, h.debut, now), [h, avecHistorique, now]);
  const actions = useMemo(
    () =>
      actionsEconomie(gisements(bilan, jours, params), {
        bilan,
        jours,
        prix: params.prixKwh,
        machines,
        calages: compterPeriodes(h, avecHistorique, from, now, 'calage'),
        pannes: compterPeriodes(h, avecHistorique, from, now, 'panne'),
        talon: lecture.talon,
      }),
    [bilan, jours, params, machines, h, avecHistorique, from, now, lecture.talon],
  );
  const cent = useMemo(() => surCent(bilan), [bilan]);
  const guide = useMemo(() => guideEnergie(machines, cent), [machines, cent]);

  const { verdict, suite, ton } = verdictEnergie(bilan, periode);
  const total = bilan.total;
  const horsProduction = total.total - total.kwh.marche;
  const tonPerte = total.total > 0 ? tonHorsProduction(bilan.horsProduction) : 'neutre';
  const enMWh = total.total >= 10_000;
  const libellePeriode = LIBELLE_PERIODE[periode];

  return (
    <div className="history energie">
      <PageIntro
        titre="Énergie"
        icone={Zap}
        verdict={verdict}
        ton={ton}
        suite={total.total > 0 ? undefined : suite}
        guide={guide}
        simule
        actions={
          <div className="seg" role="group" aria-label="Période">
            <button type="button" aria-pressed={periode === '24h'} onClick={() => setPeriode('24h')}>
              24 heures
            </button>
            <button type="button" aria-pressed={periode === '7j'} onClick={() => setPeriode('7j')}>
              7 jours
            </button>
          </div>
        }
      />

      <div className="reperes en-reperes entree" data-guide="reperes" style={rang(1)}>
        <Repere
          titre="Consommation"
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
          terme="veille"
          valeur={bilan.horsProduction}
          format={(v) => pourcent(v)}
          ton={tonPerte}
          mot={MOT_HORS_PRODUCTION[tonPerte] || undefined}
          jauge={bilan.horsProduction}
          note={`${kwh(horsProduction)}, soit ${euros(horsProduction * params.prixKwh)}. ${total.total > 0 && suite ? suite : 'Réglages, veille et pannes sous tension.'}`}
          guide="sans-produire"
        />
        <PuissanceDirect key={activeId} machines={machines} pic={lecture.pic?.kw} libellePeriode={libellePeriode} />
      </div>

      <div className="en-plus entree" data-guide="details-haut" style={rang(2)}>
        <Emissions total={total} facteurCo2={params.facteurCo2} />
        <Details titre="Réglages du calcul" apercu={`${prixKwh(params.prixKwh)}/kWh · ${fmtNombre(params.facteurCo2 * 1000)} g CO₂e/kWh`}>
          <Reglages saisie={saisie} onChange={setSaisie} cout={total.cout} co2Kg={total.co2} libellePeriode={libellePeriode} />
        </Details>
      </div>

      <div className="history-grid">
        <CourbeCharge
          points={points}
          lecture={lecture}
          phrase={phraseCourbe(lecture, periode, params.prixKwh)}
          lecon={leconCourbe(lecture, periode, params.prixKwh)}
          surPlusieursJours={periode === '7j'}
          style={rang(3)}
        />
        <Repartition bilan={bilan} style={rang(4)} />
        <Economies actions={actions} prix={params.prixKwh} style={rang(5)} />
        <EnergieParJour jours={parJour} style={rang(6)} />
        <DetailParMachine bilan={bilan} selectedId={selectedId} style={rang(7)} />
      </div>
    </div>
  );
}
