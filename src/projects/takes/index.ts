import './style.css';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError } from '../../core/agents/errors';
import { GameSession } from '../../core/games/session';
import { createGameNotebook } from '../../core/games/notebook';
import { createProjectPage, downloadText, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { blockingTool, observation, system } from './agent';
import { CUES, MARK_IDS, openingCamera, portraitActor, roles, scenarios, sceneName } from './data';
import type { Cue, MarkId, Scenario, Shot } from './data';
import { definition, evaluate, positionText, sceneComplete } from './engine';
import type { Command, Take } from './engine';
import { createTheater } from './render';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'takes'), { root, signal } = page;
  root.dataset.workspace = 'true';
  root.innerHTML = `
    <div class="takes-studio">
      <header class="takes-header">
        <div class="takes-wordmark"><span class="takes-number">81 / LITTLE PICTURES</span><h1>Takes<span>.</span></h1></div>
        <p class="takes-title" data-title>The Applause Department</p>
        <nav aria-label="Production tools"><button data-notebook>Save</button><button data-help>Help</button><button data-restart>Restart</button></nav>
      </header>
      <div class="takes-slate"><span data-scene>YOUR STAGE AWAITS</span><span data-budget>10 film / 24 time</span><span data-cut>0 / 6 in cut</span></div>
      <section class="takes-stage" data-project-preview aria-label="Theater and live camera">
        <div class="takes-views"><button data-view="stage" aria-pressed="true">Stage / orbit</button><button data-view="shot" aria-pressed="false">Camera / shot</button></div>
        <div class="takes-monitor-guide" aria-hidden="true"><div class="takes-safe"></div><div class="takes-thirds"></div><span class="takes-monitor-label">CAM 01 · LIVE <b data-monitor-lens>28 MM</b></span></div>
        <div class="takes-stage-caption"><span data-stage-caption>DRAG TO ORBIT · CLICK AN ACTOR TO FOCUS</span><span class="takes-orbit-buttons"><button data-orbit="-1" aria-label="Orbit left">↶</button><button data-orbit="1" aria-label="Orbit right">↷</button></span></div>
        <div class="takes-supertitles" data-supertitles aria-live="polite"></div>
        <div class="takes-invitation" data-invitation><span class="takes-eyebrow">A FILM IN THREE SMALL SCENES</span><h2>Quiet on the tiny set.</h2><p>Two opinionated actors. Ten frames of film. You direct the impossible into something worth keeping.</p><button class="takes-amber" data-brief>Open production brief</button><p class="takes-fine">Actors need your model. Cameras and recording run locally.</p></div>
        <div class="takes-wrap" data-wrap hidden><span class="takes-eyebrow">THAT’S A WRAP</span><h2 data-ending></h2><p data-wrap-copy></p><button data-wrap-sheet>View the contact sheet</button></div>
        <div class="takes-playback" data-playback hidden><span data-playback-title></span><button data-live>Return to live set</button></div>
      </section>
      <section class="takes-desk" aria-label="Director desk">
        <div class="takes-readout"><p data-feedback role="status" aria-live="polite">Open the brief, then give your actors their first cue.</p><button data-shot-notes aria-label="Open shot diagnostics">Why?</button></div>
        <div class="takes-optics">
          <label>Assignment<select data-shot aria-label="Shot assignment"><option value="wide">Establishing wide</option><option value="portrait">Mica portrait</option></select></label>
          <label>Lens<select data-lens aria-label="Lens"><option value="28">28 mm · wide</option><option value="50">50 mm · normal</option><option value="85">85 mm · portrait</option></select></label>
          <label>Focus<select data-focus aria-label="Focal target"><option value="both">Both actors</option><option value="mica">Mica</option><option value="pip">Pip</option></select></label>
          <button data-camera-controls>Camera rig</button>
          <button data-blocking>Marks & prop</button>
        </div>
        <div class="takes-transport">
          <button data-direction>Direction <span data-cue-name>Discover</span></button>
          <button data-rehearse class="takes-rehearse">Rehearse <span>AI</span></button>
          <button data-record class="takes-record"><i aria-hidden="true"></i> Record take <kbd>R</kbd></button>
          <button data-next>Next scene</button>
          <button data-sheet>Contact sheet <span data-take-count>0</span></button>
        </div>
      </section>
      <footer class="takes-footer"><div data-agent-host></div><span class="takes-footer-note">NO. 81 / A SMALL FILM, MADE BY YOU</span></footer>
    </div>`;
  const session = new GameSession(definition, 0);
  let camera = openingCamera(), shot: Shot = 'wide', cue: Cue = 'discover', note = '';
  let view: 'stage' | 'shot' = 'stage', busy = false, moving = false, playback: Take | undefined;
  let lastNotice = '', selectedMark: MarkId = 'mica-mid', theater: ReturnType<typeof createTheater> | undefined;
  const el = <T extends Element = HTMLElement>(selector: string) => query<T>(root, selector);
  const feedback = el('[data-feedback]');
  const notice = (message: string) => { lastNotice = message; feedback.textContent = message; };
  function run(command: Command) {
    try { session.preview(command); session.dispatch(command); return true; }
    catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      notice(error.message); return false;
    }
  }
  const agent = createAgentConsole(page, { gameId: 'takes', host: el('[data-agent-host]'), onBusyChange(value) { busy = value; updateButtons(); } });
  function updateButtons() {
    const s = session.state, active = s.phase === 'production', complete = sceneComplete(s);
    el<HTMLButtonElement>('[data-rehearse]').disabled = !active || busy || complete || s.rehearsals >= 10 || Boolean(playback);
    el<HTMLButtonElement>('[data-record]').disabled = !active || busy || moving || !s.ready || complete || Boolean(playback);
    el<HTMLButtonElement>('[data-next]').disabled = !active || busy || !complete || s.scene >= 2 || Boolean(playback);
    el<HTMLButtonElement>('[data-blocking]').disabled = !active || busy || Boolean(playback);
    el<HTMLButtonElement>('[data-direction]').disabled = !active || busy || Boolean(playback);
    root.dataset.moving = String(moving);
  }
  const briefContent = document.createElement('section');
  briefContent.className = 'takes-form';
  briefContent.innerHTML = `
    <p class="takes-eyebrow">LITTLE PICTURES / PRODUCTION 81</p>
    <p>Make a six-shot miniature film: an establishing wide and a portrait in each of three scenes. You have <strong>10 film, 24 stage-time units and 10 rehearsals</strong>.</p>
    <label>Original scenario<select data-scenario>${scenarios.map(s => `<option value="${s.id}">${s.title}</option>`).join('')}</select></label>
    <label>Film title<input data-film-title maxlength="70"></label>
    <label>Editable premise<textarea data-premise rows="3" maxlength="500"></textarea></label>
    ${CUES.map((c, i) => `<label>Scene ${i + 1} · ${c}<input data-beat="${i}" maxlength="180"></label>`).join('')}
    <p><strong>01 / Rehearse.</strong> Give a cue; the model chooses actual marks, gestures, attention and lines. No film is spent. Invalid or cancelled plans cost nothing.</p>
    <p><strong>02 / Frame.</strong> Start at front / 28 mm / Both actors. Keep the wide. Then select the required portrait, 85 mm and that actor. Adjust dolly distance if needed.</p>
    <p><strong>03 / Cut.</strong> Keep the same blocking and camera side between shots. Advance only once both are kept. Every recording, even a miss, costs one film and one time.</p>
    <button class="takes-amber" data-start>Begin production</button>`;
  function fillBrief(brief: Scenario) {
    query<HTMLSelectElement>(briefContent, '[data-scenario]').value = brief.id;
    query<HTMLInputElement>(briefContent, '[data-film-title]').value = brief.title;
    query<HTMLTextAreaElement>(briefContent, '[data-premise]').value = brief.premise;
    brief.beats.forEach((b, i) => { query<HTMLInputElement>(briefContent, `[data-beat="${i}"]`).value = b; });
  }
  fillBrief(session.state.brief);
  const briefDialog = createWorkspaceDialog(page, { id: 'takes-brief', title: 'Your production brief', content: [briefContent], triggers: [el('[data-brief]')], className: 'takes-dialog' });
  query(briefContent, '[data-scenario]').addEventListener('change', () => {
    const chosen = scenarios.find(s => s.id === query<HTMLSelectElement>(briefContent, '[data-scenario]').value)!;
    fillBrief(chosen);
  }, { signal });
  query(briefContent, '[data-start]').addEventListener('click', () => {
    const beats = [0, 1, 2].map(i => query<HTMLInputElement>(briefContent, `[data-beat="${i}"]`).value);
    const brief: Scenario = { id: query<HTMLSelectElement>(briefContent, '[data-scenario]').value,
      title: query<HTMLInputElement>(briefContent, '[data-film-title]').value, premise: query<HTMLTextAreaElement>(briefContent, '[data-premise]').value,
      beats: [beats[0], beats[1], beats[2]] };
    if (run({ type: 'start', brief })) { briefDialog.close(); notice('Scene 1: discover. Call Rehearse to invite the ensemble onto their marks.'); }
  }, { signal });
  const directionContent = document.createElement('section'); directionContent.className = 'takes-form';
  directionContent.innerHTML = `<p data-beat-copy></p><label>Director cue<select data-cue>${CUES.map(c => `<option value="${c}">${c}</option>`).join('')}</select></label>
    <label>Direction to the ensemble<textarea data-note maxlength="200" rows="3" placeholder="Keep space between you; let the cabinet surprise you."></textarea></label>
    <p>Actors improvise within their roles. Mica protects the ritual; Pip welcomes the impossible. This note is sent only when you press Rehearse.</p>
    <div data-dialogue></div><button data-save-direction>Use this direction</button>`;
  const directionDialog = createWorkspaceDialog(page, { id: 'takes-direction', title: 'Direct the ensemble', content: [directionContent], triggers: [el('[data-direction]')], className: 'takes-dialog' });
  query(directionContent, '[data-save-direction]').addEventListener('click', () => {
    const c = query<HTMLSelectElement>(directionContent, '[data-cue]').value;
    cue = CUES.find(value => value === c)!; note = query<HTMLTextAreaElement>(directionContent, '[data-note]').value.trim();
    directionDialog.close(); render();
  }, { signal });
  const cameraContent = document.createElement('section'); cameraContent.className = 'takes-form';
  cameraContent.innerHTML = `<p>These optical controls are local. They remain usable during an AI rehearsal and do not invalidate it. The model never sees your camera.</p>
    <label>Camera position<select data-rig><option value="front">Front / A side</option><option value="left">Left wing / A side</option><option value="right">Right wing / A side</option><option value="reverse">Reverse / B side</option></select></label>
    <label>Rail offset <output data-rail-value></output><input data-rail type="range" min="-6" max="6" step=".05" value="0"></label>
    <label>Dolly distance <output data-distance-value></output><input data-distance type="range" min="6" max="14" step=".05" value="10"></label>
    <label>Aim height <output data-height-value></output><input data-height type="range" min=".5" max="2" step=".05" value="1.15"></label>
    <p>Dashed box: 4% safe frame. Cross lines: thirds. Wide: each full actor is 14–55% tall. Portrait: the named full actor is 55–90% tall. Eight of nine sightlines must be clear.</p>
    <button data-camera-home>Reset camera to front / 28 mm</button>`;
  createWorkspaceDialog(page, { id: 'takes-camera', title: 'Camera rig & framing', content: [cameraContent], triggers: [el('[data-camera-controls]')], className: 'takes-dialog' });
  for (const axis of ['rail', 'distance', 'height'] as const) query(cameraContent, `[data-${axis}]`).addEventListener('input', () => {
    camera = { ...camera, [axis]: Number(query<HTMLInputElement>(cameraContent, `[data-${axis}]`).value) }; opticalChange();
  }, { signal });
  query(cameraContent, '[data-rig]').addEventListener('change', () => {
    const rig = query<HTMLSelectElement>(cameraContent, '[data-rig]').value;
    if (rig === 'front' || rig === 'left' || rig === 'right' || rig === 'reverse') camera = { ...camera, rig };
    opticalChange();
  }, { signal });
  query(cameraContent, '[data-camera-home]').addEventListener('click', () => { camera = openingCamera(); opticalChange(); }, { signal });
  const blockContent = document.createElement('section'); blockContent.className = 'takes-form';
  blockContent.innerHTML = `<p>Move tape marks before rehearsing to influence the legal stage choices. Moving an occupied mark moves that actor. A committed mark or prop edit costs one stage-time unit, never film.</p>
    <label>Tape mark<select data-mark>${MARK_IDS.map((id, i) => `<option value="${id}">${id} / ${id.startsWith('mica') ? 'M' : 'P'}${i % 3 + 1}</option>`).join('')}</select></label>
    <label>Mark left / right (m)<input data-mark-x type="number" min="-4" max="4" step=".1"></label>
    <label>Mark front / back (m)<input data-mark-z type="number" min="-2" max="2" step=".1"></label><button data-apply-mark>Move tape mark</button>
    <hr><label>Cabinet left / right (m)<input data-prop-x type="number" min="-4" max="4" step=".1"></label>
    <label>Cabinet front / back (m)<input data-prop-z type="number" min="-2" max="4" step=".1"></label><button data-apply-prop>Move cabinet</button>
    <p data-block-notice role="status"></p><p>The tall cabinet really blocks the lens. Changing blocking after a kept wide breaks continuity; restore it exactly or restart the production.</p>`;
  createWorkspaceDialog(page, { id: 'takes-blocking', title: 'Tape marks & practical prop', content: [blockContent], triggers: [el('[data-blocking]')], className: 'takes-dialog' });
  function fillBlock() {
    query<HTMLSelectElement>(blockContent, '[data-mark]').value = selectedMark;
    const p = session.state.world.marks[selectedMark], prop = session.state.world.prop;
    query<HTMLInputElement>(blockContent, '[data-mark-x]').value = String(p.x); query<HTMLInputElement>(blockContent, '[data-mark-z]').value = String(p.z);
    query<HTMLInputElement>(blockContent, '[data-prop-x]').value = String(prop.x); query<HTMLInputElement>(blockContent, '[data-prop-z]').value = String(prop.z);
  }
  query(blockContent, '[data-mark]').addEventListener('change', () => {
    selectedMark = MARK_IDS.find(id => id === query<HTMLSelectElement>(blockContent, '[data-mark]').value)!; fillBlock();
  }, { signal });
  query(blockContent, '[data-apply-mark]').addEventListener('click', () => {
    if (busy) { notice('Wait for the rehearsal before changing the stage.'); return; }
    const ok = run({ type: 'mark', mark: selectedMark, x: Number(query<HTMLInputElement>(blockContent, '[data-mark-x]').value), z: Number(query<HTMLInputElement>(blockContent, '[data-mark-z]').value) });
    query(blockContent, '[data-block-notice]').textContent = ok ? 'Tape moved. The new position is available to the ensemble.' : lastNotice;
  }, { signal });
  query(blockContent, '[data-apply-prop]').addEventListener('click', () => {
    if (busy) { notice('Wait for the rehearsal before changing the stage.'); return; }
    const ok = run({ type: 'prop', x: Number(query<HTMLInputElement>(blockContent, '[data-prop-x]').value), z: Number(query<HTMLInputElement>(blockContent, '[data-prop-z]').value) });
    query(blockContent, '[data-block-notice]').textContent = ok ? 'Cabinet moved. Check the actual sightlines in the monitor.' : lastNotice;
  }, { signal });
  const diagnosticsContent = document.createElement('section'); diagnosticsContent.className = 'takes-diagnostics';
  createWorkspaceDialog(page, { id: 'takes-diagnostics', title: 'The camera report', content: [diagnosticsContent], triggers: [el('[data-shot-notes]')], className: 'takes-dialog' });
  const help = document.createElement('section'); help.className = 'takes-form';
  help.innerHTML = `<p>This is a filmmaking game, not a conversation. Your model plays Mica and Pip. You own the blocking, camera, film and final cut.</p>
    <h3>From rehearsal to premiere</h3><p>Open a brief (all three original scripts are editable). Rehearse the required cue. Watch the actors move, then inspect the camera. Record a wide before the named portrait. Keep both and move to the next scene. Six kept shots win; empty film or stage time loses.</p>
    <h3>A good first setup</h3><p>Front rig, 28 mm and Both actors for the wide. Switch assignment to the portrait, focus the named actor, and use 85 mm. A nearby actor may need a longer dolly distance or 50 mm. Nothing auto-frames a shot for you.</p>
    <h3>Why a take can fail</h3><p>Actor bounds must fit the safe frame at the correct size. At least eight of nine body sightlines must clear the cabinet and other actor. Gesture and attention must cover the cue. The first wide locks marks, prop, pose, dialogue and left-to-right screen direction. Camera changes are free; crossing the action line is not a matching cut.</p>
    <h3>Controls</h3><p>Drag the stage to orbit. Tap an actor to set focus. Drag a tape circle to move its mark; Marks & prop offers numeric alternatives. Drag the camera image to shift the rail. The orbit arrow buttons also work by touch.</p>
    <p><kbd>R</kbd> record · <kbd>Space</kbd> rehearse · <kbd>C</kbd> switch view · <kbd>←</kbd> / <kbd>→</kbd> rail · <kbd>↑</kbd> / <kbd>↓</kbd> dolly. Shortcuts are suspended in dialogs and text controls.</p>
    <h3>Keep the little film</h3><p>Contact sheet contains actual rendered stills and a shot-by-shot 3D reconstruction. Save opens automatic browser save, validated JSON replay import/export. Export storyboard JSON keeps the geometry, camera, dialogue and shot decisions; it is not MP4 or audio. No sound is played.</p>
    <h3>Model boundary</h3><p>Only Rehearse contacts your configured model: at most two requests, 1,536 output tokens each, one illegal-plan correction, 60 seconds total. Failures never create offline actors or consume production resources. Restart and import cancel pending plans. Rehearsal time is charged only after a valid atomic commit.</p>`;
  createWorkspaceDialog(page, { id: 'takes-help', title: 'The director’s pocket guide', content: [help], triggers: [el('[data-help]')], className: 'takes-dialog' });
  const sheetContent = document.createElement('section'); sheetContent.className = 'takes-sheet-content';
  sheetContent.innerHTML = `<p data-sheet-summary></p><div class="takes-contact-sheet" data-contact-sheet></div><button data-export-storyboard>Export storyboard JSON</button><p>Stills are rendered from the recorded stage and camera. Replay a frame to inspect that exact setup. JSON includes no API settings and no video.</p>`;
  const sheetDialog = createWorkspaceDialog(page, { id: 'takes-sheet', title: 'Contact sheet / the little film', content: [sheetContent], className: 'takes-dialog takes-sheet-dialog' });
  function showSheet() {
    const s = session.state;
    query(sheetContent, '[data-sheet-summary]').textContent = `${s.brief.title} / ${s.takes.filter(t => t.result.kept).length} kept of 6 required / ${s.takes.length} exposed.`;
    const list = query(sheetContent, '[data-contact-sheet]'); list.replaceChildren();
    for (const take of s.takes) {
      const card = document.createElement('button'); card.className = 'takes-frame'; card.dataset.take = String(take.id);
      card.setAttribute('aria-label', `Replay take ${take.id}, ${take.result.kept ? 'kept' : 'rejected'} ${take.shot}`);
      const image = document.createElement('img'); image.src = theater!.still(take); image.alt = `Actual camera still, scene ${take.scene + 1}, ${take.shot}`; image.width = 480; image.height = 270;
      const caption = document.createElement('span'); caption.textContent = `${String(take.id).padStart(2, '0')} / SC${take.scene + 1} / ${take.shot} / ${take.result.kept ? 'KEEP' : 'MISS'}`;
      card.append(image, caption);
      card.addEventListener('click', () => { playback = take; view = 'shot'; sheetDialog.close(); render(); }, { signal });
      list.append(card);
    }
    if (!s.takes.length) list.textContent = 'Unexposed. Record a take to put a real frame here.';
    sheetDialog.open();
  }
  query(sheetContent, '[data-export-storyboard]').addEventListener('click', () => {
    downloadText('takes-storyboard.json', JSON.stringify({ format: 'takes-storyboard', version: 1, brief: session.state.brief, ending: session.state.ending, takes: session.state.takes }, null, 2), 'application/json');
  }, { signal });
  for (const selector of ['[data-sheet]', '[data-wrap-sheet]']) el(selector).addEventListener('click', showSheet, { signal });
  el('[data-live]').addEventListener('click', () => { playback = undefined; render(); }, { signal });
  function opticalChange() { lastNotice = ''; render(); }
  el('[data-lens]').addEventListener('change', () => { camera = { ...camera, lens: Number(el<HTMLSelectElement>('[data-lens]').value) }; opticalChange(); }, { signal });
  el('[data-focus]').addEventListener('change', () => {
    const focus = el<HTMLSelectElement>('[data-focus]').value;
    if (focus === 'both' || focus === 'mica' || focus === 'pip') camera = { ...camera, focus };
    opticalChange();
  }, { signal });
  el('[data-shot]').addEventListener('change', () => { shot = el<HTMLSelectElement>('[data-shot]').value === 'wide' ? 'wide' : 'portrait'; opticalChange(); }, { signal });
  root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.addEventListener('click', () => { view = button.dataset.view === 'shot' ? 'shot' : 'stage'; render(); }, { signal }));
  root.querySelectorAll<HTMLButtonElement>('[data-orbit]').forEach(button => button.addEventListener('click', () => theater?.orbitBy(Number(button.dataset.orbit) * .18), { signal }));
  async function rehearse() {
    if (el<HTMLButtonElement>('[data-rehearse]').disabled) return;
    const requestedCue = cue, requestedNote = note;
    const command = (plan: Parameters<typeof blockingTool.summarize>[0]): Command => ({ type: 'rehearse', cue: requestedCue, note: requestedNote, plan });
    const committed = await agent.turn({ label: `Ensemble / ${sceneName(session.state.scene)}`, system, observation: observation(session.state, requestedCue, requestedNote), tool: blockingTool,
      validate: plan => { session.preview(command(plan)); }, getRevision: () => session.revision,
      commit: plan => { lastNotice = ''; session.dispatch(command(plan)); } });
    if (committed) notice('Blocking committed. No film spent. Frame the required wide, then record.');
    else notice(el('[data-agent-status]').textContent || 'No actor plan was committed. Open the agent log for details.');
  }
  function record() {
    if (el<HTMLButtonElement>('[data-record]').disabled) return;
    if (run({ type: 'record', shot, camera })) {
      const take = session.state.takes.at(-1)!;
      notice(take.result.kept ? `Take ${take.id} kept. ${sceneComplete(session.state) ? 'Scene coverage complete.' : 'Now frame the matching portrait.'}` : `Take ${take.id} missed: ${take.result.reasons[0]}`);
    }
  }
  el('[data-rehearse]').addEventListener('click', () => { void rehearse(); }, { signal });
  el('[data-record]').addEventListener('click', record, { signal });
  el('[data-next]').addEventListener('click', () => {
    agent.cancel(); lastNotice = '';
    if (run({ type: 'next' })) { cue = CUES[session.state.scene]; shot = 'wide'; camera = openingCamera(); note = ''; render(); }
  }, { signal });
  el('[data-restart]').addEventListener('click', () => {
    agent.cancel(); playback = undefined; camera = openingCamera(); shot = 'wide'; cue = 'discover'; note = ''; lastNotice = '';
    session.reset(); fillBrief(session.state.brief); render();
  }, { signal });
  root.addEventListener('keydown', event => {
    const target = event.target;
    if (root.querySelector('dialog:modal') || (target instanceof Element && target.closest('input,textarea,select,button,[contenteditable="true"]'))) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === 'r') { event.preventDefault(); record(); }
    else if (key === ' ') { event.preventDefault(); void rehearse(); }
    else if (key === 'c') { event.preventDefault(); view = view === 'stage' ? 'shot' : 'stage'; render(); }
    else if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
      event.preventDefault();
      camera = { ...camera, rail: Math.max(-6, Math.min(6, camera.rail + (key === 'arrowleft' ? -.25 : key === 'arrowright' ? .25 : 0))),
        distance: Math.max(6, Math.min(14, camera.distance + (key === 'arrowup' ? -.25 : key === 'arrowdown' ? .25 : 0))) };
      opticalChange();
    }
  }, { signal });
  function render() {
    const s = session.state, displayed = playback?.world ?? s.world, optics = playback?.camera ?? camera;
    const result = playback?.result ?? evaluate(s, shot, camera);
    root.dataset.phase = s.phase; root.dataset.scene = String(s.scene + 1); root.dataset.film = String(s.film);
    root.dataset.view = view; root.dataset.ready = String(s.ready); root.dataset.coverage = result.kept ? 'ready' : 'blocked';
    el('[data-title]').textContent = s.brief.title;
    el('[data-scene]').textContent = s.phase === 'setup' ? 'YOUR STAGE AWAITS' : `SC ${s.scene + 1} / ${sceneName(s.scene).toUpperCase()} / ${CUES[s.scene].toUpperCase()}`;
    el('[data-budget]').textContent = `${s.film} film / ${s.time} time`;
    el('[data-cut]').textContent = `${s.takes.filter(t => t.result.kept).length} / 6 in cut`;
    el('[data-take-count]').textContent = String(s.takes.length);
    el('[data-invitation]').hidden = s.phase !== 'setup';
    el('[data-wrap]').hidden = !['won', 'lost'].includes(s.phase) || Boolean(playback);
    el('[data-ending]').textContent = s.ending;
    el('[data-wrap-copy]').textContent = s.phase === 'won' ? 'Six honest shots. Three small scenes. A complete little film, ready for its contact sheet.' : 'A production can miss its window. Keep the frames you made, or restart with a fresh reel.';
    el('[data-playback]').hidden = !playback;
    el('[data-playback-title]').textContent = playback ? `PLAYBACK / TAKE ${playback.id} / ${playback.shot.toUpperCase()}` : '';
    el('[data-monitor-lens]').textContent = `${optics.lens} MM`;
    el('[data-supertitles]').innerHTML = displayed.actors.filter(a => a.line).map(a => `<p><b>${roles[a.id].name}</b> ${escapeMarkup(a.line)}</p>`).join('');
    el('[data-stage-caption]').textContent = moving ? 'ENSEMBLE MOVING TO MARKS' : playback ? 'RECORDED STATE · NO MODEL CALL' : 'DRAG STAGE TO ORBIT · TAP ACTOR TO FOCUS';
    el<HTMLSelectElement>('[data-lens]').value = String(camera.lens); el<HTMLSelectElement>('[data-focus]').value = camera.focus;
    el<HTMLSelectElement>('[data-shot]').value = shot;
    el<HTMLOptionElement>('[data-shot] option[value="portrait"]').textContent = `${roles[portraitActor(s.scene)].name} portrait`;
    el('[data-cue-name]').textContent = cue;
    query(directionContent, '[data-beat-copy]').textContent = `Scene ${s.scene + 1}: ${s.brief.beats[s.scene]}`;
    query<HTMLSelectElement>(directionContent, '[data-cue]').value = cue;
    query<HTMLTextAreaElement>(directionContent, '[data-note]').value = note;
    query(directionContent, '[data-dialogue]').innerHTML = displayed.actors.map(a => `<p><strong>${roles[a.id].name}</strong> / ${escapeMarkup(a.mark)} / ${a.pose} / ${a.attention}<br>${escapeMarkup(a.line || 'Waiting for a model-backed rehearsal.')}</p>`).join('');
    query<HTMLSelectElement>(cameraContent, '[data-rig]').value = camera.rig;
    for (const axis of ['rail', 'distance', 'height'] as const) {
      query<HTMLInputElement>(cameraContent, `[data-${axis}]`).value = String(camera[axis]);
      query(cameraContent, `[data-${axis}-value]`).textContent = `${camera[axis].toFixed(2)} m`;
    }
    fillBlock();
    diagnosticsContent.innerHTML = `<p><strong>${result.kept ? 'Ready to keep' : 'Not ready to keep'}</strong> / ${playback?.shot ?? shot}</p>
      <ul>${result.reasons.map(r => `<li>${escapeMarkup(r)}</li>`).join('')}</ul>
      <table><thead><tr><th>Actor / mark</th><th>Height</th><th>Sightlines</th><th>Safe</th></tr></thead><tbody>${displayed.actors.map((a, i) => {
        const c = result.coverage[i];
        return `<tr><td>${roles[a.id].name}<br>${positionText(displayed.marks[a.mark])}</td><td>${Math.round(c.height * 100)}%</td><td>${c.visible}/9</td><td>${c.inside ? 'Yes' : 'No'}</td></tr>`;
      }).join('')}</tbody></table><p>Height is the projected bounding box of the actual puppet parts. Sightlines are segment intersections against stage, cabinet and the other actor. No model grades a take.</p>`;
    if (!lastNotice) feedback.textContent = playback ? `Take ${playback.id}: ${result.kept ? 'kept' : result.reasons.join(' ')}` :
      s.phase === 'setup' ? 'Open the brief, then give your actors their first cue.' : result.kept ? 'Geometry ready. Safe frame, clear sightlines, cue and continuity matched.' : result.reasons[0];
    root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    theater?.sync(displayed, optics, view, Boolean(playback));
    updateButtons();
  }
  theater = createTheater(el('[data-project-preview]'), {
    signal, onFocus(id) { camera = { ...camera, focus: id }; opticalChange(); },
    onMark(mark) { selectedMark = mark; fillBlock(); notice(`Selected ${mark}. Drag to move, or use Marks & prop.`); },
    onMoveMark(mark, x, z) { if (busy || playback) notice('Wait for the rehearsal or return to the live set before moving marks.'); else run({ type: 'mark', mark, x, z }); },
    onRail(delta) { camera = { ...camera, rail: Math.round(Math.max(-6, Math.min(6, camera.rail + delta)) * 20) / 20 }; opticalChange(); },
    onMotion(value) { moving = value; updateButtons(); },
    onError: notice,
  });
  page.onCleanup(theater.dispose);
  page.onCleanup(session.subscribe(() => { lastNotice = ''; render(); }));
  createGameNotebook(page, { gameId: 'takes', session, trigger: el('[data-notebook]'), beforeRestore() { agent.cancel(); playback = undefined; },
    afterRestore() { cue = CUES[session.state.scene]; camera = openingCamera(); shot = 'wide'; note = ''; fillBrief(session.state.brief); render(); }, onNotice: notice });
  render();
  return { destroy: page.destroy };
}
