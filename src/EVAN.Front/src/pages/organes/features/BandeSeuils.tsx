/**
 * Un point de mesure lu d'un coup d'œil : son nom, son état en un mot (forme + couleur + mot), et la bande de ses
 * seuils où un repère montre la valeur du moment. Les nombres exacts sont au survol (et lus par les lecteurs d'écran),
 * et dans « Voir les chiffres » de l'organe.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLive, type Niveau } from '@/store/live';
import type { PointDeMesure } from '@/domain/types';
import { TonGlyph, type Ton } from '@/ui/explain';
import { InfoTip } from '@/ui/InfoTip';
import { fmtValue } from '@/ui/format';
import { bandeSeuils, lectureSeuils, position } from '../lib/seuils';

const ETAT: Record<Niveau, { ton: Ton; mot: string }> = {
  ok: { ton: 'ok', mot: 'Normal' },
  attention: { ton: 'warn', mot: 'Attention' },
  alarme: { ton: 'crit', mot: 'Alarme' },
};

/** Libellé d'une mesure en minuscule dans une phrase, sauf sigle (« pH », « UV »). */
export function enPhrase(libelle: string): string {
  return /^[A-ZÉÈÀ][a-zéèêàâîôûç]/.test(libelle) ? libelle.charAt(0).toLowerCase() + libelle.slice(1) : libelle;
}

function EtatMesure({ point }: { point: PointDeMesure }) {
  const v = useLive((s) => s.values[point.id]);
  if (point.type === 'alarme') {
    const actif = !!v?.v;
    return (
      <span className={`og-etat ${actif ? 'ton-crit' : v ? 'ton-ok' : ''}`}>
        <TonGlyph ton={actif ? 'crit' : v ? 'ok' : 'neutre'} />
        {actif ? 'Alarme active' : v ? 'Rien à signaler' : 'Pas de valeur'}
      </span>
    );
  }
  const e = v ? ETAT[v.niveau] : undefined;
  return (
    <span className={`og-etat ${e ? `ton-${e.ton}` : ''}`} title={v ? `Maintenant : ${fmtValue(v.v, point.unite)}` : undefined}>
      <TonGlyph ton={e?.ton ?? 'neutre'} />
      {e?.mot ?? 'Pas de valeur'}
    </span>
  );
}

function Bande({ point }: { point: PointDeMesure }) {
  const v = useLive((s) => s.values[point.id]?.v);
  const bande = useMemo(() => bandeSeuils(point.seuils, point.nominal), [point.seuils, point.nominal]);
  const lecture = useMemo(() => lectureSeuils(point.seuils, point.unite), [point.seuils, point.unite]);

  // Seuils modifiés : la bande se redessine et s'allume une fois, pour qu'on voie ce qui a changé.
  const signature = JSON.stringify(point.seuils);
  const precedente = useRef(signature);
  const [majs, setMajs] = useState(0);
  useEffect(() => {
    if (precedente.current === signature) return;
    precedente.current = signature;
    setMajs((n) => n + 1);
  }, [signature]);

  if (!bande) return <p className="og-sans-seuil">Suivie pour information, sans limite.</p>;
  const maintenant = v === undefined ? '' : ` Maintenant : ${fmtValue(v, point.unite)}.`;
  return (
    <div key={majs} className={`og-bande ${majs ? 'maj' : ''}`} role="img" aria-label={`${lecture}${maintenant}`} title={`${lecture}${maintenant}`}>
      <span className="og-bande-fond">
        {bande.segments.map((s, i) => (
          <i key={i} className={`og-seg og-${s.plage}`} style={{ left: `${s.x0 * 100}%`, width: `${(s.x1 - s.x0) * 100}%` }} />
        ))}
      </span>
      {v !== undefined && (
        <span className="og-curseur-piste">
          <span className="og-curseur" style={{ transform: `translateX(${position(bande, v) * 100}%)` }} />
        </span>
      )}
    </div>
  );
}

export function MesureBande({ point }: { point: PointDeMesure }) {
  const alarme = point.type === 'alarme';
  return (
    <li className="og-mesure">
      <div className="og-mesure-tete">
        <span className="og-mesure-nom">
          {/* Un signal d'alarme n'a pas de bande : son nom ouvre ce qu'il est. */}
          {alarme ? (
            <InfoTip label={`Comprendre : ${point.libelle}`} texte={point.libelle}>
              <p>Signal envoyé par l’automate : actif ou non. Il n’a pas de bande, seulement un état.</p>
            </InfoTip>
          ) : (
            point.libelle
          )}
        </span>
        <EtatMesure point={point} />
      </div>
      {!alarme && <Bande point={point} />}
    </li>
  );
}

/** Comment lire une bande, une fois en tête de liste : les trois plages avec leur motif, et le repère du moment. */
export function LegendeBande() {
  return (
    <p className="og-legende">
      <span>
        <i className="og-pastille og-normal" aria-hidden /> Normal
      </span>
      <span>
        <i className="og-pastille og-attention" aria-hidden /> Attention
      </span>
      <span>
        <i className="og-pastille og-alarme" aria-hidden /> Alarme
      </span>
      <span>
        <i className="og-pastille-curseur" aria-hidden /> la valeur du moment
      </span>
    </p>
  );
}
