/** Point d'entrée : polices, système de design, routes. */
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@/styles/app.css';
import '@/ui/explain/explain.css';
// Avant le premier rendu : le thème et les animations réduites (choix gardé, sinon préférence du système) sont posés
// sur la racine dès le chargement, accueil compris.
import '@/store/ui';
import { router } from './router';

// Pas de StrictMode : les étiquettes 3D (drei <Html>) créent leurs propres racines React,
// que le double montage de développement démonte en plein rendu.
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
