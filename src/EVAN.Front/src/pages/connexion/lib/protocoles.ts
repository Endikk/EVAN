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
