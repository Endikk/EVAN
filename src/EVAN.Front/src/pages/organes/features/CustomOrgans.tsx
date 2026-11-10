/**
 * Organes d'une machine importée (hors du kit) : EVAN propose ceux que le modèle 3D annonce lui-même (nœuds
 * diag_N_nom), ou on les ajoute un par un, avec une première mesure et son seuil d'alarme.
 */
import { useMemo, useState } from 'react';
import { ListPlus, Plus } from 'lucide-react';
import { useGLTF } from '@react-three/drei';
import { useProject } from '@/store/project';
import { TYPE_MESURE_LIBELLE } from '@/domain/catalog';
import type { Machine, Organe, TypeMesure } from '@/domain/types';
import { InfoTip } from '@/ui/InfoTip';
import { Select } from '@/ui/Select';
import { uid } from '@/sim/random';

const TYPES_PROPOSES: TypeMesure[] = ['tension', 'temperature', 'vitesse', 'pression', 'alarme'];
const CHOIX_MESURES = TYPES_PROPOSES.map((t) => ({ value: t, label: TYPE_MESURE_LIBELLE[t] }));

export function CustomOrgans({ machine }: { machine: Machine }) {
  const { scene } = useGLTF(machine.modele.url);
  const noeuds = useMemo(() => {
    const out: { name: string; pos: [number, number, number] }[] = [];
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (o.name) out.push({ name: o.name, pos: [o.position.x, o.position.y, o.position.z] });
    });
    return out;
  }, [scene]);
  const [nom, setNom] = useState('');
  const [noeud, setNoeud] = useState('');
  const [mesure, setMesure] = useState<{ libelle: string; type: TypeMesure; unite: string; haut: string }>({ libelle: '', type: 'temperature', unite: '°C', haut: '' });
  const perso = useProject((s) => s.perso[machine.id]) ?? { organes: [], points: [] };
  const diag = noeuds.filter((n) => /^diag_\d+/.test(n.name));
  // Un nom de nœud peut revenir plusieurs fois dans le modèle : la liste ne le propose qu'une fois (400 au plus).
  const emplacements = useMemo(
    () => [{ value: '', label: 'Pas d’emplacement précis' }, ...[...new Set(noeuds.map((n) => n.name))].slice(0, 400).map((name) => ({ value: name, label: name }))],
    [noeuds],
  );

  const ajouter = () => {
    if (!nom.trim()) return;
    const numero = perso.organes.length + 1;
    const n = noeuds.find((x) => x.name === noeud);
    const o: Organe = { id: `${machine.id}.o${numero}`, machineId: machine.id, numero, nom: nom.trim(), noeud3d: noeud || undefined, position: n?.pos, capteurs: [], pannesTypiques: [] };
    const points = [...perso.points];
    if (mesure.libelle.trim()) {
      points.push({
        id: `${o.id}.${uid('p')}`,
        machineId: machine.id,
        organeId: o.id,
        cle: mesure.libelle.toLowerCase().replace(/\W+/g, '_'),
        libelle: mesure.libelle.trim(),
        type: mesure.type,
        unite: mesure.unite,
        nominal: 0,
        seuils: mesure.haut ? { alarmeHaut: Number(mesure.haut) } : {},
      });
    }
    useProject.getState().setPerso(machine.id, { organes: [...perso.organes, o], points });
    setNom('');
    setNoeud('');
    setMesure({ ...mesure, libelle: '', haut: '' });
  };

  const creerDepuisModele = () =>
    useProject.getState().setPerso(machine.id, {
      organes: diag.map((d, i) => ({
        id: `${machine.id}.o${i + 1}`,
        machineId: machine.id,
        numero: i + 1,
        nom: d.name.replace(/^diag_\d+_/, '').replace(/_/g, ' '),
        noeud3d: d.name,
        position: d.pos,
        capteurs: [],
        pannesTypiques: [],
      })),
      points: perso.points,
    });

  return (
    <section className="card og-fiche og-import" aria-labelledby="og-import-titre" data-guide="organes-fiche">
      <header className="og-fiche-tete">
        <div className="grow">
          <p className="og-fiche-sur">
            <span className="mono">{machine.numero}</span> · Modèle importé
          </p>
          <h3 id="og-import-titre">
            {machine.nom}
            <InfoTip label="Décrire les organes d’une machine importée">
              <p>
                Cette machine n’est pas dans le kit : ses organes sont à décrire. Donnez à chacun un nom, l’endroit du modèle 3D où il se trouve et, si
                vous la connaissez, une première mesure.
              </p>
            </InfoTip>
          </h3>
        </div>
      </header>

      {diag.length > 0 && (
        <div className="og-import-diag">
          <span>
            Le modèle 3D annonce {diag.length} point{diag.length > 1 ? 's' : ''} de diagnostic.
          </span>
          <button type="button" className="btn sm" onClick={creerDepuisModele}>
            <ListPlus aria-hidden /> En faire {diag.length} organe{diag.length > 1 ? 's' : ''}
          </button>
        </div>
      )}

      <label className="field">
        <span>Nom de l’organe</span>
        <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Groupe d’impression 3" />
      </label>
      <label className="field">
        <span>Où il se trouve dans le modèle 3D</span>
        <Select value={noeud} onChange={setNoeud} options={emplacements} />
      </label>
      <div className="og-import-ligne">
        <label className="field grow">
          <span>Une mesure sur cet organe</span>
          <input className="input" value={mesure.libelle} onChange={(e) => setMesure({ ...mesure, libelle: e.target.value })} placeholder="Ex. Température" />
        </label>
        <label className="field og-import-type">
          <span>Nature</span>
          <Select value={mesure.type} onChange={(v) => setMesure({ ...mesure, type: v as TypeMesure })} options={CHOIX_MESURES} />
        </label>
      </div>
      <div className="og-import-ligne">
        <label className="field og-import-unite">
          <span>Unité</span>
          <input className="input" value={mesure.unite} onChange={(e) => setMesure({ ...mesure, unite: e.target.value })} />
        </label>
        <label className="field grow">
          <span>Alarme au-dessus de</span>
          <input className="input num" type="number" inputMode="decimal" value={mesure.haut} onChange={(e) => setMesure({ ...mesure, haut: e.target.value })} />
        </label>
      </div>
      <button type="button" className="btn sm primary" onClick={ajouter} disabled={!nom.trim()}>
        <Plus aria-hidden /> Ajouter l’organe
      </button>
      {perso.organes.length > 0 && (
        <p className="og-texte faint">
          {perso.organes.length} organe{perso.organes.length > 1 ? 's' : ''} décrit{perso.organes.length > 1 ? 's' : ''} pour l’instant.
        </p>
      )}
    </section>
  );
}
