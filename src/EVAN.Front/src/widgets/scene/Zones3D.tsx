import { useMemo } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import type { TypeZone, Zone } from '@/domain/types';
import { polygonCentroid } from '@/geo/geodesy';
import { useDispose } from './useDispose';
import { useCouleurTrait } from './couleurs';

/**
 * Couleur d'une zone dans l'interface (pastilles, listes, guide du plan) : neutre pour tous les types. Les teintes
 * d'autrefois (vert, ambre, bleu…) reprenaient exactement celles des états machine (marche, à surveiller, réglage),
 * posées juste à côté des machines : une zone « Stock » se lisait comme une machine à surveiller. Le type se lit
 * désormais à son nom. Valeur CSS (variable) : elle suit le thème.
 */
export const ZONE_COULEUR: Record<TypeZone, string> = {
  atelier: 'var(--text-2)',
  stock: 'var(--text-2)',
  expedition: 'var(--text-2)',
  prepresse: 'var(--text-2)',
  faconnage: 'var(--text-2)',
  bureaux: 'var(--text-2)',
};

/** Voile de la zone au sol, et contour pointillé (plein et plus épais quand elle est choisie). */
const VOILE = { repos: 0.05, choisie: 0.12 };
const CONTOUR = { repos: 0.55, choisie: 1 };

export const ZONE_LIBELLE: Record<TypeZone, string> = {
  atelier: 'Atelier',
  stock: 'Stock',
  expedition: 'Expédition',
  prepresse: 'Prépresse',
  faconnage: 'Façonnage',
  bureaux: 'Bureaux',
};

function ZoneMesh({ z, selected, onSelect, showLabel, plan }: { z: Zone; selected: boolean; onSelect?: (id: string) => void; showLabel: boolean; plan: boolean }) {
  const geom = useMemo(() => {
    const shape = new THREE.Shape(z.polygone.map(([x, y]) => new THREE.Vector2(x, -y)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [z.polygone]);
  useDispose(geom);
  const c = polygonCentroid(z.polygone);
  // Plan 2D : nom de zone dans le coin haut-gauche, comme sur un plan d'architecte (le centre reste aux machines).
  const corner: [number, number, number] = [Math.min(...z.polygone.map((p) => p[0])) + 0.7, 0.1, Math.min(...z.polygone.map((p) => p[1])) + 0.6];
  // Dessin three.js : la valeur en clair du jeton, ivoire la nuit, encre le jour.
  const color = useCouleurTrait();
  return (
    <group>
      <mesh
        geometry={geom}
        position={[0, 0.035, 0]}
        onClick={
          onSelect
            ? (e) => {
                e.stopPropagation();
                onSelect(z.id);
              }
            : undefined
        }
      >
        <meshBasicMaterial color={color} transparent opacity={selected ? VOILE.choisie : VOILE.repos} depthWrite={false} />
      </mesh>
      <Line
        points={[...z.polygone, z.polygone[0]].map(([x, y]) => [x, 0.06, y] as [number, number, number])}
        color={color}
        lineWidth={selected ? 2.4 : 1.2}
        dashed={!selected}
        dashSize={1}
        gapSize={0.6}
        transparent
        opacity={selected ? CONTOUR.choisie : CONTOUR.repos}
      />
      {/* Étiquette toujours montée (masquée en CSS) : démonter un <Html> en cours de rendu casse son portail. */}
      <Html position={plan ? corner : [c[0], 0.1, c[1]]} center={!plan} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`zone-tag ${plan ? 'plan' : ''} ${selected ? 'sel' : ''}`} style={{ visibility: showLabel ? 'visible' : 'hidden' }}>
          {z.nom}
        </div>
      </Html>
    </group>
  );
}

export function Zones3D({ zones, selectedId, onSelect, showLabels, plan = false }: { zones: Zone[]; selectedId?: string; onSelect?: (id: string) => void; showLabels: boolean; plan?: boolean }) {
  return (
    <>
      {zones.map((z) => (
        <ZoneMesh key={z.id} z={z} selected={z.id === selectedId} onSelect={onSelect} showLabel={showLabels} plan={plan} />
      ))}
    </>
  );
}
