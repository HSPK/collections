import './style.css';
import { createProjectPage, downloadText, escapeMarkup, query, readLocalData, writeLocalData } from '../../core/page';
import { createLoop } from '../../core/loop';
import { clamp } from '../../core/math';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { makeLayout, PRESETS, PROFILES } from './presets';
import { History, deserialize, serialize } from './state';
import { LayoutError, MAX_EXPANSIONS, floorOf, pickEndpoint, portalIssue, radiusOf } from './world';
import type { Layout } from './world';
import { floorAt, Search } from './search';
import type { SearchResult } from './search';
import { buildRoute, poseAtTime, timeAtDistance } from './route';
import type { Route } from './route';
import { planMarkup, svgPoint, updatePlanPose } from './plan';
import { createBuildingScene } from './scene';
import type { Interaction } from './scene';
import { instructionMarkup, roomOptions, workbenchMarkup } from './ui';

let nextId = 0;
const SNAPSHOT = 'passage-layout-v1';
export async function mount(context: ProjectContext): Promise<ProjectInstance> {
  const page = createProjectPage(context, 'passage'), id = `passage-${++nextId}`;
  page.root.setAttribute('aria-labelledby', `${id}-title`);
  page.root.innerHTML = workbenchMarkup(id);
  const get = <T extends Element>(selector: string) => query<T>(page.root, selector);
  const el = <T extends Element>(name: string) => get<T>(`[data-passage-${name}]`);
  const text = (name: string, value: string) => { el<HTMLElement>(name).textContent = value; };
  const listen = (name: string, event: string, action: (event: Event) => void) => el<HTMLElement>(name).addEventListener(event, action, { signal: page.signal });
  const history = new History(makeLayout());
  let floor = 'g', exploded = true, interaction: Interaction = 'camera', selectedObject = 'g-shelf-a';
  let route: Route | null = null, result: SearchResult | null = null, search: Search | null = null;
  let epoch = 0, job = 0, pendingResolve: (() => void) | null = null, running = false, walkTime = 0, speed = 1;
  let changeReason = 'Open house.', currentInstruction = -1, preset = 'open', disposed = false;
  let cursor = { x: 3.25, z: 15.25 };
  let planZoom = 1, planCenter = { x: 13, z: 10 };
  const planHost = el<HTMLElement>('plan');
  const announce = (message: string, error = false) => {
    text('status', message);
    page.root.classList.toggle('passage-has-error', error);
    if (error) page.report(message);
  };
  const walkLoop = createLoop((_elapsed, delta) => {
    if (!running || !route) return;
    walkTime = Math.min(route.duration, walkTime + delta * speed);
    followPose();
    updateWalk();
    if (walkTime >= route.duration) stopWalk();
  }, { paused: true });
  page.onCleanup(walkLoop.destroy);
  const scene = createBuildingScene(el<HTMLElement>('space'), page.signal, pick, (message) => { stopWalk(); announce(message, true); });
  page.onCleanup(scene.destroy);

  function stopWalk() {
    running = false; walkLoop.setPaused(true);
    text('walk', 'Walk route'); page.root.dataset.walkState = 'paused';
  }
  function cancelJob() {
    epoch++; window.clearTimeout(job); job = 0;
    search?.cancel(); pendingResolve?.(); pendingResolve = null;
  }
  page.onCleanup(() => { disposed = true; cancelJob(); });

  function updateWalk() {
    const pose = route ? poseAtTime(route, walkTime) : null;
    scene.pose(pose); updatePlanPose(planHost, history.current, floor, pose);
    const scrub = el<HTMLInputElement>('scrub');
    // The final position must remain reachable when native range steps round values.
    scrub.max = String(route ? Math.ceil(route.distance * 100) / 100 || 1 : 1);
    scrub.value = String(pose?.kind === 'arrive' ? Number(scrub.max) : pose?.distance ?? 0);
    scrub.setAttribute('aria-valuetext', `${(pose?.distance ?? 0).toFixed(1)} metres; ${walkTime.toFixed(1)} seconds; ${pose?.kind ?? 'no route'}`);
    text('walk-readout', `${(pose?.distance ?? 0).toFixed(1)} m / ${walkTime.toFixed(1)} s`);
    text('pose-readout', pose ? `X ${pose.point.x.toFixed(2)} · Y ${pose.point.y.toFixed(2)} · Z ${pose.point.z.toFixed(2)} m${pose.kind === 'wait' ? ' · waiting for lift' : ''}` : 'No active walking position');
    page.root.dataset.walkTime = walkTime.toFixed(3);
    page.root.dataset.walkY = (pose?.point.y ?? 0).toFixed(3);
    page.root.dataset.walkKind = pose?.kind ?? 'none';
    const nextInstruction = route ? route.instructions.reduce((found, instruction, index) => instruction.time <= walkTime + .0001 ? index : found, -1) : -1;
    if (nextInstruction !== currentInstruction) {
      currentInstruction = nextInstruction;
      text('current-step', route && nextInstruction >= 0 ? route.instructions[nextInstruction].text : 'Choose a journey to inspect its turns and floor changes.');
      for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-passage-instruction]')) {
        button.setAttribute('aria-current', Number(button.dataset.passageInstruction) === nextInstruction ? 'step' : 'false');
      }
    }
  }
  function drawPlan() {
    planHost.innerHTML = planMarkup(history.current, floor, route,
      { clearance: el<HTMLInputElement>('clearance').checked, selected: selectedObject });
    updatePlanView();
    updateWalk();
  }
  function updatePlanView() {
    const { world } = history.current, width = (world.width + 2) / planZoom, depth = (world.depth + 2) / planZoom;
    planCenter.x = clamp(planCenter.x, -1 + width / 2, world.width + 1 - width / 2);
    planCenter.z = clamp(planCenter.z, -1 + depth / 2, world.depth + 1 - depth / 2);
    query<SVGSVGElement>(planHost, 'svg').setAttribute('viewBox', `${planCenter.x - width / 2} ${planCenter.z - depth / 2} ${width} ${depth}`);
    text('plan-zoom', `${planZoom.toFixed(1)}×`);
    el<HTMLButtonElement>('zoom-out').disabled = planZoom <= 1;
    el<HTMLButtonElement>('zoom-in').disabled = planZoom >= 3.5;
  }
  function followPose() {
    if (!route) return;
    const pose = poseAtTime(route, walkTime), nextFloor = floorAt(history.current.world, pose.point);
    if (nextFloor !== floor) changeFloor(nextFloor);
  }
  function updateScene() {
    scene.update(history.current, route, { floor, exploded, interaction }); updateWalk();
  }
  function populateSelect(select: HTMLSelectElement, html: string, value: string) {
    if (select.dataset.options !== html) { select.innerHTML = html; select.dataset.options = html; }
    select.value = value;
  }
  function updateObjectFields() {
    const obstacle = history.current.world.obstacles.find((item) => item.id === selectedObject);
    for (const key of ['x', 'z', 'w', 'd'] as const) {
      const input = el<HTMLInputElement>(`object-${key}`);
      input.value = obstacle ? String(obstacle[key]) : ''; input.disabled = !obstacle;
    }
    el<HTMLButtonElement>('apply-object').disabled = !obstacle;
    el<HTMLButtonElement>('remove-object').disabled = !obstacle;
  }
  function updateEditor() {
    const { world, profile } = history.current;
    el<HTMLInputElement>('diameter').value = String(profile.radius * 2);
    el<HTMLInputElement>('margin').value = String(profile.margin);
    el<HTMLInputElement>('stepfree').checked = profile.stepFree;
    el<HTMLSelectElement>('objective').value = history.current.objective;
    text('profile-note', `Effective radius: ${radiusOf(profile).toFixed(2)} m. Walking ${profile.speed.toFixed(2)} m/s; stairs ${profile.stairSpeed.toFixed(2)} m/s. Comfort cost adds ${profile.stairPenalty.toFixed(2)} × stair distance and 0.2 × lift wait. Changes stop the walk.`);
    const doors = world.doors.filter((door) => world.walls.find((wall) => wall.id === door.wall)!.floor === floor);
    const doorHost = el<HTMLElement>('doors'), signature = doors.map((door) => `${door.id}:${door.name}`).join('|');
    if (doorHost.dataset.signature !== signature) {
      doorHost.innerHTML = doors.map((door) => `<div><label class="passage-check"><input type="checkbox" data-passage-door="${door.id}">${escapeMarkup(door.name)}</label><label class="passage-width-label">m<input type="number" min=".4" max="4" step=".05" data-passage-door-width="${door.id}" aria-label="${escapeMarkup(door.name)} width in metres"></label></div>`).join('');
      doorHost.dataset.signature = signature;
    }
    doors.forEach((door) => {
      get<HTMLInputElement>(`[data-passage-door="${door.id}"]`).checked = door.open;
      get<HTMLInputElement>(`[data-passage-door-width="${door.id}"]`).value = String(door.width);
    });
    const portalHost = el<HTMLElement>('portals'), portalSignature = world.portals.map((portal) => `${portal.id}:${portal.name}`).join('|');
    if (portalHost.dataset.signature !== portalSignature) {
      portalHost.innerHTML = world.portals.map((portal) => `<div><label class="passage-check"><input type="checkbox" data-passage-portal="${portal.id}">${escapeMarkup(portal.name)}</label><small data-passage-portal-note="${portal.id}"></small></div>`).join('');
      portalHost.dataset.signature = portalSignature;
    }
    world.portals.forEach((portal) => {
      get<HTMLInputElement>(`[data-passage-portal="${portal.id}"]`).checked = portal.open;
      get<HTMLElement>(`[data-passage-portal-note="${portal.id}"]`).textContent = portalIssue(world, portal, profile) ??
        `${portal.width.toFixed(2)} m clear · ${portal.kind === 'lift' ? `${portal.wait} s wait` : 'switchback flight'}`;
    });
    const objects = world.obstacles.filter((item) => item.floor === floor);
    if (!objects.some((item) => item.id === selectedObject)) selectedObject = objects[0]?.id ?? '';
    populateSelect(el<HTMLSelectElement>('object'), objects.map((item) => `<option value="${item.id}">${escapeMarkup(item.name)}</option>`).join(''), selectedObject);
    updateObjectFields();
  }
  function refresh() {
    const layout = history.current;
    text('building-name', layout.world.name);
    text('building-note', `${layout.world.floors.length} levels · ${layout.world.width} × ${layout.world.depth} m · Fictional architecture, real spatial constraints.`);
    text('building-scale', `${layout.world.width} × ${layout.world.depth} m / ${layout.world.floors.length} LEVELS`);
    if (!layout.world.floors.some((item) => item.id === floor)) floor = layout.world.floors[0].id;
    for (const endpoint of ['start', 'end'] as const) {
      const options = roomOptions(layout, endpoint);
      populateSelect(el<HTMLSelectElement>(endpoint), options.html, options.value);
    }
    populateSelect(el<HTMLSelectElement>('floor'), layout.world.floors.map((item) => `<option value="${item.id}">${escapeMarkup(item.name)}</option>`).join(''), floor);
    el<HTMLSelectElement>('profile').value = PROFILES.some((profile) => profile.id === layout.profile.id) ? layout.profile.id : 'custom';
    el<HTMLButtonElement>('undo').disabled = !history.canUndo;
    el<HTMLButtonElement>('redo').disabled = !history.canRedo;
    text('distance', route ? route.distance.toFixed(1) : '—');
    text('duration', route ? route.duration.toFixed(0) : '—');
    text('cost', route ? route.cost.toFixed(1) : '—');
    text('cost-label', layout.objective === 'comfort' ? 'cost / m-eq' : 'graph cost / m');
    text('route-badge', result?.status === 'found' ? `${layout.objective === 'comfort' ? 'Comfort' : 'Distance'} route` : result?.status ?? 'Searching');
    text('instruction-count', route ? `(${route.instructions.length})` : '');
    el<HTMLElement>('instructions').innerHTML = instructionMarkup(route, layout);
    el<HTMLElement>('no-route').hidden = result === null || result.status === 'found';
    for (const name of ['walk', 'step', 'rewind', 'scrub']) el<HTMLButtonElement | HTMLInputElement>(name).disabled = !route || route.distance === 0;
    el<HTMLButtonElement>('cancel').hidden = result !== null;
    el<HTMLButtonElement>('recompute').hidden = result?.status !== 'cancelled' && result?.status !== 'budget';
    page.root.dataset.routeStatus = result?.status ?? 'searching';
    page.root.dataset.revision = String(history.revision);
    currentInstruction = -1;
    updateEditor(); updateScene(); drawPlan();
  }
  function recompute(): Promise<void> {
    stopWalk(); cancelJob();
    route = null; result = null; walkTime = 0;
    const token = epoch;
    search = new Search(history.current);
    refresh();
    announce(`${changeReason} Computing a clearance-safe route…`);
    return new Promise((resolve) => {
      pendingResolve = resolve;
      const pump = () => {
        if (disposed || page.signal.aborted || token !== epoch || !search) { resolve(); return; }
        result = search.step(180);
        text('progress', `${search.expanded.toLocaleString('en-US')} / ${MAX_EXPANSIONS.toLocaleString('en-US')} expansions`);
        if (!result) { job = window.setTimeout(pump, 0); return; }
        job = 0;
        if (result.status === 'found') route = buildRoute(history.current, result);
        refresh();
        announce(`${changeReason} ${result.message}`, result.status !== 'found');
        page.root.dataset.ready = 'true';
        pendingResolve = null; resolve();
      };
      job = window.setTimeout(pump, 0);
    });
  }
  function perform(change: () => void, reason: string, study = 'custom') {
    stopWalk();
    try {
      change(); changeReason = reason; el<HTMLSelectElement>('preset').value = study;
      void recompute();
    } catch (error) {
      if (!(error instanceof LayoutError)) throw error;
      announce(error.message, true);
    }
  }
  function edit(change: (draft: Layout) => void, reason: string) { perform(() => history.edit(change), reason); }
  function pick(x: number, z: number) {
    if (interaction === 'camera') { announce('Choose Pick start A or Pick destination B before selecting a point.'); return; }
    try {
      const endpoint = pickEndpoint(history.current.world, floor, x, z, history.current.profile);
      const target = interaction;
      edit((draft) => { draft[target] = endpoint; }, `${target === 'start' ? 'Start' : 'Destination'} picked at ${endpoint.x.toFixed(2)}, ${endpoint.z.toFixed(2)} m on ${floorOf(history.current.world, floor).name}.`);
    } catch (error) {
      if (!(error instanceof LayoutError)) throw error;
      announce(error.message, true);
    }
  }
  function changeFloor(value: string) {
    floor = value; el<HTMLSelectElement>('floor').value = floor;
    cursor = { x: history.current.world.width / 2 + .25, z: 14.25 };
    updateEditor(); updateScene(); drawPlan();
  }
  function pane(value: string) {
    el<HTMLElement>('workbench').dataset.pane = value;
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-passage-pane]')) button.setAttribute('aria-pressed', String(button.dataset.passagePane === value));
  }
  page.root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLButtonElement>('button');
    if (target?.dataset.passagePane) pane(target.dataset.passagePane);
    if (target?.dataset.passageInstruction !== undefined && route) {
      const instruction = route.instructions[Number(target.dataset.passageInstruction)];
      stopWalk(); walkTime = instruction.time; changeFloor(instruction.floor); updateWalk();
    }
  }, { signal: page.signal });
  for (const endpoint of ['start', 'end'] as const) listen(endpoint, 'change', () => {
    const room = history.current.world.rooms.find((item) => item.id === el<HTMLSelectElement>(endpoint).value);
    if (!room) { announce('Select a known landmark or pick a valid point on the plan.', true); return; }
    edit((draft) => { draft[endpoint] = { ...room.point }; }, `${endpoint === 'start' ? 'Start' : 'Destination'} changed to ${room.name}.`);
  });
  listen('swap', 'click', () => edit((draft) => { [draft.start, draft.end] = [draft.end, draft.start]; }, 'Journey reversed.'));
  listen('preset', 'change', () => {
    preset = el<HTMLSelectElement>('preset').value;
    perform(() => history.commit(makeLayout(preset)), PRESETS.find((item) => item.id === preset)!.note, preset);
  });
  listen('profile', 'change', () => {
    const profile = PROFILES.find((item) => item.id === el<HTMLSelectElement>('profile').value);
    if (profile) edit((draft) => { draft.profile = { ...profile }; }, `${profile.name} mobility selected.`);
    else { pane('edit'); announce('Adjust body diameter, margin, or step-free travel in Edit to make a custom profile.'); }
  });
  listen('floor', 'change', () => changeFloor(el<HTMLSelectElement>('floor').value));
  listen('interaction', 'change', () => {
    const value = el<HTMLSelectElement>('interaction').value;
    if (value !== 'camera' && value !== 'start' && value !== 'end') throw new LayoutError('Unknown pointer mode.');
    interaction = value; updateScene();
    text('pick-hint', interaction === 'camera' ? 'Camera mode: drag the building to orbit. Use the landmark controls for a keyboard-friendly journey.' :
      `Picking ${interaction === 'start' ? 'start A' : 'destination B'} on ${floorOf(history.current.world, floor).name}. Click open floor; or focus this plan, use arrows and Enter. Picks snap to 0.5 m cell centers.`);
  });
  listen('explode', 'click', () => {
    exploded = !exploded; el<HTMLButtonElement>('explode').setAttribute('aria-pressed', String(exploded));
    text('explode', exploded ? 'Exploded' : 'Cutaway');
    text('space-note', exploded ? 'Exploded axonometric · vertical spacing ×1.8. Measurements use physical coordinates.' : 'True-scale cutaway · floors above the selected level are removed. Walls are cut to 0.85 m.');
    updateScene();
  });
  listen('home', 'click', () => scene.home());
  listen('clearance', 'change', drawPlan);
  for (const [name, multiplier] of [['zoom-in', 1.5], ['zoom-out', 1 / 1.5]] as const) listen(name, 'click', () => {
    planZoom = clamp(planZoom * multiplier, 1, 3.5); updatePlanView();
    text('pick-hint', 'Zoomed plan: in Camera / inspect mode, focus the plan and use arrow keys to pan. Picking modes move a cursor instead. Fit plan restores the overview.');
  });
  listen('plan-fit', 'click', () => { planZoom = 1; updatePlanView(); });
  let pointer: { id: number; x: number; y: number } | null = null;
  planHost.addEventListener('pointerdown', (event) => {
    if (pointer || !event.isPrimary) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    if (interaction !== 'camera' && event.isTrusted) planHost.setPointerCapture(event.pointerId);
  }, { signal: page.signal });
  planHost.addEventListener('pointerup', (event) => {
    if (pointer?.id !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
    pointer = null;
    if (moved > 8) return;
    const point = svgPoint(query<SVGSVGElement>(planHost, 'svg'), event.clientX, event.clientY); pick(point.x, point.z);
  }, { signal: page.signal });
  const releasePointer = (event: PointerEvent) => { if (pointer?.id === event.pointerId) pointer = null; };
  planHost.addEventListener('pointercancel', releasePointer, { signal: page.signal });
  planHost.addEventListener('lostpointercapture', releasePointer, { signal: page.signal });
  planHost.addEventListener('keydown', (event) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    if (interaction === 'camera' && event.key !== 'Enter') {
      if (event.key === 'ArrowUp') planCenter.z -= 1;
      if (event.key === 'ArrowDown') planCenter.z += 1;
      if (event.key === 'ArrowLeft') planCenter.x -= 1;
      if (event.key === 'ArrowRight') planCenter.x += 1;
      updatePlanView(); return;
    }
    if (event.key === 'Enter') { pick(cursor.x, cursor.z); return; }
    if (event.key === 'ArrowUp') cursor.z -= .5;
    if (event.key === 'ArrowDown') cursor.z += .5;
    if (event.key === 'ArrowLeft') cursor.x -= .5;
    if (event.key === 'ArrowRight') cursor.x += .5;
    cursor.x = clamp(cursor.x, .25, history.current.world.width - .25);
    cursor.z = clamp(cursor.z, .25, history.current.world.depth - .25);
    if (planZoom > 1) { planCenter = { ...cursor }; updatePlanView(); }
    const marker = query<SVGGElement>(planHost, '[data-passage-cursor]');
    marker.setAttribute('visibility', 'visible'); marker.setAttribute('transform', `translate(${cursor.x},${cursor.z})`);
    text('pick-hint', `Cursor: X ${cursor.x.toFixed(2)} m, Z ${cursor.z.toFixed(2)} m. Enter places ${interaction === 'start' ? 'start A' : 'destination B'}; select a picking mode first.`);
  }, { signal: page.signal });
  listen('walk', 'click', () => {
    if (!route) return;
    if (running) { stopWalk(); return; }
    if (walkTime >= route.duration) walkTime = 0;
    running = true; text('walk', 'Pause walk'); page.root.dataset.walkState = 'walking'; walkLoop.setPaused(false);
  });
  listen('step', 'click', () => { if (route) { stopWalk(); walkTime = Math.min(route.duration, walkTime + 1); followPose(); updateWalk(); } });
  listen('rewind', 'click', () => { stopWalk(); walkTime = 0; followPose(); updateWalk(); });
  listen('speed', 'change', () => { speed = Number(el<HTMLSelectElement>('speed').value); });
  listen('scrub', 'input', () => { if (route) { stopWalk(); walkTime = timeAtDistance(route, el<HTMLInputElement>('scrub').valueAsNumber); followPose(); updateWalk(); } });
  listen('undo', 'click', () => perform(() => history.undo(), 'Previous layout restored.'));
  listen('redo', 'click', () => perform(() => history.redo(), 'Later layout restored.'));
  const reset = () => perform(() => history.commit(makeLayout(preset)), 'Layout study reset. Undo remains available.', preset);
  listen('reset', 'click', reset);
  listen('cancel', 'click', () => {
    cancelJob(); result = search?.result ?? null; route = null; refresh();
    page.root.dataset.ready = 'true';
    announce('Search cancelled. No route is active. Recompute when ready.');
  });
  listen('recompute', 'click', () => { changeReason = 'Search restarted.'; void recompute(); });
  listen('open-doors', 'click', () => edit((draft) => { draft.world.doors.forEach((door) => { door.open = true; }); }, 'All doors reopened.'));
  listen('open-portals', 'click', () => edit((draft) => { draft.world.portals.forEach((portal) => { portal.open = true; }); }, 'Stairs and lifts reopened. Mobility restrictions still apply.'));
  for (const name of ['diameter', 'margin', 'stepfree']) listen(name, 'change', () => edit((draft) => {
    draft.profile.radius = el<HTMLInputElement>('diameter').valueAsNumber / 2;
    draft.profile.margin = el<HTMLInputElement>('margin').valueAsNumber;
    draft.profile.stepFree = el<HTMLInputElement>('stepfree').checked;
    draft.profile.id = 'custom'; draft.profile.name = 'Custom profile';
  }, 'Body clearance or mobility changed.'));
  listen('objective', 'change', () => {
    const value = el<HTMLSelectElement>('objective').value;
    if (value !== 'comfort' && value !== 'distance') throw new LayoutError('Unknown search objective.');
    edit((draft) => { draft.objective = value; }, 'Search preference changed. Distance and time are reported separately.');
  });
  el<HTMLElement>('doors').addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const input = event.target, doorId = input.dataset.passageDoor ?? input.dataset.passageDoorWidth;
    edit((draft) => {
      const door = draft.world.doors.find((door) => door.id === doorId);
      if (!door) throw new LayoutError('Unknown door.');
      if (input.dataset.passageDoor) door.open = input.checked; else door.width = input.valueAsNumber;
    }, 'Door geometry or opening state changed.');
  }, { signal: page.signal });
  el<HTMLElement>('portals').addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const input = event.target;
    edit((draft) => {
      const portal = draft.world.portals.find((portal) => portal.id === input.dataset.passagePortal);
      if (!portal) throw new LayoutError('Unknown connector.');
      portal.open = input.checked;
    }, 'Vertical connector availability changed.');
  }, { signal: page.signal });
  listen('object', 'change', () => { selectedObject = el<HTMLSelectElement>('object').value; updateObjectFields(); drawPlan(); });
  listen('apply-object', 'click', () => edit((draft) => {
    const obstacle = draft.world.obstacles.find((item) => item.id === selectedObject);
    if (!obstacle) throw new LayoutError('Select an object before changing geometry.');
    for (const key of ['x', 'z', 'w', 'd'] as const) {
      const input = el<HTMLInputElement>(`object-${key}`);
      if (!input.checkValidity()) throw new LayoutError('Object coordinates must be in range; width and depth must be 0.25–12 m in 0.25 m steps.');
      obstacle[key] = input.valueAsNumber;
    }
  }, 'Solid geometry changed. The old route and walk have been discarded.'));
  listen('add-object', 'click', () => {
    const identifiers = new Set(history.current.world.obstacles.map((item) => item.id));
    let suffix = 1;
    while (identifiers.has(`partition-${suffix}`)) suffix++;
    const objectId = `partition-${suffix}`;
    perform(() => {
      history.edit((draft) => {
        draft.world.obstacles.push({ id: objectId, floor, name: 'Temporary partition',
          x: Math.min(8.5, draft.world.width - 2), z: Math.min(10, draft.world.depth - 5), w: 1, d: 4, height: 2.2 });
      });
      selectedObject = objectId;
    }, 'A solid temporary partition was added. Move it with the geometry controls.');
  });
  listen('remove-object', 'click', () => edit((draft) => { draft.world.obstacles = draft.world.obstacles.filter((item) => item.id !== selectedObject); }, 'Selected solid removed.'));
  listen('save', 'click', () => {
    if (writeLocalData(SNAPSHOT, serialize(history.current), (message) => announce(message, true))) announce('Layout snapshot saved on this device. Nothing was sent to a server.');
  });
  listen('restore', 'click', () => {
    const stored = readLocalData(SNAPSHOT, (value): value is string => typeof value === 'string', (message) => announce(message, true));
    if (stored === undefined) { announce('No readable PASSAGE snapshot is available. Save a layout first.', true); return; }
    perform(() => history.commit(deserialize(stored)), 'Local snapshot restored; route recomputed.');
  });
  listen('export', 'click', () => downloadText('passage-layout.json', serialize(history.current, route), 'application/json'));
  listen('svg', 'click', () => downloadText(`passage-plan-${floor}.svg`, planMarkup(history.current, floor, route), 'image/svg+xml'));
  listen('import', 'click', () => el<HTMLInputElement>('file').click());
  listen('file', 'change', () => {
    const input = el<HTMLInputElement>('file'), file = input.files?.[0], revision = history.revision;
    if (!file) return;
    if (file.size > 400_000) { announce('Import rejected: files must be no larger than 400 KB.', true); input.value = ''; return; }
    void file.text().then((json) => {
      if (page.signal.aborted) return;
      if (history.revision !== revision) { announce('Import cancelled because the layout changed while the file was being read.', true); return; }
      perform(() => history.commit(deserialize(json)), 'Imported layout validated. Saved route data was discarded and recomputed.');
    }, (error: unknown) => {
      if (!(error instanceof DOMException)) throw error;
      if (!page.signal.aborted) announce(`The file could not be read: ${error.message}`, true);
    }).finally(() => { input.value = ''; });
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopWalk(); }, { signal: page.signal });
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  motion.addEventListener('change', () => { if (motion.matches) stopWalk(); }, { signal: page.signal });
  page.root.dataset.reducedMotion = String(context.reducedMotion);
  await recompute();
  return { destroy: page.destroy, reset, setPaused: (paused) => { if (paused) stopWalk(); } };
}
