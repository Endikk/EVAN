/**
 * Temps 2 : où joindre l'automate. Le champ essentiel est en vue ; où trouver sa valeur est dans le « ? » de son
 * intitulé. Les réglages qu'on laisse d'ordinaire par défaut sont repliés.
 *
 * Chaque valeur est contrôlée (lib/protocoles.ts) : une adresse mal formée le dit sous son champ, avec la forme
 * attendue, dès qu'on essaie de passer au test, puis à chaque frappe jusqu'à ce qu'elle soit bonne. Pas en quittant le
 * champ : la ligne apparue sous lui ferait glisser le bouton « Suivant » sous le pointeur, et le clic se perdrait.
 */
import { useId } from 'react';
import { Router } from 'lucide-react';
import { TonGlyph } from '@/ui/explain';
import type { Protocole } from '@/domain/types';
import { Details } from '@/ui/explain';
import { InfoTip } from '@/ui/InfoTip';
import { Select } from '@/ui/Select';
import { CHAMPS, type Champ } from '../lib/protocoles';

interface Props {
  protocole: Protocole;
  params: Record<string, string>;
  changer: (k: string, v: string) => void;
  passerelle?: string;
  /** Ce qui ne va pas, champ par champ (vide si l'adresse peut être testée). */
  erreurs: Record<string, string>;
  /** Montrer les erreurs : on a essayé de passer au test avec une adresse mal formée. */
  montrerErreurs: boolean;
}

function ChampSaisie({ c, valeur, changer, erreur, montrer }: { c: Champ; valeur: string; changer: (v: string) => void; erreur?: string; montrer: boolean }) {
  const id = useId();
  const idErreur = `${id}-erreur`;
  const visible = !!erreur && montrer;
  // L'intitulé est un label relié au champ. Quand il a une explication, c'est le libellé lui-même qui l'ouvre : le
  // label reste pour les lecteurs d'écran, masqué, puisqu'un bouton n'a rien à faire dans un label.
  return (
    <div className="field">
      <span className="cx-champ-tete">
        {c.aide ? (
          <>
            <label htmlFor={id} className="sr-only">
              {c.l}
            </label>
            <InfoTip label={`Comprendre : ${c.l}`} texte={c.l}>
              <p>{c.aide}</p>
            </InfoTip>
          </>
        ) : (
          <label htmlFor={id}>{c.l}</label>
        )}
      </span>
      {c.opts ? (
        <Select id={id} value={valeur} onChange={changer} options={c.opts.map((o) => ({ value: o, label: o }))} />
      ) : (
        <input
          id={id}
          className="input mono"
          value={valeur}
          onChange={(e) => changer(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={visible}
          aria-describedby={visible ? idErreur : undefined}
        />
      )}
      {visible && (
        <p id={idErreur} className="cx-champ-erreur">
          <TonGlyph ton="warn" />
          {erreur}
        </p>
      )}
    </div>
  );
}

export function Adresse({ protocole, params, changer, passerelle, erreurs, montrerErreurs }: Props) {
  const champs = CHAMPS[protocole];
  const essentiels = champs.filter((c) => !c.avance);
  const avances = champs.filter((c) => c.avance);
  const avanceFaux = montrerErreurs && avances.some((c) => erreurs[c.k]);
  return (
    <div className="cx-pas">
      {protocole === 'simulateur' && <p className="cx-intro">Rien à saisir : le simulateur tourne dans EVAN.</p>}
      {essentiels.map((c) => (
        <ChampSaisie key={c.k} c={c} valeur={params[c.k] ?? ''} changer={(v) => changer(c.k, v)} erreur={erreurs[c.k]} montrer={montrerErreurs} />
      ))}
      {avances.length > 0 && (
        // Un réglage avancé faux ne reste pas caché : le pli se rouvre de lui-même (la clé le remonte ouvert).
        <Details
          key={avanceFaux ? 'a-corriger' : 'replie'}
          titre="Réglages avancés"
          apercu="à laisser par défaut"
          ouvert={avanceFaux}
        >
          <div className="cx-avances">
            {avances.map((c) => (
              <ChampSaisie key={c.k} c={c} valeur={params[c.k] ?? ''} changer={(v) => changer(c.k, v)} erreur={erreurs[c.k]} montrer={montrerErreurs} />
            ))}
          </div>
        </Details>
      )}
      {protocole !== 'simulateur' && (
        <p className="cx-passerelle">
          <Router aria-hidden />
          <InfoTip
            label="Comment la machine est jointe"
            texte={
              <>
                Par la passerelle{passerelle ? <> <span className="mono">{passerelle}</span></> : ' de l’usine'}
              </>
            }
          >
            <p>La passerelle est un boîtier sur le réseau de l’usine. Elle joint la machine sans ouvrir d’accès depuis l’extérieur.</p>
            <p>Elle n’ouvre que des connexions sortantes vers EVAN (MQTT sur TLS, certificat client).</p>
          </InfoTip>
        </p>
      )}
    </div>
  );
}
