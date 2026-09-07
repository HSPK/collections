import * as THREE from 'three';
import { spatialExperiment, orbitView } from '../../core/spatial';
import type { SpatialStage } from '../../core/spatial';
import { canvas2D, pointerPosition } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { clamp, lerp, random } from '../../core/math';
import type { ProjectContext, ExperimentInstance } from '../../core/types';
import { CREW, DOORS, ROOMS, position, roomInfo } from './data';
import type { CrewId, Deck, RoomId, State } from './data';
import { route } from './engine';

export type ViewMode = 'iso' | 'upper' | 'lower' | 'plan';
export interface ShipSelection { room: RoomId; crew: CrewId; mode: ViewMode; planDeck: Deck }

export function createShipRenderer(context: ProjectContext, host: HTMLElement, initial: State, onPick: (room: RoomId) => void) {
  const spatialHost = document.createElement('div');
  spatialHost.className = 'al-webgl';
  const planHost = document.createElement('div');
  planHost.className = 'al-plan';
  planHost.hidden = true;
  const errorBox = document.createElement('p');
  errorBox.className = 'al-graphics-error';
  errorBox.hidden = true;
  errorBox.setAttribute('role', 'alert');
  host.append(spatialHost, planHost, errorBox);
  const controls = document.createElement('div');
  let state = initial;
  let selection: ShipSelection = { room: 'dock', crew: 'vale', mode: 'iso', planDeck: 0 };
  let stageRef: SpatialStage | undefined;
  let spatial: ExperimentInstance | undefined;
  let updateShip: (() => void) | undefined;
  let updateCamera: (() => void) | undefined;
  let reduced = context.reducedMotion;
  let externallyPaused = false;
  let animation = 1;
  let previousTick = initial.tick;
  const movement = new Map<CrewId, THREE.Vector3[]>();
  const plan = canvas2D(planHost, 'Explicit 2D deck plan. Select rooms by clicking or use the room selector in Orders.');
  const planLoop = createLoop(drawPlan, { paused: true });
  plan.canvas.addEventListener('canvasresize', () => planLoop.requestRender(), { signal: context.signal });
  plan.canvas.addEventListener('pointerdown', event => {
    const point = pointerPosition(event, plan.canvas);
    const location = planCoordinates();
    const angle = (Math.atan2(point.y - location.cy, point.x - location.cx) + Math.PI * 2) % (Math.PI * 2);
    const radius = Math.hypot(point.x - location.cx, point.y - location.cy);
    if (radius > location.radius * 0.4 && radius < location.radius * 1.18) {
      const room = ROOMS.find(room => room.deck === selection.planDeck && room.sector === Math.floor(angle / (Math.PI / 3)));
      if (room) onPick(room.id);
    }
  }, { signal: context.signal });
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const motionChange = () => {
    reduced = media.matches;
    if (reduced) animation = 1;
    spatial?.setPaused(reduced || externallyPaused || selection.mode === 'plan');
    stageRef?.invalidate();
  };
  media.addEventListener('change', motionChange, { signal: context.signal });

  try {
    spatial = spatialExperiment({ ...context, container: spatialHost, controls }, {
      label: 'Afterlight, a three-dimensional cutaway salvage ship. Drag to orbit; bracket keys select rooms; 1, 2, 3 select crew.',
      background: '#071018', camera: [19, 22, 22], target: [0, 0, 0], fov: 36, shadows: false,
      exposure: 1.35, pixelRatio: 1.5,
    }, stage => {
      stageRef = stage;
      const { scene } = stage;
      scene.fog = new THREE.FogExp2('#071018', 0.009);
      scene.add(new THREE.HemisphereLight('#bedfe8', '#182c38', 2.5));
      const key = new THREE.DirectionalLight('#e2f5ff', 3.4);
      key.position.set(8, 17, 6); scene.add(key);
      const rim = new THREE.DirectionalLight('#69cecf', 2.1);
      rim.position.set(-13, 8, -12); scene.add(rim);
      const warm = new THREE.DirectionalLight('#ff9275', 0.9);
      warm.position.set(7, -2, -12); scene.add(warm);
      const orbit = orbitView(stage, { minDistance: 23, maxDistance: 58, maxPolarAngle: Math.PI / 2.1 });
      const metal = new THREE.MeshStandardMaterial({ color: '#7c9199', roughness: 0.64, metalness: 0.65 });
      const dark = new THREE.MeshStandardMaterial({ color: '#1e3443', roughness: 0.75, metalness: 0.5 });
      const pale = new THREE.MeshStandardMaterial({ color: '#b3c2c6', roughness: 0.5, metalness: 0.4 });
      const cyan = new THREE.MeshBasicMaterial({ color: '#8eeded' });
      const coral = new THREE.MeshBasicMaterial({ color: '#ff7e6d' });
      const glass = new THREE.MeshStandardMaterial({ color: '#8ad2d8', roughness: 0.3, metalness: 0.5, transparent: true, opacity: 0.48 });
      [metal, dark, pale, cyan, coral, glass].forEach(material => stage.own(material));
      const decks = [new THREE.Group(), new THREE.Group()];
      decks.forEach(group => scene.add(group));
      const compartments = new Map<RoomId, { floor: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial>; furniture: THREE.Group; pool: THREE.Mesh; label: THREE.Sprite }>();
      const picks: THREE.Object3D[] = [];

      function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, xyz: [number, number, number]) {
        const result = new THREE.Mesh(geometry, material);
        result.position.set(...xyz);
        parent.add(result);
        return result;
      }
      function box(parent: THREE.Object3D, dimensions: [number, number, number], xyz: [number, number, number], material: THREE.Material = metal) {
        return mesh(new THREE.BoxGeometry(...dimensions), material, parent, xyz);
      }
      function torus(parent: THREE.Object3D, radius: number, tube: number, y: number, material: THREE.Material) {
        const ring = mesh(new THREE.TorusGeometry(radius, tube, 5, 80), material, parent, [0, y, 0]);
        ring.rotation.x = Math.PI / 2;
        return ring;
      }
      function roomLabel(code: string, name: string) {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#d9eded';
        ctx.font = '500 60px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(code, 256, 57);
        ctx.font = '32px sans-serif'; ctx.fillStyle = '#a4bbc6';
        ctx.fillText(name.toUpperCase(), 256, 107);
        const texture = stage.own(new THREE.CanvasTexture(canvas));
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
        sprite.scale.set(5, 1.25, 1);
        sprite.renderOrder = 8;
        return sprite;
      }

      for (const room of ROOMS) {
        const group = decks[room.deck];
        const y = position(room.id)[1];
        const start = room.sector * Math.PI / 3 + 0.038;
        const end = (room.sector + 1) * Math.PI / 3 - 0.038;
        const shape = new THREE.Shape();
        shape.moveTo(Math.cos(start) * 4.5, -Math.sin(start) * 4.5);
        for (let step = 0; step <= 14; step++) {
          const angle = lerp(start, end, step / 14);
          shape.lineTo(Math.cos(angle) * 9.1, -Math.sin(angle) * 9.1);
        }
        for (let step = 14; step >= 0; step--) {
          const angle = lerp(start, end, step / 14);
          shape.lineTo(Math.cos(angle) * 4.5, -Math.sin(angle) * 4.5);
        }
        shape.closePath();
        const floor = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.05, bevelSegments: 1, steps: 1 }),
          new THREE.MeshStandardMaterial({ color: '#485f6b', roughness: 0.72, metalness: 0.6, emissive: '#103c46', emissiveIntensity: 0.2 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = y;
        floor.userData.room = room.id;
        picks.push(floor);
        group.add(floor);
        const furniture = new THREE.Group();
        furniture.position.set(...position(room.id));
        furniture.rotation.y = -room.sector * Math.PI / 3 - Math.PI / 6;
        group.add(furniture);

        for (let panel = 0; panel < 7; panel++) {
          const angle = lerp(start, end, (panel + 0.5) / 7);
          const wall = box(group, [1.12, panel % 3 === 1 ? 0.7 : 1.12, 0.16],
            [Math.cos(angle) * 9, y + 0.7, Math.sin(angle) * 9], panel % 3 === 1 ? glass : metal);
          wall.rotation.y = Math.PI / 2 - angle;
          const rib = box(group, [0.1, 1.42, 0.2], [Math.cos(angle) * 9.03, y + 0.9, Math.sin(angle) * 9.03], dark);
          rib.rotation.y = Math.PI / 2 - angle;
          const stripe = box(group, [0.8, 0.035, 0.04], [Math.cos(angle) * 8.88, y + 0.37, Math.sin(angle) * 8.88], cyan);
          stripe.rotation.y = Math.PI / 2 - angle;
        }
        for (let stripe = 0; stripe < 4; stripe++) {
          box(furniture, [2.7, 0.015, 0.028], [0.1, 0.38, (stripe - 1.5) * 0.47], dark);
        }
        box(furniture, [0.95, 0.55, 1.5], [1.05, 0.65, -0.25], dark);
        box(furniture, [0.91, 0.05, 1.42], [1.05, 0.94, -0.25], pale);
        box(furniture, [0.54, 0.05, 0.63], [1.05, 0.98, -0.42], cyan);
        if (room.id === 'medbay' || room.id === 'cryo') {
          for (let pod = 0; pod < 2; pod++) {
            box(furniture, [1, 0.38, 1.8], [-0.8, 0.55, pod * 2 - 0.9], pale);
            const capsule = mesh(new THREE.CapsuleGeometry(0.38, 0.9, 4, 10), glass, furniture, [-0.8, 0.95, pod * 2 - 0.9]);
            capsule.rotation.x = Math.PI / 2;
            box(furniture, [0.6, 0.06, 0.12], [-0.8, 1.32, pod * 2 - 0.9], cyan);
          }
        } else if (room.id === 'reactor' || room.id === 'life') {
          mesh(new THREE.CylinderGeometry(0.8, 1, 1.35, 16), dark, furniture, [-0.7, 1.04, 0]);
          for (let ring = 0; ring < 4; ring++) {
            const coil = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.05, 5, 24), ring === 2 ? cyan : pale);
            coil.rotation.x = Math.PI / 2; coil.position.set(-0.7, 0.6 + ring * 0.32, 0); furniture.add(coil);
          }
        } else if (room.id === 'archive' || room.id === 'relay') {
          for (let rack = 0; rack < 3; rack++) {
            box(furniture, [0.6, 1.2, 0.72], [-0.8, 0.95, (rack - 1) * 1.02], dark);
            for (let led = 0; led < 4; led++) box(furniture, [0.04, 0.045, 0.43], [-0.48, 0.63 + led * 0.23, (rack - 1) * 1.02], cyan);
          }
        } else {
          for (let crate = 0; crate < 3; crate++) box(furniture, [0.62, 0.6 + (crate % 2) * 0.35, 0.74], [-0.9, 0.67, (crate - 1) * 1.12], crate % 2 ? pale : dark);
        }
        const poolMaterial = new THREE.MeshBasicMaterial({ color: '#76e8e5', transparent: true, opacity: 0.095, depthWrite: false, side: THREE.DoubleSide });
        const pool = mesh(new THREE.ConeGeometry(1.45, 2.7, 20, 1, true), poolMaterial, furniture, [-0.3, 1.8, 0]);
        const halo = mesh(new THREE.CircleGeometry(1.5, 32), new THREE.MeshBasicMaterial({ color: '#58e1d7', transparent: true, opacity: 0.12, depthWrite: false }), furniture, [-0.3, 0.38, 0]);
        halo.rotation.x = -Math.PI / 2;
        const label = roomLabel(room.code, room.name.replace(' / 01', ''));
        const [x, , z] = position(room.id);
        label.position.set(x * 1.37, y + 0.7, z * 1.37);
        group.add(label);
        compartments.set(room.id, { floor, furniture, pool, label });
      }
      for (const deck of [0, 1] as const) {
        const y = deck === 0 ? 2.2 : -2.2;
        torus(decks[deck], 9.27, 0.12, y - 0.14, pale);
        torus(decks[deck], 4.33, 0.13, y - 0.05, metal);
        torus(decks[deck], 9.32, 0.04, y - 0.4, cyan);
        torus(decks[deck], 4.3, 0.04, y + 0.25, cyan);
      }
      const spine = new THREE.Group(); scene.add(spine);
      mesh(new THREE.CylinderGeometry(1.13, 1.13, 6.4, 20, 1, true), dark, spine, [0, 0, 0]);
      for (let ring = 0; ring < 8; ring++) torus(spine, 1.2, 0.08, ring * 0.78 - 2.7, ring % 3 ? metal : cyan);
      for (const deck of [0, 1] as const) {
        const y = deck ? -2.25 : 2.15;
        for (let spoke = 0; spoke < 3; spoke++) {
          const angle = spoke * Math.PI * 2 / 3 + Math.PI / 6;
          const beam = box(decks[deck], [5.1, 0.18, 0.4], [Math.cos(angle) * 2.9, y, Math.sin(angle) * 2.9], metal);
          beam.rotation.y = -angle;
        }
      }
      const doors = new Map<string, THREE.Mesh>();
      for (const door of DOORS) {
        const a = new THREE.Vector3(...position(door.a));
        const b = new THREE.Vector3(...position(door.b));
        const midpoint = a.clone().lerp(b, 0.5);
        const material = new THREE.MeshStandardMaterial({ color: '#e6ad80', emissive: '#a44626', emissiveIntensity: 0.15, roughness: 0.65, metalness: 0.6 });
        const gate = new THREE.Mesh(new THREE.BoxGeometry(door.lift ? 0.5 : 0.14, door.lift ? 4.1 : 0.85, door.lift ? 0.5 : 1.9), material);
        gate.position.copy(midpoint); gate.position.y += door.lift ? 0 : 0.7;
        if (!door.lift) gate.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
        gate.userData.room = door.a;
        scene.add(gate); doors.set(door.id, gate); picks.push(gate);
      }
      const breach = new THREE.Group();
      breach.position.set(...position('ballast'));
      scene.add(breach);
      for (let shard = 0; shard < 7; shard++) {
        const part = box(breach, [0.12, 0.3 + shard * 0.11, 0.4], [Math.cos(shard) * 0.9, 0.9, Math.sin(shard) * 0.9], coral);
        part.rotation.set(shard * 0.6, shard, 0.7);
      }
      const crewMeshes = new Map<CrewId, THREE.Group>();
      for (const member of CREW) {
        const figure = new THREE.Group();
        const suit = new THREE.MeshStandardMaterial({ color: member.color, roughness: 0.65, metalness: 0.3, emissive: member.color, emissiveIntensity: 0.25 });
        mesh(new THREE.CapsuleGeometry(0.18, 0.26, 3, 7), suit, figure, [0, 0.45, 0]);
        mesh(new THREE.SphereGeometry(0.2, 10, 7), pale, figure, [0, 0.83, 0]);
        box(figure, [0.3, 0.11, 0.12], [0, 0.86, 0.16], dark);
        box(figure, [0.2, 0.35, 0.18], [0, 0.5, -0.22], dark);
        const ring = mesh(new THREE.TorusGeometry(0.39, 0.035, 5, 24), new THREE.MeshBasicMaterial({ color: member.color }), figure, [0, 0.16, 0]);
        ring.rotation.x = Math.PI / 2;
        const marker = mesh(new THREE.ConeGeometry(0.13, 0.26, 3), new THREE.MeshBasicMaterial({ color: member.color, depthTest: false }), figure, [0, 1.45, 0]);
        marker.rotation.z = Math.PI;
        marker.renderOrder = 9;
        scene.add(figure); crewMeshes.set(member.id, figure);
      }
      const accepted = new THREE.Group(); scene.add(accepted);
      const evacuation = new THREE.Group(); scene.add(evacuation);
      function clearLines(group: THREE.Group) {
        for (const child of [...group.children]) {
          if (child instanceof THREE.Line) {
            child.geometry.dispose();
            if (!Array.isArray(child.material)) child.material.dispose();
          }
          group.remove(child);
        }
      }
      function line(group: THREE.Group, path: RoomId[], color: string, dashed: boolean) {
        if (path.length < 2) return;
        const points = path.map(id => new THREE.Vector3(...position(id)).add(new THREE.Vector3(0, 0.48, 0)));
        const material = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.35, gapSize: 0.22, transparent: true, opacity: 0.7, depthTest: false }) :
          new THREE.LineBasicMaterial({ color, depthTest: false });
        const trace = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
        trace.computeLineDistances(); trace.renderOrder = 6; group.add(trace);
      }
      const rng = random(78);
      const positions = new Float32Array(120 * 3);
      for (let i = 0; i < positions.length; i++) positions[i] = (rng() - 0.5) * 55;
      const dust = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)),
        new THREE.PointsMaterial({ color: '#96b9c4', size: 0.045, transparent: true, opacity: 0.58, depthWrite: false }));
      scene.add(dust);
      const raycaster = new THREE.Raycaster();
      let down = { x: 0, y: 0 };
      stage.canvas.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY }; }, { signal: stage.signal });
      stage.canvas.addEventListener('pointerup', event => {
        if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
        const rect = stage.canvas.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), stage.camera);
        const hit = raycaster.intersectObjects(picks).find(hit => {
          const id = hit.object.userData.room as RoomId;
          return selection.mode === 'iso' || roomInfo(id).deck === (selection.mode === 'lower' ? 1 : 0);
        });
        if (hit) onPick(hit.object.userData.room as RoomId);
      }, { signal: stage.signal });
      updateCamera = () => {
        if (selection.mode === 'plan') return;
        const deckMode = selection.mode !== 'iso';
        const targetY = selection.mode === 'lower' ? -2.2 : 2.2;
        orbit.target.set(0, deckMode ? targetY : 0, 0);
        if (deckMode) stage.camera.position.set(0.1, targetY + 29, 12);
        else stage.camera.position.set(19, 22, 22);
        orbit.update();
        stage.invalidate();
      };
      updateShip = () => {
        for (const room of state.rooms) {
          const item = compartments.get(room.id)!;
          item.floor.material.color.set(!room.known ? '#182630' : room.id === selection.room ? '#719ba5' : room.pressure < 35 ? '#744e4b' : '#4f6773');
          item.floor.material.emissive.set(room.id === selection.room ? '#267e8a' : '#082b35');
          item.floor.material.emissiveIntensity = room.id === selection.room ? 0.55 : 0.2;
          item.furniture.visible = room.known;
          item.pool.visible = room.pressure >= 35;
          item.label.material.opacity = room.known ? 1 : 0.42;
        }
        decks[0].visible = selection.mode !== 'lower';
        decks[1].visible = selection.mode !== 'upper';
        spine.visible = selection.mode === 'iso';
        breach.visible = !state.repaired.breach && selection.mode !== 'upper';
        for (const door of DOORS) {
          const gate = doors.get(door.id)!;
          gate.visible = selection.mode === 'iso' || (!door.lift && roomInfo(door.a).deck === (selection.mode === 'lower' ? 1 : 0));
          const open = state.orders.doors.find(entry => entry.id === door.id)!.open;
          gate.scale.y = door.lift ? 1 : open ? 0.1 : 1;
          (gate.material as THREE.MeshStandardMaterial).color.set(open ? '#538088' : '#f8a97f');
        }
        for (const crew of state.crew) {
          crewMeshes.get(crew.id)!.visible = selection.mode === 'iso' || roomInfo(crew.room).deck === (selection.mode === 'lower' ? 1 : 0);
        }
        clearLines(accepted); clearLines(evacuation);
        for (const job of state.jobs) {
          if (selection.mode === 'iso' || job.path.every(id => roomInfo(id).deck === (selection.mode === 'lower' ? 1 : 0))) {
            line(accepted, job.path, CREW.find(crew => crew.id === job.crew)!.color, false);
          }
        }
        const selectedCrew = state.crew.find(crew => crew.id === selection.crew)!;
        const path = route(state, selectedCrew.room, 'dock');
        if (selection.mode === 'iso' || path.every(id => roomInfo(id).deck === (selection.mode === 'lower' ? 1 : 0))) line(evacuation, path, '#cadce2', true);
        stage.invalidate();
      };
      updateShip();
      return {
        update(elapsed, delta) {
          animation = reduced ? 1 : clamp(animation + delta * 0.75, 0, 1);
          for (const [index, crew] of state.crew.entries()) {
            const figure = crewMeshes.get(crew.id)!;
            const path = movement.get(crew.id);
            let point = new THREE.Vector3(...position(crew.room));
            if (path && path.length > 1 && animation < 1) {
              const progress = animation * (path.length - 1);
              const segment = Math.min(path.length - 2, Math.floor(progress));
              point = path[segment].clone().lerp(path[segment + 1], progress - segment);
            }
            figure.position.copy(point).add(new THREE.Vector3((index - 1) * 0.58, 0.38, (index % 2) * 0.5));
            figure.rotation.y = Math.PI / 4;
          }
          if (!reduced) {
            dust.rotation.y = elapsed * 0.007;
            breach.rotation.y = Math.sin(elapsed * 0.4) * 0.08;
          }
        },
      };
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('needs WebGL 2')) throw error;
    errorBox.textContent = `${error.message} Choose the explicitly labelled "2D plan" view to play without WebGL.`;
    errorBox.hidden = false;
    context.report(errorBox.textContent);
  }

  function planCoordinates() {
    return { cx: plan.size.width / 2, cy: plan.size.height / 2, radius: Math.min(plan.size.width * 0.37, plan.size.height * 0.37) };
  }
  function drawPlan() {
    const { context: ctx, size } = plan;
    const { cx, cy, radius } = planCoordinates();
    ctx.fillStyle = '#08141e'; ctx.fillRect(0, 0, size.width, size.height);
    ctx.strokeStyle = '#17303a'; ctx.lineWidth = 1;
    for (let x = 0; x < size.width; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size.height); ctx.stroke(); }
    for (let y = 0; y < size.height; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size.width, y); ctx.stroke(); }
    const point = (id: RoomId, factor = 0.78) => {
      const angle = roomInfo(id).sector * Math.PI / 3 + Math.PI / 6;
      return { x: cx + Math.cos(angle) * radius * factor, y: cy + Math.sin(angle) * radius * factor };
    };
    for (const room of ROOMS.filter(room => room.deck === selection.planDeck)) {
      const data = state.rooms.find(entry => entry.id === room.id)!;
      const start = room.sector * Math.PI / 3 + 0.035;
      const end = (room.sector + 1) * Math.PI / 3 - 0.035;
      ctx.beginPath(); ctx.arc(cx, cy, radius, start, end); ctx.arc(cx, cy, radius * 0.45, end, start, true); ctx.closePath();
      ctx.fillStyle = !data.known ? '#10222d' : room.id === selection.room ? '#2c5965' : data.pressure < 35 ? '#623e3d' : '#29414e';
      ctx.fill(); ctx.strokeStyle = room.id === selection.room ? '#a3edec' : '#577682'; ctx.lineWidth = room.id === selection.room ? 2 : 1; ctx.stroke();
      const label = point(room.id, 1.16);
      ctx.fillStyle = data.known ? '#deeeee' : '#89a2af';
      ctx.font = '14px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(room.code, label.x, label.y);
      const pressure = point(room.id, 0.73);
      ctx.font = '14px sans-serif'; ctx.fillStyle = '#b2d2da'; ctx.fillText(data.known ? `${data.pressure}%` : '?', pressure.x, pressure.y);
    }
    for (const door of DOORS) {
      if (roomInfo(door.a).deck !== selection.planDeck || roomInfo(door.b).deck !== selection.planDeck) continue;
      const a = point(door.a), b = point(door.b);
      const open = state.orders.doors.find(entry => entry.id === door.id)!.open;
      ctx.strokeStyle = open ? '#8dd2d5' : '#ff9f83'; ctx.lineWidth = open ? 2 : 5;
      ctx.setLineDash(open ? [3, 5] : []);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    const selectedCrew = state.crew.find(crew => crew.id === selection.crew)!;
    const exit = route(state, selectedCrew.room, 'dock');
    ctx.strokeStyle = '#e9f4f2'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    for (let index = 1; index < exit.length; index++) {
      if ([exit[index - 1], exit[index]].some(id => roomInfo(id).deck !== selection.planDeck)) continue;
      const a = point(exit[index - 1]), b = point(exit[index]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const job of state.jobs) {
      ctx.strokeStyle = CREW.find(crew => crew.id === job.crew)!.color;
      ctx.lineWidth = 3;
      for (let index = 1; index < job.path.length; index++) {
        if ([job.path[index - 1], job.path[index]].some(id => roomInfo(id).deck !== selection.planDeck)) continue;
        const a = point(job.path[index - 1]), b = point(job.path[index]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    state.crew.forEach((crew, index) => {
      if (roomInfo(crew.room).deck !== selection.planDeck) return;
      const p = point(crew.room, 0.68);
      p.x += (index - 1) * 13;
      ctx.fillStyle = CREW[index].color; ctx.beginPath(); ctx.arc(p.x, p.y + 20, 6, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = '#aac1cc'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`DECK ${selection.planDeck === 0 ? 'A' : 'B'}`, cx, cy - 8);
    ctx.fillStyle = '#79c4c6'; ctx.fillText('2D PLAN', cx, cy + 13);
  }

  return {
    set(next: State, selected: ShipSelection) {
      if (next.tick !== previousTick || next.seed !== state.seed) {
        movement.clear();
        for (const job of next.jobs) movement.set(job.crew, job.path.map(id => new THREE.Vector3(...position(id))));
        animation = reduced ? 1 : 0;
        previousTick = next.tick;
      }
      const cameraChanged = selection.mode !== selected.mode;
      state = next; selection = { ...selected };
      spatialHost.hidden = selected.mode === 'plan';
      planHost.hidden = selected.mode !== 'plan';
      if (!spatial) errorBox.hidden = selected.mode === 'plan';
      spatial?.setPaused(reduced || externallyPaused || selected.mode === 'plan');
      if (cameraChanged) updateCamera?.();
      updateShip?.(); planLoop.requestRender();
    },
    setPaused(paused: boolean) {
      externallyPaused = paused;
      spatial?.setPaused(paused || reduced || selection.mode === 'plan');
    },
    destroy() {
      media.removeEventListener('change', motionChange);
      planLoop.destroy(); plan.dispose(); spatial?.destroy();
      spatialHost.remove(); planHost.remove(); errorBox.remove();
    },
  };
}
