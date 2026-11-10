/**
 * Vue d'ensemble de l'organisation. En haut, une phrase : les usines tournent-elles, et laquelle demande de l'attention.
 * Puis trois repères pour toute l'organisation et la rangée de ses chiffres de second rang, une carte par usine
 * (lisible en cinq secondes, un bouton pour l'ouvrir), et la comparaison des usines, chaque graphique sous une ligne
 * qui en tire la leçon. Les définitions et le détail des chiffres sont dans les « ? ». Tout est calculé de la même
 * façon pour chaque usine, sur les 7 derniers jours ; seule l'usine ouverte est suivie en direct.
 */
import { useMemo } from 'react';
import { LayoutGrid } from 'lucide-react';
import { listUsines, useProject } from '@/store/project';
import { useCarnet } from '@/store/carnet';
import { ChiffresSecondaires, PageIntro, Repere } from '@/ui/explain';
import { useNow } from '@/ui/useNow';
import { formatArea } from '@/geo/geodesy';
import { fmtDuration, fmtNombre, pct } from '@/ui/format';
import { construireLignes, totaux } from '../lib/donnees';
import { fr, minuscule, motEfficacite, motPannesOrganisation, pointAttention, repartitionRetards, tourne, TRS_POINTE, verdictOrganisation } from '../lib/lecture';
import { UsineCard } from './UsineCard';
import { Comparaison } from './Comparaison';
import { GUIDE_ORGANISATION } from './guide';
import { useDirect } from './useDirect';

export function OrganisationView() {
  const organisation = useProject((s) => s.organisation.nom);
  const usinesStore = useProject((s) => s.usines);
  const activeId = useProject((s) => s.activeId);
  const machinesActives = useProject((s) => s.machines);
  const saisies = useCarnet((s) => s.saisies);
  const now = useNow(5 * 60_000);

  const usines = useMemo(
    () => listUsines(useProject.getState()).filter((u) => u.site && u.configure && u.machines.length),
    // L'usine active dépliée change de référence quand ses machines changent.
    [usinesStore, activeId, machinesActives],
  );
  const lignes = useMemo(() => construireLignes(usines, now, saisies), [usines, now, saisies]);
  const tot = useMemo(() => totaux(lignes), [lignes]);
  const ligneActive = lignes.find((l) => l.u.id === activeId);
  const direct = useDirect(ligneActive?.u.machines);

  // Le point d'attention des usines non ouvertes ne dépend que de l'historique : leurs cartes ne se redessinent pas
  // quand le direct de l'usine ouverte change.
  const pointsHistorique = useMemo(
    () => lignes.map((l) => pointAttention({ retard: l.retard, urgent: l.urgent, derives: l.r.previsions, derive: l.derive })),
    [lignes],
  );
  const pointActif = useMemo(
    () =>
      ligneActive &&
      pointAttention({
        direct: direct?.etat,
        alarme: direct?.alarme,
        retard: ligneActive.retard,
        urgent: ligneActive.urgent,
        derives: ligneActive.r.previsions,
        derive: ligneActive.derive,
      }),
    [ligneActive, direct],
  );
  const points = useMemo(
    () => lignes.map((l, i) => (l.u.id === activeId && pointActif ? pointActif : pointsHistorique[i])),
    [lignes, activeId, pointActif, pointsHistorique],
  );
  const lecture = useMemo(
    () =>
      verdictOrganisation(
        lignes.map((l, i) => ({ court: l.court, tourne: tourne(l.u.id === activeId && direct ? direct.etat : l.derniereHeure), point: points[i] })),
      ),
    [lignes, points, activeId, direct],
  );

  const efficacite = motEfficacite(tot.trs);
  const pannes = motPannesOrganisation(lignes.map((l) => ({ court: l.court, heures: l.r.panneH, machines: l.u.machines.length })));
  const moyennePannes = lignes.length > 1 && tot.machines ? tot.panneH / tot.machines : undefined;
  const n = lignes.length;

  return (
    <div className="history organisation">
      <PageIntro
        titre={`${organisation || 'Organisation'} · vue d’ensemble`}
        icone={LayoutGrid}
        verdict={fr(lecture.verdict)}
        ton={lecture.ton}
        suite={lecture.suite && fr(lecture.suite)}
        guide={GUIDE_ORGANISATION}
        simule
      />

      {n > 0 && (
        <section className="org-haut entree" style={{ ['--i' as string]: 1 }} aria-label="Repères de l’organisation">
          <div className="reperes org-reperes" data-guide="org-reperes">
            <Repere
              titre="Efficacité des machines"
              terme="trs"
              valeur={Math.round(tot.trs * 100)}
              unite="%"
              mot={efficacite.mot}
              ton={efficacite.ton}
              jauge={tot.trs}
              cible={TRS_POINTE}
              note={`${n > 1 ? 'Toutes usines, sur 7 jours' : 'Sur 7 jours'}. Une usine de pointe atteint 85 % (repère courant du métier).`}
            />
            <Repere
              titre="Temps perdu en pannes"
              valeur={tot.panneH}
              format={(v) => fmtNombre(v, 1)}
              unite="h"
              mot={pannes?.mot}
              ton={pannes?.ton}
              note={
                tot.pannes
                  ? `${tot.pannes} ${tot.pannes > 1 ? 'pannes' : 'panne'} en 7 jours${tot.mttr !== undefined ? `, réparées en ${fmtDuration(tot.mttr)} en moyenne` : ''}.`
                  : 'Aucune panne en 7 jours.'
              }
            />
            <Repere
              titre="Entretiens en retard"
              valeur={tot.retard}
              mot={tot.retard ? 'À rattraper' : 'À jour'}
              ton={tot.retard ? 'warn' : 'ok'}
              note={
                !tot.retard
                  ? 'Aucun entretien n’a dépassé sa date.'
                  : (repartitionRetards(lignes) ??
                    (lignes[0]?.urgent ? fr(`Le plus urgent : ${minuscule(lignes[0].urgent.tache)}, sur ${lignes[0].urgent.numero}.`) : undefined))
              }
            />
          </div>
          <ChiffresSecondaires
            className="org-chiffres-sec"
            label="Autres chiffres de l’organisation, sur 7 jours"
            items={[
              { label: 'Disponibilité', terme: 'disponibilite', aide: n > 1 ? 'Moyenne des usines, pondérée par leurs machines.' : undefined, valeur: pct(tot.disponibilite) },
              { label: 'Électricité', aide: n > 1 ? 'Consommée en 7 jours, toutes usines.' : 'Consommée en 7 jours.', valeur: fmtNombre(tot.kwh / 1000, 1), unite: 'MWh' },
              { label: 'Émissions', terme: 'co2', valeur: fmtNombre(tot.co2 / 1000, 2), unite: 't' },
              { label: 'Dérives', terme: 'derive', valeur: tot.derives, ton: tot.derives ? 'warn' : undefined },
              {
                label: 'Machines',
                aide: `${n} ${n > 1 ? 'usines' : 'usine'}, ${formatArea(tot.surface)} de bâtiments.`,
                valeur: tot.machines,
              },
            ]}
          />
        </section>
      )}

      <div className={`org-usines ${n === 1 ? 'seule' : ''}`}>
        {lignes.map((l, i) => (
          <UsineCard
            key={l.u.id}
            l={l}
            direct={l.u.id === activeId ? direct : undefined}
            point={points[i]}
            moyennePannes={moyennePannes}
            premiere={i === 0}
            rang={2 + i}
          />
        ))}
      </div>

      <Comparaison lignes={lignes} rang={2 + n} />
    </div>
  );
}
