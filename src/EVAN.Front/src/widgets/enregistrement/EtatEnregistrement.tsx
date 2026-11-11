/**
 * Organisation d'un compte : où en est l'enregistrement de l'usine sur le serveur. Une puce dans la barre du haut
 * (à enregistrer, en cours, enregistré à telle heure, refusé) ; refusé, elle ouvre la liste des champs à corriger,
 * chacun nommé avec sa machine ou son bâtiment, et un bouton pour réessayer.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Check, CloudUpload, Loader2, RefreshCw } from 'lucide-react';
import { useProject } from '@/store/project';
import { useEnregistrement } from '@/store/enregistrement';
import './enregistrement.css';

const heure = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function EtatEnregistrement() {
  const serveur = useProject((s) => s.serveur);
  const etat = useEnregistrement((s) => s.etat);
  const derniere = useEnregistrement((s) => s.derniere);
  const erreur = useEnregistrement((s) => s.erreur);
  const [ouvert, setOuvert] = useState(false);
  const panneau = useId();
  const racine = useRef<HTMLDivElement>(null);

  // Le détail se referme quand l'erreur disparaît, ou d'un clic ailleurs.
  useEffect(() => {
    if (etat !== 'erreur') setOuvert(false);
  }, [etat]);
  useEffect(() => {
    if (!ouvert) return;
    const ailleurs = (e: PointerEvent) => {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false);
    };
    window.addEventListener('pointerdown', ailleurs);
    return () => window.removeEventListener('pointerdown', ailleurs);
  }, [ouvert]);

  if (!serveur || etat === 'inactif') return null;
  const enregistrer = () => void useEnregistrement.getState().enregistrer();

  // À enregistrer, en cours, enregistré : un état de l'application, pas d'une machine, donc une puce neutre. Seul le
  // refus, qui demande d'agir, prend le rouge.
  if (etat !== 'erreur') {
    const contenu = {
      modifie: { icone: <CloudUpload aria-hidden />, texte: 'Modifications à enregistrer', titre: 'Envoyées au serveur quelques secondes après la dernière modification.' },
      enregistrement: { icone: <Loader2 aria-hidden className="enr-tourne" />, texte: 'Enregistrement…', titre: 'Envoi de la configuration au serveur EVAN.' },
      enregistre: {
        icone: <Check aria-hidden />,
        texte: derniere ? `Enregistré à ${heure(derniere)}` : 'À jour sur le serveur',
        titre: 'La configuration de vos usines est enregistrée sur le serveur EVAN.',
      },
    }[etat];
    return (
      <span className="chip enr-puce hide-sm" role="status" title={contenu.titre}>
        {contenu.icone}
        <span className="hide-md">{contenu.texte}</span>
      </span>
    );
  }

  return (
    <div className="enr" ref={racine}>
      <button className="chip crit enr-puce" aria-expanded={ouvert} aria-controls={panneau} onClick={() => setOuvert(!ouvert)}>
        <AlertTriangle aria-hidden />
        <span className="hide-ml">Non enregistré</span>
      </button>
      {ouvert && erreur && (
        <div id={panneau} className="enr-panneau" role="alert">
          <p className="enr-titre">{erreur.usine} : enregistrement refusé</p>
          <p className="enr-message">{erreur.message}</p>
          {erreur.champs.length > 0 && (
            <ul className="enr-champs">
              {erreur.champs.map((c, i) => (
                <li key={`${c.champ}-${i}`}>
                  {c.message}
                  <code>{c.champ}</code>
                </li>
              ))}
            </ul>
          )}
          <p className="enr-aide">Corrigez ces éléments dans la configuration : l’usine repart vers le serveur à la modification suivante.</p>
          <button className="btn sm" onClick={enregistrer}>
            <RefreshCw aria-hidden /> Réessayer maintenant
          </button>
        </div>
      )}
    </div>
  );
}
