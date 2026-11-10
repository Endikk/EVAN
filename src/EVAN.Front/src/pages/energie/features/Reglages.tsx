/**
 * Réglages du calcul : le prix du kWh et le facteur d'émission. Ils ne changent pas l'énergie mesurée, seulement sa
 * traduction en euros et en CO₂. Le résultat se met à jour pendant la saisie, pour voir l'effet tout de suite.
 */
import { useId } from 'react';
import { RotateCcw } from 'lucide-react';
import { ENERGIE_DEFAUT } from '@/domain/catalog';
import { InfoTip } from '@/ui/InfoTip';
import { co2, euros } from '../lib/format';

export interface SaisieReglages {
  prix: string;
  facteurG: string;
}

export const REGLAGES_DEFAUT: SaisieReglages = {
  prix: String(ENERGIE_DEFAUT.prixKwh).replace('.', ','),
  facteurG: String(Math.round(ENERGIE_DEFAUT.facteurCo2 * 1000)),
};

/** Nombre saisi à la française (« 0,15 », « 1 200 ») ; undefined s'il n'est pas lisible ou négatif. */
export function lireNombre(s: string): number | undefined {
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (!t) return undefined;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? v : undefined;
}

interface Props {
  saisie: SaisieReglages;
  onChange: (s: SaisieReglages) => void;
  /** Coût et émissions de la période avec les réglages valides. */
  cout: number;
  co2Kg: number;
  libellePeriode: string;
}

export function Reglages({ saisie, onChange, cout, co2Kg, libellePeriode }: Props) {
  const id = useId();
  const prixFaux = lireNombre(saisie.prix) === undefined;
  const facteurFaux = lireNombre(saisie.facteurG) === undefined;
  const modifie = saisie.prix !== REGLAGES_DEFAUT.prix || saisie.facteurG !== REGLAGES_DEFAUT.facteurG;

  return (
    <div className="en-reglages">
      <div className="en-champs">
        <div className="field">
          <div className="en-champ-tete">
            <label htmlFor={`${id}-prix`}>Prix du kWh</label>
            <InfoTip label="Comprendre : prix du kWh">
              <p>Il change tous les montants en euros de l’écran, gains par an compris. Les kWh ne bougent pas : ils viennent des machines.</p>
            </InfoTip>
          </div>
          <div className="en-saisie">
            <input
              id={`${id}-prix`}
              className="input num"
              inputMode="decimal"
              value={saisie.prix}
              onChange={(e) => onChange({ ...saisie, prix: e.target.value })}
              aria-invalid={prixFaux}
              aria-describedby={`${id}-prix-aide`}
            />
            <span>€ par kWh</span>
          </div>
          {prixFaux ? (
            <small id={`${id}-prix-aide`} className="en-erreur" role="alert">
              Entrez un nombre positif, par exemple 0,15. En attendant, l’écran garde {String(ENERGIE_DEFAUT.prixKwh).replace('.', ',')} €.
            </small>
          ) : (
            <small id={`${id}-prix-aide`}>{ENERGIE_DEFAUT.sourcePrix}</small>
          )}
        </div>
        <div className="field">
          <div className="en-champ-tete">
            <label htmlFor={`${id}-co2`}>Facteur d’émission</label>
            <InfoTip label="Comprendre : facteur d’émission">
              <p>Il ne change que les émissions de CO₂. Les kWh ne bougent pas : ils viennent des machines.</p>
            </InfoTip>
          </div>
          <div className="en-saisie">
            <input
              id={`${id}-co2`}
              className="input num"
              inputMode="decimal"
              value={saisie.facteurG}
              onChange={(e) => onChange({ ...saisie, facteurG: e.target.value })}
              aria-invalid={facteurFaux}
              aria-describedby={`${id}-co2-aide`}
            />
            <span>g de CO₂e par kWh</span>
          </div>
          {facteurFaux ? (
            <small id={`${id}-co2-aide`} className="en-erreur" role="alert">
              Entrez un nombre positif, par exemple 40. En attendant, l’écran garde {REGLAGES_DEFAUT.facteurG} g.
            </small>
          ) : (
            <small id={`${id}-co2-aide`}>{ENERGIE_DEFAUT.sourceCo2}</small>
          )}
        </div>
      </div>
      <div className="en-reglages-pied">
        <p className="en-reglages-resultat" aria-live="polite">
          Avec ces réglages, {libellePeriode.charAt(0).toLowerCase() + libellePeriode.slice(1)} : <b className="num">{euros(cout)}</b> et{' '}
          <b className="num">{co2(co2Kg)} de CO₂e</b>.
        </p>
        {modifie && (
          <button type="button" className="btn sm ghost" onClick={() => onChange(REGLAGES_DEFAUT)}>
            <RotateCcw aria-hidden /> Revenir aux valeurs de départ
          </button>
        )}
      </div>
    </div>
  );
}
