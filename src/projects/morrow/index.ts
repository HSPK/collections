import './style.css';
import { Vector3 } from 'three';
import { createLoop } from '../../core/loop';
import { createProjectPage, downloadText, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import {
  MorrowError, RAD, clonePose, consume, copyJoints, eulerDegrees, forward, inverseSteps,
  poseFromEuler, residual, validJoints,
} from './arm';
import type { IKResult, Joints, Pose } from './arm';
import { clearance } from './collision';
import { planSteps, sampleTrajectory, timePath } from './planner';
import type { Trajectory } from './planner';
import {
  Generation, History, cloneState, createState, deserialize, destination, exportProgram, grip,
  presetById, release, serialize, source, taskComplete, worldFor,
} from './state';
import { createWorkcell } from './renderer';
import type { ManipulationMode } from './renderer';
import { markup, traceMarkup } from './ui';

let instances = 0;
export async function mount(context: ProjectContext): Promise<ProjectInstance> {
  const page = createProjectPage(context, 'morrow');
  const id = `morrow-${++instances}`;
  page.root.setAttribute('aria-labelledby', `${id}-title`);
  page.root.innerHTML = markup(id);
  page.root.dataset.mobileView = 'cell';
  const get = <T extends Element>(selector: string) => query<T>(page.root, selector);
  const all = <T extends Element>(selector: string) => [...page.root.querySelectorAll<T>(selector)];
  const text = (selector: string, value: string) => { get<HTMLElement>(selector).textContent = value; };
  const button = (name: string) => get<HTMLButtonElement>(`[data-morrow-${name}]`);
  let state = createState();
  let preview: IKResult | null = null, trajectory: Trajectory | null = null;
  let time = 0, inspectTime: number | null = null, direction = 1, paused = true, busy = false, invalid = false;
  let pathPoints: Vector3[] = [];
  let planSummary = 'Not planned';
  const history = new History(), generation = new Generation();
  let loop: ReturnType<typeof createLoop> | null = null;
  const status = get<HTMLElement>('[data-morrow-status]');
  function announce(message: string, error = false) {
    status.textContent = message; status.dataset.error = String(error);
    status.dataset.complete = String(taskComplete(state));
    if (error) page.report(message);
  }
  function handleError(error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    if (!(error instanceof MorrowError)) throw error;
    announce(error.message, true);
  }
  const scene = createWorkcell(get<HTMLElement>('[data-morrow-scene]'), page.signal, {
    beginEdit() { history.remember(state); invalidate(); },
    moveTarget(position) {
      if (!position.toArray().every(Number.isFinite) || position.length() > 3) {
        announce('Target manipulation is bounded to 3 m from the world origin.', true); return;
      }
      invalidate(); invalid = false;
      all<HTMLInputElement>('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
      state.target.position.copy(position); refresh();
      announce('Target edited. Solve the pose, then plan; the live robot has not moved.');
    },
    message: announce,
    contextLost() { setPaused(true); generation.stop(); busy = false; refresh(); announce('Graphics context lost. Motion paused; restore the view before continuing.', true); },
  });
  page.onCleanup(scene.destroy);
  page.onCleanup(() => { generation.stop(); loop?.destroy(); });

  function displayJoints(): Joints {
    return trajectory && inspectTime !== null ? sampleTrajectory(trajectory, inspectTime) : state.joints;
  }
  function draw() {
    scene.update({ joints: displayJoints(), target: state.target,
      preview: preview?.joints ?? null, previewSafe: preview !== null && clearance(preview.joints, worldFor(state)).safe,
      world: worldFor(state), path: pathPoints, frames: get<HTMLInputElement>('[data-morrow-frames]').checked });
  }
  function livePaint() {
    const q = displayJoints(), pose = forward(q).tool, c = clearance(q, worldFor(state));
    text('[data-morrow-tool]', pose.position.toArray().map(v => v.toFixed(3)).join(' / '));
    all<HTMLOutputElement>('[data-morrow-live-joint]').forEach((output, i) => { output.textContent = `${(q[i] / RAD).toFixed(1)}°`; });
    text('[data-morrow-clearance]', `${(c.clearance * 1000).toFixed(1)} mm / ${c.safe ? 'CLEAR' : 'COLLISION'}`);
    get<HTMLOutputElement>('[data-morrow-clearance]').title = c.pair;
    text('[data-morrow-payload]', state.attachment ? 'CLOSED / 46 MM PAYLOAD' : taskComplete(state) ? 'OPEN / COUPON PLACED' : 'OPEN / NO PAYLOAD');
    text('[data-morrow-live-label]', inspectTime !== null ? 'INSPECTION / NOT EXECUTION' : paused ? 'LIVE / AT REST' : direction < 0 ? 'LIVE / REVERSING' : 'LIVE / EXECUTING');
    text('[data-morrow-time]', `${(inspectTime ?? time).toFixed(2)} / ${(trajectory?.duration ?? 0).toFixed(2)} s`);
    const scrub = get<HTMLInputElement>('[data-morrow-scrub]');
    scrub.value = String(inspectTime ?? time);
    scrub.setAttribute('aria-valuetext', `${(inspectTime ?? time).toFixed(2)} seconds; ${inspectTime === null ? 'live' : 'inspection only'}`);
    const cursor = page.root.querySelector<SVGLineElement>('[data-morrow-trace-cursor]');
    if (cursor && trajectory) {
      const x = 12 + (inspectTime ?? time) / trajectory.duration * 956;
      cursor.setAttribute('x1', String(x)); cursor.setAttribute('x2', String(x));
    }
    text('[data-morrow-motion-state]', inspectTime !== null ? 'INSPECTION ONLY' :
      !trajectory ? 'WAITING FOR A PLAN' : !paused ? (direction < 0 ? 'REVERSING / CERTIFIED PATH' : 'EXECUTING / CERTIFIED PATH') :
        time >= trajectory.duration - 1e-8 ? 'AT GOAL / PAUSED' : 'CERTIFIED / PAUSED');
    button('run').textContent = !paused ? 'Pause motion' : 'Run motion';
    button('run').disabled = !trajectory || busy || (paused && time >= trajectory.duration - 1e-8);
    button('step').disabled = !trajectory || !paused || busy || time >= trajectory.duration - 1e-8;
    button('reverse').disabled = !trajectory || busy || time <= 0;
    button('live').disabled = inspectTime === null;
    button('grip').disabled = state.attachment !== null || !paused || busy || inspectTime !== null;
    button('release').disabled = state.attachment === null || !paused || busy || inspectTime !== null;
    page.root.dataset.executing = String(!paused);
    page.root.dataset.inspection = String(inspectTime !== null);
    page.root.dataset.taskComplete = String(taskComplete(state));
    draw();
  }
  function refreshFields() {
    const values = [...state.target.position.toArray(), ...eulerDegrees(state.target)];
    all<HTMLInputElement>('[data-morrow-pose]').forEach((input, i) => {
      if (document.activeElement !== input) input.value = values[i].toFixed(i < 3 ? 3 : 1);
    });
    const q = preview?.joints ?? state.joints;
    all<HTMLInputElement>('[data-morrow-joint]').forEach((input, i) => {
      if (document.activeElement !== input) input.value = (q[i] / RAD).toFixed(1);
    });
  }
  function refresh() {
    const preset = presetById(state.preset);
    text('[data-morrow-task-title]', preset.title);
    text('[data-morrow-task-description]', preset.description);
    get<HTMLSelectElement>('[data-morrow-preset]').value = state.preset;
    get<HTMLInputElement>('[data-morrow-seed]').value = String(state.seed);
    refreshFields();
    text('[data-morrow-ik-state]', busy ? 'Computing…' : preview ? preview.converged ? 'Converged' : 'Not converged' : 'Needs solve');
    text('[data-morrow-position-error]', preview ? `${(preview.positionError * 1000).toFixed(2)} mm` : '—');
    text('[data-morrow-angle-error]', preview ? `${(preview.angleError / RAD).toFixed(2)}°` : '—');
    const c = preview && clearance(preview.joints, worldFor(state));
    text('[data-morrow-target-clearance]', c ? c.safe ? `Clear / +${(c.clearance * 1000).toFixed(1)} mm` : `Blocked / ${(c.clearance * 1000).toFixed(1)} mm` : 'Not evaluated');
    get<HTMLElement>('[data-morrow-target-clearance]').title = c ? c.pair : '';
    text('[data-morrow-plan-state]', planSummary);
    button('solve').disabled = busy || invalid;
    button('plan').disabled = busy || invalid;
    button('export').disabled = trajectory === null;
    button('undo').disabled = !history.canUndo;
    button('redo').disabled = !history.canRedo;
    button('queue-add').disabled = state.waypoints.length >= 6 || invalid;
    button('queue-clear').disabled = state.waypoints.length === 0;
    const queue = get<HTMLOListElement>('[data-morrow-queue]');
    queue.replaceChildren();
    if (!state.waypoints.length) {
      const note = document.createElement('li'); note.textContent = 'No waypoints. Plan directly to target.'; queue.append(note);
    } else state.waypoints.forEach((pose, index) => {
      const row = document.createElement('li');
      row.textContent = pose.position.toArray().map(v => v.toFixed(2)).join(' / ');
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove';
      remove.dataset.morrowRemove = String(index); remove.setAttribute('aria-label', `Remove waypoint ${index + 1}`);
      row.append(remove); queue.append(row);
    });
    text('[data-morrow-queue-count]', `${state.waypoints.length} / 6`);
    const scrub = get<HTMLInputElement>('[data-morrow-scrub]');
    scrub.max = String(trajectory?.duration ?? 1); scrub.disabled = trajectory === null;
    livePaint();
  }
  function setPaused(value: boolean) {
    paused = value || !trajectory;
    loop?.setPaused(paused);
    livePaint();
  }
  function invalidate() {
    generation.stop(); busy = false; paused = true; loop?.setPaused(true);
    trajectory = null; preview = null; pathPoints = []; time = 0; inspectTime = null; planSummary = 'Not planned';
    get<HTMLElement>('[data-morrow-trace]').innerHTML = '<p>Plan a route to reveal six joint traces and a speed-limited timeline.</p>';
  }
  function edit(action: () => void, message: string) {
    history.remember(state); invalidate();
    try {
      action(); invalid = false;
      all<HTMLInputElement>('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
      announce(message);
    } catch (error) { handleError(error); }
    refresh();
  }
  function target(pose: Pose, message: string) {
    edit(() => { state.target = clonePose(pose); }, message);
  }
  async function solve() {
    setPaused(true);
    trajectory = null; pathPoints = []; time = 0; inspectTime = null; planSummary = 'Not planned';
    get<HTMLElement>('[data-morrow-trace]').innerHTML = '<p>Plan a route to reveal six joint traces and a speed-limited timeline.</p>';
    const token = generation.next(); busy = true; preview = null; refresh(); announce('Solving position and orientation with a damped Jacobian…');
    try {
      const result = await consume(inverseSteps(clonePose(state.target), state.joints, { seed: state.seed }), token.signal);
      if (!generation.current(token.id)) return;
      preview = result;
      const c = clearance(result.joints, worldFor(state));
      announce(result.converged ? c.safe ?
        `Pose converged in ${result.iterations} iterations. Target is clear; plan a route before execution.` :
        `Kinematics converged, but the target violates the collision margin: ${c.pair}. Move the target.` :
        `${result.reason} Residual: ${(result.positionError * 1000).toFixed(1)} mm / ${(result.angleError / RAD).toFixed(1)}°.`, !result.converged || !c.safe);
    } catch (error) { if (generation.current(token.id)) handleError(error); }
    finally { if (generation.current(token.id)) { busy = false; refresh(); } }
  }
  async function buildPlan() {
    setPaused(true); inspectTime = null;
    const snapshot = cloneState(state), candidate = preview?.converged ? preview.joints : null;
    const token = generation.next();
    trajectory = null; pathPoints = []; time = 0; busy = true; planSummary = 'Searching…'; refresh();
    get<HTMLElement>('[data-morrow-trace]').innerHTML = '<p>Searching joint space. No motion is authorized until every segment passes.</p>';
    announce('Planning in joint space. Every edge includes swept-clearance validation…');
    try {
      const world = worldFor(snapshot), goals = [...snapshot.waypoints.map(clonePose), clonePose(snapshot.target)];
      const path: Joints[] = [copyJoints(snapshot.joints)];
      let nodes = 0, edges = 0, last = snapshot.joints;
      for (let i = 0; i < goals.length; i++) {
        const r = candidate && i === goals.length - 1 ? residual(goals[i], forward(candidate).tool) : null;
        const result: IKResult = r && r.positionError <= .0015 && r.angleError <= .012 && candidate ?
          { joints: candidate, converged: true, positionError: r.positionError, angleError: r.angleError, iterations: 0, reason: 'Using converged preview.' } :
          await consume(inverseSteps(goals[i], last, { seed: snapshot.seed + i }), token.signal);
        if (!generation.current(token.id)) return;
        if (i === goals.length - 1) preview = result;
        if (!result.converged) throw new MorrowError(`Pose ${i + 1}: IK did not converge (${(result.positionError * 1000).toFixed(1)} mm / ${(result.angleError / RAD).toFixed(1)}°). No motion plan installed.`);
        announce(`Searching segment ${i + 1} of ${goals.length}; scene edits cancel this search.`);
        const planned = await consume(planSteps(last, result.joints, world, { seed: snapshot.seed + i }), token.signal, 1);
        if (!generation.current(token.id)) return;
        if (!planned.found) throw new MorrowError(`Segment ${i + 1}: ${planned.reason}`);
        nodes += planned.nodes; edges += planned.edgeChecks;
        path.push(...planned.path.slice(1)); last = result.joints;
        if (path.length > 1800) throw new MorrowError('Combined path exceeds the 1,800-state project budget. Use fewer waypoints.');
      }
      if (!generation.current(token.id)) return;
      const timed = timePath(path);
      trajectory = timed; time = 0;
      const count = Math.min(769, Math.max(81, path.length * 18));
      pathPoints = Array.from({ length: count }, (_, i) =>
        forward(sampleTrajectory(timed, timed.duration * i / (count - 1))).tool.position);
      planSummary = `${path.length - 1} certified edges`;
      get<HTMLElement>('[data-morrow-trace]').innerHTML = traceMarkup(trajectory);
      announce(`Path ready: ${path.length - 1} certified edges, ${nodes} search nodes, ${edges} edge attempts, ${trajectory.duration.toFixed(2)} s. ${snapshot.attachment ? 'Payload included. ' : ''}Run or inspect; motion is paused.`);
    } catch (error) {
      if (generation.current(token.id)) {
        trajectory = null; pathPoints = []; planSummary = 'No path installed';
        get<HTMLElement>('[data-morrow-trace]').innerHTML = '<p>No certified trajectory. Adjust the target, add a waypoint or change the seed.</p>';
        handleError(error);
      }
    } finally { if (generation.current(token.id)) { busy = false; refresh(); } }
  }
  function advance(seconds: number) {
    if (!trajectory) return;
    const nextTime = Math.max(0, Math.min(trajectory.duration, time + seconds));
    const next = sampleTrajectory(trajectory, nextTime);
    const c = clearance(next, worldFor(state));
    if (!c.safe) {
      setPaused(true); invalidate(); refresh();
      announce(`Execution stopped: clearance changed at ${c.pair}. Replan from the live state.`, true); return;
    }
    time = nextTime; state.joints = next;
    if ((direction < 0 && time <= 0) || (direction > 0 && time >= trajectory.duration)) {
      paused = true; loop?.setPaused(true);
      announce(time <= 0 ? 'Returned along the certified path to its start.' :
        state.attachment ? 'At the target with payload. Release only when aligned inside the receiver.' :
          'At the target. Grip if the coupon is within the local contact envelope, or choose a new pose.');
    }
    livePaint();
  }
  loop = createLoop((_, delta) => { if (!paused) advance(delta * direction); }, { paused: true });
  function on(name: string, action: () => void) {
    button(name).addEventListener('click', action, { signal: page.signal });
  }
  on('solve', () => { void solve(); });
  on('plan', () => { void buildPlan(); });
  on('source', () => target(source, 'Source target selected. Solve and plan the approach; gripping never teleports the coupon.'));
  on('receiver', () => target(destination, 'Receiver target selected. A held payload is included in the next plan.'));
  on('current', () => target(forward(state.joints).tool, 'Target copied from the live tool frame. No solver success has been assumed.'));
  on('grip', () => edit(() => { state = grip(state); }, 'Coupon gripped locally. Payload clearance is now part of every motion check. Select Receiver pose.'));
  on('release', () => edit(() => { state = release(state); }, 'Transfer complete. The coupon is aligned in the receiver and the gripper is open.'));
  on('run', () => {
    if (!trajectory) return;
    if (!paused) { setPaused(true); announce('Execution paused at the current joint state.'); return; }
    history.remember(state); direction = 1; inspectTime = null; setPaused(false); refresh();
    announce('Executing the certified path. Every edit stops execution and invalidates the remaining plan.');
  });
  on('step', () => { if (!trajectory) return; history.remember(state); inspectTime = null; direction = 1; setPaused(true); advance(.1); refresh(); });
  on('reverse', () => { if (!trajectory || time <= 0) return; history.remember(state); inspectTime = null; direction = -1; setPaused(false); refresh(); announce('Returning to the start along the same certified edges, in reverse.'); });
  on('live', () => { inspectTime = null; refresh(); announce('Returned to the live robot. Inspection did not change its executed state.'); });
  on('reset', () => edit(() => { state = createState(state.preset); }, 'Study reset. The arm and coupon return to their initial simulation state.'));
  on('fit', scene.fit);
  on('queue-add', () => edit(() => {
    if (state.waypoints.length >= 6) throw new MorrowError('The queue is limited to six poses.');
    state.waypoints.push(clonePose(state.target));
  }, 'Target queued. Change the target for the next segment, or plan the queue.'));
  on('queue-clear', () => edit(() => { state.waypoints = []; }, 'Waypoint queue cleared.'));
  on('undo', () => {
    invalidate(); state = history.undo(state); invalid = false;
    all<HTMLInputElement>('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
    refresh(); announce('Previous edit restored. Any prior motion plan must be recomputed.');
  });
  on('redo', () => {
    invalidate(); state = history.redo(state); invalid = false;
    all<HTMLInputElement>('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
    refresh(); announce('Edit restored. Plan again before running.');
  });
  on('save', () => { downloadText('morrow-project-v1.json', serialize(state), 'application/json'); announce('Versioned project saved locally. Imported projects never inherit a trusted trajectory.'); });
  on('load', () => get<HTMLInputElement>('[data-morrow-file]').click());
  on('export', () => {
    if (!trajectory) { announce('Plan a certified trajectory before exporting.', true); return; }
    downloadText('morrow-inspection-program.json', exportProgram(trajectory, state), 'application/json');
    announce('Inspection program exported with timed joints and tool poses. Simulation only; not hardware commands.');
  });
  get<HTMLInputElement>('[data-morrow-file]').addEventListener('change', event => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    const file = input.files[0]; input.value = '';
    invalidate(); refresh();
    if (file.size > 32000) { announce('Project exceeds the 32 KB import limit.', true); return; }
    const token = generation.next();
    void file.text().then(value => {
      if (!generation.current(token.id) || page.signal.aborted) return;
      edit(() => { state = deserialize(value); }, 'Project loaded. Joint limits and current collisions validated; solve and replan before execution.');
    }).catch(error => {
      if (!generation.current(token.id) || page.signal.aborted) return;
      if (!(error instanceof DOMException)) throw error;
      announce(`The selected file could not be read: ${error.message}`, true);
    });
  }, { signal: page.signal });
  get<HTMLSelectElement>('[data-morrow-preset]').addEventListener('change', event => {
    if (event.target instanceof HTMLSelectElement)
      edit(() => { if (event.target instanceof HTMLSelectElement) state = createState(event.target.value); }, 'Study loaded. New obstacles invalidate all previous motion.');
  }, { signal: page.signal });
  get<HTMLInputElement>('[data-morrow-seed]').addEventListener('input', () => {
    invalidate(); invalid = true; button('solve').disabled = true; button('plan').disabled = true; livePaint();
    announce('Seed edited. Commit a whole number from 0 to 999999 to enable planning.');
  }, { signal: page.signal });
  get<HTMLInputElement>('[data-morrow-seed]').addEventListener('change', () => {
    const input = get<HTMLInputElement>('[data-morrow-seed]');
    edit(() => {
      if (!Number.isInteger(input.valueAsNumber) || input.valueAsNumber < 0 || input.valueAsNumber > 999999) {
        invalid = true; throw new MorrowError('Use a whole-number seed between 0 and 999999.');
      }
      state.seed = input.valueAsNumber;
    }, 'Search seed changed. Solve or plan again.');
  }, { signal: page.signal });
  get<HTMLElement>('[data-morrow-queue]').addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || target.dataset.morrowRemove === undefined) return;
    const index = Number(target.dataset.morrowRemove);
    edit(() => { state.waypoints.splice(index, 1); }, 'Waypoint removed. Replan the edited queue.');
  }, { signal: page.signal });
  const inputs = all<HTMLInputElement>('[data-morrow-pose], [data-morrow-joint]');
  for (const input of inputs) {
    input.addEventListener('input', () => {
      invalidate(); invalid = !input.validity.valid || !Number.isFinite(input.valueAsNumber);
      input.setAttribute('aria-invalid', String(invalid));
      button('solve').disabled = true; button('plan').disabled = true; livePaint();
      announce(invalid ? 'Enter a finite value within this field’s limits. Stale motion has been cancelled.' : 'Editing target. Commit the field to update its preview.', invalid);
    }, { signal: page.signal });
    input.addEventListener('change', () => {
      edit(() => {
        if (inputs.some(field => !field.validity.valid || !Number.isFinite(field.valueAsNumber))) {
          invalid = true; throw new MorrowError('Correct the highlighted position, orientation or joint input before solving.');
        }
        if (input.dataset.morrowPose !== undefined) {
          const values = all<HTMLInputElement>('[data-morrow-pose]').map(field => field.valueAsNumber);
          state.target = poseFromEuler(values[0], values[1], values[2], values[3], values[4], values[5]);
        } else {
          const values = all<HTMLInputElement>('[data-morrow-joint]').map(field => field.valueAsNumber * RAD);
          if (!validJoints(values)) { invalid = true; throw new MorrowError('Joint targets must stay inside all six joint limits.'); }
          state.target = forward(values).tool;
          preview = { joints: values, converged: true, positionError: 0, angleError: 0, iterations: 0,
            reason: 'Direct forward-kinematic joint target. Motion has not been executed.' };
        }
      }, 'Target updated. The ghost is a preview, not execution. Plan a collision-checked route.');
    }, { signal: page.signal });
  }
  const tabs = all<HTMLButtonElement>('[data-morrow-tab]');
  all<HTMLButtonElement>('[data-morrow-view]').forEach(view => {
    view.addEventListener('click', () => {
      page.root.dataset.mobileView = view.dataset.morrowView;
      all<HTMLButtonElement>('[data-morrow-view]').forEach(other => other.setAttribute('aria-pressed', String(view === other)));
    }, { signal: page.signal });
  });
  function showTab(selected: HTMLButtonElement) {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      get<HTMLElement>(`[data-morrow-pane="${tab.dataset.morrowTab}"]`).hidden = !active;
    }
    refreshFields();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showTab(tab), { signal: page.signal });
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
      showTab(next); next.focus();
    }, { signal: page.signal });
  });
  get<HTMLSelectElement>('[data-morrow-mode]').addEventListener('change', event => {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const value = event.target.value;
    const modes: ManipulationMode[] = ['camera', 'xz', 'xy', 'yz', 'x', 'y', 'z'];
    const selected = modes.find(mode => mode === value);
    if (!selected) throw new MorrowError('Unknown target manipulation mode.');
    scene.setMode(selected);
    text('[data-morrow-mode-hint]', selected === 'camera' ?
      'Drag to orbit. Scroll to zoom. Focus the scene and use arrow keys. Home fits the workcell.' :
      `${selected.toUpperCase()} ${selected.length === 1 ? 'axis' : 'plane'} / Drag to move the target. Arrows: 10 mm. Shift + arrows: 1 mm. Live arm stays put.`);
  }, { signal: page.signal });
  get<HTMLInputElement>('[data-morrow-frames]').addEventListener('change', draw, { signal: page.signal });
  get<HTMLInputElement>('[data-morrow-scrub]').addEventListener('input', event => {
    if (!trajectory || !(event.target instanceof HTMLInputElement)) return;
    const requestedTime = event.target.valueAsNumber;
    setPaused(true); inspectTime = requestedTime; livePaint();
    announce('Inspecting the certified path. The live robot has not advanced. Return to live or Run to resume from the actual execution time.');
  }, { signal: page.signal });
  refresh();
  await solve();
  page.signal.throwIfAborted();
  page.root.dataset.ready = 'true';
  return { destroy: page.destroy, setPaused(value) { if (value) setPaused(true); }, reset() {
    edit(() => { state = createState(); }, 'Morrow reset to the transfer study.');
  } };
}
