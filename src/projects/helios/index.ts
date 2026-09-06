import './style.css';
import { createProjectPage, copyText, downloadText, query } from '../../core/page';
import { createLoop } from '../../core/loop';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { BODIES, bodyData, isBody, SITES, STUDIES } from './data';
import type { BodyName } from './data';
import { observe, nextPhase, sunAngularDiameterFrom, systemAt } from './astronomy';
import { clamp, DEG, mapToSite, siteToMap, wrap } from './math';
import { dayStart, parseUTC, utcClock, utcDay, utcInput, validTime } from './time';
import { decodeStudy, initialState, shareURL, stateFromHash, StudyHistory } from './state';
import type { StudyState, View } from './state';
import { eventKey } from './eclipse';
import type { LocalEvent } from './eclipse';
import { EclipseSearch } from './search';
import { createRenderer } from './render';
import { observationRecord } from './interchange';
import { markup } from './ui';

const number = (n: number, digits = 1) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const titleCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
const aborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export async function mount(context: ProjectContext): Promise<ProjectInstance> {
  const page = createProjectPage(context, 'helios');
  page.root.innerHTML = markup();
  page.root.setAttribute('aria-labelledby', 'helios-title');
  page.root.setAttribute('aria-busy', 'true');
  page.root.dataset.pane = 'sky';
  const get = <T extends Element>(selector: string) => query<T>(page.root, selector);
  const text = (selector: string, value: string) => { get<HTMLElement>(selector).textContent = value; };
  function report(message: string, error = false) {
    if (page.signal.aborted) return;
    text('[data-h-status]', message);
    page.root.dataset.error = String(error);
    if (error) page.report(message);
  }
  const search = new EclipseSearch(); page.onCleanup(() => search.destroy());
  const baseline = initialState();
  let initialEvent: LocalEvent | null;
  try {
    initialEvent = await search.find({ mode: 'current', time: baseline.time, site: baseline.site });
    page.signal.throwIfAborted();
    if (!initialEvent) throw new Error('The initial Nazas eclipse could not be solved. No substitute event was selected.');
    baseline.time = initialEvent.peak;
  } catch (error) {
    page.destroy();
    throw error;
  }
  const history = new StudyHistory(baseline); page.onCleanup(() => history.dispose());
  let linkError = '';
  try {
    const linked = stateFromHash(window.location.hash);
    if (linked) history.commit(linked, false);
  } catch (error) { linkError = `Observation link rejected: ${messageOf(error)} The initial Nazas study is shown instead.`; }
  let state = history.state;
  let observation = observe(state.time, state.site);
  let bodies = systemAt(state.time);
  let current: LocalEvent | null = eventKey(state.time, state.site) === eventKey(baseline.time, baseline.site) ? initialEvent : null;
  let currentKey = current ? eventKey(state.time, state.site) : '';
  let eventGeneration = 0;
  let playing = false;
  let dirty = true;
  let timeAccumulator = 0;
  let loop: ReturnType<typeof createLoop> | undefined;
  let mobilePane: View | 'observe' = state.view;
  const keepDialog = get<HTMLDialogElement>('[data-h-keep-dialog]');
  const notesDialog = get<HTMLDialogElement>('[data-h-notes-dialog]');
  function fail(error: unknown) {
    if (aborted(error) || page.signal.aborted) return;
    report(messageOf(error), true);
    if (keepDialog.open) text('[data-h-record-status]', messageOf(error));
  }
  function action(callback: () => void | Promise<void>) {
    return () => {
      try {
        const result = callback();
        if (result instanceof Promise) void result.catch(fail);
      } catch (error) { fail(error); }
    };
  }
  const on = (name: string, callback: () => void | Promise<void>) =>
    get<HTMLButtonElement>(`[data-h-action="${name}"]`).addEventListener('click', action(callback), { signal: page.signal });
  function invalidate() { dirty = true; loop?.requestRender(); }
  let scene: ReturnType<typeof createRenderer>;
  try { scene = createRenderer({
    host: get('[data-h-host]'), signal: page.signal, invalidate,
    navigate(dx, dy, zoom) {
      try {
        const next = history.state;
        if (next.view === 'sky') {
          if (zoom) next.fov = clamp(next.fov * zoom, .65, 110);
          else {
            const target = next.track === 'Moon' ? observation.moon : observation.sun;
            const az = next.track === 'horizon' ? next.skyAzimuth : target.azimuth;
            const alt = next.track === 'horizon' ? next.skyAltitude : target.altitude;
            next.skyAzimuth = wrap(az - dx * next.fov * 1.7);
            next.skyAltitude = clamp(alt + dy * next.fov, -90, 90);
            next.track = 'horizon';
          }
        } else {
          next.orbitYaw = wrap((next.orbitYaw - dx * 5) / DEG) * DEG;
          next.orbitPitch = clamp(next.orbitPitch + dy * 3, -1.45, 1.45);
          if (zoom) next.orbitZoom = clamp(next.orbitZoom * zoom, .45, 3);
        }
        apply(next, false);
      } catch (error) { fail(error); }
    },
    select: chooseBody,
    report(message) { setPaused(true); report(message, true); },
  }); } catch (error) { page.destroy(); throw error; }
  page.onCleanup(scene.destroy);

  function chooseBody(name: BodyName) {
    const next = history.state;
    next.body = name;
    if (next.view === 'sky') next.view = 'planet';
    apply(next); mobilePane = next.view; syncUI();
    report(`${name} selected. Local orbit and system-follow cameras travel with the computed body.`);
  }
  function setView(view: View) {
    const next = history.state; next.view = view;
    mobilePane = view; apply(next);
    report(view === 'sky' ? 'Earth surface instrument. Directions and disks are topocentric; the opaque horizon clips the sky.' :
      view === 'planet' ? 'The camera follows the selected body. This is an orbital reference view, not a surface observation.' :
        'Real ephemeris positions. Distances are radially compressed and body radii enlarged for exploration.');
  }
  function apply(next: StudyState, remember = true, findEvent = true) {
    const snapshot = observe(next.time, next.site);
    const positions = next.time === state.time ? bodies : systemAt(next.time);
    history.commit(next, remember);
    state = history.state; observation = snapshot; bodies = positions;
    const key = eventKey(state.time, state.site);
    if (key !== currentKey) {
      current = null;
      if (findEvent && !playing) void requestCurrent().catch(fail);
      else {
        ++eventGeneration; search.cancel(); currentKey = '';
        renderEvent('Pause time to compute contacts for this UTC date.');
      }
    }
    syncUI(); invalidate();
  }
  async function requestCurrent(seek = false) {
    const captured = history.state;
    const generation = ++eventGeneration;
    const key = eventKey(captured.time, captured.site);
    const owner = seek ? history.claim() : null;
    currentKey = key; current = null;
    renderEvent('Solving contacts for this date and location…');
    let result: LocalEvent | null;
    try { result = await search.find({ mode: 'current', time: captured.time, site: captured.site }); }
    catch (error) {
      if (page.signal.aborted || generation !== eventGeneration || aborted(error)) return;
      currentKey = '';
      renderEvent(`Contact search failed: ${messageOf(error)}`);
      throw error;
    }
    if (page.signal.aborted || generation !== eventGeneration || eventKey(history.state.time, history.state.site) !== key) return;
    current = result;
    if (seek && owner !== null && history.owns(owner) && result) {
      const next = history.state; next.time = result.peak; apply(next, false, false);
      report(`At the computed ${result.kind} eclipse peak in ${next.site.name}, ${utcClock(next.time)} UTC.`);
    } else if (seek && !result && owner !== null && history.owns(owner)) {
      report('No local eclipse was returned on this UTC date. The selected date and observer have been kept.');
    }
    renderEvent(); syncUI(); invalidate();
  }
  function renderEvent(note?: string) {
    text('[data-h-event-day]', utcDay(history.state.time));
    const contacts = get<HTMLElement>('[data-h-contacts]');
    contacts.replaceChildren();
    const scrub = get<HTMLInputElement>('#h-event-scrub');
    scrub.disabled = !current;
    get<HTMLButtonElement>('[data-h-action="peak"]').disabled = !current;
    if (note || !current) {
      text('[data-h-event-kind]', note ? 'Current-date circumstances' : 'No local event returned');
      text('[data-h-event-description]', note || 'No visible local eclipse was returned for this UTC date and observer. The instantaneous geometry is still shown above.');
      const line = document.createElement('p'); line.className = 'h-no-event';
      line.textContent = note ? 'The existing observation remains usable.' : 'No future event has been substituted.';
      contacts.append(line); return;
    }
    const duration = current.centralDuration;
    text('[data-h-event-kind]', `${titleCase(current.kind)} event · ${current.site.name}`);
    text('[data-h-event-description]', duration === null ?
      'Partial contacts only at this observer. Select a contact or scrub the timeline.' :
      `${current.kind === 'total' ? 'Totality' : 'Annularity'} lasts ${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s in the library shadow model.`);
    for (const contact of current.contacts) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.hContact = contact.label;
      button.setAttribute('aria-label', `${contact.label} at ${utcClock(contact.time)} UTC`);
      const label = document.createElement('b'); label.textContent = contact.label;
      const time = document.createElement('time'); time.dateTime = new Date(contact.time).toISOString(); time.textContent = utcClock(contact.time);
      const altitude = document.createElement('small'); altitude.textContent = `${number(contact.altitude)}° alt`;
      button.append(label, time, altitude);
      button.addEventListener('click', action(() => {
        setPaused(true); apply({ ...history.state, time: contact.time }); report(`${contact.label}: ${utcClock(contact.time)} UTC. Contact boundaries can differ by seconds from the disk model.`);
      }), { signal: page.signal });
      contacts.append(button);
    }
    scrub.min = String(current.contacts[0].time);
    scrub.max = String(current.contacts[current.contacts.length - 1].time);
    scrub.value = String(clamp(history.state.time, Number(scrub.min), Number(scrub.max)));
    scrub.setAttribute('aria-valuetext', `${utcInput(history.state.time)} UTC`);
  }
  function syncUI() {
    const s = history.state, sky = s.view === 'sky', b = bodyData(s.body);
    page.root.dataset.pane = mobilePane;
    page.root.dataset.view = s.view;
    page.root.dataset.time = String(s.time);
    page.root.dataset.eclipse = observation.eclipse.kind;
    page.root.dataset.visibility = observation.sun.visibility;
    page.root.dataset.phase = String(observation.phase.fraction);
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-h-view]'))
      button.setAttribute('aria-pressed', String(button.dataset.hView === s.view && mobilePane !== 'observe'));
    get('[data-h-action="observe-pane"]').setAttribute('aria-pressed', String(mobilePane === 'observe'));
    get<HTMLElement>('.h-sky-controls').hidden = !sky;
    get<HTMLElement>('.h-planet-controls').hidden = sky;
    get<HTMLElement>('[data-h-optics]').hidden = !sky;
    get<SVGElement>('[data-h-leaders]').style.display = sky ? 'none' : '';
    get<HTMLElement>('[data-h-horizon-fields]').hidden = s.track !== 'horizon';
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-h-track]'))
      button.setAttribute('aria-pressed', String(button.dataset.hTrack === s.track));
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-h-camera]'))
      button.setAttribute('aria-pressed', String(button.dataset.hCamera === s.planetCamera && s.view === 'planet'));
    const updateInput = (selector: string, value: string) => {
      const input = get<HTMLInputElement | HTMLSelectElement>(selector);
      if (document.activeElement !== input) input.value = value;
    };
    updateInput('#h-utc', utcInput(s.time));
    updateInput('#h-latitude', String(s.site.latitude)); updateInput('#h-longitude', String(s.site.longitude));
    updateInput('#h-elevation', String(s.site.elevation));
    const selectedSite = SITES.findIndex(site => site.latitude === s.site.latitude && site.longitude === s.site.longitude && site.elevation === s.site.elevation);
    updateInput('#h-site', selectedSite < 0 ? 'custom' : String(selectedSite));
    updateInput('#h-body', s.body); updateInput('#h-fov', String(Number(s.fov.toFixed(3))));
    updateInput('#h-fov-range', String(Math.log(s.fov / .65) / Math.log(110 / .65) * 1000));
    updateInput('#h-rate', String(s.rate)); updateInput('#h-azimuth', String(Number(s.skyAzimuth.toFixed(3))));
    updateInput('#h-altitude', String(Number(s.skyAltitude.toFixed(3))));
    get<HTMLInputElement>('#h-fov-range').setAttribute('aria-valuetext', `${number(s.fov, 2)} degrees vertical`);
    const point = siteToMap(s.site.latitude, s.site.longitude);
    get<SVGGElement>('[data-h-map-marker]').setAttribute('transform', `translate(${point.x * 360} ${point.y * 180})`);
    get<HTMLButtonElement>('[data-h-action="undo"]').disabled = !history.canUndo;
    text('[data-h-mode-label]', sky ? 'Earth surface / optical instrument' : s.view === 'system' ? 'Ephemeris / orbital atlas' : 'Body-centered / orbital reference');
    text('[data-h-kicker]', sky ? 'THE LOCAL SKY / GEODETIC EARTH OBSERVER' : s.view === 'system' ? 'THE SOLAR SYSTEM / J2000 ECLIPTIC' : `${s.body.toUpperCase()} / ${s.planetCamera === 'orbit' ? 'LOCAL ORBIT' : 'SYSTEM FOLLOW'}`);
    text('[data-h-title]', sky ? s.site.name : s.view === 'system' ? 'The architecture of sunlight.' : s.body);
    text('[data-h-subtitle]', sky ? s.track === 'Moon' ? 'One sphere. The light changes with your point of view.' :
      s.track === 'horizon' ? 'Your geometric horizon. North is 0°; east is 90°.' : 'The Moon’s shadow, seen from where you stand.' :
      s.view === 'system' ? 'Sun, eight planets, and our Moon. Select a world to travel with it.' : b.subtitle);
    text('[data-h-frame-label]', sky ? `${number(s.fov, 2)}° VERTICAL / TRUE ANGULAR` :
      s.view === 'system' || s.planetCamera === 'ride' ? 'COMPRESSED DISTANCE / ENLARGED BODIES' : 'ORIGINAL ILLUSTRATIVE SURFACE / IAU POLE');
    const target = s.track === 'Moon' ? observation.moon : observation.sun;
    if (sky) {
      text('[data-h-instant-label]', s.track === 'Moon' ? 'TOPOCENTRIC LUNAR ILLUMINATION' : 'INSTANTANEOUS ALIGNMENT');
      const eclipse = observation.eclipse;
      text('[data-h-instant]', s.track === 'Moon' ? observation.phase.name :
        observation.sun.visibility === 'below' ? 'Below the horizon' :
          eclipse.kind === 'none' ? 'No solar overlap' : !eclipse.visible ? 'Overlap below horizon' : `${titleCase(eclipse.kind)} eclipse`);
      text('[data-h-instant-detail]', s.track === 'Moon' ?
        `${number(observation.phase.fraction * 100)}% illuminated · Moon ${observation.moon.visibility === 'below' ? 'below the horizon' : observation.moon.visibility === 'horizon' ? 'crosses the horizon' : 'above the horizon'}` :
        `${number(eclipse.obscuration * 100, 2)}% disk obscuration · ${observation.sun.visibility === 'below' || eclipse.kind !== 'none' && !eclipse.visible ? `not visible (${eclipse.kind} geometry)` : observation.sun.visibility === 'horizon' ? 'horizon-clipped; visibility is limited' : eclipse.kind === 'total' ? 'illustrative corona, not photometry' : 'Sun above the geometric horizon'}`);
      text('[data-h-measure-one]', `${s.track === 'Moon' ? 'Moon' : 'Sun'} ALT ${number(target.altitude, 2)}°`);
      text('[data-h-measure-two]', `AZ ${number(target.azimuth, 2)}° · N→E`);
      text('[data-h-measure-three]', `MOON ${number(observation.moon.distanceKm, 0)} km`);
      const scaleDegrees = s.fov <= 3 ? 1 / 6 : s.fov <= 15 ? 1 : s.fov <= 60 ? 5 : 10;
      const host = get<HTMLElement>('[data-h-host]');
      const pixels = host.clientHeight * Math.tan(scaleDegrees * DEG / 2) / Math.tan(s.fov * DEG / 2);
      get<HTMLElement>('.h-scale').style.setProperty('--scale-height', `${pixels}px`);
      text('[data-h-scale]', scaleDegrees < 1 ? '10′' : `${scaleDegrees}°`);
    } else {
      const position = bodies.find(body => body.name === s.body);
      if (!position) throw new Error('Selected planet has no physical position.');
      text('[data-h-instant-label]', s.view === 'system' ? 'SELECTED WORLD' : 'CAMERA REFERENCE');
      text('[data-h-instant]', s.view === 'system' ? s.body : s.planetCamera === 'orbit' ? 'Traveling with this world.' : `Following ${s.body}`);
      text('[data-h-instant-detail]', s.view === 'system' ? 'Drag to orbit. Choose Planet for a local view.' : b.reference);
      text('[data-h-measure-one]', `SUN DISTANCE ${number(position.distanceAu, 4)} AU`);
      text('[data-h-measure-two]', `RADIUS ${number(b.radiusKm, 0)} km`);
      text('[data-h-measure-three]', 'GEOMETRIC / NOT TO SCALE');
    }
    const position = bodies.find(body => body.name === s.body);
    text('[data-h-body-deck]', b.story); text('[data-h-reference]', b.reference);
    text('[data-h-planet-distance]', `${number(position?.distanceAu ?? 0, 4)} AU`);
    text('[data-h-planet-radius]', `${number(b.radiusKm, 0)} km`);
    const solarDiameter = sunAngularDiameterFrom(s.body, s.time);
    text('[data-h-planet-sun]', solarDiameter === null ? 'At the source' : `${number(solarDiameter, 4)}°`);
    text('[data-h-phase-name]', observation.phase.name);
    text('[data-h-phase-observer]', `Earth observer · ${s.site.name}`);
    text('[data-h-angular-sizes]', `Angular diameters: Sun ${number(observation.sun.radius / DEG * 120, 2)}′ · Moon ${number(observation.moon.radius / DEG * 120, 2)}′`);
    text('[data-h-phase-fraction]', `${number(observation.phase.fraction * 100, 1)}% lit`);
    text('[data-h-phase-angle]', `${number(observation.phase.angle, 2)}°`);
    text('[data-h-elongation]', `${number(observation.phase.elongation, 2)}°`);
    text('[data-h-limb-angle]', observation.phase.limbAngle === null ? 'Undefined' : `${number(observation.phase.limbAngle, 1)}°`);
    if (current) {
      const scrub = get<HTMLInputElement>('#h-event-scrub');
      scrub.value = String(clamp(s.time, Number(scrub.min), Number(scrub.max)));
      scrub.setAttribute('aria-valuetext', `${utcInput(s.time)} UTC`);
    }
  }
  function draw() {
    const info = scene.draw(history.state, observation, bodies);
    for (const body of BODIES) {
      const element = get<HTMLButtonElement>(`[data-h-body-label="${body.name}"]`);
      const label = info.labels.find(item => item.name === body.name);
      element.hidden = !label?.visible;
      const leader = get<SVGLineElement>(`[data-h-leader="${body.name}"]`);
      leader.style.display = label?.visible ? '' : 'none';
      if (label) {
        leader.setAttribute('x1', String(label.anchorX)); leader.setAttribute('y1', String(label.anchorY));
        leader.setAttribute('x2', String(label.x)); leader.setAttribute('y2', String(label.y));
      }
      if (label) { element.style.left = `${label.x}px`; element.style.top = `${label.y}px`; }
      element.setAttribute('aria-pressed', String(body.name === state.body));
    }
    dirty = false;
  }
  function setPaused(paused: boolean) {
    if (page.signal.aborted) return;
    const wasPlaying = playing;
    playing = !paused; timeAccumulator = 0;
    if (wasPlaying !== playing) history.claim();
    loop?.setPaused(paused);
    const button = get<HTMLButtonElement>('[data-h-action="play"]');
    button.textContent = paused ? '▶ Run' : 'Ⅱ Pause';
    button.setAttribute('aria-label', paused ? 'Run time' : 'Pause time');
    text('[data-h-live-label]', paused ? 'TIME HELD' : 'TIME RUNNING');
    page.root.dataset.playing = String(playing);
    if (wasPlaying && paused && currentKey !== eventKey(state.time, state.site)) void requestCurrent().catch(fail);
  }
  loop = createLoop((_elapsed, delta) => {
    if (playing && delta > 0) {
      timeAccumulator += delta;
      if (timeAccumulator >= .12) {
        const dt = timeAccumulator; timeAccumulator = 0;
        try { apply({ ...history.state, time: validTime(history.state.time + dt * state.rate * 1000) }, false, false); }
        catch (error) { setPaused(true); fail(error); }
      }
    }
    if (dirty) draw();
  }, { paused: true });
  page.onCleanup(loop.destroy);

  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-h-view]')) {
    button.addEventListener('click', action(() => {
      const view = button.dataset.hView;
      if (view === 'system' || view === 'planet' || view === 'sky') setView(view);
    }), { signal: page.signal });
  }
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-h-body-label]')) {
    button.addEventListener('click', action(() => { const body = button.dataset.hBodyLabel; if (isBody(body)) chooseBody(body); }), { signal: page.signal });
  }
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-h-track]')) {
    button.addEventListener('click', action(() => {
      const track = button.dataset.hTrack;
      if (track !== 'Sun' && track !== 'Moon' && track !== 'horizon') throw new Error('Unsupported tracking target.');
      apply({ ...history.state, track, ...(track === 'horizon' ? { fov: 90, skyAltitude: 15 } : {}) });
      report(track === 'horizon' ? 'Wide horizon view. Drag to point, or enter a look azimuth and altitude.' : `Tracking the ${track}. Its real altitude and local-up orientation are preserved.`);
    }), { signal: page.signal });
  }
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-h-camera]')) {
    button.addEventListener('click', action(() => {
      const camera = button.dataset.hCamera;
      if (camera !== 'orbit' && camera !== 'ride') throw new Error('Unsupported planet camera.');
      mobilePane = 'planet'; apply({ ...history.state, view: 'planet', planetCamera: camera, orbitZoom: 1 });
    }), { signal: page.signal });
  }
  on('observe-pane', () => { mobilePane = 'observe'; syncUI(); });
  on('earth-surface', () => { apply({ ...history.state, body: 'Earth' }); setView('sky'); });
  on('zoom-in', () => {
    const s = history.state;
    apply(s.view === 'sky' ? { ...s, fov: clamp(s.fov * .8, .65, 110) } : { ...s, orbitZoom: clamp(s.orbitZoom * .8, .45, 3) });
  });
  on('zoom-out', () => {
    const s = history.state;
    apply(s.view === 'sky' ? { ...s, fov: clamp(s.fov * 1.25, .65, 110) } : { ...s, orbitZoom: clamp(s.orbitZoom * 1.25, .45, 3) });
  });
  on('center', () => {
    const s = history.state;
    apply(s.view === 'sky' ? { ...s, track: s.track === 'Moon' ? 'Moon' : 'Sun', fov: 1.6 } :
      { ...s, orbitYaw: .45, orbitPitch: .48, orbitZoom: 1 });
  });
  on('point', () => apply({ ...history.state, skyAzimuth: get<HTMLInputElement>('#h-azimuth').valueAsNumber, skyAltitude: get<HTMLInputElement>('#h-altitude').valueAsNumber }));
  get<HTMLSelectElement>('#h-body').addEventListener('change', action(() => {
    const body = get<HTMLSelectElement>('#h-body').value;
    if (!isBody(body)) throw new Error('Unsupported body.');
    chooseBody(body);
  }), { signal: page.signal });
  get<HTMLSelectElement>('#h-site').addEventListener('change', action(() => {
    const value = get<HTMLSelectElement>('#h-site').value;
    if (value === 'custom') { get<HTMLInputElement>('#h-latitude').focus(); return; }
    const site = SITES[Number(value)];
    if (!site) throw new Error('Unsupported observer preset.');
    setPaused(true); apply({ ...history.state, site: { ...site } });
    report(`Observer moved to ${site.name}. The UTC instant has not changed.`);
  }), { signal: page.signal });
  get<HTMLFormElement>('[data-h-location-form]').addEventListener('submit', event => {
    event.preventDefault();
    action(() => {
      setPaused(true);
      apply({ ...history.state, site: { name: 'Custom observer', latitude: get<HTMLInputElement>('#h-latitude').valueAsNumber,
        longitude: get<HTMLInputElement>('#h-longitude').valueAsNumber, elevation: get<HTMLInputElement>('#h-elevation').valueAsNumber } });
      report('Geodetic observer applied. The same UTC instant is now seen from a different place.');
    })();
  }, { signal: page.signal });
  const map = get<HTMLElement>('[data-h-map]');
  let mapPointer: number | null = null;
  map.addEventListener('pointerdown', event => {
    if (mapPointer !== null || event.button !== 0) return;
    mapPointer = event.pointerId; map.setPointerCapture(event.pointerId);
  }, { signal: page.signal });
  map.addEventListener('pointerup', event => {
    if (mapPointer !== event.pointerId) return;
    mapPointer = null; map.releasePointerCapture(event.pointerId);
    action(() => {
      const r = get<SVGSVGElement>('[data-h-map] svg').getBoundingClientRect();
      const site = mapToSite((event.clientX - r.left) / r.width, (event.clientY - r.top) / r.height);
      setPaused(true);
      apply({ ...history.state, site: { name: 'Map observer', latitude: Number(site.latitude.toFixed(4)), longitude: Number(site.longitude.toFixed(4)), elevation: 0 } });
      report('Map location selected at 0 m elevation. Adjust the numeric coordinates for a specific site.');
    })();
  }, { signal: page.signal });
  map.addEventListener('lostpointercapture', () => { mapPointer = null; }, { signal: page.signal });
  map.addEventListener('keydown', event => {
    const lon = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const lat = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
    if (!lat && !lon) return;
    event.preventDefault();
    action(() => {
      setPaused(true);
      const s = history.state;
      apply({ ...s, site: { ...s.site, name: 'Map observer', latitude: clamp(s.site.latitude + lat, -90, 90), longitude: clamp(s.site.longitude + lon, -180, 180) } });
    })();
  }, { signal: page.signal });
  get<HTMLInputElement>('#h-fov').addEventListener('change', action(() => apply({ ...history.state, fov: get<HTMLInputElement>('#h-fov').valueAsNumber })), { signal: page.signal });
  get<HTMLInputElement>('#h-fov-range').addEventListener('input', action(() => {
    const value = .65 * Math.pow(110 / .65, Number(get<HTMLInputElement>('#h-fov-range').value) / 1000);
    apply({ ...history.state, fov: value }, false);
  }), { signal: page.signal });
  get<HTMLSelectElement>('#h-rate').addEventListener('change', action(() => apply({ ...history.state, rate: Number(get<HTMLSelectElement>('#h-rate').value) })), { signal: page.signal });
  on('set-time', () => {
    const time = parseUTC(get<HTMLInputElement>('#h-utc').value);
    setPaused(true); apply({ ...history.state, time }); report(`Observation set to ${utcInput(time)} UTC, independent of browser time zone.`);
  });
  get<HTMLInputElement>('#h-utc').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); get<HTMLButtonElement>('[data-h-action="set-time"]').click(); }
  }, { signal: page.signal });
  on('play', () => { setPaused(playing); report(playing ? 'Time is running. Cameras do not move on their own.' : 'Time is held. All controls remain available.'); });
  const step = (direction: number) => {
    setPaused(true);
    const time = validTime(history.state.time + direction * Number(get<HTMLSelectElement>('#h-step').value) * 1000);
    apply({ ...history.state, time }); report(`Stepped to ${utcInput(time)} UTC.`);
  };
  on('step-back', () => step(-1)); on('step-forward', () => step(1));
  on('undo', () => {
    setPaused(true); history.undo(); mobilePane = history.state.view;
    apply(history.state, false); report('Previous observation restored, paused.');
  });
  on('reset', () => {
    setPaused(true); history.reset(); mobilePane = history.state.view;
    apply(history.state, false); report('Reset to the original computed Nazas totality. Imported observations never change the reset baseline.');
  });
  get<HTMLInputElement>('#h-event-scrub').addEventListener('input', action(() => {
    setPaused(true); apply({ ...history.state, time: Number(get<HTMLInputElement>('#h-event-scrub').value) }, false);
  }), { signal: page.signal });
  on('peak', () => {
    if (!current) throw new Error('There is no local peak for this date and observer.');
    setPaused(true); mobilePane = 'sky';
    apply({ ...history.state, time: current.peak, view: 'sky', track: 'Sun', fov: 1.6 });
    report(`At local peak, ${utcClock(current.peak)} UTC. The live disk classification is independent of the event name.`);
  });
  on('next-eclipse', async () => {
    setPaused(true);
    const owner = history.claim(), captured = history.state;
    const generation = ++eventGeneration;
    if (!current) {
      currentKey = '';
      renderEvent('Searching ahead. Current-date contacts will be restored if you keep this observation.');
    }
    report('Searching the next five years for a local eclipse. Your current observation is unchanged until a result is ready.');
    try {
      const result = await search.find({ mode: 'next', time: captured.time, site: captured.site });
      if (!history.owns(owner) || page.signal.aborted) return;
      if (!result) throw new Error('No next local eclipse was returned.');
      current = result; currentKey = eventKey(result.peak, captured.site); mobilePane = 'sky';
      apply({ ...captured, time: result.peak, view: 'sky', track: 'Sun', fov: 1.6 }, true, false);
      renderEvent(); report(`Advanced explicitly to the next local eclipse: ${result.day}, ${utcClock(result.peak)} UTC.`);
    } finally {
      if (!page.signal.aborted && !playing && generation === eventGeneration &&
          currentKey !== eventKey(history.state.time, history.state.site)) {
        void requestCurrent().catch(fail);
      }
    }
  });
  const phase = (direction: 1 | -1) => {
    const value = Number(get<HTMLSelectElement>('#h-phase').value);
    if (value !== 0 && value !== 90 && value !== 180 && value !== 270) throw new Error('Unsupported lunar phase.');
    const time = nextPhase(history.state.time, value, direction);
    setPaused(true); mobilePane = 'sky';
    apply({ ...history.state, time, view: 'sky', track: 'Moon', fov: 1.6 });
    report(`At the ${direction > 0 ? 'next' : 'previous'} geocentric longitude phase. The displayed illumination and horizon are topocentric.`);
  };
  on('phase-back', () => phase(-1)); on('phase-next', () => phase(1));
  on('moon-study', () => {
    setPaused(true); mobilePane = 'sky';
    apply({ ...history.state, site: { ...SITES[7] }, time: parseUTC('2024-04-17T18:00:00Z'), view: 'sky', track: 'Moon', fov: 1.6 });
    report('Evening Moon from Cape Town. Try London at the same UTC instant to change its local-up orientation.');
  });
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-h-study]')) {
    button.addEventListener('click', action(async () => {
      const study = STUDIES.find(item => item.id === button.dataset.hStudy);
      if (!study) throw new Error('Unknown observation study.');
      setPaused(true); mobilePane = 'sky';
      const time = study.seek ? dayStart(study.day) + 18 * 3600000 : baseline.time;
      apply({ ...history.state, site: { ...SITES[study.site] }, time, view: 'sky', track: 'Sun', fov: 1.6 }, true, false);
      report(study.seek ? 'Solving this study’s local peak; no result is prescribed by its title.' : 'Sydney at the original Nazas peak UTC. The Earth itself blocks this line of sight.');
      await requestCurrent(study.seek);
    }), { signal: page.signal });
  }
  function fillRecord() {
    get<HTMLTextAreaElement>('#h-record').value = observationRecord(history.state, observation, current);
    get<HTMLTextAreaElement>('#h-share').value = shareURL(window.location.href, history.state);
    text('[data-h-record-status]', 'The JSON includes the validated state, physical snapshot, and available local contacts.');
  }
  function restore(decoded: StudyState) {
    setPaused(true); mobilePane = decoded.view; apply(decoded);
    keepDialog.close(); report('Observation restored and recomputed, paused. Reset still returns to the original Nazas study.');
  }
  on('keep', () => { setPaused(true); fillRecord(); keepDialog.showModal(); });
  on('notes', () => { setPaused(true); notesDialog.showModal(); });
  on('notes-footer', () => { setPaused(true); notesDialog.showModal(); });
  on('download', () => downloadText(`helios-${utcDay(history.state.time)}.json`, observationRecord(history.state, observation, current), 'application/json'));
  on('restore-text', () => {
    const owner = history.claim();
    const decoded = decodeStudy(get<HTMLTextAreaElement>('#h-record').value);
    if (history.owns(owner)) restore(decoded);
  });
  on('copy', async () => {
    const link = get<HTMLTextAreaElement>('#h-share');
    await copyText(link.value, message => { if (!page.signal.aborted) text('[data-h-record-status]', message); });
  });
  get<HTMLInputElement>('#h-file').addEventListener('change', action(async () => {
    const input = get<HTMLInputElement>('#h-file'), file = input.files?.[0];
    if (!file) return;
    const owner = history.claim();
    input.value = '';
    if (file.size > 32000) throw new Error('Observation files are limited to 32 KB.');
    const contents = await file.text();
    if (!history.owns(owner) || page.signal.aborted) return;
    const decoded = decodeStudy(contents);
    if (history.owns(owner)) restore(decoded);
  }), { signal: page.signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { history.claim(); setPaused(true); }
  }, { signal: page.signal });
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  preference.addEventListener('change', event => { if (event.matches) setPaused(true); }, { signal: page.signal });
  page.onCleanup(() => { playing = false; ++eventGeneration; mapPointer = null; });
  setPaused(true); syncUI(); renderEvent(); draw();
  if (currentKey !== eventKey(state.time, state.site)) {
    try { await requestCurrent(); } catch (error) { fail(error); }
    page.signal.throwIfAborted();
  }
  page.root.setAttribute('aria-busy', 'false');
  page.root.dataset.ready = 'true';
  report(linkError || (eventKey(state.time, state.site) === eventKey(baseline.time, baseline.site) ?
    'Nazas totality is computed, not staged. Move the observer or scrub the contacts to see why.' :
    'Shared observation restored with its own UTC instant and observer. All geometry has been recomputed.'), Boolean(linkError));
  return { destroy: page.destroy, setPaused, reset: () => get<HTMLButtonElement>('[data-h-action="reset"]').click() };
}
