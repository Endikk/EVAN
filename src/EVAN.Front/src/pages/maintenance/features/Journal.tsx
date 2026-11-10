/**
 * Journal des interventions, jour par jour : une ligne par intervention (heure, type, machine, quoi, durée). Le
 * détail (organe, intervenant, compte rendu) se déplie au clic sur la ligne : le journal est long, on n'en lit le
 * détail que ligne par ligne. Les réparations après panne y entrent seules ; les entretiens et observations, quand
 * l'atelier les consigne.
 */
import { useId, useMemo, useState } from 'react';
import { ChevronDown, ClipboardCheck, Eye, History as HistoryIcon, Wrench, type LucideIcon } from 'lucide-react';
import type { Intervention, TypeIntervention } from '@/analytics/maintenance';
import { machineModel } from '@/domain/catalog';
import type { Alarme, Machine } from '@/domain/types';
import { TitreCarte } from '@/ui/explain';
import { fmtDuration, fmtHM } from '@/ui/format';
import { openReplay } from '@/widgets/shell/navigation';
import { fmtDateLongue } from '../lib/carnet';

/** Le type se lit au mot et à l'icône : une réparation passée n'est plus une alarme, elle reste calme. */
const TYPE: Record<TypeIntervention, { mot: string; filtre: string; icone: LucideIcon }> = {
  curative: { mot: 'Réparation', filtre: 'Réparations', icone: Wrench },
  preventive: { mot: 'Entretien', filtre: 'Entretiens', icone: ClipboardCheck },
  observation: { mot: 'Observation', filtre: 'Observations', icone: Eye },
};

const PAS = 20;
const PREMIERS = 12;
const jourFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function titreJour(t: number, now: number): string {
  const jour = new Date(t).setHours(0, 0, 0, 0);
  const auj = new Date(now).setHours(0, 0, 0, 0);
  if (jour === auj) return 'Aujourd’hui';
  if (auj - jour <= 86_400_000 + 3_600_000 && auj > jour) return 'Hier';
  const s = jourFmt.format(t);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Intitulé d'une réparation sans son code d'alarme, qui passe en petit à côté. */
function quoi(i: Intervention, a?: Alarme): string {
  if (a) return a.message;
  if (i.code && i.titre.startsWith(`${i.code} · `)) return i.titre.slice(i.code.length + 3);
  return i.titre;
}

function Ligne({ i, machine, alarme }: { i: Intervention; machine?: Machine; alarme?: Alarme }) {
  const [ouvert, setOuvert] = useState(false);
  const id = useId();
  const organe = machine && i.organeId ? machineModel(machine).organes.find((o) => o.id === i.organeId) : undefined;
  const duree = i.fin ? fmtDuration(i.fin - i.debut) : undefined;
  const detail = [
    organe?.nom,
    duree && i.type === 'curative' ? `machine arrêtée ${duree}` : null,
    i.auteur ? `par ${i.auteur}` : null,
    i.source === 'saisie' ? 'consignée à l’écran' : i.source === 'direct' ? 'pendant cette session' : null,
  ].filter(Boolean);
  const aDetail = detail.length > 0 || !!i.compteRendu;
  const T = TYPE[i.type];
  const tete = (
    <>
      <time className="num">{fmtHM(i.debut)}</time>
      <span className="chip mt-jl-type" title={T.mot}>
        <T.icone aria-hidden />
        <span className="mt-jl-type-mot">{T.mot}</span>
      </span>
      <span className="mt-jl-quoi">
        <b>{machine?.numero}</b> {quoi(i, alarme)}
        {i.code && <span className="mono mt-jl-code">{i.code}</span>}
      </span>
      {duree && <span className="mt-jl-duree num">{i.type === 'curative' ? `arrêt ${duree}` : duree}</span>}
    </>
  );
  return (
    <li className={`mt-jl type-${i.type} ${ouvert ? 'ouvert' : ''}`}>
      {aDetail ? (
        <button type="button" className="mt-jl-tete" aria-expanded={ouvert} aria-controls={id} onClick={() => setOuvert((v) => !v)}>
          {tete}
          <ChevronDown className="mt-jl-chevron" aria-hidden />
        </button>
      ) : (
        <div className="mt-jl-tete">{tete}</div>
      )}
      {alarme && (
        <button type="button" className="btn sm mt-jl-revoir" onClick={() => openReplay(alarme)} aria-label={`Revoir la panne de ${machine?.numero ?? 'la machine'} : ${alarme.message}`}>
          <HistoryIcon /> <span>Revoir</span>
        </button>
      )}
      {aDetail && (
        <div className="mt-jl-detail" id={id} hidden={!ouvert}>
          {detail.length > 0 && <p>{detail.join(', ')}.</p>}
          {i.compteRendu && <p className="mt-jl-cr">Ce qui a été fait : {i.compteRendu}</p>}
        </div>
      )}
    </li>
  );
}

interface Props {
  entries: Intervention[];
  byId: Map<string, Machine>;
  alarmes: Alarme[];
  depuis: number;
  now: number;
}

export function Journal({ entries, byId, alarmes, depuis, now }: Props) {
  const [filtre, setFiltre] = useState<TypeIntervention | ''>('');
  const [n, setN] = useState(PREMIERS);
  const alarmeParId = useMemo(() => new Map(alarmes.map((a) => [a.id, a])), [alarmes]);
  const compte = useMemo(() => {
    const c: Record<TypeIntervention, number> = { curative: 0, preventive: 0, observation: 0 };
    for (const i of entries) c[i.type] += 1;
    return c;
  }, [entries]);
  const visibles = useMemo(() => (filtre ? entries.filter((i) => i.type === filtre) : entries), [entries, filtre]);
  const jours = useMemo(() => {
    const out: { titre: string; liste: Intervention[] }[] = [];
    for (const i of visibles.slice(0, n)) {
      const titre = titreJour(i.debut, now);
      const dernier = out[out.length - 1];
      if (dernier?.titre === titre) dernier.liste.push(i);
      else out.push({ titre, liste: [i] });
    }
    return out;
  }, [visibles, n, now]);

  const filtres = (
    <div className="seg mt-jl-filtres" role="group" aria-label="Type d’intervention">
      {(['', 'curative', 'preventive', 'observation'] as const).map((t) => (
        <button key={t || 'tout'} type="button" aria-pressed={filtre === t} onClick={() => (setFiltre(t), setN(PREMIERS))}>
          {t ? TYPE[t].filtre : 'Tout'}
          <span className="mt-seg-compte num">{t ? compte[t] : entries.length}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <TitreCarte
        titre="Journal des interventions"
        aide={`Tout ce qui a été fait sur les machines depuis le ${fmtDateLongue(depuis)}. Les réparations après panne y entrent seules ; les entretiens et observations, quand on les consigne.`}
        actions={filtres}
      />
      {jours.length ? (
        jours.map((j) => (
          <section key={j.titre} className="mt-jour">
            <h4>{j.titre}</h4>
            <ol className="mt-jl-liste">
              {j.liste.map((i) => (
                <Ligne key={i.id} i={i} machine={byId.get(i.machineId)} alarme={i.alarmeId ? alarmeParId.get(i.alarmeId) : undefined} />
              ))}
            </ol>
          </section>
        ))
      ) : (
        <div className="empty">
          <b>Rien de ce type dans le journal</b>
          <span className="muted">Choisissez « Tout » pour revoir toutes les interventions.</span>
        </div>
      )}
      {visibles.length > n && (
        <button type="button" className="btn sm journal-more" onClick={() => setN((x) => x + PAS)}>
          Afficher {Math.min(PAS, visibles.length - n)} de plus ({visibles.length - n} restantes)
        </button>
      )}
    </>
  );
}
