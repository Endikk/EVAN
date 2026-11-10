/**
 * La machine sélectionnée sur le plan : ce qui vient de se passer (posée, numérotée) et ce qu'on peut encore régler
 * (numéro, nom, sens). Ce que ça change pour la suite et les gestes à la souris sont dans les « ? ». Juste après une
 * pose, la carte s'allume une fois et vient se placer sous les yeux.
 */
import { useEffect, useRef } from 'react';
import { RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { batimentContenant, useProject } from '@/store/project';
import { useUi, isReducedMotion } from '@/store/ui';
import { MACHINE_TYPES } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import { borneNiveaux, niveauDe, nomNiveau } from '@/domain/niveaux';
import { Select } from '@/ui/Select';
import { TonGlyph } from '@/ui/explain';
import { InfoTip } from '@/ui/InfoTip';
import { SilhouetteMachine } from './Bibliotheque';

const metres = (v: number) => v.toFixed(1).replace('.', ',');

function tourner(m: Machine, delta: number) {
  useProject.getState().updateMachine(m.id, { rotationDeg: (((m.rotationDeg + delta) % 360) + 360) % 360 });
}

export function MachinePosee({ machine, nouvelle, numeroEnDouble }: { machine: Machine; nouvelle: boolean; numeroEnDouble: boolean }) {
  const zone = useProject((s) => s.zones.find((z) => z.id === machine.zoneId));
  // Niveaux du bâtiment où la machine est posée : à partir de deux, elle peut changer de niveau.
  const niveaux = useProject((s) =>
    borneNiveaux((batimentContenant(s.site, s.batiments, machine.position) ?? s.batiments.find((b) => b.id === machine.batimentId))?.niveaux ?? 1),
  );
  const niveau = niveauDe(machine);
  const carte = useRef<HTMLElement>(null);
  const def = MACHINE_TYPES[machine.type];
  const organes = def?.organes.length;

  // Juste posée : la carte vient sous les yeux, même si le panneau avait défilé jusqu'à la bibliothèque.
  useEffect(() => {
    if (nouvelle) carte.current?.scrollIntoView({ block: 'nearest', behavior: isReducedMotion() ? 'auto' : 'smooth' });
  }, [nouvelle]);

  const maj = (patch: Partial<Machine>) => useProject.getState().updateMachine(machine.id, patch);
  const probleme = !machine.numero.trim()
    ? 'Sans numéro, la machine ne se retrouve ni sur le plan ni dans les alarmes.'
    : numeroEnDouble
      ? `Une autre machine porte déjà le numéro ${machine.numero}.`
      : undefined;

  return (
    <section ref={carte} className={`card mc-posee ${nouvelle ? 'vient-d-arriver' : ''}`} aria-labelledby="mc-posee-titre" data-guide="machines-fiche">
      <header className="mc-posee-tete">
        <span className="mc-posee-sens" aria-hidden>
          <span style={{ transform: `rotate(${machine.rotationDeg}deg)` }}>
            <SilhouetteMachine type={def ? machine.type : 'custom'} largeur={52} />
          </span>
        </span>
        <div className="grow">
          <p className="mc-posee-sur">{nouvelle ? 'Vient d’être posée' : 'Machine sélectionnée'}</p>
          <h3 id="mc-posee-titre">
            <span className="mono">{machine.numero || 'Sans numéro'}</span> · {machine.nom || def?.libelle || 'Machine'}
            <InfoTip label="Comprendre : numéro et nom">
              <p>
                Le numéro est le repère court : on retrouve la machine sous ce numéro en supervision et dans les alarmes. Le nom est celui qu’on emploie à
                l’atelier.
              </p>
              <p>
                {organes
                  ? `Ses ${organes} organes, les parties qu’EVAN surveille, se vérifient à l’étape suivante.`
                  : 'Ses organes, les parties qu’EVAN surveille, se décrivent à l’étape suivante.'}
              </p>
            </InfoTip>
          </h3>
          <p className="mc-posee-zone">
            {zone ? `Zone ${zone.nom}` : 'Hors des zones dessinées'}
            {niveaux > 1 || niveau > 0 ? ` · ${nomNiveau(niveau)}` : null}
            {organes ? <span className="num"> · {organes} organes</span> : null}
          </p>
        </div>
      </header>

      <div className="mc-posee-champs">
        <label className="field mc-champ-numero">
          <span>Numéro</span>
          <input
            className="input mono"
            value={machine.numero}
            onChange={(e) => maj({ numero: e.target.value })}
            aria-invalid={!!probleme}
            aria-describedby={probleme ? 'mc-aide-numero' : undefined}
          />
        </label>
        <label className="field grow">
          <span>Nom</span>
          <input className="input" value={machine.nom} onChange={(e) => maj({ nom: e.target.value })} placeholder={def?.libelle} />
        </label>
      </div>
      {probleme && (
        <p id="mc-aide-numero" className="mc-aide mc-aide-alerte">
          <TonGlyph ton="warn" />
          {probleme}
        </p>
      )}
      {niveaux > 1 && (
        <label className="field mc-champ-niveau">
          <span>Niveau</span>
          <Select
            value={String(niveau)}
            onChange={(v) => {
              // La machine garde sa place sur le plan et prend la zone de son nouveau niveau ; la scène la suit.
              maj({ niveau: Number(v) });
              useUi.getState().setNiveau(Number(v));
            }}
            options={Array.from({ length: Math.max(niveaux, niveau + 1) }, (_, n) => ({ value: String(n), label: nomNiveau(n) }))}
          />
        </label>
      )}

      <div className="mc-posee-sens-ligne">
        <span className="mc-sens-texte">
          Sens <span className="num">{machine.rotationDeg}°</span>
          <InfoTip label="Déplacer et tourner sur le plan">
            <p>
              Glissez la machine sur le plan pour la déplacer. Une poignée à un coin la fait pivoter par pas de 15°, au degré près avec{' '}
              <span className="kbd">Alt</span>. Au clavier : <span className="kbd">R</span> pour un quart de tour, <span className="kbd">Suppr</span> pour la
              retirer.
            </p>
            <p className="num">
              Position depuis l’origine du plan : x {metres(machine.position[0])} m, z {metres(machine.position[1])} m.
            </p>
          </InfoTip>
        </span>
        <div className="row wrap mc-sens-boutons">
          <button type="button" className="btn sm" onClick={() => tourner(machine, -90)} aria-label="Tourner d’un quart de tour à gauche">
            <RotateCcw /> 90°
          </button>
          <button type="button" className="btn sm" onClick={() => tourner(machine, -15)} aria-label="Tourner de 15 degrés à gauche">
            −15°
          </button>
          <button type="button" className="btn sm" onClick={() => tourner(machine, 15)} aria-label="Tourner de 15 degrés à droite">
            +15°
          </button>
          <button type="button" className="btn sm" onClick={() => tourner(machine, 90)} aria-label="Tourner d’un quart de tour à droite">
            <RotateCw /> 90°
          </button>
        </div>
      </div>

      <button
        type="button"
        className="btn sm ghost mc-retirer"
        onClick={() => {
          useProject.getState().removeMachine(machine.id);
          useUi.getState().selectMachine(undefined);
        }}
      >
        <Trash2 /> Retirer du plan
      </button>
    </section>
  );
}
