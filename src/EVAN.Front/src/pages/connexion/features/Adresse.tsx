/**
 * Temps 2 : où joindre l'automate. Le champ essentiel est en vue ; où trouver sa valeur est dans le « ? » de son
 * intitulé. Les réglages qu'on laisse d'ordinaire par défaut sont repliés.
 */
import { useId } from 'react';
import { Router } from 'lucide-react';
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
}

function ChampSaisie({ c, valeur, changer }: { c: Champ; valeur: string; changer: (v: string) => void }) {
  const id = useId();
  // L'intitulé est un label relié au champ ; le « ? » est à côté, jamais dedans (pas de bouton dans un label).
  return (
    <div className="field">
      <span className="cx-champ-tete">
        <label htmlFor={id}>{c.l}</label>
        {c.aide && (
          <InfoTip label={`Comprendre : ${c.l}`}>
            <p>{c.aide}</p>
          </InfoTip>
        )}
      </span>
      {c.opts ? (
        <Select id={id} value={valeur} onChange={changer} options={c.opts.map((o) => ({ value: o, label: o }))} />
      ) : (
        <input id={id} className="input mono" value={valeur} onChange={(e) => changer(e.target.value)} spellCheck={false} autoComplete="off" />
      )}
    </div>
  );
}

export function Adresse({ protocole, params, changer, passerelle }: Props) {
  const champs = CHAMPS[protocole];
  const essentiels = champs.filter((c) => !c.avance);
  const avances = champs.filter((c) => c.avance);
  return (
    <div className="cx-pas">
      {protocole === 'simulateur' && <p className="cx-intro">Rien à saisir : le simulateur tourne dans EVAN.</p>}
      {essentiels.map((c) => (
        <ChampSaisie key={c.k} c={c} valeur={params[c.k] ?? ''} changer={(v) => changer(c.k, v)} />
      ))}
      {avances.length > 0 && (
        <Details titre="Réglages avancés" apercu="à laisser par défaut">
          <div className="cx-avances">
            {avances.map((c) => (
              <ChampSaisie key={c.k} c={c} valeur={params[c.k] ?? ''} changer={(v) => changer(c.k, v)} />
            ))}
          </div>
        </Details>
      )}
      {protocole !== 'simulateur' && (
        <p className="cx-passerelle">
          <Router aria-hidden />
          <span>
            Par la passerelle{passerelle ? <> <span className="mono">{passerelle}</span></> : ' de l’usine'}
          </span>
          <InfoTip label="Comment la machine est jointe">
            <p>La passerelle est un boîtier sur le réseau de l’usine. Elle joint la machine sans ouvrir d’accès depuis l’extérieur.</p>
            <p>Elle n’ouvre que des connexions sortantes vers EVAN (MQTT sur TLS, certificat client).</p>
          </InfoTip>
        </p>
      )}
    </div>
  );
}
