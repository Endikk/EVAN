/** Point d'entrée : polices, système de design, routes. */
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import '@fontsource-variable/onest';
import '@fontsource-variable/jetbrains-mono';
import '@/styles/app.css';
import '@/ui/explain/explain.css';
import { router } from './router';

// Pas de StrictMode : les étiquettes 3D (drei <Html>) créent leurs propres racines React,
// que le double montage de développement démonte en plein rendu.
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
