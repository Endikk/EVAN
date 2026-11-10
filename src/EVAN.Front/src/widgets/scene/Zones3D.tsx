import { useMemo } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import type { TypeZone, Zone } from '@/domain/types';
import { polygonCentroid } from '@/geo/geodesy';
import { useDispose } from './useDispose';

export const ZONE_COULEUR: Record<TypeZone, string> = {
  atelier: '#4b8bff',
  stock: '#f2a541',
  expedition: '#34c38f',
  prepresse: '#36c5d6',
  faconnage: '#b89cff',
  bureaux: '#9aa3ad',
};

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
  const color = ZONE_COULEUR[z.type];
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
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.34 : 0.17} depthWrite={false} />
      </mesh>
      <Line
        points={[...z.polygone, z.polygone[0]].map(([x, y]) => [x, 0.06, y] as [number, number, number])}
        color={color}
        lineWidth={selected ? 2.4 : 1.2}
        dashed={!selected}
        dashSize={1}
        gapSize={0.6}
      />
      {/* Étiquette toujours montée (masquée en CSS) : démonter un <Html> en cours de rendu casse son portail. */}
      <Html position={plan ? corner : [c[0], 0.1, c[1]]} center={!plan} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`zone-tag ${plan ? 'plan' : ''}`} style={{ ['--c' as string]: color, visibility: showLabel ? 'visible' : 'hidden' }}>
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
