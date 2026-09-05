import * as THREE from 'three';
import { controlRange, controlSelect } from '../core/controls';
import type { ExperimentContext, ExperimentInstance } from '../core/types';
import { orbitView, plateLabel, plinth, setControlValue, spatialExperiment, studio } from './spatial-common';

const finishes = [
  {
    value: 'alloy', label: 'Mixed metals',
    colors: ['#b7beb2', '#bb9565', '#253b32'],
    metalness: 0.96, roughness: 0.2, clearcoat: 0.45,
  },
  {
    value: 'silver', label: 'Liquid silver',
    colors: ['#d4dbd7', '#a9b9b4', '#e1e5dc'],
    metalness: 1, roughness: 0.13, clearcoat: 0.65,
  },
  {
    value: 'porcelain', label: 'Glazed porcelain',
    colors: ['#f0e9d6', '#d17a51', '#364b3d'],
    metalness: 0.08, roughness: 0.24, clearcoat: 1,
  },
];

export function mount(context: ExperimentContext): ExperimentInstance {
  return spatialExperiment(context, {
    label: 'Three engraved, polished rings turning around a pearl center and an orange satellite. Drag or use arrow keys to orbit; scroll or use plus and minus to zoom.',
    background: '#d9e4cf',
    camera: [6.8, 6.1, 11.4],
    target: [0, 3.05, 0],
    fov: 35,
  }, (stage) => {
    studio(stage, { ground: '#d9e4cf', shadow: '#536148', radius: 3.4 });
    const orbit = orbitView(stage, { minDistance: 7.5, maxDistance: 24 });
    const caption = plateLabel(stage, '01 / KINETIC OBJECT / MIXED METALS');
    plinth(stage, 2.12, '#dce1cb');

    const dial = new THREE.Mesh(
      new THREE.RingGeometry(1.89, 1.902, 128),
      new THREE.MeshBasicMaterial({ color: '#69745d', transparent: true, opacity: 0.35 }),
    );
    dial.rotation.x = -Math.PI / 2;
    dial.position.y = 0.163;
    stage.scene.add(dial);

    const sculpture = new THREE.Group();
    stage.scene.add(sculpture);
    const radii = [2.68, 2.1, 1.5];
    const thicknesses = [0.14, 0.16, 0.18];
    const materials = radii.map(() => new THREE.MeshPhysicalMaterial({
      clearcoatRoughness: 0.16,
      envMapIntensity: 1.3,
    }));
    const seamMaterial = new THREE.MeshStandardMaterial({
      color: '#f1dfb5', metalness: 0.9, roughness: 0.27,
    });
    const engravingMaterial = new THREE.MeshStandardMaterial({
      color: '#344334', metalness: 0.6, roughness: 0.35,
    });
    const rings = radii.map((radius, index) => {
      const ring = new THREE.Group();
      const geometry = new THREE.TorusGeometry(radius, thicknesses[index], 24, 224);
      geometry.scale(1, 1, 0.62);
      const band = new THREE.Mesh(geometry, materials[index]);
      band.castShadow = true;
      band.receiveShadow = true;
      ring.add(band);
      if (index < 2) {
        const seamGeometry = new THREE.TorusGeometry(radius + 0.075, 0.013, 8, 192);
        for (const side of [-1, 1]) {
          const seam = new THREE.Mesh(seamGeometry, seamMaterial);
          seam.position.z = side * thicknesses[index] * 0.48;
          ring.add(seam);
        }
      }
      sculpture.add(ring);
      return ring;
    });

    const marks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.014, 0.085, 0.008),
      engravingMaterial,
      96,
    );
    const stamp = new THREE.Object3D();
    for (let index = 0; index < 48; index++) {
      const angle = index / 48 * Math.PI * 2;
      for (let side = 0; side < 2; side++) {
        stamp.position.set(Math.cos(angle) * radii[0], Math.sin(angle) * radii[0], side ? 0.089 : -0.089);
        stamp.rotation.z = angle - Math.PI / 2;
        stamp.scale.set(1, index % 4 === 0 ? 1.3 : 0.55, 1);
        stamp.updateMatrix();
        marks.setMatrixAt(index * 2 + side, stamp.matrix);
      }
    }
    marks.instanceMatrix.needsUpdate = true;
    rings[0].add(marks);

    const pearlMaterial = new THREE.MeshPhysicalMaterial({
      color: '#f4ead4', metalness: 0.13, roughness: 0.19,
      clearcoat: 1, clearcoatRoughness: 0.13,
    });
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.47, 48, 32), pearlMaterial);
    pearl.castShadow = true;
    sculpture.add(pearl);
    const equator = new THREE.Mesh(new THREE.TorusGeometry(0.476, 0.012, 8, 96), seamMaterial);
    equator.rotation.set(1.1, 0.3, 0.4);
    pearl.add(equator);

    const satellite = new THREE.Mesh(
      new THREE.SphereGeometry(0.245, 40, 28),
      new THREE.MeshPhysicalMaterial({
        color: '#ee692d', roughness: 0.21, metalness: 0.16,
        clearcoat: 1, clearcoatRoughness: 0.15,
      }),
    );
    satellite.castShadow = true;
    rings[0].add(satellite);
    const counterweight = new THREE.Mesh(new THREE.SphereGeometry(0.145, 32, 24), pearlMaterial);
    counterweight.castShadow = true;
    rings[1].add(counterweight);

    let phase = 0;
    let speed = 0.7;
    let spread = 1;
    let finish = finishes[0];
    const applyFinish = () => {
      materials.forEach((material, index) => {
        material.color.set(finish.colors[index]);
        material.metalness = finish.metalness;
        material.roughness = finish.roughness;
        material.clearcoat = finish.clearcoat;
      });
      caption.textContent = `01 / KINETIC OBJECT / ${finish.label.toUpperCase()}`;
      stage.invalidate();
    };
    applyFinish();

    const speedControl = controlRange(stage.controls, {
      label: 'Speed', min: 0, max: 1.8, step: 0.05, value: speed,
      format: (value) => `${value.toFixed(2)}x`,
      onChange: (value) => { speed = value; stage.invalidate(); },
    });
    const spreadControl = controlRange(stage.controls, {
      label: 'Ring spread', min: 0.7, max: 1.35, step: 0.01, value: spread,
      format: (value) => `${Math.round(value * 100)}%`,
      onChange: (value) => { spread = value; stage.invalidate(); },
    });
    const finishControl = controlSelect(stage.controls, {
      label: 'Material', value: finish.value, choices: finishes,
      onChange: (value) => {
        const next = finishes.find((choice) => choice.value === value);
        if (!next) throw new Error(`Unknown orbital material: ${value}`);
        finish = next;
        applyFinish();
        context.report(`${finish.label} selected. Drag the sculpture to explore its reflections.`);
      },
    });

    return {
      update(_elapsed, delta) {
        phase += delta * speed;
        sculpture.position.y = 3.35 + (spread - 1) * 2;
        sculpture.rotation.y = Math.sin(phase * 0.13) * 0.1;
        rings[0].rotation.set(-0.24 + phase * 0.13, 0.38 + phase * 0.21, 0.24 + phase * 0.045);
        rings[1].rotation.set(1.13 - phase * 0.24, -0.46 + phase * 0.12, -0.7 + phase * 0.09);
        rings[2].rotation.set(0.6 + phase * 0.18, 0.7 - phase * 0.29, 0.8 - phase * 0.16);
        rings[0].scale.setScalar(1 + (spread - 1) * 0.72);
        rings[1].scale.setScalar(1 + (spread - 1) * 0.42);
        const angle = phase * 0.47 + 2.1;
        satellite.position.set(Math.cos(angle) * radii[0], Math.sin(angle) * radii[0], 0);
        counterweight.position.set(
          Math.cos(-phase * 0.35 + 0.55) * radii[1],
          Math.sin(-phase * 0.35 + 0.55) * radii[1],
          0,
        );
        pearl.rotation.y = phase * 0.12;
      },
      reset() {
        phase = 0;
        setControlValue(speedControl, 0.7);
        setControlValue(spreadControl, 1);
        setControlValue(finishControl, 'alloy');
        orbit.reset();
        stage.invalidate();
        context.report('Orbital returned to its original composition.');
      },
    };
  });
}
