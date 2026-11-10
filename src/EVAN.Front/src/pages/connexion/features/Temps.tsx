/**
 * Les quatre temps du branchement d'une machine, numérotés, reliés par un fil qui se remplit. Un temps déjà atteint
 * se rouvre d'un clic ; les suivants attendent leur tour. Chaque temps garde une ligne (son nom, son but) ; ce qu'il
 * faut savoir pour le mener est dans le « ? » de son titre.
 */
import type { ReactNode } from 'react';
import type { Protocole } from '@/domain/types';
import { DefinitionTerme, GLOSSAIRE } from '@/ui/explain';

export const TEMPS = [
  { titre: 'Protocole', sous: 'La langue de l’automate' },
  { titre: 'Adresse', sous: 'Où le joindre' },
  { titre: 'Test', sous: 'La liaison passe-t-elle ?' },
  { titre: 'Variables', sous: 'Les relier aux organes' },
] as const;

/** Le contenu du « ? » de chaque temps. */
export function aideDuTemps(i: number, protocole: Protocole, numero: string): ReactNode {
  switch (i) {
    case 0:
      return (
        <>
          <DefinitionTerme t={GLOSSAIRE.protocole} />
          <p>Choisissez celui que propose l’automate de la machine. Dans le doute, OPC UA.</p>
        </>
      );
    case 1:
      return protocole === 'simulateur' ? (
        <p>Le simulateur tourne dans EVAN : il n’y a pas de machine à joindre.</p>
      ) : (
        <p>Où EVAN trouve l’automate de {numero} sur le réseau de l’usine. Les réglages avancés se laissent d’ordinaire par défaut.</p>
      );
    case 2:
      return <p>EVAN demande à la passerelle de joindre l’automate, puis lit quelques valeurs. Le test ne fait que lire : rien ne change sur la machine.</p>;
    default:
      return (
        <>
          <DefinitionTerme t={GLOSSAIRE.variable} />
          <p>
            Reliez chacune au point de mesure qui lui correspond : EVAN saura sur quel organe l’afficher. « Associer automatiquement » rapproche les noms, une
            variable qui porte le nom d’un organe et d’une mesure va avec ce point.
          </p>
        </>
      );
  }
}

export function FilDesTemps({ courant, atteint, aller }: { courant: number; atteint: number; aller: (i: number) => void }) {
  return (
    <ol className="cx-temps" data-guide="connexion-etapes" style={{ ['--avance' as string]: courant / (TEMPS.length - 1) }}>
      {TEMPS.map((t, i) => {
        const etat = i < courant ? 'fait' : i === courant ? 'courant' : 'a-venir';
        return (
          <li key={t.titre} className={etat}>
            <button
              type="button"
              onClick={() => aller(i)}
              disabled={i > atteint}
              aria-current={i === courant ? 'step' : undefined}
              aria-label={`Temps ${i + 1} sur ${TEMPS.length} : ${t.titre}${i < courant ? ', fait' : ''}`}
            >
              <span className="cx-temps-rond" aria-hidden>
                {i < courant ? (
                  <svg viewBox="0 0 16 16" width="14" height="14">
                    <path className="cx-temps-coche" d="M3.5 8.4 6.6 11.4 12.6 5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="cx-temps-nom">{t.titre}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
