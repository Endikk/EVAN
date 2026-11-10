/**
 * Le test de liaison lu comme un trajet : EVAN joint la passerelle de l'usine, qui joint l'automate. De la liste des
 * étapes renvoyées par le test, on tire l'état de chaque tronçon, la cause d'un échec et ce qu'il faut vérifier.
 */
export interface LigneTest {
  t: string;
  ok?: boolean;
}

export type EtatTroncon = 'attente' | 'encours' | 'ok' | 'echec';

export interface LectureTest {
  etat: 'attente' | 'encours' | 'ok' | 'echec';
  /** EVAN ↔ passerelle, puis passerelle ↔ automate. */
  troncons: [EtatTroncon, EtatTroncon];
  derniere?: string;
  cause?: string;
  conseil?: string;
}

/** Un échec qui vient de la passerelle elle-même (ou de la route jusqu'à elle), pas de l'automate. */
const COTE_PASSERELLE = /passerelle|test impossible/i;

const CONSEILS: [RegExp, string][] = [
  [COTE_PASSERELLE, 'Vérifiez que la passerelle de l’usine est allumée et reliée au réseau, puis relancez le test.'],
  [/certificat/i, 'Le certificat de l’automate doit être approuvé par l’administrateur d’EVAN avant la première connexion.'],
  [/session|authentif|identif|mot de passe|utilisateur/i, 'L’automate refuse l’identification : vérifiez l’utilisateur, le mot de passe ou le certificat dans les réglages avancés.'],
  [/résolution|introuvable|dns/i, 'L’adresse de l’automate est introuvable : vérifiez-la au temps 2.'],
  [/tcp|connexion|refus|délai|timeout|répond/i, 'L’automate ne répond pas : vérifiez qu’il est allumé, branché au réseau de l’usine, et l’adresse saisie au temps 2.'],
];

export function conseilPour(cause: string): string {
  return CONSEILS.find(([motif]) => motif.test(cause))?.[1] ?? 'Vérifiez l’adresse saisie au temps 2, puis relancez le test. Si l’échec persiste, montrez ce détail à l’automaticien.';
}

export function lireTest(log: LigneTest[], enCours: boolean): LectureTest {
  if (!log.length && !enCours) return { etat: 'attente', troncons: ['attente', 'attente'] };
  const derniere = log[log.length - 1]?.t;
  const echec = log.find((l) => l.ok === false);
  if (echec) {
    const passerelle = COTE_PASSERELLE.test(echec.t);
    return {
      etat: 'echec',
      troncons: passerelle ? ['echec', 'attente'] : ['ok', 'echec'],
      derniere,
      cause: echec.t,
      conseil: conseilPour(echec.t),
    };
  }
  if (enCours) {
    // Le premier tronçon passe dès que la passerelle a répondu : la deuxième ligne du test vient d'elle.
    const passerelleJointe = log.length >= 2;
    return { etat: 'encours', troncons: passerelleJointe ? ['ok', 'encours'] : ['encours', 'attente'], derniere };
  }
  return { etat: 'ok', troncons: ['ok', 'ok'], derniere };
}
