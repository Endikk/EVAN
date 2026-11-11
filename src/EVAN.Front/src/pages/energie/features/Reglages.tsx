/**
 * Réglages du calcul : le prix du kWh et le facteur d'émission, propres à l'usine et retenus d'une visite à l'autre
 * (lib/reglages.ts). Ils ne changent pas l'énergie mesurée, seulement sa traduction en euros et en CO₂. Le résultat se
 * met à jour pendant la saisie, pour voir l'effet tout de suite ; une saisie refusée dit pourquoi, et l'écran garde en
 * attendant le dernier réglage valable.
 */
import { useId, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { ENERGIE_DEFAUT } from '@/domain/catalog';
import { InfoTip } from '@/ui/InfoTip';
import { co2, euros, prixKwh } from '../lib/format';
import { lireFacteur, lirePrix, REGLAGES_DEFAUT, type SaisieReglages } from '../lib/reglages';

interface Props {
  saisie: SaisieReglages;
  onChange: (s: SaisieReglages) => void;
  /** Ce que l'écran utilise vraiment : la saisie si elle est bonne, sinon le dernier réglage valable. */
  prixUtilise: number;
  facteurUtiliseG: number;
  /** Coût et émissions de la période avec les réglages valides. */
  cout: number;
  co2Kg: number;
  libellePeriode: string;
}

export function Reglages({ saisie, onChange, prixUtilise, facteurUtiliseG, cout, co2Kg, libellePeriode }: Props) {
  const id = useId();
  const champPrix = useRef<HTMLInputElement>(null);
  const prixLu = lirePrix(saisie.prix);
  const facteurLu = lireFacteur(saisie.facteurG);
  const prixFaux = prixLu.erreur !== undefined;
  const facteurFaux = facteurLu.erreur !== undefined;
  const modifie = saisie.prix !== REGLAGES_DEFAUT.prix || saisie.facteurG !== REGLAGES_DEFAUT.facteurG;
  // Le bouton disparaît une fois les valeurs revenues : le focus passe au premier champ plutôt que de tomber sur la page.
  const revenir = () => {
    onChange(REGLAGES_DEFAUT);
    champPrix.current?.focus();
  };

  return (
    <div className="en-reglages">
      <div className="en-champs">
        <div className="field">
          {/* Le libellé visible ouvre l'explication (souligné en pointillé) ; le champ garde son vrai label, lu par les
              lecteurs d'écran. */}
          <div className="en-champ-tete">
            <label htmlFor={`${id}-prix`} className="sr-only">
              Prix du kWh
            </label>
            <InfoTip texte="Prix du kWh" label="Comprendre : prix du kWh">
              <p>
                Il change tous les montants en euros de l’écran, gains par an compris. Les kWh ne bougent pas : ils viennent des machines. Il est retenu pour cette usine,
                d’une visite à l’autre.
              </p>
            </InfoTip>
          </div>
          <div className="en-saisie">
            <input
              ref={champPrix}
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
              {prixLu.erreur} En attendant, l’écran garde {prixKwh(prixUtilise)}.
            </small>
          ) : (
            <small id={`${id}-prix-aide`}>{ENERGIE_DEFAUT.sourcePrix}</small>
          )}
        </div>
        <div className="field">
          <div className="en-champ-tete">
            <label htmlFor={`${id}-co2`} className="sr-only">
              Facteur d’émission
            </label>
            <InfoTip texte="Facteur d’émission" label="Comprendre : facteur d’émission">
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
              {facteurLu.erreur} En attendant, l’écran garde {new Intl.NumberFormat('fr-FR').format(facteurUtiliseG)} g.
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
          <button type="button" className="btn sm ghost" onClick={revenir}>
            <RotateCcw aria-hidden /> Revenir aux valeurs de départ
          </button>
        )}
      </div>
    </div>
  );
}
