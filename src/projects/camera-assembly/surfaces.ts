import * as THREE from 'three';
import type { SpatialStage } from '../../core/spatial';

export type Surface = 'enamel' | 'cream' | 'teal' | 'metal' | 'darkMetal' | 'rubber' | 'glass' | 'paper';

const SURFACES: Record<Surface, THREE.MeshPhysicalMaterialParameters> = {
  enamel: { color: '#e4aa3a', roughness: 0.24, metalness: 0.18, clearcoat: 0.85, clearcoatRoughness: 0.19 },
  cream: { color: '#eee5d4', roughness: 0.3, metalness: 0.07, clearcoat: 0.65, clearcoatRoughness: 0.23 },
  teal: { color: '#267d79', roughness: 0.25, metalness: 0.2, clearcoat: 0.8 },
  metal: { color: '#c8c4bd', roughness: 0.27, metalness: 0.87 },
  darkMetal: { color: '#37323d', roughness: 0.36, metalness: 0.75 },
  rubber: { color: '#2c2530', roughness: 0.91, metalness: 0.03 },
  glass: {
    color: '#80c0bd', roughness: 0.08, metalness: 0.08, transmission: 0.36,
    thickness: 0.22, ior: 1.48, transparent: true, opacity: 0.86, clearcoat: 1,
  },
  paper: { color: '#f4ead8', roughness: 0.92, metalness: 0 },
};

export interface PartSurface {
  material: THREE.MeshPhysicalMaterial;
  color: THREE.Color;
}

export function surfaceSet(stage: SpatialStage) {
  const cache = new Map<string, THREE.MeshPhysicalMaterial>();
  const byPart = new Map<string, PartSurface[]>();
  return {
    byPart,
    get(part: string, kind: Surface): THREE.MeshPhysicalMaterial {
      const key = `${part}:${kind}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const material = stage.own(new THREE.MeshPhysicalMaterial(SURFACES[kind]));
      cache.set(key, material);
      const surfaces = byPart.get(part) ?? [];
      surfaces.push({ material, color: material.color.clone() });
      byPart.set(part, surfaces);
      return material;
    },
    highlight(selected: string | null) {
      for (const [part, surfaces] of byPart) {
        for (const { material, color } of surfaces) {
          material.color.copy(color).multiplyScalar(selected && part !== selected ? 0.42 : 1);
          material.emissive.set(selected === part ? '#a97f32' : '#000000');
          material.emissiveIntensity = selected === part ? 0.28 : 0;
        }
      }
    },
  };
}

export function canvasTexture(
  stage: SpatialStage,
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The camera exhibit could not draw its local paper textures.');
  draw(context);
  const texture = stage.own(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, stage.renderer.capabilities.getMaxAnisotropy());
  stage.onDestroy(() => { canvas.width = canvas.height = 0; });
  return texture;
}

export function pictureTexture(stage: SpatialStage): THREE.CanvasTexture {
  return canvasTexture(stage, 512, 620, (p) => {
    p.fillStyle = '#f5ecda';
    p.fillRect(0, 0, 512, 620);
    p.save();
    p.beginPath();
    p.rect(30, 30, 452, 474);
    p.clip();
    const sky = p.createLinearGradient(0, 30, 0, 380);
    sky.addColorStop(0, '#c79063');
    sky.addColorStop(1, '#f0c77d');
    p.fillStyle = sky;
    p.fillRect(30, 30, 452, 474);
    p.fillStyle = '#f7e7b4';
    p.beginPath();
    p.arc(329, 153, 58, 0, Math.PI * 2);
    p.fill();
    p.fillStyle = '#446b70';
    p.fillRect(30, 280, 452, 224);
    p.fillStyle = '#304e58';
    p.beginPath();
    p.moveTo(30, 341);
    p.bezierCurveTo(155, 287, 258, 380, 482, 325);
    p.lineTo(482, 504);
    p.lineTo(30, 504);
    p.fill();
    p.fillStyle = '#342b40';
    p.beginPath();
    p.moveTo(30, 208);
    p.lineTo(103, 241);
    p.lineTo(143, 323);
    p.lineTo(196, 364);
    p.lineTo(226, 504);
    p.lineTo(30, 504);
    p.fill();
    p.strokeStyle = '#e5c888';
    p.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const y = 294 + i * 14;
      const spread = 9 + i * 3.8;
      p.beginPath();
      p.moveTo(329 - spread, y);
      p.lineTo(329 + spread * 0.7, y);
      p.stroke();
    }
    p.restore();
    p.fillStyle = '#443347';
    p.font = '22px Georgia, serif';
    p.fillText('Last light', 34, 554);
    p.font = '12px monospace';
    p.fillText('AN IMAGINED PLACE', 34, 582);
    p.textAlign = 'right';
    p.fillText('03', 477, 582);
  });
}
