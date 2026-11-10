/**
 * Le vocabulaire d'EVAN en mots de tous les jours. Chaque terme technique affiché à l'écran renvoie ici
 * (composant Term) : on garde le mot du métier, et on dit ce qu'il veut dire au survol ou au toucher.
 */
export interface Terme {
  /** Mot tel qu'il s'affiche. */
  mot: string;
  /** Nom complet, quand le mot est un sigle. */
  long?: string;
  /** Ce que ça veut dire, en une ou deux phrases. */
  sens: string;
  /** Comment le lire : plus haut c'est mieux, un exemple… */
  lecture?: string;
}

export const GLOSSAIRE = {
  trs: {
    mot: 'TRS',
    long: 'Taux de rendement synthétique',
    sens: 'La part du temps où la machine a vraiment produit de bonnes étiquettes, à sa vitesse normale. Il réunit trois pertes : les arrêts, le ralentissement et les étiquettes jetées.',
    lecture: 'Plus c’est haut, mieux c’est. 100 % voudrait dire : jamais arrêtée, jamais ralentie, rien jeté.',
  },
  disponibilite: {
    mot: 'Disponibilité',
    sens: 'La part du temps prévu où la machine tournait vraiment, une fois retirés les pannes et les réglages.',
    lecture: 'Plus c’est haut, mieux c’est.',
  },
  performance: {
    mot: 'Performance',
    sens: 'La vitesse réelle de la machine comparée à sa vitesse normale.',
    lecture: '100 % : elle tourne à sa vitesse normale.',
  },
  qualite: {
    mot: 'Qualité',
    sens: 'La part des étiquettes bonnes, sans celles jetées.',
  },
  mtbf: {
    mot: 'MTBF',
    long: 'Temps moyen entre deux pannes',
    sens: 'En moyenne, combien de temps une machine tourne avant de tomber en panne.',
    lecture: 'Plus c’est long, mieux c’est.',
  },
  mttr: {
    mot: 'MTTR',
    long: 'Temps moyen de réparation',
    sens: 'En moyenne, combien de temps il faut pour remettre une machine en route après une panne.',
    lecture: 'Plus c’est court, mieux c’est.',
  },
  acquittement: {
    mot: 'Acquittement',
    sens: 'Le moment où quelqu’un indique qu’il a vu l’alarme et s’en occupe.',
    lecture: 'Le délai d’acquittement dit combien de temps une alarme reste sans réponse.',
  },
  calage: {
    mot: 'Calage',
    sens: 'Le réglage d’une machine avant une nouvelle série : clichés, encres, repérage. Pendant ce temps, elle ne produit pas.',
  },
  gache: {
    mot: 'Gâche',
    sens: 'Les étiquettes imprimées puis jetées : réglage, défaut, fin de bobine.',
    lecture: 'Plus c’est bas, mieux c’est.',
  },
  anilox: {
    mot: 'Anilox',
    sens: 'Rouleau gravé de minuscules alvéoles qui dépose une quantité précise d’encre sur le cliché.',
  },
  organe: {
    mot: 'Organe',
    sens: 'Une partie de la machine qu’EVAN surveille : dérouleur, groupe d’impression, séchage UV, découpe…',
    lecture: 'En cas de panne, EVAN dit quel organe lâche, pas seulement quelle machine.',
  },
  pointMesure: {
    mot: 'Point de mesure',
    sens: 'Une valeur lue en continu sur un organe (température, tension de la bande, vitesse…), avec ses limites.',
  },
  seuil: {
    mot: 'Seuil',
    sens: 'La limite au-delà de laquelle EVAN prévient : d’abord « attention », puis « alarme ».',
  },
  plageNormale: {
    mot: 'Plage normale',
    sens: 'L’intervalle où une mesure doit rester pendant la production, entre ses deux seuils d’attention.',
    lecture: 'Tant que la courbe y reste, tout va bien.',
  },
  derive: {
    mot: 'Dérive',
    sens: 'Une mesure qui glisse lentement vers sa limite. EVAN la repère et prévient avant que la limite soit atteinte.',
  },
  defautRepetitif: {
    mot: 'Défaut répétitif',
    sens: 'La même panne, sur le même organe, plusieurs fois en peu de temps. Souvent le signe d’une cause qui n’a pas été réglée.',
  },
  preventif: {
    mot: 'Préventif',
    sens: 'Un entretien fait avant la panne, à date fixe ou après un nombre d’heures.',
  },
  curatif: {
    mot: 'Curatif',
    sens: 'Une réparation faite après une panne.',
  },
  previsionnel: {
    mot: 'Maintenance prévisionnelle',
    sens: 'EVAN suit l’évolution d’une mesure et calcule quand elle atteindra sa limite, pour planifier l’entretien avant.',
  },
  kwh: {
    mot: 'kWh',
    long: 'Kilowattheure',
    sens: 'L’unité de l’électricité consommée. 1 kWh, c’est une machine de 1 kW qui tourne pendant une heure.',
  },
  puissance: {
    mot: 'Puissance appelée',
    sens: 'L’électricité tirée à cet instant, en kW. La consommation (kWh), c’est cette puissance cumulée dans le temps.',
  },
  pic: {
    mot: 'Pic de puissance',
    sens: 'La puissance la plus forte tirée sur la période. C’est elle que l’abonnement électrique doit couvrir.',
  },
  intensite: {
    mot: 'Électricité par étiquette',
    sens: 'Les kWh consommés pour 1 000 étiquettes bonnes, toute l’usine comprise.',
    lecture: 'Plus c’est bas, mieux c’est : l’usine produit autant avec moins d’électricité.',
  },
  co2: {
    mot: 'CO₂e',
    long: 'Équivalent CO₂',
    sens: 'Les gaz à effet de serre liés à l’électricité consommée, ramenés à du CO₂.',
  },
  courbeCharge: {
    mot: 'Courbe de charge',
    sens: 'La puissance tirée par l’usine heure par heure. Les creux sont les nuits et les week-ends.',
  },
  veille: {
    mot: 'Veille',
    sens: 'Ce que les machines consomment quand elles ne produisent pas : la nuit, le week-end, entre deux séries.',
  },
  emprise: {
    mot: 'Emprise',
    sens: 'La surface au sol du bâtiment, mesurée sur la photo satellite.',
  },
  contour: {
    mot: 'Contour',
    sens: 'Le bord du toit vu du ciel. EVAN le relève auprès de l’IGN ; on peut en déplacer les coins s’il ne tombe pas juste.',
  },
  hauteurSousToiture: {
    mot: 'Hauteur sous toiture',
    sens: 'La hauteur du sol au bas du toit. Elle sert à monter le bâtiment en 3D.',
  },
  siret: {
    mot: 'SIRET',
    sens: 'Le numéro à 14 chiffres qui identifie un établissement d’entreprise. Le taper suffit à retrouver son adresse.',
  },
  laize: {
    mot: 'Laize',
    sens: 'La largeur de bande qu’une machine peut imprimer, en millimètres.',
  },
  lectureSeule: {
    mot: 'Lecture seule',
    sens: 'EVAN lit les valeurs de l’automate sans jamais rien y écrire ni commander la machine.',
  },
  automate: {
    mot: 'Automate',
    sens: 'Le petit ordinateur qui pilote la machine. EVAN lit ses valeurs sans rien modifier.',
  },
  passerelle: {
    mot: 'Passerelle',
    sens: 'Le petit boîtier posé dans l’atelier qui lit les automates et envoie les valeurs à EVAN, sans rien leur écrire.',
  },
  protocole: {
    mot: 'Protocole',
    sens: 'La langue qu’on utilise pour parler à l’automate : OPC UA, Modbus, Siemens S7, JDF/JMF selon la machine.',
  },
  variable: {
    mot: 'Variable',
    sens: 'Une valeur que l’automate met à disposition (vitesse, compteur, alarme…). On la relie à un point de mesure.',
  },
  zone: {
    mot: 'Zone',
    sens: 'Une partie de l’atelier : impression, stock, expédition… Elle sert à ranger les machines et à lire le plan.',
  },
} satisfies Record<string, Terme>;

export type TermeCle = keyof typeof GLOSSAIRE;
