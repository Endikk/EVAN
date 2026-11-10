/**
 * Organisation d'un compte : quitter la page avec des modifications que le serveur n'a pas encore les perdrait. Le
 * navigateur demande alors confirmation. Sans compte, la sauvegarde du navigateur est immédiate : rien à demander.
 */
import { useEffect } from 'react';
import { useProject } from '@/store/project';
import { nonEnregistre } from '@/store/enregistrement';

export function useAvantDeQuitter() {
  useEffect(() => {
    const avant = (e: BeforeUnloadEvent) => {
      if (useProject.getState().serveur && nonEnregistre()) e.preventDefault();
    };
    window.addEventListener('beforeunload', avant);
    return () => window.removeEventListener('beforeunload', avant);
  }, []);
}
