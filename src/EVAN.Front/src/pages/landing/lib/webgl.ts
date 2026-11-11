/**
 * WebGL 2 est-il disponible ? La presse 3D de l'accueil (et son film d'ouverture) en a besoin. Le test ne se fait
 * qu'une fois par page : le navigateur n'accorde qu'un petit nombre de contextes.
 */
let disponible: boolean | undefined;

export function webglDisponible(): boolean {
  if (disponible !== undefined) return disponible;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    // Le contexte d'essai est rendu tout de suite.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    disponible = !!gl;
  } catch {
    disponible = false;
  }
  return disponible;
}
