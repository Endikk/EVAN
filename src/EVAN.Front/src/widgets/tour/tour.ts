/**
 * Visite guidée de /demo : toute l'application en douze chapitres, avec une légende narrée. Le parcours de mise en
 * service (localiser, plan, machines, organes, connexion), puis l'exploitation (supervision et panne, historique,
 * maintenance, énergie, plusieurs usines, assistant) et l'accès protégé au paramétrage.
 * Un clic dans la scène met la visite en pause ; la légende permet de reprendre, de sauter un chapitre ou d'en choisir un.
 * Chaque chapitre amène lui-même l'écran qu'il raconte : on peut en démarrer un directement (?visite=8).
 *
 * Les légendes s'adressent à quelqu'un qui découvre EVAN : des phrases courtes, les mots de l'atelier plutôt que les
 * sigles, et le titre de chaque étape repris de ce qu'on y fait (steps.ts), pour que la visite et l'écran disent la même chose.
 */
import { useUi, isReducedMotion, espaceOf } from '@/store/ui';
import { useProject } from '@/store/project';
import { useLive } from '@/store/live';
import { useCarnet } from '@/store/carnet';
import { mapHandle, useMapUi } from '@/widgets/carte/mapState';
import { fitSite } from '@/widgets/carte/cadrage';
import { decalageCarte } from '@/widgets/carte/marges';
import { clearLocalisation, fitLocalisation, locate } from '@/widgets/carte/localisation';
import { formatArea } from '@/geo/geodesy';
import type { SaisieVisite, SearchResult } from '@/geo/search';
import { finishConfiguration, goToStep, openOrganisation, openReplay, requestConfiguration, showOrgan, simulateFault } from '@/widgets/shell/navigation';
import { getSource } from '@/realtime/source';
import { useSceneUi } from '@/widgets/scene/sceneState';
import { placeMachine } from '@/widgets/scene/placement';
import { switchView } from '@/widgets/scene/planView';
import { machineModel, MACHINE_TYPES } from '@/domain/catalog';
import { openUsine } from '@/widgets/usines/usines';
import { getHistory } from '@/sim/history';
import { echeances, previsions } from '@/analytics/maintenance';
import { diagnostiquerPas } from '@/analytics/repeatDefect';
import { etatAssistant } from '@/widgets/assistant/AssistantPanel';
import { EXPLOIT_TABS, STEPS } from '@/widgets/shell/steps';
import type { FlyToOptions } from 'maplibre-gl';

let ctrl: AbortController | null = null;

class Cancelled extends Error {}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Cancelled());
    const t = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      window.clearTimeout(t);
      reject(new Cancelled());
    });
  });
}

function caption(caption: string, sub?: string) {
  useUi.getState().setTour({ caption, sub });
}

/** Titre d'un chapitre d'étape : son numéro et ce qu'on y fait, mot pour mot comme sur l'écran (« 2 · Dessiner le plan et les zones »). */
function titreEtape(n: number): string {
  const e = [...STEPS, ...EXPLOIT_TABS].find((x) => x.n === n);
  return e ? `${n} · ${e.action}` : String(n);
}

async function waitFor(pred: () => boolean, timeout: number, signal: AbortSignal) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < timeout) await wait(250, signal);
}

/** Centre de l'emprise des bâtiments (milieu de leur rectangle englobant). */
function centreBatiments(batiments: { contour: [number, number][] }[]): [number, number] | undefined {
  const pts = batiments.flatMap((b) => b.contour);
  if (!pts.length) return undefined;
  const lng = pts.map((p) => p[0]);
  const lat = pts.map((p) => p[1]);
  return [(Math.min(...lng) + Math.max(...lng)) / 2, (Math.min(...lat) + Math.max(...lat)) / 2];
}

async function flyTo(opts: FlyToOptions, signal: AbortSignal) {
  const map = mapHandle.map;
  if (!map) return;
  await new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, (opts.duration ?? 4000) + 800);
    map.once('moveend', () => {
      window.clearTimeout(t);
      resolve();
    });
    // Le point visé arrive au centre de ce qui se voit (sous la recherche, au-dessus de la légende de la visite).
    map.flyTo({ offset: decalageCarte(map), ...opts, duration: isReducedMotion() ? 0 : opts.duration, essential: true });
  });
  if (signal.aborted) throw new Cancelled();
}

/** Carte mise en avant sur un écran d'exploitation : amenée au centre et cerclée le temps de la légende. */
let spot: Element | null = null;
async function montrer(cible: string | null, signal?: AbortSignal) {
  spot?.classList.remove('tour-spot');
  spot = null;
  if (!cible) return;
  const sel = `[data-tour="${cible}"]`;
  if (signal) await waitFor(() => !!document.querySelector(sel), 3000, signal);
  spot = document.querySelector(sel);
  if (!spot) return;
  spot.classList.add('tour-spot');
  spot.scrollIntoView({ behavior: isReducedMotion() ? 'auto' : 'smooth', block: 'center' });
}

/** Les écrans d'exploitation se racontent depuis l'exploitation : un chapitre lancé en configuration la termine. */
async function enExploitation(step: 6 | 7 | 8 | 9 = 6) {
  if (espaceOf(useUi.getState().step) === 'configuration') await finishConfiguration();
  useUi.getState().setVueOrganisation(false);
  await goToStep(step, { force: true });
}

const machinesDemo = () => useProject.getState().machines;
const flexoDemo = () => machinesDemo().find((m) => m.type === 'flexo') ?? machinesDemo()[0];

/**
 * Fiche « Valtiq » telle que l'annuaire des entreprises la donnerait. L'entreprise est fictive : la visite fournit
 * elle-même le résultat, avec les deux défauts courants d'une fiche SIRENE (position décalée de 270 m, adresse = la rue).
 */
const SIRENE_VALTIQ: SearchResult = {
  id: 'ent-valtiq',
  kind: 'entreprise',
  label: 'VALTIQ',
  sub: 'Siège · ZI DU MENNETON AVENUE THERESE VOISIN 37000 TOURS · NAF 18.12Z',
  coords: [0.6702, 47.3745],
  zoom: 17,
  precision: 'entreprise',
  entreprise: 'VALTIQ',
  adresse: 'ZI DU MENNETON AVENUE THERESE VOISIN 37000 TOURS',
};

/** Pas d'un défaut répétitif mesuré sur la bande (mm) : le développement d'un cylindre de la Gallus. */
const PAS_DEFAUT_MM = 381;

export interface Chapitre {
  titre: string;
  run(s: AbortSignal): Promise<void>;
}

export const CHAPITRES: Chapitre[] = [
  {
    titre: 'Localiser',
    run: async (s) => {
      if (useUi.getState().step !== 1) await goToStep(1, { force: true });
      const { site, batiments } = useProject.getState();
      if (!site) return;
      // Visite lancée depuis un écran en pleine page ouvert à l'instant : la carte peut être encore en chargement.
      await waitFor(() => !!mapHandle.map, 5000, s);
      const map = mapHandle.map;
      caption(titreEtape(1), 'On part de la carte de France et on tape le nom de l’entreprise, comme dans un moteur de recherche.');
      map?.jumpTo({ center: [2.4, 46.7], zoom: 4.6, pitch: 0, bearing: 0 });
      await wait(900, s);
      const name = 'Valtiq';
      for (let i = 1; i <= name.length; i++) {
        window.dispatchEvent(new CustomEvent<SaisieVisite>('evan:search-type', { detail: { q: name.slice(0, i), resultats: [SIRENE_VALTIQ] } }));
        await wait(110, s);
      }
      await wait(1600, s);
      window.dispatchEvent(new CustomEvent<SaisieVisite>('evan:search-type', { detail: { q: '' } }));
      caption('EVAN trouve l’entreprise dans l’annuaire officiel', 'Il vole jusqu’à son adresse : ZI du Menneton, avenue Thérèse Voisin, à Tours.');
      const loc = locate(SIRENE_VALTIQ);
      // Le vol arrive sur l'usine elle-même, au centre de l'écran : le point d'adresse est sur la rue, à côté.
      await flyTo({ center: centreBatiments(batiments) ?? SIRENE_VALTIQ.coords, zoom: 16.6, duration: 5200, curve: 1.7 }, s);
      caption('Les bâtiments apparaissent en zoomant', 'Ils viennent de la carte de l’IGN. Les bâtiments industriels sont en ambre.');
      await wait(2200, s);
      // Bâtiments candidats (requêtes IGN en direct ; la visite continue sans eux si le réseau ne répond pas).
      const res = await Promise.race([loc, wait(6000, s).then(() => null)]);
      const bonne = res?.candidates.find((c) => c.sourceRef === batiments[0]?.sourceRef);
      if (res && bonne) {
        fitLocalisation(res, { duration: 1400 });
        caption('Une adresse ne désigne que la rue', res.note ?? 'EVAN propose les bâtiments qui la bordent, chacun avec une lettre. On choisit le sien.');
        await wait(4200, s);
        useMapUi.getState().set({ hoverCandidate: bonne.sourceRef });
        caption(
          `Le bâtiment ${bonne.lettre} : c’est l’usine`,
          `${formatArea(bonne.surface)}, ${bonne.usage?.toLowerCase() ?? 'industriel'}, ${String(bonne.hauteur ?? '').replace('.', ',')} m de haut. Un clic suffit à le choisir.`,
        );
        await wait(3600, s);
      }
      clearLocalisation();
      // Le site entier, centré : l'adresse est sur la rue, à côté des bâtiments.
      if (map) fitSite(map, batiments, { duration: 1600, padding: 40 });
      await wait(1700, s);
      caption('Le contour exact du bâtiment', 'EVAN récupère sa forme, sa hauteur et son usage, puis calcule sa surface.');
      for (const b of batiments) {
        useUi.getState().selectBatiment(b.id);
        useMapUi.getState().set({ lastAddedId: undefined });
        await wait(60, s);
        useMapUi.getState().set({ lastAddedId: b.id });
        await wait(1900, s);
      }
      useUi.getState().selectBatiment(batiments[0]?.id);
      if (map) fitSite(map, batiments, { duration: 1600, padding: 60 });
      await wait(1800, s);
      caption('Plus on zoome, plus le relevé est précis', 'La longueur de chaque mur s’affiche. Le halo autour du contour montre la marge d’erreur, en mètres.');
      // Gros plan sur le bâtiment principal entier, centré, pour lire la longueur de chaque mur.
      if (map) fitSite(map, batiments.slice(0, 1), { duration: 2200, padding: 30 });
      await wait(2300, s);
      useMapUi.getState().setMode('edit');
      await wait(3400, s);
      useMapUi.getState().setMode('browse');
      if (map) fitSite(map, batiments, { duration: 1400, padding: 60 });
      await wait(1600, s);
    },
  },
  {
    titre: 'Plan',
    run: async (s) => {
      caption(titreEtape(2), 'Le contour du bâtiment se dresse en 3D : le sol et les murs à la bonne hauteur, sur la photo aérienne.');
      await goToStep(2, { force: true });
      await waitFor(() => useSceneUi.getState().groundReady, 4000, s);
      await wait(4200, s);
      caption('Les murs face à vous s’effacent', 'On voit l’intérieur comme dans une maison de poupée. La hauteur des murs se règle dans le panneau.');
      await wait(3500, s);
      await switchView('2d');
      caption('Le même atelier, vu de dessus', 'Le plan 2D est à l’échelle, avec la longueur de chaque mur et le nord.');
      await wait(3600, s);
      useUi.getState().selectZone('z-impr');
      caption('Les zones de l’atelier', 'Impression, stock… Chaque zone se trace sur le plan, et ses coins se déplacent à la souris.');
      await wait(3000, s);
      useUi.getState().selectZone(undefined);
      await switchView('3d');
      await wait(1200, s);
    },
  },
  {
    titre: 'Machines',
    run: async (s) => {
      await goToStep(3, { force: true });
      caption(titreEtape(3), 'On glisse une machine depuis la bibliothèque jusqu’au plan. Elle se cale sur une grille de 50 cm.');
      await wait(2500, s);
      // Depuis la bibliothèque (hors bâtiment, au bout du grand côté) jusqu'à la zone stock, le long de l'atelier d'impression.
      const from: [number, number] = [66, 16];
      const target: [number, number] = [8, 15.5];
      const path: [number, number][] = [];
      for (let i = 0; i <= 24; i++) {
        const k = 1 - (1 - i / 24) ** 2;
        path.push([from[0] + (target[0] - from[0]) * k, from[1] + (target[1] - from[1]) * k]);
      }
      for (const p of path) {
        useSceneUi.getState().set({ ghost: { type: 'digital', pos: [Math.round(p[0] * 2) / 2, Math.round(p[1] * 2) / 2], valid: true } });
        await wait(55, s);
      }
      useSceneUi.getState().set({ ghost: undefined });
      const exists = useProject.getState().machines.find((m) => m.numero === 'R09');
      const m = exists ?? placeMachine('digital', target);
      useUi.getState().selectMachine(m.id);
      caption('Chaque machine a un numéro et un nom', `${m.numero} · ${m.nom} est posée dans la zone stock. On la tourne d’un quart de tour.`);
      await wait(1600, s);
      useProject.getState().updateMachine(m.id, { rotationDeg: 90 });
      await wait(2200, s);
      useProject.getState().updateMachine(m.id, { rotationDeg: 0 });
      await wait(1500, s);
    },
  },
  {
    titre: 'Organes',
    run: async (s) => {
      await goToStep(4, { force: true });
      const flexo = machinesDemo().find((m) => m.type === 'flexo');
      if (!flexo) return;
      useUi.getState().selectMachine(flexo.id);
      useUi.getState().setFocus({ kind: 'machine', machineId: flexo.id });
      const model = machineModel(flexo, useProject.getState().perso[flexo.id]);
      caption(titreEtape(4), `${flexo.nom} : ${model.organes.length} organes, c’est-à-dire ses grandes parties, et ${model.points.length} points de mesure.`);
      await wait(3600, s);
      for (const n of [1, 2, 4]) {
        useUi.getState().setFocus({ kind: 'organe', machineId: flexo.id, organeId: `${flexo.id}.o${n}` });
        caption(
          n === 1 ? 'Organe 1 : le dérouleur' : n === 2 ? 'Organe 2 : un groupe d’impression' : 'Organe 4 : le séchage UV',
          n === 1
            ? 'La bobine s’y déroule. EVAN suit la tension de la bande et le diamètre de la bobine, chacun avec ses seuils.'
            : n === 2
              ? 'Son moteur entraîne le cylindre. S’il décroche, l’alarme désigne ce groupe et pas un autre.'
              : 'Les lampes UV sèchent l’encre. EVAN suit leur puissance et la température de la bande.',
        );
        await wait(3300, s);
      }
      useUi.getState().setFocus({ kind: 'machine', machineId: flexo.id });
      await wait(1200, s);
    },
  },
  {
    titre: 'Connexion',
    run: async (s) => {
      const m = machinesDemo().find((x) => x.numero === 'R02') ?? machinesDemo()[0];
      useUi.getState().selectMachine(m.id);
      await goToStep(5, { force: true });
      caption(titreEtape(5), 'On choisit comment parler à l’automate de la machine, on donne son adresse, puis on teste la liaison.');
      await wait(800, s);
      window.dispatchEvent(new Event('evan:connect-autoplay'));
      await wait(5200, s);
      caption('Test de la liaison', 'La connexion est chiffrée. Par défaut, EVAN ne fait que lire les valeurs de la machine.');
      await wait(5200, s);
      caption('Chaque valeur trouve sa place', 'Les variables de l’automate sont rattachées toutes seules aux organes de la machine.');
      await wait(5000, s);
      window.dispatchEvent(new Event('evan:connect-write-demo'));
      caption('Lecture seule par défaut', 'Envoyer un ordre à une machine demande un geste exprès et une raison, notée au journal. Ici, on renonce.');
      await wait(5200, s);
    },
  },
  {
    titre: 'Supervision',
    run: async (s) => {
      // Fin de la configuration : la suite se passe dans l'espace d'exploitation, le paramétrage repasse derrière un accès.
      await enExploitation(6);
      caption(titreEtape(6), 'Les machines bougent comme dans l’atelier. La forme et la couleur de leur étiquette disent si elles produisent, se règlent ou sont en panne.');
      await wait(5000, s);
      const r04 = machinesDemo().find((m) => m.numero === 'R04');
      if (r04) {
        useUi.getState().selectMachine(r04.id);
        useUi.getState().setFocus({ kind: 'machine', machineId: r04.id });
        caption('La fiche d’une machine', `${r04.numero} : sa vitesse et ses organes, avec leurs courbes en direct. Sa lampe UV faiblit : EVAN prévoit quand elle passera sous le seuil.`);
        await wait(5500, s);
        useUi.getState().selectMachine(undefined);
        useUi.getState().setFocus({ kind: 'site' });
        await wait(1200, s);
      }
      caption('Simulons une panne', 'EVAN pousse une mesure hors de sa plage, sur une pièce choisie au hasard.');
      const res = await simulateFault();
      if (!res) return;
      await waitFor(() => useLive.getState().alarms.some((a) => a.machineId === res.machineId && a.gravite === 'critique' && a.statut !== 'resolue'), 20000, s);
      caption('La panne est détectée', 'Du capteur jusqu’à l’écran, chaque étape est horodatée : on voit le temps que l’alarme a mis à arriver.');
      await wait(2600, s);
      caption('La caméra plonge jusqu’à la pièce en défaut', 'Sa fiche dit le code d’alarme, l’heure, la valeur mesurée et la cause probable.');
      await wait(7000, s);
      const a = useLive.getState().alarms.find((x) => x.machineId === res.machineId && x.gravite === 'critique' && x.statut !== 'resolue');
      if (a) {
        caption('On intervient', 'L’alarme est prise en compte, la panne réparée, puis la machine redémarre après un réglage. Tout est noté au journal.');
        await getSource()?.acknowledge(a.id);
        await wait(1800, s);
        await getSource()?.resolve(a.id);
      }
      useUi.getState().selectMachine(undefined);
      useUi.getState().setFocus({ kind: 'site' });
      await wait(2500, s);
    },
  },
  {
    titre: 'Historique',
    run: async (s) => {
      await enExploitation(7);
      caption(titreEtape(7), 'Sept jours d’atelier : quelles machines se sont arrêtées, combien de temps, et où dans l’usine.');
      await montrer('arrets-machines', s);
      await wait(4800, s);
      const flexo = flexoDemo();
      if (flexo) {
        useUi.getState().setPageMachineId(flexo.id);
        caption('Un clic sur une machine filtre tout l’écran', `${flexo.numero} ${flexo.nom} : sa courbe de mesure, ses seuils et ses alarmes.`);
        await montrer('courbe', s);
        await wait(4800, s);
      }
      await montrer('journal-alarmes', s);
      caption('Les pannes qui reviennent sont repérées', 'Sur la Gallus, le déchet autour des étiquettes casse souvent quand il est retiré : l’outil de découpe est à contrôler. Le journal s’exporte pour un tableur.');
      await wait(5200, s);
      await montrer(null);
    },
  },
  {
    titre: 'Maintenance',
    run: async (s) => {
      await enExploitation(8);
      caption(titreEtape(8), 'Les entretiens en retard ou à planifier, toutes machines confondues, et le temps moyen entre deux pannes.');
      await montrer('a-planifier', s);
      await wait(4800, s);

      const machines = machinesDemo();
      const h = getHistory(machines);
      const now = Date.now();
      const derive = machines.flatMap((m) => (m.creeLe ? [] : previsions(h, m, now)))[0];
      await montrer('prevision', s);
      caption(
        'Prévoir avant la panne',
        derive
          ? `${machines.find((m) => m.id === derive.machineId)?.numero} · ${derive.libelle.toLowerCase()} dérive lentement : EVAN prolonge la tendance et date le jour où le seuil sera franchi. On intervient avant.`
          : 'Quand une mesure dérive régulièrement, EVAN prolonge la tendance jusqu’au seuil : on intervient avant la panne.',
      );
      await wait(5200, s);

      // Une tâche en retard consignée : bon de travail prérempli, compteur remis à zéro.
      const tache = machines
        .flatMap((m) => (m.creeLe ? [] : echeances(h, m, now, useCarnet.getState().saisies)))
        .filter((e) => e.statut === 'en_retard' && e.nature === 'systematique')
        .sort((a, b) => (a.echeance ?? 0) - (b.echeance ?? 0))[0];
      if (tache) {
        const m = machines.find((x) => x.id === tache.machineId);
        await montrer('a-planifier', s);
        useUi.getState().setSaisie({ machineId: tache.machineId, organeId: tache.organeId, type: 'preventive', tacheId: tache.tacheId, titre: tache.tache, duree: tache.duree });
        caption('Noter une intervention', `${m?.numero} · ${tache.tache} : le bon de travail est déjà rempli à partir du plan d’entretien.`);
        await wait(3800, s);
        document.querySelector<HTMLFormElement>('[data-tour="saisie"]')?.requestSubmit();
        caption('Le carnet se tient tout seul', 'Les pannes y entrent d’elles-mêmes, l’atelier n’ajoute que ce qu’il a fait. Le compteur de la tâche repart à zéro.');
        await wait(3200, s);
      }

      // Une panne de l'historique rejouée.
      const panne =
        h.alarmes.filter((a) => a.code === 'DC-07' && a.finLe).sort((a, b) => b.horodatage - a.horodatage)[0] ??
        h.alarmes.filter((a) => a.gravite === 'critique' && a.finLe).sort((a, b) => b.horodatage - a.horodatage)[0];
      if (panne) {
        await montrer('journal-interventions', s);
        await wait(1200, s);
        const m = machines.find((x) => x.id === panne.machineId);
        openReplay(panne);
        caption('Revoir une panne', `${panne.code} sur ${m?.numero} : la mesure dérive, passe le seuil d’attention puis celui d’alarme, et la machine s’arrête en 3D.`);
        await wait(9000, s);
        window.dispatchEvent(new CustomEvent('evan:replay-vitesse', { detail: 600 }));
        caption('Jusqu’au redémarrage', 'L’alarme prise en compte, l’intervention, la reprise : chaque étape s’affiche à son heure, comme un enregistrement qu’on relit.');
        await wait(8500, s);
        useUi.getState().setReplay(null);
        await wait(600, s);
      }

      // Défaut répétitif : le pas mesuré sur la bande désigne la pièce tournante.
      const flexo = flexoDemo();
      const type = flexo ? MACHINE_TYPES[flexo.type] : undefined;
      if (flexo && type) {
        await montrer('defaut-repetitif', s);
        caption('Un défaut qui revient : quelle pièce ?', `Une marque revient tous les ${PAS_DEFAUT_MM} mm sur la bande de ${flexo.numero}. EVAN cherche la pièce qui fait un tour en ${PAS_DEFAUT_MM} mm.`);
        window.dispatchEvent(new CustomEvent('evan:pitch-demo', { detail: { machineId: flexo.id, pas: String(PAS_DEFAUT_MM), nature: '' } }));
        await wait(4200, s);
        window.dispatchEvent(new CustomEvent('evan:pitch-demo', { detail: { machineId: flexo.id, nature: 'decoupe' } }));
        caption('L’aspect du défaut fait le tri', 'Plusieurs pièces font un tour de la même longueur : un défaut de découpe ne désigne pas la même qu’un défaut d’impression.');
        await wait(4200, s);
        const best = diagnostiquerPas(type.organes, PAS_DEFAUT_MM, { nature: 'decoupe' }).candidats[0];
        if (best) {
          await montrer(null);
          caption('Un clic montre la pièce en 3D', `${best.cylindre} · organe ${best.organeNumero}, ${best.organeNom.toLowerCase()}.`);
          await showOrgan(flexo.id, `${flexo.id}.o${best.organeNumero}`);
          await wait(6000, s);
          useUi.getState().selectMachine(undefined);
          useUi.getState().setFocus({ kind: 'site' });
        }
      }
      await montrer(null);
    },
  },
  {
    titre: 'Énergie',
    run: async (s) => {
      await enExploitation(9);
      caption(titreEtape(9), 'La puissance appelée en ce moment, et ce que la semaine a coûté en électricité et en CO₂.');
      await wait(4500, s);
      await montrer('courbe-charge', s);
      caption('La courbe de la journée', 'Le pic fixe l’abonnement électrique. La nuit et le dimanche, il ne reste que la veille des machines.');
      await wait(4500, s);
      await montrer('gisements', s);
      caption('Où économiser', 'Réglages, veille hors production, machine plus gourmande que ses voisines : chaque piste est chiffrée en euros par an.');
      await wait(5200, s);
      await montrer('energie-machines', s);
      caption('Machine par machine', 'Ce que chaque machine consomme quand elle produit, se règle ou attend. Le détail s’affiche au survol.');
      await wait(4200, s);
      await montrer(null);
    },
  },
  {
    titre: 'Plusieurs usines',
    run: async (s) => {
      const { usines, organisation } = useProject.getState();
      await enExploitation(6);
      if (usines.length < 2) return;
      openOrganisation();
      caption('10 · Plusieurs usines', `${organisation.nom || 'L’organisation'} : ${usines.length} usines côte à côte, avec les mêmes repères calculés de la même façon.`);
      await wait(5200, s);
      await montrer('comparables', s);
      caption('Des machines comparables', 'Une même machine d’une usine à l’autre : son efficacité et son énergie par étiquette. Un écart qui dure mérite qu’on regarde.');
      await wait(4800, s);
      await montrer(null);
      await goToStep(6, { force: true });
      const autre = usines[1];
      await openUsine(autre.id);
      caption(
        autre.site?.nom ?? 'Deuxième usine',
        `Son vrai bâtiment, ses ${autre.machines.length} machines${autre.site?.passerelle ? `, sa passerelle ${autre.site.passerelle}` : ''} et ses propres données en direct.`,
      );
      await wait(6500, s);
      await openUsine(usines[0].id);
      caption('Retour à la première usine', 'Le sélecteur, en haut à gauche, passe d’une usine à l’autre ou les montre toutes ensemble.');
      await wait(3000, s);
    },
  },
  {
    titre: 'Demander à EVAN',
    run: async (s) => {
      await enExploitation(6);
      useUi.getState().setAssistantOuvert(true);
      caption('11 · Demander à EVAN', 'Une question en français sur l’usine : l’assistant cherche la réponse dans les données d’EVAN.');
      // La disponibilité est (re)vérifiée à l'ouverture du panneau.
      await wait(1800, s);
      await waitFor(() => etatAssistant().dispo !== undefined, 2000, s);
      const flexo = flexoDemo();
      if (etatAssistant().dispo?.disponible && flexo) {
        window.dispatchEvent(new CustomEvent('evan:assistant-ask', { detail: `Pourquoi ${flexo.numero} ${flexo.nom} s’est-elle arrêtée ces dernières 24 heures ?` }));
        caption('EVAN va chercher dans ses données', 'Alarmes, arrêts, déroulé d’une panne : on voit ce qu’il consulte.');
        await wait(1000, s);
        await waitFor(() => !etatAssistant().enCours, 60000, s);
        caption('Une réponse avec ses sources', 'Les machines et les alarmes citées sont des liens : un clic rejoue la panne.');
        await wait(7000, s);
      } else {
        caption('Demander à EVAN : hors ligne ici', 'L’assistant a besoin du serveur EVAN et de sa clé Claude. Une fois branché, il répond en citant les machines et les alarmes.');
        await wait(6500, s);
      }
      useUi.getState().setAssistantOuvert(false);
      await wait(600, s);
    },
  },
  {
    titre: 'Et après',
    run: async (s) => {
      await enExploitation(6);
      requestConfiguration(1);
      caption('Modifier l’usine est protégé', 'Changer le plan, les machines ou leurs branchements demande d’ouvrir un accès, noté au journal.');
      await wait(5000, s);
      useUi.getState().setAccessRequest(null);
      caption('À vous de jouer', 'Menu ⋯, puis «\u00a0Commencer avec mon usine\u00a0» : votre adresse, votre bâtiment, vos machines.');
      await wait(6500, s);
    },
  },
];

/** Interrompt le chapitre en cours sans toucher à la légende. */
function interrompre() {
  ctrl?.abort();
  ctrl = null;
  useSceneUi.getState().set({ ghost: undefined });
  void montrer(null);
}

/** Démarre (ou reprend) la visite au chapitre donné, par défaut celui de la pause, sinon le premier. */
export async function startTour(from?: number) {
  interrompre();
  const c = new AbortController();
  ctrl = c;
  const ui = useUi.getState();
  // Fenêtres laissées ouvertes par un chapitre interrompu.
  ui.setReplay(null);
  ui.setSaisie(null);
  ui.setAccessRequest(null);
  ui.setAssistantOuvert(false);
  const start = Math.min(Math.max(1, Math.round(from ?? ui.tour.chapitre ?? 1)), CHAPITRES.length);
  ui.setTour({ playing: true, chapitre: start });
  // La visite raconte l'usine de Tours : on y revient si l'on regardait une autre usine de la démo.
  const { mode, usines, activeId } = useProject.getState();
  if (mode === 'demo' && usines[0] && activeId !== usines[0].id) await openUsine(usines[0].id);
  try {
    for (let n = start; n <= CHAPITRES.length; n++) {
      useUi.getState().setTour({ chapitre: n });
      await CHAPITRES[n - 1].run(c.signal);
      if (c.signal.aborted) return;
    }
    useUi.getState().setTour({ playing: false, caption: undefined, sub: undefined, chapitre: undefined });
  } catch (e) {
    if (!(e instanceof Cancelled)) {
      console.error(e);
      useUi.getState().setTour({ playing: false });
    }
  }
}

/** Pause : le chapitre s'arrête, la légende reste pour reprendre ou changer de chapitre. */
export function pauseTour() {
  interrompre();
  useUi.getState().setTour({ playing: false });
}

/** Fin de la visite : l'utilisateur reprend la main. */
export function stopTour() {
  interrompre();
  const ui = useUi.getState();
  if (ui.tour.playing || ui.tour.caption || ui.tour.chapitre) ui.setTour({ playing: false, caption: undefined, sub: undefined, chapitre: undefined });
}
