import { useEffect } from 'react';

interface Disposable {
  dispose(): void;
}

/**
 * Libère un objet GPU (géométrie, matériau, texture) quand il est remplacé ou que le composant disparaît.
 * React Three Fiber ne libère que ce qu'il a créé lui-même ; un objet passé en propriété (`geometry={g}`) reste en
 * mémoire graphique sinon, à chaque changement d'usine ou de contour.
 */
export function useDispose<T extends Disposable | readonly Disposable[] | null | undefined>(obj: T): T {
  useEffect(() => {
    if (!obj) return;
    return () => (Array.isArray(obj) ? obj : [obj]).forEach((o: Disposable) => o.dispose());
  }, [obj]);
  return obj;
}
