/**
 * Journal des alarmes, de la plus récente à la plus ancienne, rangé par jour. Chaque ligne se lit d'un coup d'œil :
 * l'heure et la forme de la gravité, ce qui s'est passé, où, et la durée. Seul ce qui n'est pas réglé porte un mot
 * en couleur (« Pas prise en charge », « Prise en charge ») ; une alarme résolue reste grise (ISA-101). Les phrases
 * complètes sont dans le volet ouvert au clic, et dites au lecteur d'écran. Ses filtres (gravité, type, recherche) ne touchent que le journal et son export ; le reste
 * de l'écran suit la période et la machine.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronRight, Download, Search } from 'lucide-react';
import type { Alarme, Machine } from '@/domain/types';
import type { MachineModel } from '@/domain/catalog';
import { fmtHM } from '@/ui/format';
import { Select, type OptionChoix } from '@/ui/Select';
import { StatusIcon } from '@/ui/status';
import { focusAlarm } from '@/widgets/shell/navigation';
import { journalCsv, telecharger } from '../lib/csv';
import { ETAT_COURT, TYPE_ALARME } from '../lib/libelles';
import { dureeCourte, periodeEnFin } from '../lib/phrases';
import type { Periode } from '../lib/calculs';
import { AlarmeVolet, STATUT_ALARME, dureeAlarme } from './AlarmeVolet';
import { Carte } from './Carte';

const PREMIERES = 15;
const PAQUET = 25;

const GRAVITES = [
  { value: 'critique', label: 'Critiques (la machine s’arrête)' },
  { value: 'attention', label: 'Attention' },
];
const TYPES = Object.entries(TYPE_ALARME).map(([value, label]) => ({ value, label }));

const enAlarmes = (n: number) => (n === 0 ? 'Aucune alarme' : n === 1 ? '1 alarme' : `${n} alarmes`);

/**
 * Les choix d'un filtre, chacun avec le nombre d'alarmes qu'il montrerait. Un choix qui ne montrerait rien reste dans
 * la liste (on voit qu'il existe) mais ne se choisit pas : sinon on tombe sur un journal vide sans comprendre pourquoi.
 */
function avecNombres(choix: { value: string; label: string }[], tous: string, compter: (v: string) => number, courant: string): OptionChoix[] {
  return [
    { value: '', label: tous },
    ...choix.map((c) => {
      const n = compter(c.value);
      return { ...c, detail: enAlarmes(n), disabled: n === 0 && c.value !== courant };
    }),
  ];
}

const jourLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const enJour = (t: number) => {
  const s = jourLong.format(t);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

interface Props {
  alarmes: Alarme[];
  machines: Machine[];
  modeles: ReadonlyMap<string, MachineModel>;
  periode: Periode;
  now: number;
  /** Ouvre la courbe de la mesure en cause (filtre l'écran sur la machine et la mesure). */
  onVoirCourbe(a: Alarme): void;
  rang: number;
}

export function Journal({ alarmes, machines, modeles, periode, now, onVoirCourbe, rang }: Props) {
  const [gravite, setGravite] = useState('');
  const [regle, setRegle] = useState('');
  const [q, setQ] = useState('');
  const [n, setN] = useState(PREMIERES);
  const [ouverteId, setOuverteId] = useState<string>();

  const organe = useCallback((a: Alarme) => modeles.get(a.machineId)?.organes.find((o) => o.id === a.organeId)?.nom, [modeles]);
  const liste = useMemo(() => {
    const mot = q.trim().toLowerCase();
    return alarmes.filter(
      (a) =>
        (!gravite || a.gravite === gravite) &&
        (!regle || a.regle === regle) &&
        (!mot || `${a.code} ${a.message} ${a.cause ?? ''} ${organe(a) ?? ''}`.toLowerCase().includes(mot)),
    );
  }, [alarmes, gravite, regle, q, organe]);

  // Les lignes visibles, rangées par jour (titre « Mardi 13 octobre »).
  const jours = useMemo(() => {
    const out: { cle: number; titre: string; alarmes: Alarme[] }[] = [];
    for (const a of liste.slice(0, n)) {
      const d = new Date(a.horodatage);
      d.setHours(0, 0, 0, 0);
      const dernier = out[out.length - 1];
      if (dernier?.cle === d.getTime()) dernier.alarmes.push(a);
      else out.push({ cle: d.getTime(), titre: enJour(d.getTime()), alarmes: [a] });
    }
    return out;
  }, [liste, n]);

  // Les nombres de chaque choix tiennent compte des autres filtres : « Attention » dit combien il en reste avec le type
  // et la recherche en cours.
  const optionsGravite = useMemo(
    () => avecNombres(GRAVITES, 'Toutes', (v) => alarmes.filter((a) => a.gravite === v && (!regle || a.regle === regle)).length, gravite),
    [alarmes, regle, gravite],
  );
  const optionsType = useMemo(
    () => avecNombres(TYPES, 'Tous', (v) => alarmes.filter((a) => a.regle === v && (!gravite || a.gravite === gravite)).length, regle),
    [alarmes, gravite, regle],
  );
  const filtre = !!(gravite || regle || q.trim());
  const recherche = useRef<HTMLInputElement>(null);
  // Le bouton disparaît avec les filtres : le focus passe à la recherche plutôt que de tomber sur la page.
  const effacer = () => {
    setGravite('');
    setRegle('');
    setQ('');
    recherche.current?.focus();
  };

  const nRep = useMemo(() => new Set(alarmes.filter((a) => a.regle === 'repetitif').map((a) => `${a.machineId}|${a.code}`)).size, [alarmes]);
  const ouverte = ouverteId ? alarmes.find((a) => a.id === ouverteId) : undefined;
  const fermer = useCallback(() => setOuverteId(undefined), []);
  const machineDe = (a: Alarme) => machines.find((m) => m.id === a.machineId);
  const aUneCourbe = (a: Alarme) => {
    const p = a.pointId ? modeles.get(a.machineId)?.points.find((x) => x.id === a.pointId) : undefined;
    return !!p && p.type !== 'alarme';
  };

  const lecon = alarmes.length
    ? `${alarmes.length} alarme${alarmes.length > 1 ? 's' : ''} ${periodeEnFin(periode)}${nRep ? `, dont ${nRep} défaut${nRep > 1 ? 's' : ''} qui revien${nRep > 1 ? 'nent' : 't'} souvent` : ''}.`
    : `Aucune alarme ${periodeEnFin(periode)}.`;

  const exporter = (
    <button type="button" className="btn sm" onClick={() => telecharger(`evan-alarmes-${periode}.csv`, journalCsv(liste, machines, modeles))} disabled={!liste.length}>
      <Download aria-hidden /> Exporter pour un tableur
    </button>
  );

  return (
    <Carte
      titre="Journal des alarmes"
      aide="Le carré marque une alarme critique (la machine s’arrête), le triangle une alarme d’attention ; une ligne sans mention est résolue. Un clic sur une alarme dit ce qui s’est passé et quoi vérifier."
      lecon={lecon}
      span={12}
      rang={rang}
      guide="journal"
      tour="journal-alarmes"
      className="hist-journal"
      actions={exporter}
    >
      <div className="hj-filtres" role="group" aria-label="Trier le journal">
        <label className="hj-champ">
          <span>Gravité</span>
          <Select taille="sm" className="hj-gravite" value={gravite} onChange={setGravite} options={optionsGravite} />
        </label>
        <label className="hj-champ">
          <span>Type</span>
          <Select taille="sm" className="hj-type" value={regle} onChange={setRegle} options={optionsType} />
        </label>
        <label className="hj-champ hj-cherche">
          <span>Chercher</span>
          <span className="hj-cherche-boite">
            <Search aria-hidden />
            <input ref={recherche} className="input" type="search" placeholder="Casse, UV, découpe, code…" value={q} onChange={(e) => setQ(e.target.value)} />
          </span>
        </label>
      </div>
      {/* Un journal filtré le dit : combien d'alarmes restent sur combien, et comment tout revoir. */}
      <p className="hj-compte" aria-live="polite">
        {filtre && (
          <>
            <span>
              <b className="num">{liste.length}</b> sur {enAlarmes(alarmes.length).toLowerCase()} {liste.length > 1 ? 'correspondent' : 'correspond'} à ces filtres.
            </span>
            <button type="button" className="btn sm ghost" onClick={effacer}>
              Effacer les filtres
            </button>
          </>
        )}
      </p>

      {liste.length === 0 ? (
        <p className="muted hj-vide">{alarmes.length ? 'Aucune alarme ne correspond à ces filtres.' : 'Rien à signaler sur la période.'}</p>
      ) : (
        jours.map((j) => (
          <section key={j.cle} className="hj-jour" aria-label={j.titre}>
            <h4>{j.titre}</h4>
            <ul>
              {j.alarmes.map((a) => {
                const m = machineDe(a);
                const critique = a.gravite === 'critique';
                const etat = ETAT_COURT[a.statut];
                const duree = a.finLe === undefined ? now - a.horodatage : a.finLe - a.horodatage;
                return (
                  <li key={a.id}>
                    <button type="button" className={`hj-ligne ${a.statut}`} onClick={() => setOuverteId(a.id)} aria-haspopup="dialog">
                      <span className="hj-heure num">
                        <StatusIcon etat={critique ? 'panne' : 'attention'} size={11} animate={a.statut === 'active'} />
                        {fmtHM(a.horodatage)}
                        <span className="sr-only">{critique ? ', alarme critique' : ', alarme d’attention'}</span>
                      </span>
                      <span className="hj-texte">
                        <span className="hj-quoi">
                          {a.message}
                          {a.regle === 'repetitif' && <span className="chip crit">Revient souvent{a.repetitions ? ` : ${a.repetitions} fois en 8\u00a0h` : ''}</span>}
                          {a.regle === 'derive' && <span className="chip warn">Dérive</span>}
                        </span>
                        <span className="hj-ou" title={m ? `${m.numero} ${m.nom}` : undefined}>
                          {m?.numero}
                          {organe(a) && ` · ${organe(a)}`}
                        </span>
                      </span>
                      <span className="hj-duree" title={dureeAlarme(a, now)}>
                        <span className="num" aria-hidden>
                          {dureeCourte(duree)}
                        </span>
                        <span className="sr-only">{dureeAlarme(a, now)}.</span>
                        {etat ? <span className={`hj-etat ${a.statut}`}>{etat}</span> : <span className="sr-only">{STATUT_ALARME[a.statut]}</span>}
                      </span>
                      <ChevronRight className="hj-fleche" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      {liste.length > n && (
        <button type="button" className="btn sm hj-plus" onClick={() => setN((x) => x + PAQUET)}>
          Afficher {Math.min(PAQUET, liste.length - n)} alarmes de plus ({liste.length - n} restantes)
        </button>
      )}

      {ouverte && (
        <AlarmeVolet
          alarme={ouverte}
          machine={machineDe(ouverte)}
          organe={organe(ouverte)}
          courbe={aUneCourbe(ouverte)}
          now={now}
          onFermer={fermer}
          onVoirCourbe={() => {
            setOuverteId(undefined);
            onVoirCourbe(ouverte);
          }}
          onVoirMachine={() => {
            setOuverteId(undefined);
            focusAlarm(ouverte.id);
          }}
        />
      )}
    </Carte>
  );
}
