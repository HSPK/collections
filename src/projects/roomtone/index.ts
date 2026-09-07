import './style.css';
import { createProjectPage, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { LIMITS, PRESETS, cloneRoom, isMaterial, isWall } from './data';
import type { Room } from './data';
import { validateRoom } from './engine';
import { createRoomScene } from './scene';
import type { CameraAction } from './scene';
import { createFloorplan } from './floorplan';
import { RoomtoneAudio } from './audio';
import { encodeWav } from './wav';
import { calculateDesign, renderAnalysis, renderComparison, renderPaths, renderReadouts, studioMarkup, syncInputs } from './ui';
import type { AcousticDesign } from './ui';
import { createStudioWorkspace } from './workspace';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'roomtone');
  const { root, signal } = page;
  let preset = PRESETS[0];
  let design = calculateDesign(cloneRoom(preset.room), preset.name);
  let reference: AcousticDesign | null = null;
  let band = 2;
  let selectedId = '-1,1,0';
  let updateFrame = 0;
  let pendingRoom: Room | null = null;
  let active = true;
  const downloadUrls = new Map<string, number>();
  const invalid = new Set<HTMLInputElement>();
  root.innerHTML = studioMarkup();
  createStudioWorkspace(page);
  root.dataset.audioState = 'off';
  const report = (message: string) => {
    if (!active) return;
    query(root, '[data-status]').textContent = message;
  };
  const audio = new RoomtoneAudio((status) => {
    if (!active) return;
    root.dataset.audioState = status.state;
    query(root, '[data-audio-status]').textContent = status.message;
    const busy = status.state === 'starting' || status.state === 'playing';
    query<HTMLButtonElement>(root, '[data-action="play"]').disabled = busy || !audio.supported;
    query<HTMLButtonElement>(root, '[data-action="stop"]').disabled = !busy;
    const error = query<HTMLElement>(root, '[data-audio-error]');
    error.hidden = status.state !== 'error' && status.state !== 'unavailable';
    error.textContent = error.hidden ? '' : status.message;
    query(root, '[data-audio-light]').textContent = status.state === 'playing' ? 'Listening' : status.state === 'starting' ? 'Opening audio' : 'Sound off';
  });
  if (!audio.supported) {
    query<HTMLElement>(root, '[data-audio-error]').hidden = false;
    query(root, '[data-audio-error]').textContent = 'Web Audio is unavailable in this browser. The room model and WAV export still work.';
    query<HTMLButtonElement>(root, '[data-action="play"]').disabled = true;
    root.dataset.audioState = 'unavailable';
  }
  const scene = createRoomScene(query<HTMLElement>(root, '[data-scene]'), report);
  const plan = createFloorplan(query(root, '[data-floorplan]'), (name, position) => {
    const room = cloneRoom(pendingRoom ?? design.room);
    room[name] = position;
    pendingRoom = room;
    audio.stop(false);
    if (!updateFrame) updateFrame = requestAnimationFrame(flushDrag);
  }, () => {
    flushDrag();
    report('Position updated. The paths, impulse response, and audio now use these coordinates.');
  });
  function sizePlotLabels(): void {
    for (const svg of root.querySelectorAll<SVGSVGElement>('.roomtone-plot, .roomtone-floorplan')) {
      const width = svg.getBoundingClientRect().width;
      if (!width) continue;
      const size = 14 * svg.viewBox.baseVal.width / width;
      for (const text of svg.querySelectorAll('text')) text.style.fontSize = `${size}px`;
      for (const target of svg.querySelectorAll('[data-position] > circle:first-child')) {
        target.setAttribute('r', String(22 * svg.viewBox.baseVal.width / width));
      }
    }
  }
  const drawingObserver = new ResizeObserver(sizePlotLabels);
  for (const element of root.querySelectorAll('[data-ir-plot], [data-decay-plot], [data-floorplan]')) drawingObserver.observe(element);
  function selected() {
    return design.result.paths.find((path) => path.id === selectedId) ?? design.result.paths[0];
  }
  function refresh(rebuild = true): void {
    const path = selected();
    selectedId = path.id;
    renderReadouts(root, design, band);
    renderPaths(root, design, path, band, rebuild);
    renderAnalysis(root, design, reference, path, band);
    renderComparison(root, design, reference, band);
    scene.update(design.room, design.result.paths, path);
    plan.update(design.room, path);
    sizePlotLabels();
  }
  function clearInvalid(): void {
    for (const input of invalid) input.removeAttribute('aria-invalid');
    invalid.clear();
    query<HTMLElement>(root, '[data-input-feedback]').hidden = true;
  }
  function commit(room: Room, message?: string): void {
    validateRoom(room);
    audio.stop();
    design = calculateDesign(room, preset.name);
    syncInputs(root, room);
    clearInvalid();
    refresh();
    root.dataset.modified = String(JSON.stringify(room) !== JSON.stringify(preset.room));
    if (message) report(message);
  }
  function flushDrag(): void {
    if (updateFrame) cancelAnimationFrame(updateFrame);
    updateFrame = 0;
    if (pendingRoom && active) {
      const next = pendingRoom;
      pendingRoom = null;
      commit(next);
    }
  }
  function reset(): void {
    pendingRoom = null;
    if (updateFrame) cancelAnimationFrame(updateFrame);
    updateFrame = 0;
    selectedId = '-1,1,0';
    commit(cloneRoom(preset.room), 'Original room preset restored. Your pinned reference is unchanged; sound is off.');
    scene.camera('home');
  }
  function editNumber(input: HTMLInputElement): void {
    const field = input.dataset.field;
    if (!field) return;
    const room = cloneRoom(design.room);
    const value = input.valueAsNumber;
    try {
      if (!Number.isFinite(value)) throw new RangeError('Enter a finite number. The last valid room remains active.');
      if (field === 'width' || field === 'depth' || field === 'height') {
        room[field] = value;
        const axis = field === 'width' ? 'x' : field === 'depth' ? 'y' : 'z';
        for (const name of ['source', 'listener'] as const) room[name][axis] = Math.min(value - LIMITS.margin, room[name][axis]);
      } else {
        const [name, axis] = field.split('.');
        if ((name === 'source' || name === 'listener') && (axis === 'x' || axis === 'y' || axis === 'z')) room[name][axis] = value;
        else throw new RangeError('Unknown room coordinate.');
      }
      validateRoom(room);
      commit(room, 'Room updated. All paths, plots, and the audition impulse have been recalculated.');
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      invalid.add(input);
      input.setAttribute('aria-invalid', 'true');
      const feedback = query<HTMLElement>(root, '[data-input-feedback]');
      feedback.hidden = false;
      feedback.textContent = `${error.message} Press Escape to restore the last valid room.`;
    }
  }
  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches('[data-field]')) { editNumber(target); return; }
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.matches('[data-preset]')) {
      const next = PRESETS.find((item) => item.id === target.value);
      if (!next) throw new RangeError('Unknown room preset.');
      preset = next;
      reset();
      report(`${preset.name} loaded. ${preset.note}`);
    } else if (target.matches('[data-material]')) {
      const wall = target.dataset.material;
      if (!wall || !isWall(wall) || !isMaterial(target.value)) throw new RangeError('Unknown wall material.');
      const room = cloneRoom(design.room);
      room.materials[wall] = target.value;
      commit(room, 'Surface changed. Reflection amplitudes and diffuse-field estimates have been recalculated.');
    } else if (target.matches('[data-order]')) {
      commit({ ...cloneRoom(design.room), order: Number(target.value) }, 'Reflection order updated. Finite decay is not full-room reverberation.');
    } else if (target.matches('[data-band]')) {
      band = Number(target.value);
      refresh(false);
      report('Analysis band changed. Audio and exported WAV still contain all six frequency bands.');
    } else if (target.matches('[data-path]')) {
      selectedId = target.value;
      refresh(false);
    } else if (target.matches('[data-example], [data-audition]')) audio.stop();
  }, { signal });
  root.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.matches('[data-wet], [data-level]')) {
      query(root, input.matches('[data-wet]') ? '[data-wet-output]' : '[data-level-output]').textContent = `${input.value}%`;
      audio.stop();
    }
  }, { signal });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && event.target instanceof HTMLInputElement && event.target.matches('[data-field]')) {
      syncInputs(root, design.room);
      clearInvalid();
      report('Last valid geometry restored.');
    }
  }, { signal });
  function exportImpulse(): void {
    const blob = new Blob([encodeWav(design.ir)], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `roomtone-${preset.id}-order-${design.room.order}-44100-float.wav`;
    root.append(link);
    link.click();
    link.remove();
    downloadUrls.set(url, window.setTimeout(() => { URL.revokeObjectURL(url); downloadUrls.delete(url); }, 1500));
    report(`Exported the current ${design.ir.samples.length.toLocaleString()}-sample, 44.1 kHz mono float impulse response. All six bands, no normalization.`);
  }
  root.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!button || !root.contains(button)) return;
    const action = button.dataset.action;
    if (action === 'reset') reset();
    else if (action === 'export') exportImpulse();
    else if (action === 'pin') {
      audio.stop();
      reference = calculateDesign(cloneRoom(design.room), design.name);
      refresh(false);
      query(root, '[data-action="pin"]').textContent = 'Replace reference';
      report('Design B pinned. Subsequent edits only change A. Blue plot overlays show the reference.');
    } else if (action === 'clear-reference') {
      audio.stop();
      reference = null;
      query<HTMLSelectElement>(root, '[data-audition]').value = 'current';
      query(root, '[data-action="pin"]').textContent = '+ Pin reference';
      refresh(false);
      report('Pinned reference cleared.');
    } else if (action === 'next-path' || action === 'previous-path') {
      const paths = design.result.paths;
      const index = paths.findIndex((path) => path.id === selectedId);
      selectedId = paths[(index + (action === 'next-path' ? 1 : -1) + paths.length) % paths.length].id;
      refresh(false);
    } else if (action === 'play') {
      const example = query<HTMLSelectElement>(root, '[data-example]').value;
      const mode = query<HTMLSelectElement>(root, '[data-audition]').value;
      if (example !== 'click' && example !== 'chord' && example !== 'percussion') throw new RangeError('Unknown audition sound.');
      if (mode !== 'current' && mode !== 'reference' && mode !== 'dry') throw new RangeError('Unknown audition design.');
      void audio.play({
        current: design.ir, reference: reference?.ir ?? null, mode, example,
        wet: query<HTMLInputElement>(root, '[data-wet]').valueAsNumber / 100,
        volume: query<HTMLInputElement>(root, '[data-level]').valueAsNumber / 100,
      });
    } else if (action === 'stop') audio.stop();
    if (button.dataset.view === 'cutaway' || button.dataset.view === 'plan') {
      scene.view(button.dataset.view);
      root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    }
    const cameraActions: CameraAction[] = ['left', 'right', 'up', 'down', 'closer', 'further', 'home'];
    const cameraAction = cameraActions.find((item) => item === button.dataset.camera);
    if (cameraAction) scene.camera(cameraAction);
  }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) audio.stop(); }, { signal });
  window.addEventListener('pagehide', () => audio.stop(), { signal });
  page.onCleanup(() => {
    active = false;
    cancelAnimationFrame(updateFrame);
    pendingRoom = null;
    audio.destroy();
    plan.destroy();
    scene.destroy();
    drawingObserver.disconnect();
    for (const [url, timer] of downloadUrls) { window.clearTimeout(timer); URL.revokeObjectURL(url); }
    downloadUrls.clear();
    invalid.clear();
  });
  syncInputs(root, design.room);
  refresh();
  return { destroy: page.destroy, reset };
}
