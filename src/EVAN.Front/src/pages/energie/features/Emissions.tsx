/**
 * Émissions de CO₂ et électricité pour 1 000 étiquettes : une rangée toujours visible sous les repères. Ce que veut dire
 * chaque chiffre, et d'où il vient, est dans son « ? ».
 */
import type { BilanEnergie } from '@/analytics/energy';
import { ENERGIE_DEFAUT } from '@/domain/catalog';
import { ChiffresSecondaires } from '@/ui/explain';
import { fmtNombre } from '@/ui/format';

export function Emissions({ total, facteurCo2 }: { total: BilanEnergie; facteurCo2: number }) {
  const enTonnes = total.co2 >= 1000;
  const grammes = fmtNombre(facteurCo2 * 1000);
  const mixFrancais = Math.abs(facteurCo2 - ENERGIE_DEFAUT.facteurCo2) < 1e-9;
  return (
    <ChiffresSecondaires
      label="Émissions et électricité par étiquette"
      className="en-chiffres"
      items={[
        {
          label: 'Émissions',
          terme: 'co2',
          valeur: fmtNombre(enTonnes ? total.co2 / 1000 : total.co2, enTonnes ? 2 : 0),
          unite: enTonnes ? 't CO₂e' : 'kg CO₂e',
          aide: `À ${grammes} g de CO₂e par kWh${mixFrancais ? ', l’ordre de grandeur du mix électrique français' : ''}. Ce facteur se change dans les réglages du calcul.`,
        },
        {
          label: 'Par 1 000 étiquettes',
          terme: 'intensite',
          valeur: total.intensite !== undefined ? fmtNombre(total.intensite, 2) : 'pas de production',
          unite: total.intensite !== undefined ? 'kWh' : undefined,
          aide: 'Prépresse et façonnage compris. C’est l’indicateur que suit la norme ISO 50001.',
        },
      ]}
    />
  );
}
