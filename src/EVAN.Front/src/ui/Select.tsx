/**
 * Liste de choix d'EVAN, la même partout : un bouton qui montre le choix et une flèche bien détachée du bord, puis une
 * liste qui s'ouvre sous lui, avec le choix en cours coché. Bâtie sur Radix Select : clavier (flèches, Entrée, Échap,
 * frappe des premières lettres), lecteurs d'écran et toucher sont gérés.
 *
 * Une option de valeur vide (« Toutes les machines ») est acceptée : Radix l'interdit, elle est traduite en interne.
 */
import type { ReactNode } from 'react';
import * as RS from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import './select.css';

export interface OptionChoix {
  value: string;
  label: ReactNode;
  /** Précision en petit sous le libellé, dans la liste seulement. */
  detail?: ReactNode;
  disabled?: boolean;
  /** Texte pour la frappe au clavier quand `label` n'est pas une chaîne. */
  texte?: string;
}

export interface GroupeChoix {
  groupe: string;
  options: OptionChoix[];
}

const VIDE = '__evan_vide__';
const versRadix = (v: string) => (v === '' ? VIDE : v);
const depuisRadix = (v: string) => (v === VIDE ? '' : v);

interface Props {
  value: string;
  onChange(v: string): void;
  options: (OptionChoix | GroupeChoix)[];
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** `sm` pour une barre de filtres serrée. */
  taille?: 'sm' | 'md';
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

function Ligne({ o }: { o: OptionChoix }) {
  return (
    <RS.Item className="choix-option" value={versRadix(o.value)} disabled={o.disabled} textValue={o.texte ?? (typeof o.label === 'string' ? o.label : undefined)}>
      <span className="choix-option-texte">
        <RS.ItemText>{o.label}</RS.ItemText>
        {o.detail && <small>{o.detail}</small>}
      </span>
      <RS.ItemIndicator className="choix-coche">
        <Check aria-hidden />
      </RS.ItemIndicator>
    </RS.Item>
  );
}

export function Select({ value, onChange, options, id, placeholder, disabled, className = '', taille = 'md', ...aria }: Props) {
  return (
    <RS.Root value={versRadix(value)} onValueChange={(v) => onChange(depuisRadix(v))} disabled={disabled}>
      <RS.Trigger id={id} className={`choix ${taille === 'sm' ? 'sm' : ''} ${className}`} {...aria}>
        <span className="choix-valeur">
          <RS.Value placeholder={placeholder} />
        </span>
        <RS.Icon className="choix-fleche">
          <ChevronDown aria-hidden />
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content className="choix-liste" position="popper" sideOffset={6} collisionPadding={10}>
          <RS.ScrollUpButton className="choix-defile">
            <ChevronUp aria-hidden />
          </RS.ScrollUpButton>
          <RS.Viewport className="choix-vue">
            {options.map((o, i) =>
              'groupe' in o ? (
                <RS.Group key={`g-${o.groupe}`} className="choix-groupe">
                  {i > 0 && <RS.Separator className="choix-sep" />}
                  <RS.Label className="choix-groupe-titre">{o.groupe}</RS.Label>
                  {o.options.map((oo) => (
                    <Ligne key={oo.value} o={oo} />
                  ))}
                </RS.Group>
              ) : (
                <Ligne key={o.value} o={o} />
              ),
            )}
          </RS.Viewport>
          <RS.ScrollDownButton className="choix-defile">
            <ChevronDown aria-hidden />
          </RS.ScrollDownButton>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}
