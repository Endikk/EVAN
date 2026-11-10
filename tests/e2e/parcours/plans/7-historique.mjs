import { CADRE } from './commun.mjs';
export default {
  nom: '7-historique',
  url: '/demo/historique?visite=0',
  cadre: CADRE,
  async prepare({ attendre }) {
    await attendre(5000);
  },
  async scene({ page, aller, cliquer, molette, attendre }) {
    await attendre(600);
    // Les dernières 24 heures, puis la semaine ; puis là où le temps s'est perdu, machine par machine.
    await cliquer(page.getByRole('button', { name: '24 heures' }), 900);
    await attendre(1400);
    await cliquer(page.getByRole('button', { name: '7 jours' }), 600);
    await attendre(900);
    // La molette loin des bulles d'aide : une bulle ouverte sous le curseur prendrait le défilement.
    await aller(760, 270, 800);
    await molette(470, 1100);
    await attendre(500);
    // La machine qui s'arrête le plus : sa barre, son détail, sa place sur le plan.
    await aller(440, 246, 1000);
    await attendre(2400);
  },
};
