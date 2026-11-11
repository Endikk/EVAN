/**
 * Durée d'une intervention, telle qu'on la tape à l'atelier : « 45 », « 45 min », « 1h30 », « 1 h 30 », « 1:30 »,
 * « 2 h », « 1,5 h ». Rend des minutes, ou null quand la saisie ne se lit pas.
 */
export function lireDuree(saisie: string): number | null {
  const t = saisie.trim().toLowerCase().replace(/\s+/g, '').replace(',', '.');
  if (!t) return null;
  const minutes = /^(\d+)(?:mn|min|minutes?|m)?$/.exec(t);
  if (minutes) return Number(minutes[1]);
  const heuresMinutes = /^(\d+)(?:h|:)(\d{1,2})(?:mn|min|m)?$/.exec(t);
  if (heuresMinutes) return Number(heuresMinutes[2]) < 60 ? Number(heuresMinutes[1]) * 60 + Number(heuresMinutes[2]) : null;
  const heures = /^(\d+(?:\.\d+)?)h(?:eures?)?$/.exec(t);
  if (heures) return Math.round(Number(heures[1]) * 60);
  return null;
}

/** Durée affichée dans le champ, comme on la dirait : « 45 min », « 1 h 30 », « 2 h ». Le champ la relit telle quelle. */
export function ecrireDuree(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
