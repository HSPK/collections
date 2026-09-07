import './style.css';
import { createProjectPage, copyText, downloadText, query } from '../../core/page';
import { createLoop } from '../../core/loop';
import { siteUrl } from '../../core/urls';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { BODIES, bodyData, isBody, SITES, STUDIES } from './data';
import type { BodyName, Site } from './data';
import { observe, nextPhase, sunAngularDiameterFrom, systemAt } from './astronomy';
import { clamp, DEG, wrap } from './math';
import { dayStart, parseUTC, utcClock, utcDay, utcInput, validTime } from './time';
import { decodeStudy, initialState, shareURL, stateFromHash, StudyHistory } from './state';
import type { StudyState, View } from './state';
import { eventKey } from './eclipse';
import type { LocalEvent } from './eclipse';
import { EclipseSearch } from './search';
import { createRenderer } from './render';
import { observationRecord } from './interchange';
import { loadGeography } from './geography';
import { createObserverMap } from './map';
import { ObservationClock } from './clock';
import { createTimeAxis } from './time-axis';
import { markup } from './ui';

const numberFormats = new Map<number, Intl.NumberFormat>();
const number = (n: number, digits = 1) => {
  let format = numberFormats.get(digits);
  if (!format) {
    format = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numberFormats.set(digits, format);
  }
  return format.format(n);
};
const sameSite = (a: Site, b: Site) => a.name === b.name && a.latitude === b.latitude &&
  a.longitude === b.longitude && a.elevation === b.elevation;
const altitudeLabel = (value: number) => `${value < 0 ? '' : '+'}${number(value, 2)}°`;
const horizonLabels = { above: 'Above horizon', horizon: 'Horizon crossing', below: 'Below horizon' };
const titleCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
const aborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';
type Instrument = 'observer' | 'eclipse' | 'moon' | 'journeys';
const isInstrument = (value: unknown): value is Instrument => ['observer', 'eclipse', 'moon', 'journeys'].some(item => item === value);

export async function mount(context: ProjectContext): Promise<ProjectInstance> {
  const page = createProjectPage(context, 'helios');
  page.root.dataset.workspace = 'true';
  page.root.innerHTML = markup();
  page.root.setAttribute('aria-labelledby', 'helios-title');
  page.root.setAttribute('aria-busy', 'true');
  const get = <T extends Element>(selector: string) => query<T>(page.root, selector);
  const text = (selector: string, value: string) => {
    const element = get<HTMLElement>(selector);
    if (element.textContent !== value) element.textContent = value;
  };
  function report(message: string, error = false) {
    if (page.signal.aborted) return;
    const status = get<HTMLElement>('[data-h-status]');
    status.textContent = message; status.title = message;
    page.root.dataset.error = String(error);
    if (error) page.report(message);
  }
  const search = new EclipseSearch(); page.onCleanup(() => search.destroy());
  const baseline = initialState();
  const resources = await Promise.all([
    search.find({ mode: 'current', time: baseline.time, site: baseline.site }),
    loadGeography(siteUrl('helios/ne_50m_land.geojson'), page.signal),
  ]).catch(error => { page.destroy(); throw error; });
  page.signal.throwIfAborted();
  const [initialEvent, land] = resources;
  if (!initialEvent) { page.destroy(); throw new Error('The initial Nazas eclipse could not be solved. No substitute event was selected.'); }
  baseline.time = initialEvent.peak;
  const history = new StudyHistory(baseline); page.onCleanup(() => history.dispose());
  let linkError = '';
  try {
    const linked = stateFromHash(window.location.hash);
    if (linked) history.commit(linked, false);
  } catch (error) { linkError = `Observation link rejected: ${messageOf(error)} The original Nazas study is shown.`; }
  let state = history.state, observation = observe(state.time, state.site), bodies = systemAt(state.time);
  const clock = new ObservationClock(state.time); page.onCleanup(() => clock.dispose());
  let current: LocalEvent | null = eventKey(state.time, state.site) === eventKey(baseline.time, baseline.site) ? initialEvent : null;
  let currentKey = current ? eventKey(state.time, state.site) : '';
  let eventGeneration = 0, clockTimer = 0, contactTimer = 0;
  let playing = false, scrubbing = false, dirty = true;
  let loop: ReturnType<typeof createLoop> | undefined;
  let timeAxis: ReturnType<typeof createTimeAxis> | undefined;
  let lastMapKey = '';
  const dock = get<HTMLDialogElement>('[data-h-dock]');
  const keepDialog = get<HTMLDialogElement>('[data-h-keep-dialog]');
  const notesDialog = get<HTMLDialogElement>('[data-h-notes-dialog]');
  const timeDialog = get<HTMLDialogElement>('[data-h-time-dialog]');
  const dockLayout = window.matchMedia('(min-width: 1000px) and (min-height: 600px)');
  let instrument: Instrument = 'eclipse';
  let skyInstrument: Instrument = instrument;
  let detailBody: BodyName | undefined, detailTime: number | undefined;
  let recordJSON = '', recordLink = '', recordDay = '';
  function fail(error: unknown) {
    if (aborted(error) || page.signal.aborted) return;
    report(messageOf(error), true);
    if (keepDialog.open) text('[data-h-record-status]', messageOf(error));
  }
  function action(callback: () => void | Promise<void>) {
    return () => {
      try { const result = callback(); if (result instanceof Promise) void result.catch(fail); }
      catch (error) { fail(error); }
    };
  }
  const on = (name: string, callback: () => void | Promise<void>) =>
    get<HTMLButtonElement>(`[data-h-action="${name}"]`).addEventListener('click', action(callback), { signal: page.signal });
  function invalidate() { dirty = true; loop?.requestRender(); }
  function finishDockAction() { if (!dockLayout.matches && dock.open) dock.close(); }
  function selectInstrument(panel: Instrument) {
    instrument = panel;
    for (const element of page.root.querySelectorAll<HTMLElement>('[data-h-instrument]')) element.hidden = element.dataset.hInstrument !== panel;
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-h-panel]')) button.setAttribute('aria-pressed', String(button.dataset.hPanel === panel));
    page.root.dataset.instrument = panel;
  }
  function showDock(panel: Instrument) {
    selectInstrument(panel);
    if (state.view === 'sky' || panel !== 'observer') skyInstrument = panel;
    if (!dock.open) { if (dockLayout.matches) dock.show(); else dock.showModal(); }
    invalidate();
  }
  function adaptDock() {
    if (dock.open) dock.close();
    if (dockLayout.matches) showDock(instrument);
    invalidate();
  }
  function openDialog(dialog: HTMLDialogElement) {
    finishDockAction();
    for (const other of [timeDialog, keepDialog, notesDialog]) if (other !== dialog && other.open) other.close();
    if (!dialog.open) dialog.showModal();
  }
  selectInstrument(state.view === 'sky' ? skyInstrument : 'observer');
  if (dockLayout.matches) {
    dock.show();
    if (document.activeElement instanceof HTMLElement && dock.contains(document.activeElement)) document.activeElement.blur();
  }
  dockLayout.addEventListener('change', adaptDock, { signal: page.signal });
  const map = createObserverMap({
    host: get('[data-h-map]'), land, signal: page.signal,
    onChoose(latitude, longitude) {
      action(() => {
        apply({ ...history.state, site: { name: 'Map observer', latitude: Number(latitude.toFixed(4)), longitude: Number(longitude.toFixed(4)), elevation: 0 } });
        report('Map observer selected at 0 m. Refine the numeric coordinates or apply to return to the sky.');
      })();
    },
    report: message => report(message),
  });
  page.onCleanup(map.destroy);
  let scene: ReturnType<typeof createRenderer>;
  try { scene = createRenderer({
    host: get('[data-h-host]'), zoomTarget: get<HTMLElement>('.h-stage'), land, signal: page.signal, invalidate,
    navigate(dx, dy, zoom) {
      action(() => {
        const next = history.state;
        if (next.view === 'sky') {
          if (zoom) next.fov = clamp(next.fov * zoom, .65, 110);
          else {
            const target = next.track === 'Moon' ? observation.moon : observation.sun;
            const az = next.track === 'horizon' ? next.skyAzimuth : target.azimuth;
            const alt = next.track === 'horizon' ? next.skyAltitude : target.altitude;
            next.skyAzimuth = wrap(az - dx * next.fov * 1.7);
            next.skyAltitude = clamp(alt + dy * next.fov, -90, 90); next.track = 'horizon';
          }
        } else {
          next.orbitYaw = wrap((next.orbitYaw - dx * 5) / DEG) * DEG;
          next.orbitPitch = clamp(next.orbitPitch + dy * 3, -1.45, 1.45);
          if (zoom) next.orbitZoom = clamp(next.orbitZoom * zoom, .45, 3);
        }
        apply(next, false);
      })();
    },
    select: name => action(() => chooseBody(name))(),
    report(message) { setPaused(true); report(message, true); },
  }); } catch (error) { page.destroy(); throw error; }
  page.onCleanup(scene.destroy);

  function chooseBody(name: BodyName) {
    apply({ ...history.state, body: name, view: state.view === 'sky' ? 'planet' : state.view });
    finishDockAction();
    report(`${name} selected.`);
  }
  function setView(view: View) {
    apply({ ...history.state, view }); finishDockAction();
    report(view === 'sky' ? 'Earth sky. Select a location and track the Sun, Moon, or horizon.' :
      'Scroll to zoom, drag to orbit. Choose a world from the selector or its label.');
  }
  function apply(next: StudyState, remember = true, findEvent = true, automatic = false) {
    // Camera-only edits use the held clock sample; timers own Live/Playback cadence.
    if (!automatic && clock.mode !== 'manual' &&
        (next.time !== state.time || !sameSite(next.site, state.site) || next.rate !== state.rate))
      next = { ...next, time: clock.sample(Date.now()) };
    const snapshot = next.time === observation.time && sameSite(next.site, observation.site) ?
      observation : observe(next.time, next.site);
    const positions = next.time === state.time ? bodies : systemAt(next.time);
    const previousView = state.view;
    if (automatic) history.advanceTime(next.time); else history.commit(next, remember);
    state = history.state; observation = snapshot; bodies = positions;
    if (state.view !== previousView) {
      if (previousView === 'sky') skyInstrument = instrument;
      selectInstrument(state.view === 'sky' ? skyInstrument : 'observer');
    }
    if (clock.mode === 'manual') clock.hold(state.time);
    const key = eventKey(state.time, state.site);
    if (key !== currentKey) {
      current = null;
      if (!scrubbing && !playing && (findEvent || clock.mode === 'live')) void requestCurrent().catch(fail);
      else {
        ++eventGeneration; search.cancel(); currentKey = '';
        renderEvent(scrubbing ? 'Scrubbing UTC; contacts update on release.' : 'Pause playback to compute this date’s contacts.');
      }
    }
    syncUI(); invalidate();
  }
  async function requestCurrent(seek = false) {
    clearTimeout(contactTimer); contactTimer = 0;
    const captured = history.state, generation = ++eventGeneration;
    const key = eventKey(captured.time, captured.site), owner = seek ? history.claim() : null;
    currentKey = key; current = null; renderEvent('Solving contacts for this date and location…');
    let result: LocalEvent | null;
    try { result = await search.find({ mode: 'current', time: captured.time, site: captured.site }); }
    catch (error) {
      if (page.signal.aborted || generation !== eventGeneration || aborted(error)) return;
      currentKey = ''; renderEvent(`Contact search failed: ${messageOf(error)}`); throw error;
    }
    if (page.signal.aborted || generation !== eventGeneration || eventKey(history.state.time, history.state.site) !== key) return;
    current = result;
    if (seek && owner !== null && history.owns(owner) && result) {
      apply({ ...history.state, time: result.peak }, false, false);
      timeAxis?.setTime(result.peak, true);
      report(`Computed ${result.kind} peak in ${state.site.name}: ${utcClock(result.peak)} UTC.`);
    } else if (seek && !result && owner !== null && history.owns(owner)) report('No local eclipse was returned on this UTC date. Date and observer were kept.');
    renderEvent(); syncUI(); invalidate();
  }
  function renderEvent(note?: string) {
    text('[data-h-event-day]', utcDay(history.state.time));
    const contacts = get<HTMLElement>('[data-h-contacts]'); contacts.replaceChildren();
    const scrub = get<HTMLInputElement>('#h-event-scrub'); scrub.disabled = !current;
    get<HTMLButtonElement>('[data-h-action="peak"]').disabled = !current;
    if (note || !current) {
      text('[data-h-event-kind]', note ? 'Current-date circumstances' : 'No local event returned');
      text('[data-h-event-description]', note || 'No visible local eclipse was returned for this UTC date and observer. Instantaneous geometry remains above.');
      const line = document.createElement('p'); line.className = 'h-no-event';
      line.textContent = note ? 'The selected observation remains usable.' : 'No future event has been substituted.';
      contacts.append(line); return;
    }
    const duration = current.centralDuration;
    text('[data-h-event-kind]', `${titleCase(current.kind)} event`);
    text('[data-h-event-description]', duration === null ? 'Partial contacts at this observer. Choose a contact or scrub.' :
      `${current.kind === 'total' ? 'Totality' : 'Annularity'}: ${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s in the library shadow model.`);
    for (const contact of current.contacts) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.hContact = contact.label;
      button.setAttribute('aria-label', `${contact.label} at ${utcClock(contact.time)} UTC`);
      const label = document.createElement('b'); label.textContent = contact.label;
      const time = document.createElement('time'); time.dateTime = new Date(contact.time).toISOString(); time.textContent = utcClock(contact.time);
      const altitude = document.createElement('small'); altitude.textContent = `${number(contact.altitude)}° alt`;
      button.append(label, time, altitude);
      button.addEventListener('click', action(() => {
        setPaused(true, false); apply({ ...history.state, time: contact.time }); finishDockAction();
        report(`${contact.label}: ${utcClock(contact.time)} UTC. Live disk tangencies can differ by seconds.`);
      }), { signal: page.signal });
      contacts.append(button);
    }
    scrub.min = String(current.contacts[0].time); scrub.max = String(current.contacts[current.contacts.length - 1].time);
    scrub.value = String(clamp(state.time, Number(scrub.min), Number(scrub.max)));
    scrub.setAttribute('aria-valuetext', `${utcInput(state.time)} UTC`);
  }
  function syncUI() {
    const s = history.state, sky = s.view === 'sky', b = bodyData(s.body);
    page.root.dataset.view = s.view; page.root.dataset.time = String(s.time);
    page.root.dataset.eclipse = observation.eclipse.kind; page.root.dataset.visibility = observation.sun.visibility;
    page.root.dataset.phase = String(observation.phase.fraction); page.root.dataset.clockMode = clock.mode;
    page.root.dataset.playing = String(playing);
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-h-view]')) button.setAttribute('aria-pressed', String(button.dataset.hView === s.view));
    get<HTMLElement>('.h-sky-controls').hidden = !sky; get<HTMLElement>('.h-planet-controls').hidden = sky;
    get<HTMLElement>('.h-sky-quick').hidden = !sky; get<HTMLElement>('.h-world-quick').hidden = sky;
    get<HTMLElement>('[data-h-sky-summary]').hidden = !sky;
    get<HTMLElement>('[data-h-title]').hidden = sky;
    get<HTMLElement>('[data-h-sky-altitudes]').hidden = !sky;
    get<HTMLElement>('[data-h-world-measures]').hidden = sky;
    get<HTMLSelectElement>('#h-camera-select').hidden = s.view !== 'planet';
    get<HTMLElement>('[data-h-optics]').hidden = !sky;
    get<SVGElement>('[data-h-leaders]').style.display = sky ? 'none' : '';
    get<HTMLElement>('[data-h-horizon-fields]').hidden = s.track !== 'horizon';
    const updateInput = (selector: string, value: string) => {
      const input = get<HTMLInputElement | HTMLSelectElement>(selector);
      if (document.activeElement !== input && input.value !== value) input.value = value;
    };
    updateInput('#h-utc', utcInput(s.time));
    updateInput('#h-latitude', String(s.site.latitude)); updateInput('#h-longitude', String(s.site.longitude)); updateInput('#h-elevation', String(s.site.elevation));
    const selectedSite = SITES.findIndex(site => sameSite(site, s.site));
    text('#h-site option[value="custom"]', selectedSite < 0 ? s.site.name : 'Custom observer');
    updateInput('#h-site', selectedSite < 0 ? 'custom' : String(selectedSite));
    updateInput('#h-body', s.body); updateInput('#h-track-select', s.track); updateInput('#h-camera-select', s.planetCamera);
    updateInput('#h-fov', String(Number(s.fov.toFixed(3))));
    updateInput('#h-fov-range', String(Math.log(s.fov / .65) / Math.log(110 / .65) * 1000));
    updateInput('#h-rate', String(s.rate)); updateInput('#h-azimuth', String(Number(s.skyAzimuth.toFixed(3)))); updateInput('#h-altitude', String(Number(s.skyAltitude.toFixed(3))));
    get<HTMLInputElement>('#h-fov-range').setAttribute('aria-valuetext', `${number(s.fov, 2)} degrees vertical`);
    const mapKey = `${s.site.latitude}:${s.site.longitude}`;
    if (mapKey !== lastMapKey) { map.setSite(s.site); lastMapKey = mapKey; }
    get<HTMLButtonElement>('[data-h-action="undo"]').disabled = !history.canUndo;
    text('[data-h-clock-mode]', clock.mode === 'live' ? 'LIVE / DEVICE UTC' : playing ? 'PLAYBACK / UTC' : 'MANUAL / UTC');
    text('[data-h-clock-date]', utcDay(s.time)); text('[data-h-clock-time]', `${utcClock(s.time)} UTC`);
    get<HTMLTimeElement>('[data-h-utc-display]').dateTime = new Date(s.time).toISOString();
    get('[data-h-action="live"]').setAttribute('aria-pressed', String(clock.mode === 'live'));
    const play = get<HTMLButtonElement>('[data-h-action="play"]');
    const playLabel = playing ? 'Ⅱ Pause' : '▶ Run';
    if (play.textContent !== playLabel) play.textContent = playLabel;
    play.setAttribute('aria-label', playing ? 'Pause time' : 'Run time');
    const stepValue = get<HTMLSelectElement>('#h-step').value;
    text('[data-h-step-display]', stepValue === '1' ? '1s' : stepValue === '60' ? '1m' : stepValue === '3600' ? '1h' : '1d');
    text('[data-h-open="observer"]', sky ? 'Observe' : 'Details');
    text('[data-h-panel="observer"]', sky ? 'Place' : 'Details');
    text('[data-h-kicker]', sky ? 'True angular sky' : s.view === 'system' || s.planetCamera === 'ride' ?
      'Schematic · not to scale' : 'Body-centered reference');
    if (!sky) text('[data-h-title]', s.view === 'system' ? 'Solar system' : s.body);
    const target = s.track === 'Moon' ? observation.moon : observation.sun;
    if (sky) {
      const eclipse = observation.eclipse;
      text('[data-h-instant]', s.track === 'Moon' ? observation.phase.name : observation.sun.visibility === 'below' ? 'Below the horizon' : eclipse.kind === 'none' ? 'No solar overlap' : !eclipse.visible ? 'Overlap below horizon' : `${titleCase(eclipse.kind)} eclipse`);
      text('[data-h-instant-detail]', s.track === 'Moon' ? `${number(observation.phase.fraction * 100)}% illuminated` :
        `${number(eclipse.obscuration * 100, 2)}% disk coverage${eclipse.kind === 'total' && observation.sun.visibility === 'above' ? ' · illustrative corona' : ''}`);
      for (const [name, body] of [['sun', observation.sun], ['moon', observation.moon]] as const) {
        text(`[data-h-${name}-altitude]`, altitudeLabel(body.altitude));
        text(`[data-h-${name}-visibility]`, horizonLabels[body.visibility]);
        get<HTMLElement>(`[data-h-altitude="${name === 'sun' ? 'Sun' : 'Moon'}"]`).dataset.visibility = body.visibility;
      }
      text('[data-h-azimuth-reading]', `Look azimuth ${number(s.track === 'horizon' ? s.skyAzimuth : target.azimuth, 2)}° · north 0°, east 90°`);
      const scaleDegrees = s.fov <= 3 ? 1 / 6 : s.fov <= 15 ? 1 : s.fov <= 60 ? 5 : 10;
      text('[data-h-scale]', scaleDegrees < 1 ? '10′' : `${scaleDegrees}°`);
    } else {
      const position = bodies.find(body => body.name === s.body);
      if (!position) throw new Error('Selected planet has no physical position.');
      text('[data-h-measure-one]', `Sun distance ${number(position.distanceAu, 4)} AU`);
      text('[data-h-measure-two]', `Mean radius ${number(b.radiusKm, 0)} km`);
    }
    if (!sky && (detailBody !== s.body || detailTime !== s.time)) {
      text('[data-h-body-deck]', b.story); text('[data-h-reference]', b.reference);
      const solarDiameter = sunAngularDiameterFrom(s.body, s.time);
      text('[data-h-planet-sun]', solarDiameter === null ? 'At the source' : `${number(solarDiameter, 4)}°`);
      detailBody = s.body; detailTime = s.time;
    }
    get<HTMLElement>('.h-phase-heading').hidden = sky && s.track === 'Moon';
    get<HTMLElement>('[data-h-phase-observer]').hidden = sky;
    text('[data-h-phase-name]', observation.phase.name); text('[data-h-phase-observer]', `Earth observer · ${s.site.name}`);
    text('[data-h-angular-sizes]', `Diameters: Sun ${number(observation.sun.radius / DEG * 120, 2)}′ · Moon ${number(observation.moon.radius / DEG * 120, 2)}′`);
    text('[data-h-phase-fraction]', `${number(observation.phase.fraction * 100)}% lit`); text('[data-h-phase-angle]', `${number(observation.phase.angle, 2)}°`);
    text('[data-h-moon-distance]', `Distance ${number(observation.moon.distanceKm, 0)} km`);
    text('[data-h-elongation]', `${number(observation.phase.elongation, 2)}°`); text('[data-h-limb-angle]', observation.phase.limbAngle === null ? 'Undefined' : `${number(observation.phase.limbAngle)}°`);
    if (current) {
      const scrub = get<HTMLInputElement>('#h-event-scrub'); scrub.value = String(clamp(s.time, Number(scrub.min), Number(scrub.max)));
      scrub.setAttribute('aria-valuetext', `${utcInput(s.time)} UTC`);
    }
    timeAxis?.setTime(s.time);
  }
  function draw() {
    if (state.view === 'sky') {
      const degrees = state.fov <= 3 ? 1 / 6 : state.fov <= 15 ? 1 : state.fov <= 60 ? 5 : 10;
      const pixels = get<HTMLElement>('[data-h-host]').clientHeight * Math.tan(degrees * DEG / 2) / Math.tan(state.fov * DEG / 2);
      get<HTMLElement>('.h-scale').style.setProperty('--scale-height', `${pixels}px`);
    }
    const info = scene.draw(history.state, observation, bodies);
    for (const body of BODIES) {
      const element = get<HTMLButtonElement>(`[data-h-body-label="${body.name}"]`);
      const label = info.labels.find(item => item.name === body.name), leader = get<SVGLineElement>(`[data-h-leader="${body.name}"]`);
      element.hidden = !label?.visible; leader.style.display = label?.visible ? '' : 'none';
      if (label) {
        leader.setAttribute('x1', String(label.anchorX)); leader.setAttribute('y1', String(label.anchorY));
        leader.setAttribute('x2', String(label.x)); leader.setAttribute('y2', String(label.y));
        element.style.left = `${label.x}px`; element.style.top = `${label.y}px`;
      }
      element.setAttribute('aria-pressed', String(body.name === state.body));
    }
    dirty = false;
  }
  function scheduleClock() {
    clearTimeout(clockTimer); clockTimer = 0;
    if (page.signal.aborted || clock.mode === 'manual' || document.hidden) return;
    clockTimer = window.setTimeout(() => {
      clockTimer = 0;
      try { advanceClock(); } catch (error) { setPaused(true, false); fail(error); }
      scheduleClock();
    }, clock.mode === 'live' ? 250 : 125);
  }
  function advanceClock() {
    const time = clock.sample(Date.now());
    if (time !== state.time) apply({ ...history.state, time }, false, false, true);
  }
  function cancelScrub() {
    scrubbing = false; timeAxis?.cancel();
    clearTimeout(contactTimer); contactTimer = 0;
  }
  function setPaused(paused: boolean, refreshContacts = true, fromTimeline = false) {
    if (page.signal.aborted) return;
    if (!fromTimeline) cancelScrub();
    clearTimeout(contactTimer); contactTimer = 0;
    const wasPlaying = playing, wasLive = clock.mode === 'live';
    if (paused) clock.hold(state.time); else clock.play(state.time, state.rate, Date.now());
    playing = !paused;
    if (wasPlaying !== playing || wasLive) history.claim();
    scheduleClock(); syncUI();
    if (wasPlaying && paused && refreshContacts && currentKey !== eventKey(state.time, state.site)) void requestCurrent().catch(fail);
  }
  loop = createLoop(() => { if (dirty) draw(); }, { paused: true });
  page.onCleanup(loop.destroy);
  timeAxis = createTimeAxis({
    host: get('[data-h-axis-host]'), signal: page.signal, time: state.time, baseline: baseline.time, isLive: () => clock.mode === 'live', report,
    onSeek(time, phase) {
      action(() => {
        if (phase === 'finish') {
          scrubbing = false;
          clearTimeout(contactTimer); contactTimer = window.setTimeout(() => { contactTimer = 0; void requestCurrent().catch(fail); }, 160);
          report(`Manual UTC: ${utcInput(state.time)}. Timeline and sky share this snapshot.`); return;
        }
        if (phase === 'start') {
          clearTimeout(contactTimer); setPaused(true, false, true); scrubbing = true; history.claim();
          ++eventGeneration; search.cancel(); currentKey = ''; current = null;
        }
        apply({ ...history.state, time }, phase === 'start', false);
      })();
    },
  });
  page.onCleanup(timeAxis.destroy);

  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-h-view]')) button.addEventListener('click', action(() => {
    const view = button.dataset.hView; if (view === 'system' || view === 'planet' || view === 'sky') setView(view);
  }), { signal: page.signal });
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-h-open], [data-h-panel]')) button.addEventListener('click', action(() => {
    const panel = button.dataset.hOpen ?? button.dataset.hPanel; if (isInstrument(panel)) showDock(panel);
  }), { signal: page.signal });
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-h-body-label]')) button.addEventListener('click', action(() => { if (isBody(button.dataset.hBodyLabel)) chooseBody(button.dataset.hBodyLabel); }), { signal: page.signal });
  const track = (value: string) => {
    if (value !== 'Sun' && value !== 'Moon' && value !== 'horizon') throw new Error('Unsupported sky tracking target.');
    apply({ ...history.state, track: value, ...(value === 'horizon' ? { fov: 90, skyAltitude: 15 } : {}) });
    report(`Tracking ${value}. Observer and camera edits preserve the current clock mode.`);
  };
  get<HTMLSelectElement>('#h-track-select').addEventListener('change', action(() => track(get<HTMLSelectElement>('#h-track-select').value)), { signal: page.signal });
  const camera = (value: string) => {
    if (value !== 'orbit' && value !== 'ride') throw new Error('Unsupported planet camera.');
    apply({ ...history.state, view: 'planet', planetCamera: value, orbitZoom: 1 }); finishDockAction();
  };
  get<HTMLSelectElement>('#h-camera-select').addEventListener('change', action(() => camera(get<HTMLSelectElement>('#h-camera-select').value)), { signal: page.signal });
  on('close-dock', () => dock.close());
  on('earth-surface', () => { apply({ ...history.state, body: 'Earth' }); setView('sky'); });
  on('zoom-in', () => { const s = history.state; apply(s.view === 'sky' ? { ...s, fov: clamp(s.fov * .8, .65, 110) } : { ...s, orbitZoom: clamp(s.orbitZoom * .8, .45, 3) }); });
  on('zoom-out', () => { const s = history.state; apply(s.view === 'sky' ? { ...s, fov: clamp(s.fov * 1.25, .65, 110) } : { ...s, orbitZoom: clamp(s.orbitZoom * 1.25, .45, 3) }); });
  on('center', () => { const s = history.state; apply(s.view === 'sky' ? { ...s, track: s.track === 'Moon' ? 'Moon' : 'Sun', fov: 1.6 } : { ...s, orbitYaw: .45, orbitPitch: .48, orbitZoom: 1 }); });
  on('point', () => { apply({ ...history.state, skyAzimuth: get<HTMLInputElement>('#h-azimuth').valueAsNumber, skyAltitude: get<HTMLInputElement>('#h-altitude').valueAsNumber }); finishDockAction(); });
  on('map-in', map.zoomIn); on('map-out', map.zoomOut); on('map-reset', map.reset);
  get<HTMLSelectElement>('#h-body').addEventListener('change', action(() => {
    const body = get<HTMLSelectElement>('#h-body').value; if (!isBody(body)) throw new Error('Unsupported body.'); chooseBody(body);
  }), { signal: page.signal });
  get<HTMLSelectElement>('#h-site').addEventListener('change', action(() => {
    const value = get<HTMLSelectElement>('#h-site').value;
    if (value === 'custom') { showDock('observer'); get<HTMLInputElement>('#h-latitude').focus(); return; }
    const site = SITES[Number(value)]; if (!site) throw new Error('Unsupported observer preset.');
    apply({ ...history.state, site: { ...site } });
    report(site.elevation === 0 ? 'City-center coordinates use a 0 m reference height. Adjust the height for your observing location.' : 'Observer updated.');
  }), { signal: page.signal });
  get<HTMLFormElement>('[data-h-location-form]').addEventListener('submit', event => {
    event.preventDefault();
    action(() => {
      const site: Site = { name: 'Custom observer', latitude: get<HTMLInputElement>('#h-latitude').valueAsNumber, longitude: get<HTMLInputElement>('#h-longitude').valueAsNumber, elevation: get<HTMLInputElement>('#h-elevation').valueAsNumber };
      apply({ ...history.state, site }); finishDockAction(); report('Geodetic observer applied. Clock synchronization is unchanged.');
    })();
  }, { signal: page.signal });
  get<HTMLInputElement>('#h-fov').addEventListener('change', action(() => apply({ ...history.state, fov: get<HTMLInputElement>('#h-fov').valueAsNumber })), { signal: page.signal });
  get<HTMLInputElement>('#h-fov-range').addEventListener('input', action(() => apply({ ...history.state, fov: .65 * Math.pow(110 / .65, Number(get<HTMLInputElement>('#h-fov-range').value) / 1000) }, false)), { signal: page.signal });
  get<HTMLSelectElement>('#h-rate').addEventListener('change', action(() => {
    const rate = Number(get<HTMLSelectElement>('#h-rate').value);
    if (playing) { advanceClock(); clock.play(state.time, rate, Date.now()); }
    apply({ ...history.state, rate });
  }), { signal: page.signal });
  get<HTMLSelectElement>('#h-step').addEventListener('change', syncUI, { signal: page.signal });
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-h-open-time]')) button.addEventListener('click', () => openDialog(timeDialog), { signal: page.signal });
  on('set-time', () => {
    const time = parseUTC(get<HTMLInputElement>('#h-utc').value); setPaused(true, false);
    apply({ ...history.state, time }); timeAxis?.setTime(time, true); timeDialog.close();
    report(`Manual UTC set: ${utcInput(time)}, independent of browser timezone.`);
  });
  get<HTMLInputElement>('#h-utc').addEventListener('input', () => { setPaused(true, false); history.claim(); }, { signal: page.signal });
  get<HTMLInputElement>('#h-utc').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); get<HTMLButtonElement>('[data-h-action="set-time"]').click(); } }, { signal: page.signal });
  on('now', () => {
    const time = validTime(Date.now()); setPaused(true, false); apply({ ...history.state, time }); timeAxis?.setTime(time, true);
    report('Device UTC captured once. Manual mode; choose Live to keep synchronized.');
  });
  on('live', () => {
    if (clock.mode === 'live') { setPaused(true); report('Live synchronization stopped. The current observation is held in Manual.'); }
    else {
      const time = validTime(Date.now()); cancelScrub(); playing = false; clock.live(time); history.claim();
      apply({ ...history.state, time }); timeAxis?.setTime(state.time, true); scheduleClock();
      report('Live: synchronized directly with device UTC. Time edits leave Live; observer and camera changes do not.');
    }
  });
  on('play', () => { setPaused(playing); report(playing ? 'Manual playback is running at the selected rate; this is not device-time synchronization.' : 'Manual time is held.'); });
  const step = (direction: number) => {
    setPaused(true, false); const time = validTime(state.time + direction * Number(get<HTMLSelectElement>('#h-step').value) * 1000);
    apply({ ...history.state, time }); report(`Stepped to ${utcInput(time)} UTC.`);
  };
  on('step-back', () => step(-1)); on('step-forward', () => step(1));
  on('undo', () => { setPaused(true, false); history.undo(); apply(history.state, false); timeAxis?.setTime(state.time, true); timeDialog.close(); finishDockAction(); report('Previous observation restored in Manual.'); });
  on('reset', () => {
    setPaused(true, false); history.reset(); apply(history.state, false); timeAxis?.reset(state.time);
    get<HTMLSelectElement>('#h-timespan').value = '6h'; timeDialog.close(); finishDockAction(); map.reset();
    report('Original computed Nazas study restored. Reset is independent of imported records and Live clock updates.');
  });
  get<HTMLSelectElement>('#h-timespan').addEventListener('change', action(() => { history.claim(); timeAxis?.setSpan(get<HTMLSelectElement>('#h-timespan').value); }), { signal: page.signal });
  get<HTMLInputElement>('#h-event-scrub').addEventListener('input', action(() => {
    const time = Number(get<HTMLInputElement>('#h-event-scrub').value);
    setPaused(true, false); apply({ ...history.state, time }, false);
  }), { signal: page.signal });
  on('peak', () => {
    if (!current) throw new Error('There is no local peak for this date and observer.');
    const peak = current.peak; setPaused(true, false); apply({ ...history.state, time: peak, view: 'sky', track: 'Sun', fov: 1.6 });
    finishDockAction(); report(`Local peak: ${utcClock(peak)} UTC. The live disk classification is independent of the event name.`);
  });
  on('next-eclipse', async () => {
    setPaused(true, false);
    const owner = history.claim(), captured = history.state, generation = ++eventGeneration;
    if (!current) { currentKey = ''; renderEvent('Searching ahead. Current-date contacts recover if you keep this observation.'); }
    finishDockAction();
    report('Searching the next five years. Current observation is unchanged until a result is ready.');
    try {
      const result = await search.find({ mode: 'next', time: captured.time, site: captured.site });
      if (!history.owns(owner) || page.signal.aborted) return;
      if (!result) throw new Error('No next local eclipse was returned.');
      current = result; currentKey = eventKey(result.peak, captured.site);
      apply({ ...captured, time: result.peak, view: 'sky', track: 'Sun', fov: 1.6 }, true, false);
      timeAxis?.setTime(result.peak, true); renderEvent();
      report(`Advanced explicitly to ${result.day}, ${utcClock(result.peak)} UTC.`);
    } finally {
      if (!page.signal.aborted && !playing && generation === eventGeneration && currentKey !== eventKey(history.state.time, history.state.site))
        void requestCurrent().catch(fail);
    }
  });
  const phase = (direction: 1 | -1) => {
    const value = Number(get<HTMLSelectElement>('#h-phase').value);
    if (value !== 0 && value !== 90 && value !== 180 && value !== 270) throw new Error('Unsupported lunar phase.');
    const time = nextPhase(state.time, value, direction); setPaused(true, false);
    apply({ ...history.state, time, view: 'sky', track: 'Moon', fov: 1.6 }); timeAxis?.setTime(time, true); finishDockAction();
    report('Manual phase navigation: geocentric longitude quarter; displayed illumination and horizon remain topocentric.');
  };
  on('phase-back', () => phase(-1)); on('phase-next', () => phase(1));
  on('moon-study', () => {
    setPaused(true, false);
    apply({ ...history.state, site: { ...SITES[7] }, time: parseUTC('2024-04-17T18:00:00Z'), view: 'sky', track: 'Moon', fov: 1.6 });
    timeAxis?.setTime(state.time, true); finishDockAction(); report('Evening Moon, Cape Town. Choose London at the same UTC to change the local-up orientation.');
  });
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-h-study]')) button.addEventListener('click', action(async () => {
    const study = STUDIES.find(item => item.id === button.dataset.hStudy);
    if (!study) throw new Error('Unknown observation study.');
    setPaused(true, false);
    const time = study.seek ? dayStart(study.day) + 18 * 3600000 : baseline.time;
    apply({ ...history.state, site: { ...SITES[study.site] }, time, view: 'sky', track: 'Sun', fov: 1.6 }, true, false);
    finishDockAction(); report(study.seek ? 'Computing this historical site’s peak; its name does not prescribe the result.' : 'Sydney at the original Nazas peak UTC. Earth blocks the line of sight.');
    await requestCurrent(study.seek);
  }), { signal: page.signal });
  function fillRecord() {
    if (clock.mode !== 'manual') advanceClock();
    recordJSON = observationRecord(history.state, observation, current, clock.mode);
    recordLink = shareURL(window.location.href, history.state); recordDay = utcDay(state.time);
    get<HTMLTextAreaElement>('#h-record').value = recordJSON; get<HTMLTextAreaElement>('#h-share').value = recordLink;
    text('[data-h-record-status]', `Captured ${utcInput(state.time)} UTC. This record is fixed even while Live continues.`);
  }
  function restore(decoded: StudyState) {
    setPaused(true, false); apply(decoded); timeAxis?.setTime(state.time, true);
    keepDialog.close(); finishDockAction(); report('Version-1 observation restored and recomputed in Manual. Reset still returns to the original Nazas study.');
  }
  window.addEventListener('hashchange', action(() => {
    if (!window.location.hash.startsWith('#helios=')) return;
    const owner = history.claim(), decoded = stateFromHash(window.location.hash);
    if (decoded && history.owns(owner)) restore(decoded);
  }), { signal: page.signal });
  on('keep', () => { fillRecord(); openDialog(keepDialog); });
  on('notes', () => openDialog(notesDialog));
  on('download', () => downloadText(`helios-${recordDay}.json`, recordJSON, 'application/json'));
  on('restore-text', () => { const owner = history.claim(); const decoded = decodeStudy(get<HTMLTextAreaElement>('#h-record').value); if (history.owns(owner)) restore(decoded); });
  on('copy', async () => { await copyText(recordLink, message => { if (!page.signal.aborted) text('[data-h-record-status]', message); }); });
  get<HTMLInputElement>('#h-file').addEventListener('change', action(async () => {
    const input = get<HTMLInputElement>('#h-file'), file = input.files?.[0]; if (!file) return;
    const owner = history.claim(); input.value = '';
    if (file.size > 32000) throw new Error('Observation files are limited to 32 KB.');
    const contents = await file.text();
    if (!history.owns(owner) || page.signal.aborted) return;
    const decoded = decodeStudy(contents); if (history.owns(owner)) restore(decoded);
  }), { signal: page.signal });
  document.addEventListener('visibilitychange', () => {
    clearTimeout(clockTimer); clockTimer = 0;
    if (document.hidden) {
      history.claim();
      if (playing) setPaused(true, false);
      clearTimeout(contactTimer); contactTimer = 0;
    } else {
      action(() => {
        if (clock.mode === 'live') {
          advanceClock();
          report('Live UTC resynchronized with the device clock.');
        } else if (clock.mode === 'manual' && currentKey !== eventKey(state.time, state.site)) {
          void requestCurrent().catch(fail);
        }
        scheduleClock();
        invalidate();
      })();
    }
  }, { signal: page.signal });
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => { if (event.matches && playing) setPaused(true); }, { signal: page.signal });
  page.onCleanup(() => { clearTimeout(clockTimer); clearTimeout(contactTimer); playing = false; ++eventGeneration; });
  syncUI(); renderEvent(); draw();
  if (currentKey !== eventKey(state.time, state.site)) {
    try { await requestCurrent(); } catch (error) { fail(error); } page.signal.throwIfAborted();
  }
  page.root.setAttribute('aria-busy', 'false'); page.root.dataset.ready = 'true';
  report(linkError || (eventKey(state.time, state.site) === eventKey(baseline.time, baseline.site) ? 'Computed Nazas totality. Drag the UTC axis, move your observer, or opt into Live device time.' : 'Shared UTC snapshot restored in Manual; geometry has been recomputed.'), Boolean(linkError));
  return { destroy: page.destroy, setPaused, reset: () => get<HTMLButtonElement>('[data-h-action="reset"]').click() };
}
