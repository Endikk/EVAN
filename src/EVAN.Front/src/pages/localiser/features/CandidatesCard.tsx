/**
 * Les bâtiments que désigne l'adresse cherchée, lettrés comme sur la carte (A, B, C…). L'utilisateur confirme le sien ;
 * une fois un bâtiment retenu, la liste se replie et la mesure passe au premier plan. La note de la recherche et les
 * conseils (plusieurs bâtiments, aucun ne convient) sont dans le « ? » du titre.
 */
import { useEffect, useState } from 'react';
import { Check, X, ZoomIn } from 'lucide-react';
import type { Localisation } from '@/geo/candidates';
import { formatArea, formatNumber } from '@/geo/geodesy';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { TitreCarte } from '@/ui/explain';
import { chooseCandidate, clearLocalisation, fitLocalisation } from '@/widgets/carte/localisation';
import { useMapUi } from '@/widgets/carte/mapState';

export function CandidatesCard({ loc }: { loc: Localisation }) {
  const batiments = useProject((s) => s.batiments);
  const hover = useMapUi((s) => s.hoverCandidate);
  const retenus = new Set(batiments.map((b) => b.sourceRef));
  const nRetenus = loc.candidates.filter((c) => retenus.has(c.sourceRef)).length;
  const autres = loc.candidates.length - nRetenus;
  const [open, setOpen] = useState(nRetenus === 0);
  useEffect(() => setOpen(nRetenus === 0), [nRetenus, loc]);
  const close = (
    <button type="button" className="btn sm ghost icon" onClick={clearLocalisation} aria-label="Masquer les bâtiments proposés" title="Masquer les bâtiments proposés">
      <X />
    </button>
  );
  if (!open) {
    return (
      <div className="card cand-card compact">
        <div className="row between" style={{ gap: 8 }}>
          <span className="row truncate loc-cand-resume" style={{ gap: 8 }}>
            <span className="cand-letter sm ok" aria-hidden>
              <Check />
            </span>
            <span className="truncate">
              <b>{nRetenus > 1 ? `${nRetenus} bâtiments retenus` : 'Bâtiment retenu'}</b>
              {autres > 0 && <span className="muted"> · {autres > 1 ? `${autres} autres proposés` : '1 autre proposé'}</span>}
            </span>
          </span>
          <span className="row" style={{ gap: 4 }}>
            <button type="button" className="btn sm ghost" onClick={() => setOpen(true)}>
              Revoir
            </button>
            {close}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="card cand-card">
      <TitreCarte
        titre="Lequel est votre bâtiment ?"
        aide={`${loc.note && loc.candidates.length ? `${loc.note} ` : ''}L’usine a plusieurs bâtiments ? Choisissez-les l’un après l’autre. Aucun ne convient ? Cliquez sur la carte ou dessinez le contour.`}
        actions={close}
      />
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="chip truncate">{loc.libelle}</span>
        {loc.candidates.length > 0 && (
          <button type="button" className="btn sm ghost" onClick={() => fitLocalisation(loc)}>
            <ZoomIn /> Les voir sur la carte
          </button>
        )}
      </div>
      {loc.candidates.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {/* Sans proposition, la note de la recherche (une commune entière…) dit quoi faire : elle reste visible. */}
          {loc.note ?? 'Aucun bâtiment de plus de 250 m² à cette adresse. Cliquez sur le toit sur la photo, ou dessinez son contour.'}
        </p>
      ) : (
        <div className="cand-list">
          {loc.candidates.map((c) => {
            const r = retenus.has(c.sourceRef);
            return (
              <button
                key={c.sourceRef}
                type="button"
                className="cand-item"
                aria-pressed={r}
                data-hover={hover === c.sourceRef || undefined}
                onMouseEnter={() => useMapUi.getState().set({ hoverCandidate: c.sourceRef })}
                onMouseLeave={() => useMapUi.getState().set({ hoverCandidate: undefined })}
                onClick={() => {
                  const b = useProject.getState().batiments.find((x) => x.sourceRef === c.sourceRef);
                  if (b) useUi.getState().selectBatiment(b.id);
                  else void chooseCandidate(c);
                }}
              >
                <span className="cand-letter">{r ? <Check aria-label="Retenu" /> : c.lettre}</span>
                <span className="grow truncate">
                  <span className="t num">
                    {formatArea(c.surface)}
                    {c.hauteur ? <span className="faint"> · {formatNumber(c.hauteur, 1)} m de haut</span> : null}
                  </span>
                  <span className="s truncate">
                    {c.usage ?? 'Usage non renseigné'} · {c.raison}
                  </span>
                </span>
                <span className="cand-action">{r ? 'Retenu' : 'Choisir'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
