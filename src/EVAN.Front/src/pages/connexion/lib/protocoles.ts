/**
 * Les langues qu'EVAN sait parler avec un automate, chacune dite en une phrase, et ce qu'il faut saisir pour le
 * joindre. Les réglages qu'on laisse d'ordinaire par défaut (sécurité, fréquence, port) sont marqués « avancé » :
 * ils restent repliés.
 */
import type { Protocole } from '@/domain/types';

export interface ProtocoleInfo {
  id: Protocole;
  nom: string;
  phrase: string;
  conseille?: boolean;
}

export const PROTOCOLES: ProtocoleInfo[] = [
  { id: 'opcua', nom: 'OPC UA', phrase: 'La langue standard des automates récents : Siemens S7-1500, Beckhoff, B&R, Rockwell…', conseille: true },
  { id: 'modbus', nom: 'Modbus TCP', phrase: 'Une langue ancienne et simple : EVAN interroge l’automate à intervalle régulier.' },
  { id: 's7', nom: 'Siemens S7', phrase: 'Les automates Siemens S7-300 ou S7-400 qui ne parlent pas OPC UA.' },
  { id: 'jmf', nom: 'JDF / JMF', phrase: 'La langue des presses d’imprimerie qui la proposent : état, vitesse, compteurs.' },
  { id: 'mqtt', nom: 'MQTT direct', phrase: 'Des capteurs qui envoient déjà leurs valeurs d’eux-mêmes.' },
  { id: 'simulateur', nom: 'Simulateur', phrase: 'Pour essayer sans machine : EVAN produit des valeurs de démonstration.' },
];

export const nomProtocole = (p: Protocole) => PROTOCOLES.find((x) => x.id === p)?.nom ?? p;

export const DEFAUTS: Record<Protocole, Record<string, string>> = {
  opcua: { endpoint: 'opc.tcp://10.20.1.21:4840', securite: 'SignAndEncrypt', politique: 'Basic256Sha256', auth: 'Certificat X.509', publication: '250' },
  modbus: { hote: '10.20.1.40', port: '502', unite: '1', scrutation: '500' },
  s7: { hote: '10.20.1.50', rack: '0', slot: '2', scrutation: '500' },
  jmf: { url: 'http://10.20.1.11:8080/jmf', intervalle: '5000' },
  mqtt: { broker: 'mqtts://capteurs.local:8883', topic: 'capteurs/#' },
  simulateur: { cadence: '1000' },
};

export interface Champ {
  k: string;
  l: string;
  /** Une ligne pour dire où trouver la valeur, ou à quoi elle sert. */
  aide?: string;
  opts?: string[];
  /** Réglage qu'on laisse d'ordinaire par défaut : replié sous « Réglages avancés ». */
  avance?: boolean;
}

export const CHAMPS: Record<Protocole, Champ[]> = {
  opcua: [
    { k: 'endpoint', l: 'Adresse du serveur OPC UA', aide: 'De la forme opc.tcp://adresse:4840. Elle figure dans les réglages de l’automate, ou chez l’automaticien.' },
    { k: 'securite', l: 'Mode de sécurité', opts: ['SignAndEncrypt', 'Sign', 'None'], avance: true, aide: 'SignAndEncrypt : messages signés et chiffrés.' },
    { k: 'politique', l: 'Politique de chiffrement', opts: ['Basic256Sha256', 'Aes256_Sha256_RsaPss', 'Aes128_Sha256_RsaOaep'], avance: true },
    { k: 'auth', l: 'Identification', opts: ['Certificat X.509', 'Utilisateur / mot de passe', 'Anonyme'], avance: true },
    { k: 'publication', l: 'Fréquence d’envoi des valeurs (ms)', avance: true },
  ],
  modbus: [
    { k: 'hote', l: 'Adresse IP de l’automate', aide: 'Quatre nombres séparés par des points, sur le réseau de l’usine.' },
    { k: 'port', l: 'Port', avance: true },
    { k: 'unite', l: 'Identifiant d’unité (esclave)', avance: true },
    { k: 'scrutation', l: 'Intervalle de lecture (ms)', avance: true },
  ],
  s7: [
    { k: 'hote', l: 'Adresse IP de l’automate', aide: 'Quatre nombres séparés par des points, sur le réseau de l’usine.' },
    { k: 'rack', l: 'Rack', avance: true },
    { k: 'slot', l: 'Emplacement (slot)', avance: true },
    { k: 'scrutation', l: 'Intervalle de lecture (ms)', avance: true },
  ],
  jmf: [
    { k: 'url', l: 'Adresse JMF de la presse', aide: 'Indiquée dans les réglages réseau de la presse ou par son constructeur.' },
    { k: 'intervalle', l: 'Intervalle des messages (ms)', avance: true },
  ],
  mqtt: [
    { k: 'broker', l: 'Serveur MQTT (broker)', aide: 'Le serveur où les capteurs publient leurs valeurs.' },
    { k: 'topic', l: 'Sujet à écouter', aide: 'Le # écoute tout ce qui est publié sous ce préfixe.' },
  ],
  simulateur: [{ k: 'cadence', l: 'Une valeur toutes les (ms)', avance: true }],
};

// ---------- Contrôle de la saisie ----------

/** Un nom de machine sur le réseau, ou une adresse IPv4 dont chaque nombre tient entre 0 et 255. */
const OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = `${OCTET}(\\.${OCTET}){3}`;
const NOM_HOTE = '[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*';
const HOTE = `(${IPV4}|${NOM_HOTE})`;
const PORT = '(:\\d{1,5})?';

const exact = (motif: string) => new RegExp(`^${motif}$`);
const RE_HOTE = exact(HOTE);
const RE_OPCUA = exact(`opc\\.tcp://${HOTE}${PORT}(/\\S*)?`);
const RE_HTTP = exact(`https?://${HOTE}${PORT}(/\\S*)?`);
const RE_MQTT = exact(`mqtts?://${HOTE}${PORT}`);
/** Ressemble à une adresse IP (que des chiffres et des points) : on la juge alors comme une IP, pas comme un nom. */
const RE_FACON_IP = /^[\d.]+$/;

/** Bornes des réglages numériques : en dehors, la valeur est une faute de frappe, pas un choix. */
const BORNES: Record<string, [number, number]> = {
  port: [1, 65535],
  unite: [0, 255],
  rack: [0, 7],
  slot: [0, 31],
  publication: [10, 600_000],
  scrutation: [10, 600_000],
  intervalle: [100, 600_000],
  cadence: [10, 600_000],
};

/** Le port d'une adresse, s'il y en a un, doit tenir entre 1 et 65535. */
function portHorsBornes(adresse: string): boolean {
  const port = adresse.match(/:(\d{1,5})(\/|$)/)?.[1];
  return port !== undefined && (Number(port) < 1 || Number(port) > 65535);
}

function hoteInvalide(hote: string): boolean {
  return RE_FACON_IP.test(hote) ? !exact(IPV4).test(hote) : !RE_HOTE.test(hote);
}

/** Hôte d'une adresse complète (« opc.tcp://10.20.1.21:4840/ua » donne « 10.20.1.21 »). */
const hoteDe = (adresse: string) => adresse.replace(/^[a-z.]+:\/\//i, '').split(/[:/]/)[0] ?? '';

/**
 * Ce qui ne va pas dans la valeur d'un champ, en une phrase qui dit la forme attendue, ou rien si elle est bonne. Un test
 * simulé ne joint aucune machine : c'est ce contrôle qui empêche de « valider » une adresse qui ne peut pas exister.
 */
export function erreurChamp(protocole: Protocole, cle: string, brut: string | undefined): string | undefined {
  const v = (brut ?? '').trim();
  if (CHAMPS[protocole].find((c) => c.k === cle)?.opts) return undefined;
  if (!v) return 'À remplir.';
  const bornes = BORNES[cle];
  if (bornes) {
    const n = Number(v);
    return Number.isInteger(n) && n >= bornes[0] && n <= bornes[1] ? undefined : `Un nombre entier entre ${bornes[0]} et ${bornes[1]}.`;
  }
  switch (`${protocole}.${cle}`) {
    case 'opcua.endpoint':
      return RE_OPCUA.test(v) && !hoteInvalide(hoteDe(v)) && !portHorsBornes(v) ? undefined : 'De la forme opc.tcp://10.20.1.21:4840.';
    case 'modbus.hote':
    case 's7.hote':
      return hoteInvalide(v) ? 'Une adresse IP de la forme 10.20.1.40 (quatre nombres de 0 à 255), ou le nom de l’automate sur le réseau.' : undefined;
    case 'jmf.url':
      return RE_HTTP.test(v) && !hoteInvalide(hoteDe(v)) && !portHorsBornes(v) ? undefined : 'De la forme http://10.20.1.11:8080/jmf.';
    case 'mqtt.broker':
      return RE_MQTT.test(v) && !hoteInvalide(hoteDe(v)) && !portHorsBornes(v) ? undefined : 'De la forme mqtts://capteurs.local:8883.';
    case 'mqtt.topic':
      return /\s/.test(v) || /#./.test(v) ? 'Sans espace ; le # seulement en dernier (capteurs/#).' : undefined;
    default:
      return undefined;
  }
}

/** Les champs du protocole qui ne vont pas, avec leur raison : vide quand l'adresse peut être testée. */
export function erreursAdresse(protocole: Protocole, params: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    CHAMPS[protocole].flatMap((c) => {
      const e = erreurChamp(protocole, c.k, params[c.k]);
      return e ? [[c.k, e]] : [];
    }),
  );
}
