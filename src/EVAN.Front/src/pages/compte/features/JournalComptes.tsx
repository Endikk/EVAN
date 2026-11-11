/**
 * Administrateur : le journal des comptes de l'organisation. Qui a créé un compte, en a retiré un, a donné un mot de
 * passe provisoire ou changé le sien, à quelle heure (celle de ce poste) et depuis quelle adresse. Rangé par jour, le
 * plus récent d'abord, filtrable par action et par personne dès que la liste s'allonge.
 * Relu après chaque action faite sur cette page (`version`) ; un 403 retire la section (le compte n'est plus
 * administrateur), un 401 fait revérifier la session.
 */
import { useEffect, useId, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { appel } from '@/api/http';
import { useSession } from '@/store/session';
import { ACTIONS, JOURNAL_MAX, filtrer, issueLecture, jours, lignesValides, personnes, phrase, type Filtre, type LigneJournal } from '../lib/journal';

/** En dessous, la liste se lit d'un coup d'œil : les filtres n'apportent rien. */
const FILTRES_DES = 8;
const SANS_FILTRE: Filtre = { action: '', personne: '' };

interface Props {
  /** Change après une action sur les comptes faite sur cette page : le journal est relu. */
  version: number;
}

/** Une personne du journal, son identifiant ; la sienne est signalée comme dans la liste des membres. */
function Qui({ identifiant, moi }: { identifiant: string; moi?: string }) {
  return (
    <>
      <span className="cpt-journal-qui">{identifiant}</span>
      {identifiant === moi && <span className="cpt-soi"> (vous)</span>}
    </>
  );
}

export function JournalComptes({ version }: Props) {
  const moi = useSession((s) => s.utilisateur?.identifiant?.trim().toLowerCase());
  const [lignes, setLignes] = useState<LigneJournal[] | null>(null);
  const [erreur, setErreur] = useState<string>();
  const [masque, setMasque] = useState(false);
  const [lecture, setLecture] = useState(true);
  const [essai, setEssai] = useState(0);
  const [filtre, setFiltre] = useState(SANS_FILTRE);
  const titre = useId();

  useEffect(() => {
    // Une réponse arrivée après une lecture plus récente (ou après le départ de la page) est ignorée.
    let actuelle = true;
    setLecture(true);
    appel<unknown>('GET', '/api/organisation/journal-comptes')
      .then(
        (brut) => {
          if (!actuelle) return;
          setLignes(lignesValides(brut));
          setErreur(undefined);
        },
        (err: unknown) => {
          if (!actuelle) return;
          const r = issueLecture(err);
          if (r.masquer) setMasque(true);
          else setErreur(r.texte);
          if (r.sessionPerdue) void useSession.getState().verifier(true);
        },
      )
      .finally(() => {
        if (actuelle) setLecture(false);
      });
    return () => {
      actuelle = false;
    };
  }, [version, essai]);

  if (masque) return null;

  const visibles = lignes ? filtrer(lignes, filtre) : [];
  const filtreActif = Boolean(filtre.action || filtre.personne);
  const groupes = jours(visibles, Date.now());
  const compte = !lignes
    ? undefined
    : filtreActif
      ? visibles.length === 0
        ? 'Aucune action ne correspond à ces filtres.'
        : `${visibles.length} action${visibles.length > 1 ? 's' : ''} sur ${lignes.length}`
      : lignes.length >= JOURNAL_MAX
        ? `Les ${JOURNAL_MAX} actions les plus récentes : les plus anciennes ne s’affichent pas ici.`
        : undefined;

  return (
    <section className="cpt-carte cpt-journal" aria-labelledby={titre} aria-busy={lecture || undefined}>
      <h2 id={titre}>Journal des comptes</h2>
      <p className="cpt-note">Créations, retraits et mots de passe des comptes de l’organisation : qui, quand (heure de ce poste) et depuis quelle adresse.</p>

      {!lignes && !erreur && (
        <p className="cpt-note" role="status">
          Chargement du journal…
        </p>
      )}
      {erreur && (
        <div className="cpt-journal-erreur">
          <p className="cpt-erreur" role="alert">
            {erreur}
          </p>
          <button type="button" className="btn sm" onClick={() => setEssai((n) => n + 1)} disabled={lecture} aria-busy={lecture || undefined}>
            <RotateCw aria-hidden /> {lecture ? 'Lecture…' : 'Réessayer'}
          </button>
        </div>
      )}
      {lignes?.length === 0 && (
        <p className="cpt-note">Aucune action sur les comptes pour l’instant. La création d’un compte, un retrait ou un mot de passe provisoire s’inscriront ici.</p>
      )}

      {lignes && lignes.length >= FILTRES_DES && (
        <div className="cpt-journal-filtres" role="group" aria-label="Filtrer le journal">
          <label className="field">
            <span>Action</span>
            <select className="input" value={filtre.action} onChange={(e) => setFiltre({ ...filtre, action: e.target.value })}>
              <option value="">Toutes les actions</option>
              {ACTIONS.map((a) => (
                <option key={a.valeur} value={a.valeur}>
                  {a.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Personne</span>
            <select className="input" value={filtre.personne} onChange={(e) => setFiltre({ ...filtre, personne: e.target.value })}>
              <option value="">Toutes les personnes</option>
              {personnes(lignes).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {/* Toujours présente une fois la liste lue : une zone d'annonce ajoutée avec son texte n'est pas toujours lue. */}
      {lignes && lignes.length > 0 && (
        <p className="cpt-note cpt-journal-compte" role="status">
          {compte}
        </p>
      )}
      {lignes && lignes.length > 0 && visibles.length === 0 && (
        <div className="cpt-actions">
          <button type="button" className="btn sm" onClick={() => setFiltre(SANS_FILTRE)}>
            Tout afficher
          </button>
        </div>
      )}

      {groupes.length > 0 && (
        <ol className="cpt-journal-jours">
          {groupes.map((g) => (
            <li key={g.cle}>
              <h3 className="cpt-journal-jour">{g.titre}</h3>
              <ol className="cpt-journal-lignes">
                {g.lignes.map(({ ligne, heure, iso }, i) => {
                  const p = phrase(ligne);
                  return (
                    <li key={`${ligne.le}-${ligne.action}-${ligne.cible}-${i}`} className="cpt-journal-ligne">
                      <time dateTime={iso}>{heure}</time>
                      <p className="cpt-journal-texte">
                        <Qui identifiant={ligne.auteur} moi={moi} /> {p.verbe}
                        {p.cible && (
                          <>
                            {' '}
                            <Qui identifiant={p.cible} moi={moi} />
                          </>
                        )}
                      </p>
                      {ligne.adresse && (
                        <span className="cpt-journal-adresse">
                          <span className="sr-only">depuis l’adresse </span>
                          {ligne.adresse}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
