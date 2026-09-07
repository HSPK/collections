import { escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import type { WorkspaceLifecycle } from '../../core/workspace';
import {
  CHAPTERS, CLAIM_IDS, ROLES, ROUTES, SUSPECT_IDS, TIMES, WITNESS_IDS, WITNESSES, caseFile,
} from './data';
import type { ArtifactId, ClaimId, WitnessId } from './data';
import { canInvestigate, corroborated, edgeBetween, inspectionCost, routableClaims } from './engine';
import type { Command, Encounter, State } from './engine';

const esc = escapeMarkup;

export function portrait(index: number): string {
  const hair = [
    '<path d="M27 39Q17 12 45 15Q75 7 74 43L63 31 34 36Z"/><path d="M28 58Q27 83 50 78Q75 78 72 57L61 70 41 70Z"/>',
    '<path d="M25 46Q12 17 42 14Q75 2 79 44L64 27 33 30Z"/><path d="M30 31L20 75 34 70M69 30L82 74 69 73"/>',
    '<path d="M25 42Q22 10 52 12Q81 12 75 45L61 25 33 35Z"/><circle cx="76" cy="21" r="11"/>',
    '<path d="M22 32L30 16 64 13 76 32Z"/><path d="M15 31H83V40H15Z"/>',
    '<path d="M26 44Q8 28 27 23Q27 5 45 17Q63 4 72 22Q88 21 76 46L64 30 34 34Z"/>',
  ][index];
  return `<svg viewBox="0 0 100 110" aria-hidden="true" focusable="false">
    <defs><pattern id="mn-hatch-${index}" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 4L4 0" stroke="#e8d5af" stroke-width=".6"/></pattern></defs>
    <path d="M0 0H100V110H0Z" fill="#c6b28e"/><circle cx="50" cy="46" r="39" fill="#deccaa"/>
    <path d="M9 110Q12 79 43 78L45 68H59L60 79Q91 83 95 110" fill="#373931"/>
    <path d="M37 79L50 104 65 79 58 77 45 76Z" fill="#ddc9a5"/>
    <path d="M29 37Q29 21 52 22Q74 22 73 44L69 64Q63 78 51 77Q36 75 32 59Z" fill="#b49771" stroke="#322f28" stroke-width="1.4"/>
    <path d="M34 35Q49 25 55 37L53 59 62 64 52 71 36 60Z" fill="#d9c09a"/>
    <g fill="#39382f">${hair}</g><path d="M35 45L44 44M58 44L67 45M51 45L47 57H54M43 66Q51 69 59 65" stroke="#342e25" stroke-width="1.6" fill="none"/>
    ${index === 2 ? '<g fill="none" stroke="#332c25"><circle cx="40" cy="47" r="9"/><circle cx="62" cy="47" r="9"/><path d="M49 46H53"/></g>' : ''}
    <path d="M0 0H100V110H0Z" fill="url(#mn-hatch-${index})" opacity=".24"/>
    <path d="M7 0V110M93 0V110" stroke="#423b2b" opacity=".3"/>
  </svg>`;
}

export function photograph(id: ArtifactId, chapter: number, developed: boolean, localTime: string): string {
  const [hour, minute] = localTime.split(':').map(Number);
  const details = {
    seal: '<path d="M60 63L267 40 281 153 74 180Z" fill="#69665b"/><path d="M84 82L248 63 258 132 99 155Z" fill="#252b28"/><path d="M180 84a32 32 0 1 0 12 53 25 25 0 1 1-12-53" fill="#b98644"/><path d="M88 145L117 133M98 149L130 134" stroke="#afaa8d" stroke-width="2"/>',
    threshold: chapter === 0 ? '<path d="M52 29L129 44 109 189 31 170Z" fill="#202b28"/><path d="M129 44L280 29 295 179 109 189Z" fill="#61675b"/><path d="M119 156Q177 113 275 145L283 174 112 185Z" fill="#a5a180"/><g fill="#292f29"><ellipse cx="148" cy="167" rx="5" ry="2"/><ellipse cx="170" cy="154" rx="3" ry="2"/><ellipse cx="221" cy="149" rx="7" ry="3"/></g><path d="M140 35L150 162M266 37L275 147" stroke="#959780"/>' :
      '<path d="M80 23L266 44 253 182 55 166Z" fill="#c2b58d"/><path d="M132 31L109 171M203 38L180 175" stroke="#726e53" stroke-width="5"/><path d="M68 116L260 132" stroke="#5d6557" stroke-width="2"/><path d="M101 55L234 70M98 70L232 84M93 85L226 99" stroke="#8b846c" stroke-width="3"/>',
    recorder: `<circle cx="155" cy="100" r="77" fill="#343b33" stroke="#aaa17b" stroke-width="5"/><circle cx="155" cy="100" r="65" fill="#c8bb92"/><g stroke="#4d5143">${Array.from({ length: 12 }, (_, n) => `<path d="M155 41V49" transform="rotate(${n * 30} 155 100)"/>`).join('')}</g><path d="M155 100V65" transform="rotate(${(hour % 12 + minute / 60) * 30} 155 100)" stroke="#323b32" stroke-width="5"/><path d="M155 100V48" transform="rotate(${minute * 6} 155 100)" stroke="#323b32" stroke-width="3"/><circle cx="155" cy="100" r="5" fill="#86613e"/><path d="M214 131L314 142 303 201 201 188Z" fill="#cabc94"/>${developed ? `<text x="215" y="163" fill="#3c4034" font-size="16" font-family="monospace">${localTime}</text><text x="219" y="185" fill="#654e33" font-size="16">+10 min</text>` : ''}`,
    ribbon: '<path d="M23 146Q70 33 139 94T308 59L297 81Q218 168 143 116T47 167Z" fill="#985c3f"/><path d="M121 92L198 40 201 128 132 119Z" fill="#b17449"/><path d="M166 91L166 116" stroke="#332f25" stroke-width="14"/><path d="M58 160L85 178 102 145" fill="#ad7e51"/>',
  };
  return `<svg viewBox="0 0 340 225" role="img" aria-label="${developed ? 'Procedural archival photograph of the inspected exhibit' : 'Undeveloped contact print; inspect to reveal the record'}">
    <defs><filter id="mn-grain-${id}"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" seed="${17 + chapter}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".16"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/></filter></defs>
    <path d="M0 0H340V225H0Z" fill="#dad0b7"/><g filter="url(#mn-grain-${id})"><path d="M13 12H327V211H13Z" fill="#474e41"/>${details[id]}</g>
    ${developed ? '' : '<path d="M13 12H327V211H13Z" fill="#18241f" opacity=".83"/><text x="170" y="116" text-anchor="middle" fill="#dfd0b0" font-family="monospace" font-size="16">SEALED CONTACT PRINT</text>'}
    <path d="M24 196H75M24 192V200M49 194V200M75 192V200" stroke="#e7d9b7"/><path d="M308 18V39M298 29H319" stroke="#b2a47f"/>
  </svg>`;
}

interface Hooks {
  getState(): State;
  busy(): boolean;
  command(command: Command): void;
  encounter(encounter: Encounter): void;
  restart(newSeed: boolean): void;
  cancel(): void;
}

export function createView(page: WorkspaceLifecycle, hooks: Hooks) {
  let selected: WitnessId = 'ivo';
  let pane: 'claims' | 'objects' | 'voices' = 'claims';
  let mode: 'beliefs' | 'evidence' = 'beliefs';
  let action: 'interview' | 'message' = 'interview';
  let openArtifact: ArtifactId | null = null;
  let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  page.root.innerHTML = `
    <div class="mn-workspace" data-project-preview>
      <header class="mn-header">
        <div class="mn-brand"><span class="mn-kicker">The municipal memory office / 074</span><h1>Mnemosyne<span>.</span></h1></div>
        <nav aria-label="Investigation tools"><button data-casebook>Casebook</button><button data-help>Guide</button><button data-save>Save</button><button data-restart>Restart</button></nav>
      </header>
      <div class="mn-case-line"><span data-chapter></span><span data-budget aria-live="polite"></span></div>
      <main class="mn-main">
        <section class="mn-investigation" aria-label="Investigation workspace">
          <div class="mn-scene" data-scene>
            <div class="mn-scene-toolbar"><div class="mn-switch" aria-label="Diagram view"><button data-mode="beliefs" aria-pressed="true">Belief network</button><button data-mode="evidence" aria-pressed="false">Evidence graph</button></div><button class="mn-records-trigger" data-records>Records</button></div>
            <div class="mn-map" data-map>
              <div class="mn-map-depth" data-map-depth>
                <div class="mn-rings" aria-hidden="true"></div>
                <svg class="mn-threads" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true" data-threads></svg>
                <div class="mn-trust-labels" data-trust-labels aria-hidden="true"></div>
                <div class="mn-town-stamp" aria-hidden="true">PALIMPSEST<span>MEMORY IS NOT A RECORD</span></div>
                ${WITNESS_IDS.map(id => `<button class="mn-person" data-witness="${id}" aria-label="Select ${WITNESSES[id].name}" aria-pressed="${id === selected}" style="--x:${WITNESSES[id].x}%;--y:${WITNESSES[id].y}%">${portrait(WITNESSES[id].portrait)}<span>${esc(WITNESSES[id].name)}</span><small data-person-trust="${id}"></small></button>`).join('')}
                <div class="mn-pins" data-graph-pins></div>
              </div>
            </div>
            <p class="mn-legend" data-legend>Lines are relationships, not proof. Gold threads carry accepted stories.</p>
          </div>
          <section class="mn-desk" aria-label="Primary investigation actions" data-desk></section>
          <p class="mn-notice" data-notice role="status" aria-live="polite">Read the case, then open your inquiry. Nothing is sent to a model until you interview or route a message.</p>
        </section>
        <aside class="mn-notebook-slot" data-notebook-slot></aside>
      </main>
      <footer class="mn-footer"><div data-agent-host></div><span class="mn-footer-note">A record, not a consensus.</span></footer>
    </div>`;
  const root = page.root;
  const map = query<HTMLElement>(root, '[data-map]');
  const depth = query<HTMLElement>(root, '[data-map-depth]');
  const desk = query<HTMLElement>(root, '[data-desk]');
  const threads = query<SVGElement>(root, '[data-threads]');
  const graph = query<HTMLElement>(root, '[data-graph-pins]');
  const notice = query<HTMLElement>(root, '[data-notice]');
  const notebook = document.createElement('section');
  notebook.className = 'mn-notebook';
  notebook.setAttribute('aria-label', 'Field notebook');
  notebook.innerHTML = `<header><span class="mn-kicker">Working record</span><h2>In the margins</h2></header>
    <nav class="mn-notebook-tabs" aria-label="Notebook sections"><button data-pane="claims" aria-pressed="true">Claims</button><button data-pane="objects" aria-pressed="false">Objects</button><button data-pane="voices" aria-pressed="false">Voices</button></nav>
    <div class="mn-notebook-content" data-notebook-content tabindex="0"></div>
    <button class="mn-file" data-trial>File an accusation</button>`;
  const notebookContent = query<HTMLElement>(notebook, '[data-notebook-content]');
  const mobileNotebook = document.createElement('div');
  const recordsDialog = createWorkspaceDialog(page, { id: 'mnemosyne-records', title: 'Field notebook', content: [mobileNotebook], triggers: [query(root, '[data-records]')], className: 'mn-dialog mn-records-dialog' });
  const caseContent = document.createElement('section');
  const caseDialog = createWorkspaceDialog(page, { id: 'mnemosyne-casebook', title: 'The casebook', content: [caseContent], triggers: [query(root, '[data-casebook]')], className: 'mn-dialog' });
  const helpContent = document.createElement('section');
  helpContent.innerHTML = `
    <p class="mn-lede">In Palimpsest, a story grows stronger each time it is repeated. Evidence does not.</p>
    <ol class="mn-guide">
      <li><strong>Read the case.</strong> Compare the three suspects' permit colors and access in Casebook. A permit match alone is not an identification.</li>
      <li><strong>Choose a witness.</strong> Select a portrait or use the Witness menu. Interview costs one turn. Reassurance adds one influence and raises their trust before they decide. Each witness allows three interviews.</li>
      <li><strong>Carry a story.</strong> Route a known claim from the selected witness to a connected recipient for one turn and one influence. They decide whether to believe it, reveal something else, offer an alibi, change an edge, or relay to a trusted contact. Accepted messages raise trust in you. Gold paths show the flow; a relay needs edge trust 2.</li>
      <li><strong>Find a second source.</strong> Two different direct observers corroborate a claim. Copies and relays never count as additional observers. One inspected physical object can independently corroborate a claim. Quoted testimony is never proof by itself.</li>
      <li><strong>Keep a way back.</strong> A disclosed observation locates its corresponding object. Inspection then costs one turn. Without a lead, a physical warrant costs three turns and two influence. Three critical warrants need nine turns and six influence; no witness can permanently lock them.</li>
      <li><strong>Make the links.</strong> In Claims, pin your evidence. The evidence graph shows its sources. File one distinct pinned claim for each of identity, entry, and time, then select a suspect, entrance, and corrected minute. Explain the linkage in your own words. The local rules, not the model or your prose, judge the evidence.</li>
    </ol>
    <p>You have 14 turns and 8 influence per chapter. Unsupported accusations are final. At zero turns you lose unless all three critical claims are corroborated; then you have one last chance to pin and file. Reading, selecting, reviewing, and pinning cost nothing. Dawn never takes a turn on an API failure.</p>
    <p><strong>Controls:</strong> all actions are buttons and labeled menus. Outside forms or dialogs: 1-5 selects a witness, E switches diagram, N opens records, and ? opens this guide. Motion follows your system preference. There is no audio.</p>
    <p><strong>Connection:</strong> use Model to configure your own OpenAI-compatible tool-capable endpoint. Only interviews and routed messages request a model. Errors are explicit; warrants are player investigations, not simulated witnesses. Save exports a validated move replay, never connection secrets.</p>`;
  const helpDialog = createWorkspaceDialog(page, { id: 'mnemosyne-guide', title: 'How to investigate', content: [helpContent], triggers: [query(root, '[data-help]')], className: 'mn-dialog' });
  const artifactContent = document.createElement('section');
  const artifactDialog = createWorkspaceDialog(page, { id: 'mnemosyne-object', title: 'The material record', content: [artifactContent], className: 'mn-dialog mn-object-dialog' });
  const claimContent = document.createElement('section');
  const claimDialog = createWorkspaceDialog(page, { id: 'mnemosyne-claim', title: 'Claim & provenance', content: [claimContent], className: 'mn-dialog' });
  const trialContent = document.createElement('section');
  const trialDialog = createWorkspaceDialog(page, { id: 'mnemosyne-trial', title: 'The final hearing', content: [trialContent], className: 'mn-dialog' });
  const restartContent = document.createElement('section');
  restartContent.innerHTML = '<p>Restart clears both chapters of this inquiry. Export a replay first if you want to keep it. The same seed keeps the same objective case; a new seed changes credentials, time, and responsibility.</p><div class="mn-dialog-actions"><button data-confirm-restart>Restart same case</button><button data-new-seed>New seeded case</button></div>';
  const restartDialog = createWorkspaceDialog(page, { id: 'mnemosyne-restart', title: 'Start a new inquiry', content: [restartContent], triggers: [query(root, '[data-restart]')], className: 'mn-dialog' });
  const narrow = window.matchMedia('(max-width: 1000px)');
  const compact = window.matchMedia('(max-width: 540px)');
  function placeNotebook() {
    const target = narrow.matches ? mobileNotebook : query<HTMLElement>(root, '[data-notebook-slot]');
    if (notebook.parentElement !== target) {
      if (recordsDialog.dialog.open) recordsDialog.close();
      target.append(notebook);
    }
  }
  placeNotebook();
  narrow.addEventListener('change', placeNotebook, { signal: page.signal });
  compact.addEventListener('change', () => renderDiagram(), { signal: page.signal });
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function motionChanged() {
    reducedMotion = motion.matches;
    root.classList.toggle('mn-static', reducedMotion);
    depth.style.removeProperty('--rx');
    depth.style.removeProperty('--ry');
  }
  motionChanged();
  motion.addEventListener('change', motionChanged, { signal: page.signal });
  map.addEventListener('pointermove', event => {
    if (reducedMotion || event.pointerType !== 'mouse') return;
    const bounds = map.getBoundingClientRect();
    depth.style.setProperty('--rx', `${(event.clientY - bounds.top - bounds.height / 2) / bounds.height * -3}deg`);
    depth.style.setProperty('--ry', `${(event.clientX - bounds.left - bounds.width / 2) / bounds.width * 4}deg`);
  }, { signal: page.signal });
  map.addEventListener('pointerleave', () => {
    depth.style.setProperty('--rx', '0deg');
    depth.style.setProperty('--ry', '0deg');
  }, { signal: page.signal });

  function setNotice(message: string) { notice.textContent = message; }
  function showClaim(id: ClaimId) {
    const state = hooks.getState();
    const record = state.records.find(item => item.claimId === id);
    if (!record) { setNotice('That claim has not been recorded.'); return; }
    const claim = caseFile(state.seed, state.chapter).claims[id];
    claimContent.innerHTML = `<span class="mn-kicker">${esc(claim.kind)} / ${corroborated(state, id) ? 'Corroborated' : 'Unverified'}</span><h3>${esc(claim.title)}</h3><p class="mn-lede">${esc(claim.text)}</p><p>Sources: ${esc(sourceNames(record.sources))}</p><p>${claim.role ? `Potential linkage: ${claim.role}. This claim must still fit your named suspect, entry and time.` : 'This is context, not a complete identity, entry, or time linkage.'}</p>`;
    claimDialog.open();
  }
  function sourceNames(sources: string[]): string {
    return sources.map(source => {
      if (source === 'town') return 'Town rumor (no independent observer)';
      const who = WITNESS_IDS.find(id => `witness:${id}` === source);
      return who ? WITNESSES[who].name : `Physical exhibit ${source.replace('artifact:', '')}`;
    }).join(' / ');
  }
  function renderArtifact() {
    if (!openArtifact) return;
    const state = hooks.getState();
    const file = caseFile(state.seed, state.chapter);
    const artifact = file.artifacts.find(item => item.id === openArtifact)!;
    const inspected = state.inspected.includes(artifact.id);
    const cost = inspectionCost(state, artifact.id);
    artifactContent.innerHTML = `<span class="mn-kicker">${esc(artifact.location)}</span><h3>${esc(artifact.title)}</h3>
      <figure class="mn-photograph">${photograph(artifact.id, state.chapter, inspected, file.localTime)}<figcaption>${inspected ? esc(artifact.caption) : 'Sealed until examined. No objective details are available yet.'}</figcaption></figure>
      <p class="mn-lede">${inspected ? esc(artifact.detail) : state.leads.includes(artifact.id) ? 'A witness has located this record. Develop and inspect it to establish an independent source.' : 'No witness has located this record. You may commission a physical warrant: an expensive, guaranteed search independent of witness cooperation.'}</p>
      ${inspected ? `<p class="mn-corrob">Recorded and corroborated. Revisit freely; no turns spent.</p><button data-artifact-pin="${artifact.claimId}" ${state.pinned.includes(artifact.claimId) || !['investigation', 'last-call'].includes(state.phase) || hooks.busy() ? 'disabled' : ''}>${state.pinned.includes(artifact.claimId) ? 'Pinned to graph' : 'Pin to evidence graph'}</button>` :
        `<button data-inspect="${artifact.id}" ${!canInvestigate(state) || hooks.busy() || state.turns < cost.turns || state.influence < cost.influence ? 'disabled' : ''}>${cost.turns === 3 ? 'Commission warrant' : 'Inspect located object'} / ${cost.turns} turn${cost.turns === 1 ? '' : 's'}${cost.influence ? ` + ${cost.influence} influence` : ''}</button>`}`;
  }
  function showArtifact(id: ArtifactId) { openArtifact = id; renderArtifact(); artifactDialog.open(); }

  function renderNotebook() {
    const state = hooks.getState();
    const file = caseFile(state.seed, state.chapter);
    notebook.querySelectorAll<HTMLButtonElement>('[data-pane]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.pane === pane)));
    if (pane === 'claims') {
      notebookContent.innerHTML = `<p class="mn-marginal">${state.records.length} claims / ${state.pinned.length} pinned. A repeated story is not a second source.</p>${state.records.map(entry => {
        const claim = file.claims[entry.claimId];
        const verified = corroborated(state, entry.claimId);
        return `<article class="mn-record" data-record="${entry.claimId}"><div class="mn-record-meta">${esc(claim.kind)} <span>${verified ? 'Corroborated' : 'Unverified'}</span></div><h3>${esc(claim.title)}</h3><p>${esc(claim.text)}</p><small>${esc(sourceNames(entry.sources))}</small><div class="mn-record-actions"><button data-claim="${entry.claimId}">Provenance</button><button data-pin="${entry.claimId}" aria-pressed="${state.pinned.includes(entry.claimId)}" ${!['investigation', 'last-call'].includes(state.phase) || hooks.busy() ? 'disabled' : ''}>${state.pinned.includes(entry.claimId) ? 'Unpin' : 'Pin claim'}</button></div></article>`;
      }).join('')}`;
    } else if (pane === 'objects') {
      notebookContent.innerHTML = `<p class="mn-marginal">Three records establish the crime; the ribbon only tests a rumor. Located objects cost 1 turn. Unlocated warrants cost 3 turns + 2 influence.</p>${file.artifacts.map(item => {
        const known = state.inspected.includes(item.id);
        return `<button class="mn-object-row" data-artifact="${item.id}"><span class="mn-contact-print">${photograph(item.id, state.chapter, known, file.localTime)}</span><span><strong>${esc(item.title)}</strong><small>${known ? 'Verified / revisit free' : state.leads.includes(item.id) ? 'Located / 1 turn' : 'Unlocated / warrant available'}</small></span></button>`;
      }).join('')}`;
    } else {
      const beliefs = state.beliefs.filter(item => item.witnessId === selected);
      const contacts = state.edges.filter(edge => edge.from === selected || edge.to === selected);
      notebookContent.innerHTML = `<article class="mn-record"><span class="mn-kicker">Selected witness / received beliefs</span><h3>${esc(WITNESSES[selected].name)}</h3><p>Trust in you: ${state.trust[selected]}/3. These received stories are not independent observations.</p>
        ${beliefs.map(item => `<p>${esc(file.claims[item.claimId].title)} / ${item.claimId === 'rumor' ? 'town gossip' : `received from ${esc(WITNESSES[item.origin].name)}`}</p>`).join('')}
        <p>Connections: ${contacts.map(edge => `${esc(WITNESSES[edge.from === selected ? edge.to : edge.from].name)} (${edge.trust}/3)`).join('; ')}.</p></article>` +
        [...state.log].reverse().map((entry, i) => `<article class="mn-record"><span class="mn-kicker">Record ${String(state.log.length - i).padStart(2, '0')}</span><h3>${esc(entry.title)}</h3><p class="mn-transcript">${esc(entry.text)}</p></article>`).join('');
    }
    query<HTMLButtonElement>(notebook, '[data-trial]').disabled = hooks.busy() || !['investigation', 'last-call'].includes(state.phase);
  }

  function renderDiagram() {
    const state = hooks.getState();
    const file = caseFile(state.seed, state.chapter);
    const positions: Record<WitnessId, { x: number; y: number }> = compact.matches ? {
      ivo: { x: 18, y: 22 }, nell: { x: 50, y: 22 }, ada: { x: 82, y: 22 },
      bram: { x: 71, y: 78 }, cyra: { x: 29, y: 78 },
    } : WITNESSES;
    root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    root.querySelectorAll<HTMLButtonElement>('[data-witness]').forEach(button => {
      const id = WITNESS_IDS.find(who => who === button.dataset.witness)!;
      button.style.setProperty('--x', `${positions[id].x}%`);
      button.style.setProperty('--y', `${positions[id].y}%`);
      button.setAttribute('aria-pressed', String(id === selected));
      const received = state.beliefs.filter(item => item.witnessId === id && item.claimId !== 'rumor').length;
      query(button, 'small').textContent = `Trust ${state.trust[id]}${received ? ` / ${received} heard` : ''}`;
    });
    root.classList.toggle('mn-evidence-mode', mode === 'evidence');
    depth.style.minHeight = mode === 'evidence' ? `${Math.max(250, state.pinned.length * 65)}px` : '';
    if (mode === 'beliefs') {
      graph.replaceChildren();
      query(root, '[data-trust-labels]').innerHTML = state.edges.map(edge => {
        const from = positions[edge.from], to = positions[edge.to];
        return `<span style="left:${(from.x + to.x) / 2}%;top:${(from.y + to.y) / 2 - 3}%">${edge.trust}</span>`;
      }).join('');
      threads.innerHTML = state.edges.map((edge, index) => {
        const from = positions[edge.from], to = positions[edge.to];
        const x1 = from.x * 10, y1 = from.y * 6.5, x2 = to.x * 10, y2 = to.y * 6.5;
        const active = [...state.messages].reverse().find(message => message.accepted && ((message.from === edge.from && message.to === edge.to) || (message.from === edge.to && message.to === edge.from)));
        const control = `${(x1 + x2) / 2 + (index % 2 ? 35 : -35)} ${(y1 + y2) / 2 - 30}`;
        const flow = active?.from === edge.from ? `M${x1} ${y1}Q${control} ${x2} ${y2}` : `M${x2} ${y2}Q${control} ${x1} ${y1}`;
        return `<g class="${edge.from === selected || edge.to === selected ? 'mn-edge-selected' : ''}">
          <path d="M${x1} ${y1}Q${(x1 + x2) / 2 + (index % 2 ? 35 : -35)} ${(y1 + y2) / 2 - 30} ${x2} ${y2}" class="mn-edge" stroke-width="${1 + edge.trust * .6}"/>
          ${active ? `<path d="${flow}" class="mn-flow"/>` : ''}</g>`;
      }).join('');
      query(root, '[data-legend]').textContent = 'Lines show trust 0-3. Gold threads carry beliefs, not additional proof.';
    } else {
      query(root, '[data-trust-labels]').replaceChildren();
      const pins = state.pinned;
      const pinPositions = pins.map((_, index) => ({ x: 50, y: 14 + index * (70 / Math.max(pins.length - 1, 1)) }));
      graph.innerHTML = (pins.length ? pins.map((id, index) => `<button class="mn-graph-claim" data-claim="${id}" style="left:${pinPositions[index].x}%;top:${pinPositions[index].y}%"><span>${corroborated(state, id) ? 'CORROBORATED' : 'UNVERIFIED'}</span>${esc(file.claims[id].title)}</button>`).join('') : '<p class="mn-empty-graph">Pin discovered claims in the notebook.<br>Their independent sources will appear here.</p>') + '<span class="mn-material-label">Material / town records</span>';
      threads.innerHTML = pins.map((id, index) => {
        const record = state.records.find(item => item.claimId === id)!;
        return record.sources.map(source => {
          const witnessId = WITNESS_IDS.find(who => source === `witness:${who}`);
          const pos = witnessId ? positions[witnessId] : { x: 8, y: 94 };
          return `<path class="mn-proof-line ${corroborated(state, id) ? 'mn-proof-verified' : ''}" d="M${pos.x * 10} ${pos.y * 6.5}L500 ${pinPositions[index].y * 6.5}"/>`;
        }).join('');
      }).join('');
      query(root, '[data-legend]').textContent = 'Source lines preserve provenance. Inspect a pinned claim to read its record.';
    }
  }

  function renderDesk() {
    const state = hooks.getState();
    const file = caseFile(state.seed, state.chapter);
    if (state.phase === 'briefing') {
      desk.innerHTML = `<div class="mn-brief"><div><span class="mn-kicker">${esc(file.story.location)}</span><h2>${esc(file.story.title)}</h2><p>${esc(file.story.mission)}</p></div><button class="mn-primary" data-begin>Begin investigation</button></div>`;
      return;
    }
    if (state.phase === 'won' || state.phase === 'lost') {
      desk.innerHTML = `<div class="mn-ending" data-ending="${state.phase}"><div><span class="mn-kicker">${state.phase === 'won' ? 'A supported reconstruction' : 'The record remains broken'}</span><h2>${state.phase === 'won' ? state.chapter === CHAPTERS.length - 1 ? 'The town remembers.' : 'The record holds.' : 'The inquiry is lost.'}</h2><p>${esc(state.verdict)}</p></div>${state.phase === 'won' && state.chapter < CHAPTERS.length - 1 ? '<button class="mn-primary" data-next>Open chapter II</button>' : '<button data-restart-intent>Restart inquiry</button>'}</div>`;
      return;
    }
    if (state.phase === 'last-call') {
      desk.innerHTML = '<div class="mn-brief"><div><span class="mn-kicker">No more investigation turns</span><h2>The last bell.</h2><p>You have the corroborated record. Review and pin for free, then make one reasoned accusation.</p></div><button class="mn-primary" data-trial>Final hearing</button></div>';
      return;
    }
    const person = WITNESSES[selected];
    const latest = [...state.log].reverse().find(entry => entry.title.startsWith(person.name));
    desk.innerHTML = `<div class="mn-desk-heading"><label class="mn-witness-select">Witness<select data-select-witness aria-label="Witness">${WITNESS_IDS.map(id => `<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(WITNESSES[id].name)} / ${esc(WITNESSES[id].role)}</option>`).join('')}</select></label>
      <div class="mn-switch"><button data-action-mode="interview" aria-pressed="${action === 'interview'}">Interview</button><button data-action-mode="message" aria-pressed="${action === 'message'}">Route</button></div></div>
      ${action === 'interview' ? `<div class="mn-action-row"><label>Approach<select data-approach aria-label="Approach"><option value="ask">Ask / 1 turn</option><option value="reassure">Reassure / 1 turn + 1 influence</option></select></label><button class="mn-primary" data-interview ${hooks.busy() || state.interviews[selected] >= 3 ? 'disabled' : ''}>Interview witness</button></div>` :
        `<div class="mn-route-row"><label>To<select data-recipient aria-label="Message recipient">${state.edges.filter(edge => edge.from === selected || edge.to === selected).map(edge => {
          const id = edge.from === selected ? edge.to : edge.from;
          return `<option value="${id}">${esc(WITNESSES[id].name)} / trust ${edge.trust}</option>`;
        }).join('')}</select></label><label>Carry<select data-message-claim aria-label="Message claim">${routableClaims(state, selected).map(id => `<option value="${id}">${esc(file.claims[id].title)}</option>`).join('')}</select></label><button class="mn-primary" data-send ${hooks.busy() || !state.influence ? 'disabled' : ''}>Send / 1t + 1i</button></div>`}
      <div class="mn-testimony"><span>${esc(person.role)} / Trust ${state.trust[selected]} / ${state.interviews[selected]}/3 interviews</span><p>${latest ? esc(latest.text) : 'No recorded testimony. This witness will choose what to disclose, withhold, and pass on.'}</p></div>`;
  }

  function showTrial() {
    const state = hooks.getState();
    const file = caseFile(state.seed, state.chapter);
    const options = '<option value="">Choose a pinned claim</option>' + state.pinned.map(id => `<option value="${id}">${esc(file.claims[id].title)} / ${corroborated(state, id) ? 'corroborated' : 'unverified'}</option>`).join('');
    trialContent.innerHTML = `<p class="mn-lede">One accusation. Three independent links.</p><p>The hearing is final. Name a suspect and reconstruct the route and corrected time. Your prose records your reasoning; only the linked, corroborated facts can sustain it.</p>
      <div class="mn-roster">${file.suspects.map(suspect => `<p><strong>${esc(WITNESSES[suspect.id].name)}</strong> / ${suspect.permit} permit / access: ${suspect.access.join(', ')}</p>`).join('')}</div>
      <form data-accusation>
        <div class="mn-trial-selection"><label>Accused<select name="suspect" aria-label="Accused" required><option value="">Choose a suspect</option>${SUSPECT_IDS.map(id => `<option value="${id}">${esc(WITNESSES[id].name)}</option>`).join('')}</select></label>
        <label>Entry route<select name="route" aria-label="Entry route" required><option value="">Choose an entrance</option>${ROUTES.map(id => `<option value="${id}">${id}</option>`).join('')}</select></label>
        <label>Corrected time<select name="time" aria-label="Corrected time" required><option value="">Choose a minute</option>${TIMES.map(id => `<option value="${id}">${id}</option>`).join('')}</select></label></div>
        ${ROLES.map(role => {
          const label = role === 'identity' ? 'Identity / permit evidence' : role === 'entry' ? 'Entry / physical route evidence' : 'Time / corrected chronology';
          return `<label>${label}<select name="link-${role}" aria-label="${label}" required>${options}</select></label>`;
        }).join('')}
        <label>Your reasoning<textarea name="reasoning" minlength="20" maxlength="500" rows="3" required placeholder="Explain how the permit and access intersect, and why the corrected minute fits."></textarea></label>
        <p data-trial-error role="status"></p><button type="submit" class="mn-primary" ${hooks.busy() || state.pinned.length < 3 ? 'disabled' : ''}>Submit final accusation</button>
      </form><p>${state.pinned.length < 3 ? 'Pin at least three distinct discovered claims before filing.' : 'An alibi or a popular rumor is not a substitute for a corroborated linkage.'}</p>
      <details><summary>Leave the crime unresolved</summary><p>This ends the chapter in a loss without accusing anyone.</p><button data-close-inquiry>Close investigation unresolved</button></details>`;
    trialDialog.open();
  }

  function renderCasebook() {
    const state = hooks.getState();
    const file = caseFile(state.seed, state.chapter);
    caseContent.innerHTML = `<span class="mn-kicker">Seed ${state.seed} / ${esc(file.story.subtitle)}</span><h3>${esc(file.story.title)}</h3><p class="mn-lede">${esc(file.story.scene)}</p><p>${esc(file.story.mission)}</p>
      <h3>The public credential register</h3><p>Credentials are verified public facts. Each amber permit could leave the imprint. Only a listed service-route holder could open that entrance. Alibis are claims, not verified locations.</p>
      <div class="mn-roster">${file.suspects.map(suspect => `<article><strong>${esc(WITNESSES[suspect.id].name)}</strong><p>${suspect.permit} permit / authorized entrances: ${suspect.access.join(', ')}</p><p class="mn-alibi">Registered alibi, not proof: "${esc(suspect.alibi)}"</p></article>`).join('')}</div>
      <h3>Two chapters, one broken archive</h3><ol><li>The Empty Cylinder: recover a stolen voice.</li><li>The Borrowed Flood: use that voice to expose a substituted public record. Unlocks after a supported first verdict; evidence and responsibility change.</li></ol>
      <p>Begin with Ivo's ferry observation, Nell's clock memory, or Bram's practical recollection. Not all will cooperate. Reserve 9 turns and 6 influence for three warrants if necessary.</p>`;
  }
  function render() {
    const state = hooks.getState();
    query(root, '[data-chapter]').textContent = caseFile(state.seed, state.chapter).story.subtitle;
    query(root, '[data-budget]').textContent = `${state.turns} turns / ${state.influence} influence`;
    root.dataset.phase = state.phase;
    renderDiagram();
    renderDesk();
    renderNotebook();
    renderCasebook();
    renderArtifact();
  }

  function setSelected(id: WitnessId) {
    selected = id;
    renderDiagram();
    renderDesk();
    if (pane === 'voices') renderNotebook();
  }
  function performEncounter() {
    if (action === 'interview') {
      const approach = query<HTMLSelectElement>(desk, '[data-approach]').value === 'reassure' ? 'reassure' : 'ask';
      hooks.encounter({ kind: 'interview', witnessId: selected, approach });
    } else {
      const recipient = WITNESS_IDS.find(id => id === query<HTMLSelectElement>(desk, '[data-recipient]').value)!;
      const claim = CLAIM_IDS.find(id => id === query<HTMLSelectElement>(desk, '[data-message-claim]').value);
      if (!claim || !edgeBetween(hooks.getState(), selected, recipient)) { setNotice('Choose a known claim and a connected recipient.'); return; }
      hooks.encounter({ kind: 'message', from: selected, witnessId: recipient, claimId: claim });
    }
  }
  root.addEventListener('change', event => {
    if (event.target instanceof HTMLSelectElement && event.target.matches('[data-select-witness]')) {
      const value = event.target.value;
      const id = WITNESS_IDS.find(who => who === value);
      if (id) setSelected(id);
    }
  }, { signal: page.signal });
  root.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!button || button.disabled) return;
    const id = WITNESS_IDS.find(who => who === button.dataset.witness);
    if (id) setSelected(id);
    if (button.dataset.mode === 'beliefs' || button.dataset.mode === 'evidence') { mode = button.dataset.mode; renderDiagram(); }
    if (button.dataset.pane === 'claims' || button.dataset.pane === 'objects' || button.dataset.pane === 'voices') { pane = button.dataset.pane; renderNotebook(); }
    if (button.dataset.actionMode === 'interview' || button.dataset.actionMode === 'message') { action = button.dataset.actionMode; renderDesk(); }
    if (button.hasAttribute('data-begin')) hooks.command({ type: 'begin' });
    if (button.hasAttribute('data-next')) {
      selected = 'ivo'; mode = 'beliefs'; action = 'interview'; pane = 'claims';
      hooks.command({ type: 'next' });
    }
    if (button.hasAttribute('data-interview') || button.hasAttribute('data-send')) performEncounter();
    if (button.hasAttribute('data-trial')) showTrial();
    if (button.hasAttribute('data-close-inquiry')) { hooks.command({ type: 'close' }); trialDialog.close(); recordsDialog.close(); }
    const artifact = caseFile(hooks.getState().seed, hooks.getState().chapter).artifacts.find(item => item.id === button.dataset.artifact);
    if (artifact) showArtifact(artifact.id);
    const inspect = caseFile(hooks.getState().seed, hooks.getState().chapter).artifacts.find(item => item.id === button.dataset.inspect);
    if (inspect) hooks.command({ type: 'inspect', artifactId: inspect.id });
    const claim = CLAIM_IDS.find(item => item === button.dataset.claim);
    if (claim) showClaim(claim);
    const pin = CLAIM_IDS.find(item => item === (button.dataset.pin ?? button.dataset.artifactPin));
    if (pin) hooks.command({ type: button.dataset.artifactPin || !hooks.getState().pinned.includes(pin) ? 'pin' : 'unpin', claimId: pin });
    if (button.hasAttribute('data-restart')) hooks.cancel();
    if (button.hasAttribute('data-restart-intent')) { hooks.cancel(); restartDialog.open(); }
    if (button.hasAttribute('data-confirm-restart') || button.hasAttribute('data-new-seed')) {
      hooks.restart(button.hasAttribute('data-new-seed'));
      for (const dialog of [restartDialog, artifactDialog, claimDialog, recordsDialog, trialDialog, caseDialog]) dialog.close();
      selected = 'ivo'; mode = 'beliefs'; action = 'interview'; pane = 'claims'; openArtifact = null;
      render();
      setNotice('Fresh inquiry. The case is not open yet; no model has been called.');
    }
  }, { signal: page.signal });
  trialContent.addEventListener('submit', event => {
    event.preventDefault();
    const form = query<HTMLFormElement>(trialContent, '[data-accusation]');
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const suspectId = SUSPECT_IDS.find(id => id === values.get('suspect'))!;
    const route = ROUTES.find(id => id === values.get('route'))!;
    const time = TIMES.find(id => id === values.get('time'))!;
    const links = ROLES.map(role => ({ role, claimId: CLAIM_IDS.find(id => id === values.get(`link-${role}`))! }));
    const reasoning = String(values.get('reasoning'));
    if (new Set(links.map(link => link.claimId)).size !== 3) {
      query(trialContent, '[data-trial-error]').textContent = 'Use three distinct claims. Repeating one story cannot fill three gaps.';
      return;
    }
    hooks.command({ type: 'accuse', suspectId, route, time, links, reasoning });
    if (['won', 'lost'].includes(hooks.getState().phase)) { trialDialog.close(); recordsDialog.close(); }
  }, { signal: page.signal });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog:modal') ||
      (event.target instanceof Element && event.target.closest('input, select, textarea, button, a, [contenteditable="true"]'))) return;
    const number = Number(event.key);
    if (Number.isInteger(number) && number >= 1 && number <= 5) { event.preventDefault(); setSelected(WITNESS_IDS[number - 1]); }
    if (event.key.toLowerCase() === 'e') { event.preventDefault(); mode = mode === 'beliefs' ? 'evidence' : 'beliefs'; renderDiagram(); }
    if (event.key.toLowerCase() === 'n') { event.preventDefault(); if (narrow.matches) recordsDialog.open(); else notebookContent.focus(); }
    if (event.key === '?') { event.preventDefault(); helpDialog.open(); }
  }, { signal: page.signal });
  render();
  return {
    render, setNotice,
    saveTrigger: query<HTMLElement>(root, '[data-save]'),
    agentHost: query<HTMLElement>(root, '[data-agent-host]'),
    closeTransientDialogs() { artifactDialog.close(); claimDialog.close(); trialDialog.close(); restartDialog.close(); recordsDialog.close(); openArtifact = null; },
  };
}
