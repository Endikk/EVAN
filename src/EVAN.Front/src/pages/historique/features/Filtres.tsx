/**
 * Ce que regarde l'écran : la période et la machine. Deux choix, nommés en clair, qui pilotent tout l'écran ;
 * les filtres propres au journal (gravité, type, recherche) vivent dans le journal.
 */
import type { CSSProperties } from 'react';
import { CalendarDays, Factory, X } from 'lucide-react';
import type { Machine } from '@/domain/types';
import { Select } from '@/ui/Select';
import type { Periode } from '../lib/calculs';

interface Props {
  periode: Periode;
  onPeriode(p: Periode): void;
  machineId: string;
  onMachine(id: string): void;
  machines: Machine[];
  rang: number;
}

export function Filtres({ periode, onPeriode, machineId, onMachine, machines, rang }: Props) {
  const choisie = machines.find((m) => m.id === machineId);
  return (
    <div className="entree" style={{ '--i': rang } as CSSProperties}>
      <div className="hist-filtres" role="group" aria-label="Ce que montre l’écran" data-guide="filtres">
        <div className="hf-groupe">
          <span className="hf-label" id="hf-periode">
            <CalendarDays aria-hidden /> Période
          </span>
          <div className="seg" role="group" aria-labelledby="hf-periode">
            <button type="button" aria-pressed={periode === '24h'} onClick={() => onPeriode('24h')}>
              24 heures
            </button>
            <button type="button" aria-pressed={periode === '7j'} onClick={() => onPeriode('7j')}>
              7 jours
            </button>
          </div>
        </div>
        <div className="hf-groupe hf-machine">
          <label className="hf-label" htmlFor="hf-machine">
            <Factory aria-hidden /> Machine
          </label>
          <Select
            id="hf-machine"
            value={machineId}
            onChange={onMachine}
            options={[{ value: '', label: 'Toutes les machines' }, ...machines.map((m) => ({ value: m.id, label: `${m.numero} · ${m.nom}` }))]}
          />
          {choisie && (
            <button type="button" className="btn sm ghost hf-retirer" onClick={() => onMachine('')}>
              <X aria-hidden /> Revoir toutes les machines
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
