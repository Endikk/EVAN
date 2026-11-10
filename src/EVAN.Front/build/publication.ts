/**
 * EVAN est l'outil interne d'une entreprise : rien n'est ouvert aux moteurs de recherche (robots.txt, balise robots,
 * en-tête X-Robots-Tag de nginx). Le build ne fait qu'une chose de l'adresse du site quand elle est connue
 * (EVAN_URL_PUBLIQUE=https://evan.exemple.fr) : les adresses absolues des balises de partage (og:image, og:url), pour
 * qu'un lien collé dans une messagerie s'affiche avec son aperçu. Sans elle, l'image reste en adresse relative.
 */

/**
 * Adresse publique lue dans l'environnement, sans barre finale ; null si elle n'est pas posée. Une adresse mal formée
 * arrête le build : des balises de partage fausses seraient pires qu'absentes.
 */
export function urlPublique(brute: string | undefined): string | null {
  const texte = brute?.trim();
  if (!texte) return null;
  let url: URL;
  try {
    url = new URL(texte);
  } catch {
    throw new Error(`EVAN_URL_PUBLIQUE n'est pas une adresse : « ${texte} » (attendu : https://evan.exemple.fr)`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`EVAN_URL_PUBLIQUE doit commencer par https:// (« ${texte} »)`);
  // Le front est servi à la racine du domaine : un chemin casserait toutes les adresses des écrans.
  if (url.pathname !== '/' || url.search || url.hash) throw new Error(`EVAN_URL_PUBLIQUE ne doit contenir que le domaine (« ${texte} »)`);
  return url.origin;
}

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Balises de partage en adresses absolues : og:image et twitter:image, plus og:url (la page d'accueil). */
export function partageAbsolu(html: string, base: string): string {
  const absolu = html.replace(/(<meta (?:property="og:image"|name="twitter:image") content=")\//g, `$1${base}/`);
  return absolu.replace(
    /(\s*)(<meta property="og:type")/,
    (_, retrait: string, balise: string) => `${retrait}<meta property="og:url" content="${echapper(base)}/" />${retrait}${balise}`,
  );
}
