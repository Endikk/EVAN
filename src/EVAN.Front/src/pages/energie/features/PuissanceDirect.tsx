/**
 * Puissance tirée par l'usine en ce moment. Seul bloc de l'écran abonné au temps réel : les sélecteurs ne renvoient que
 * des nombres, si bien qu'il ne se redessine que lorsque la puissance ou le nombre de machines en production change.
 * Sans cela, chaque seconde redessinait tous les graphiques de l'écran.
 */
import type { Machine } from '@/domain/types';
import { puissanceUsine } from '@/analytics/energy';
import { useLive } from '@/store/live';
import { Repere } from '@/ui/explain';
import { fmtNombre } from '@/ui/format';
import { kw as fmtKw } from '../lib/format';

interface Props {
  machines: Machine[];
  /** Pic de la période, pour situer la puissance du moment. */
  pic?: number;
  libellePeriode: string;
}

export function PuissanceDirect({ machines, pic, libellePeriode }: Props) {
  const kw = useLive((s) => puissanceUsine(machines, s.machines));
  const recu = useLive((s) => Object.keys(s.machines).length > 0);
  const enProduction = useLive((s) => machines.filter((m) => !s.machines[m.id]?.horsLigne && (s.machines[m.id]?.etat === 'marche' || s.machines[m.id]?.etat === 'attention')).length);

  if (!recu) {
    return (
      <Repere
        titre="Puissance tirée en ce moment"
        className="rp-compact"
        terme="puissance"
        valeur="…"
        unite="kW"
        note="En attente des premières mesures des machines."
        guide="puissance"
      />
    );
  }
  const machinesTexte = `${enProduction} machine${enProduction > 1 ? 's' : ''} sur ${machines.length} en production`;
  return (
    <Repere
      titre="Puissance tirée en ce moment"
      className="rp-compact"
      terme="puissance"
      valeur={kw}
      format={(v) => fmtNombre(v)}
      unite="kW"
      mot="En direct"
      jauge={pic ? kw / pic : undefined}
      note={pic ? `${machinesTexte}. La barre compare au pic (${fmtKw(pic)}, ${libellePeriode.toLowerCase()}).` : `${machinesTexte}.`}
      guide="puissance"
    />
  );
}
