/**
 * Un organe de la machine, en liste compacte : replié, son numéro, son nom et un point par mesure (gris tant que
 * c'est normal, en couleur seulement quand ça sort de la plage) ; déplié, l'état de chaque mesure sur sa bande de
 * seuils, puis une rangée de chiffres dont les « ? » disent ce qui lâche d'habitude, comment remonter à la cause et
 * l'alarme de la machine. Les chiffres exacts et le réglage des seuils restent repliés dans « Voir les chiffres ».
 */
import { useEffect, useId, useState } from 'react';
import { ChevronRight, Crosshair } from 'lucide-react';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { useLive, type Niveau } from '@/store/live';
import { machineModel } from '@/domain/catalog';
import type { Machine, Organe, PointDeMesure, Seuils } from '@/domain/types';
import { ChiffresSecondaires, Details, TonGlyph, type ChiffreSecondaire, type Ton } from '@/ui/explain';
import { fmtValue } from '@/ui/format';
import { lectureSeuils, nombreSeuil } from '../lib/seuils';
import { enPhrase, MesureBande } from './BandeSeuils';

const CHAMPS_SEUILS: { k: keyof Seuils; l: string }[] = [
  { k: 'alarmeBas', l: 'Alarme sous' },
  { k: 'attentionBas', l: 'Attention sous' },
  { k: 'attentionHaut', l: 'Attention au-delà de' },
  { k: 'alarmeHaut', l: 'Alarme au-delà de' },
];

function modifierPoint(machine: Machine, pointId: string, patch: Partial<PointDeMesure>) {
  const st = useProject.getState();
  const model = machineModel(machine, st.perso[machine.id]);
  st.setPerso(machine.id, {
    organes: model.organes,
    points: model.points.map((p) => (p.id === pointId ? { ...p, ...patch } : p)),
  });
}

const RANG: Record<Niveau, number> = { ok: 0, attention: 1, alarme: 2 };

/** Niveau de chaque mesure (« - » sans valeur), en une chaîne simple : le composant ne se redessine que si elle change. */
function useNiveaux(points: PointDeMesure[]): (Niveau | undefined)[] {
  const cle = useLive((s) =>
    points
      .map((p) => {
        const v = s.values[p.id];
        if (!v) return '-';
        if (p.type === 'alarme') return v.v ? 'alarme' : 'ok';
        return v.niveau;
      })
      .join(','),
  );
  return cle ? cle.split(',').map((n) => (n === '-' ? undefined : (n as Niveau))) : [];
}

function pire(niveaux: (Niveau | undefined)[]): Niveau | undefined {
  return niveaux.reduce<Niveau | undefined>((acc, n) => (n && (!acc || RANG[n] > RANG[acc]) ? n : acc), undefined);
}

const TON: Record<Niveau, Ton> = { ok: 'ok', attention: 'warn', alarme: 'crit' };

/** Un point par mesure : on compte les mesures et on voit, d'un coup d'œil, celles qui sortent de la normale. */
function Points({ niveaux }: { niveaux: (Niveau | undefined)[] }) {
  if (!niveaux.length) return null;
  return (
    <span className="og-points" aria-hidden>
      {niveaux.map((n, i) => (
        <i key={i} className={n ? `og-point-${n}` : 'og-point-vide'} />
      ))}
    </span>
  );
}

/** Ce que l'organe a d'utile à savoir, en chiffres dont le « ? » donne le détail. */
function chiffresOrgane(organe: Organe): ChiffreSecondaire[] {
  const items: ChiffreSecondaire[] = [];
  if (organe.pannesTypiques.length || organe.methode) {
    items.push({
      label: 'Pannes',
      valeur: organe.pannesTypiques.length,
      aide: (
        <>
          {organe.pannesTypiques.length > 0 && (
            <>
              <b>Ce qui lâche d’habitude :</b> {organe.pannesTypiques.map((t, i) => (i ? enPhrase(t) : t)).join(', ')}.{' '}
            </>
          )}
          {organe.methode && (
            <>
              <b>Pour trouver la cause :</b> {organe.methode}
            </>
          )}
        </>
      ),
    });
  }
  if (organe.alarme) {
    items.push({ label: 'Alarme', valeur: <span className="mono">{organe.alarme.code}</span>, aide: `Message affiché par la machine : ${organe.alarme.message}.` });
  }
  if (organe.capteurs.length) {
    items.push({ label: 'Capteurs', valeur: organe.capteurs.length, aide: `${organe.capteurs.map((c, i) => (i ? enPhrase(c) : c)).join(', ')}.` });
  }
  return items;
}

function ChiffresPoint({ machine, point }: { machine: Machine; point: PointDeMesure }) {
  const v = useLive((s) => s.values[point.id]?.v);
  return (
    <div className="og-chiffres-point">
      <p className="og-chiffres-nom">
        <b>{point.libelle}</b>
        <span className="num faint">
          {v !== undefined && `maintenant ${fmtValue(v, point.unite)} · `}valeur normale {nombreSeuil(point.nominal, point.unite)}
        </span>
      </p>
      <p className="og-chiffres-lecture">{lectureSeuils(point.seuils, point.unite) || 'Aucun seuil : la mesure est suivie pour information.'}</p>
      <div className="og-seuils-champs">
        {CHAMPS_SEUILS.map(({ k, l }) => (
          <label key={k} className="field">
            <span>
              {l}
              {point.unite ? ` (${point.unite})` : ''}
            </span>
            <input
              className="input num"
              type="number"
              inputMode="decimal"
              step="any"
              value={point.seuils[k] ?? ''}
              placeholder="aucun"
              onChange={(e) => modifierPoint(machine, point.id, { seuils: { ...point.seuils, [k]: e.target.value === '' ? undefined : Number(e.target.value) } })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export function OrganCard({ machine, organe, points, actif }: { machine: Machine; organe: Organe; points: PointDeMesure[]; actif: boolean }) {
  const [ouvert, setOuvert] = useState(actif);
  const corps = useId();
  const niveaux = useNiveaux(points);
  const pireEtat = pire(niveaux);
  useEffect(() => {
    if (actif) setOuvert(true);
  }, [actif]);

  const mesures = points.filter((p) => p.type !== 'alarme');
  const alerte = pireEtat && pireEtat !== 'ok';
  const chiffres = chiffresOrgane(organe);

  return (
    <li className={`og-carte ${actif ? 'actif' : ''} ${ouvert ? 'ouvert' : ''}`}>
      <div className="og-carte-tete">
        <button type="button" className="og-carte-bouton" aria-expanded={ouvert} aria-controls={corps} onClick={() => setOuvert((o) => !o)}>
          <ChevronRight className="og-chevron" aria-hidden />
          <span className="og-numero mono">#{organe.numero}</span>
          <span className="og-carte-titre">
            <b>
              {organe.nom}
              {alerte && (
                <span className={`og-carte-alerte ton-${TON[pireEtat]}`}>
                  <TonGlyph ton={TON[pireEtat]} />
                  <span className="sr-only">{pireEtat === 'alarme' ? 'Alarme en cours' : 'Mesure en attention'}</span>
                </span>
              )}
            </b>
          </span>
          <Points niveaux={niveaux} />
          <span className="sr-only">
            {points.length} point{points.length > 1 ? 's' : ''} de mesure
          </span>
        </button>
        <button
          type="button"
          className={`btn sm icon og-viser ${actif ? 'active' : ''}`}
          onClick={() => {
            useUi.getState().setFocus({ kind: 'organe', machineId: machine.id, organeId: organe.id });
            setOuvert(true);
          }}
          aria-label={`Voir ${organe.nom} dans la vue 3D`}
          title="Voir en 3D : placer la caméra sur cet organe"
        >
          <Crosshair aria-hidden />
        </button>
      </div>

      {ouvert && (
        <div id={corps} className="og-carte-corps">
          <ul className="og-mesures">
            {points.map((p) => (
              <MesureBande key={p.id} point={p} />
            ))}
            {!points.length && <li className="og-sans-seuil">Aucun point de mesure sur cet organe.</li>}
          </ul>

          {chiffres.length > 0 && <ChiffresSecondaires items={chiffres} label={`À savoir sur ${organe.nom}`} className="og-organe-chiffres" />}

          <Details titre="Voir les chiffres et régler les seuils" apercu={mesures.length ? `${mesures.length} mesure${mesures.length > 1 ? 's' : ''}` : undefined}>
            {mesures.map((p) => (
              <ChiffresPoint key={p.id} machine={machine} point={p} />
            ))}
            <p className="og-texte faint">Un seuil modifié s’applique tout de suite à la surveillance.</p>
            <p className="og-texte faint mono og-repere-3d">
              Repère 3D : {organe.noeud3d ?? 'aucun'}
              {organe.position ? ` (${organe.position.map((x) => x.toFixed(2)).join(' ; ')} m)` : ''}
            </p>
          </Details>
        </div>
      )}
    </li>
  );
}
