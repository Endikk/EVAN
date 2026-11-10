/**
 * Le conseil posé sur la carte tant que l'usine n'a pas de bâtiment : ce qu'il faut faire maintenant, en une phrase,
 * avec le geste montré en petit. Il suit l'état réel : taper l'adresse, attendre la recherche, choisir parmi les
 * bâtiments proposés, cliquer sur le toit, ou poser les coins d'un contour tracé à la main. Les variantes et les
 * astuces passent dans le « ? » de la phrase.
 */
import { useState } from 'react';
import { AlertTriangle, Check, Loader2, PenLine, X } from 'lucide-react';
import { useProject } from '@/store/project';
import { InfoTip } from '@/ui/InfoTip';
import { finishDrawing } from '@/widgets/carte/SiteMap';
import { useMapUi } from '@/widgets/carte/mapState';
import { phaseAccueil, type PhaseAccueil } from '../lib/verdicts';
import { GesteAdresse, GesteToit } from './gestes';

/** Durée d'une scène animée : la seconde démarre à mi-course de la première. */
const DECALAGE_SECONDE_SCENE_MS = 2600;

export function AccueilCarte({ saisie }: { saisie: boolean }) {
  const aSite = useProject((s) => !!s.site);
  const nbBatiments = useProject((s) => s.batiments.length);
  const dessin = useMapUi((s) => s.mode === 'draw');
  const cherche = useMapUi((s) => s.locating);
  const releve = useMapUi((s) => s.detecting);
  const nbCandidats = useMapUi((s) => s.localisation?.candidates.length ?? 0);
  const erreur = useMapUi((s) => s.detectError);
  const phase = phaseAccueil({ aSite, nbBatiments, dessin, cherche: !!cherche, releve, nbCandidats, erreur: !!erreur, saisie });
  // Masquer vaut pour le conseil affiché : le suivant revient de lui-même.
  const [masquee, setMasquee] = useState<PhaseAccueil>(null);

  if (!phase || masquee === phase) return null;
  const fermer =
    phase === 'dessin' ? null : (
      <button type="button" className="btn sm icon ghost loc-accueil-fermer" onClick={() => setMasquee(phase)} aria-label="Masquer ce conseil">
        <X />
      </button>
    );

  return (
    // Une clé par conseil : chaque nouveau conseil rejoue l'entrée, on voit que la consigne a changé.
    <section key={phase} className={`loc-accueil loc-accueil-${phase}`} aria-live="polite" aria-label="Que faire maintenant">
      {fermer}
      <Contenu phase={phase} enCours={cherche} erreur={erreur} />
    </section>
  );
}

function Contenu({ phase, enCours, erreur }: { phase: Exclude<PhaseAccueil, null>; enCours?: string; erreur?: string }) {
  switch (phase) {
    case 'adresse':
      return (
        <>
          <h2>
            Trouvez votre usine sur la carte.
            <InfoTip label="Pas d’adresse précise ?">
              <p>Pas d’adresse précise ? Zoomez sur la photo et cliquez sur le toit, ou dessinez son contour depuis le panneau.</p>
            </InfoTip>
          </h2>
          <div className="loc-accueil-gestes">
            <figure>
              <GesteAdresse />
              <figcaption>
                <b>1</b> Taper l’adresse
              </figcaption>
            </figure>
            <figure>
              <GesteToit decalage={DECALAGE_SECONDE_SCENE_MS} />
              <figcaption>
                <b>2</b> Cliquer sur le toit
              </figcaption>
            </figure>
          </div>
        </>
      );
    case 'cherche':
      return (
        <p className="loc-accueil-ligne">
          <Loader2 className="spin" aria-hidden /> {enCours}
        </p>
      );
    case 'releve':
      return (
        <p className="loc-accueil-ligne">
          <Loader2 className="spin" aria-hidden /> EVAN relève le contour du bâtiment…
        </p>
      );
    case 'choisir':
      return (
        <div className="loc-accueil-rangee">
          <GesteToit className="petit" />
          <h2>
            Cliquez sur la lettre de votre bâtiment.
            <InfoTip label="Choisir son bâtiment">
              <p>Un clic sur son toit suffit aussi. La liste des bâtiments proposés est dans le panneau.</p>
            </InfoTip>
          </h2>
        </div>
      );
    case 'cliquer':
      return (
        <div className="loc-accueil-rangee">
          <GesteToit className="petit" />
          <h2>
            Cliquez sur le toit de votre usine.
            <InfoTip label="Les bâtiments n’apparaissent pas ?">
              <p>Zoomez si besoin : les bâtiments apparaissent sur la photo avec un trait fin.</p>
            </InfoTip>
          </h2>
        </div>
      );
    case 'erreur':
      return (
        <>
          <p className="loc-accueil-ligne erreur">
            <AlertTriangle aria-hidden /> {erreur}
          </p>
          <div className="row">
            <button type="button" className="btn sm" onClick={() => useMapUi.getState().setMode('draw')}>
              <PenLine /> Dessiner le contour
            </button>
          </div>
        </>
      );
    case 'dessin':
      return <ConseilDessin />;
  }
}

/** Tracé à la main : les coins se posent un par un sur la photo, puis on ferme le contour. */
function ConseilDessin() {
  const nbPoints = useMapUi((s) => s.drawPoints.length);
  return (
    <>
      <h2>
        Cliquez sur chaque coin du bâtiment.
        <InfoTip label="Fermer le contour">
          <p>Faites le tour du toit sur la photo. Pour finir, double-cliquez sur le dernier coin ou fermez le contour.</p>
        </InfoTip>
      </h2>
      <p className="num loc-accueil-compte">{nbPoints === 0 ? 'Aucun coin posé' : nbPoints === 1 ? '1 coin posé' : `${nbPoints} coins posés`}</p>
      <div className="row">
        <button type="button" className="btn sm primary" disabled={nbPoints < 3} onClick={finishDrawing}>
          <Check /> Fermer le contour
        </button>
        <button type="button" className="btn sm" onClick={() => useMapUi.getState().setMode('browse')}>
          <X /> Annuler
        </button>
      </div>
    </>
  );
}
