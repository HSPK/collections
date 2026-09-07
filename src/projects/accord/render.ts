import { escapeMarkup, query } from '../../core/page';
import {
  CAPACITY, CONDITIONS, DELEGATE_IDS, DELEGATES, FIELDS, MAX_AMENDMENTS, MAX_HEARINGS, SEASONS, SECTORS, SETUPS, WORKS,
} from './data';
import type { State } from './data';
import { allocated, decisionFor, forecast, majority, projectPolicy, supportRule } from './engine';

export type BoardView = 'city' | 'section';
const e = escapeMarkup;
const point = (x: number, y: number, z = 0) => `${440 + (x - y) * .82},${56 + (x + y) * .34 - z}`;

function block(x: number, y: number, w: number, d: number, h: number, kind = ''): string {
  const corners = [point(x, y, h), point(x + w, y, h), point(x + w, y + d, h), point(x, y + d, h)];
  return `<g class="accord-building ${kind}">
    <path class="accord-block-shadow" d="M${point(x, y)} ${point(x + w + 20, y)} ${point(x + w + 20, y + d + 15)} ${point(x, y + d + 15)}Z"/>
    <path class="accord-block-side" d="M${corners[1]} ${corners[2]} ${point(x + w, y + d)} ${point(x + w, y)}Z"/>
    <path class="accord-block-front" d="M${corners[2]} ${corners[3]} ${point(x, y + d)} ${point(x + w, y + d)}Z"/>
    <path class="accord-block-roof" d="M${corners.join(' ')}Z"/>
    <path class="accord-roof-line" d="M${point(x + 4, y + 4, h + 1)} ${point(x + w - 4, y + 4, h + 1)} ${point(x + w - 4, y + d - 4, h + 1)}"/>
    <path class="accord-window" d="M${point(x + w, y + d * .3, h * .65)}v${h * .3}m0,${-h * .45}v${h * .1}M${point(x + w, y + d * .7, h * .65)}v${h * .3}"/>
  </g>`;
}

export function cityDrawing(seed: number): string {
  const houses: string[] = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
    houses.push(block(28 + col * 57, 35 + row * 75, 36, 43, 24 + ((row * 7 + col * 11 + seed) % 5) * 7));
  }
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    houses.push(block(340 + col * 53, 24 + row * 63, 33, 36, 27 + ((row * 13 + col * 3 + seed) % 5) * 8));
  }
  return `<svg class="accord-city-svg" viewBox="20 0 950 445" aria-hidden="true" focusable="false" data-city-svg>
    <defs>
      <pattern id="accord-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#24465f" stroke-opacity=".07"/></pattern>
      <pattern id="accord-hatch" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7 7 0" stroke="#23465e" stroke-opacity=".24" stroke-width="1"/></pattern>
      <pattern id="accord-river-lines" width="40" height="30" patternUnits="userSpaceOnUse"><path d="M0 8Q10 3 20 8T40 8M0 23Q10 18 20 23T40 23" fill="none" stroke="#b4cec7" stroke-width="1" opacity=".35"/></pattern>
      <clipPath id="accord-reservoir-clip"><path d="M${point(355, 242)} ${point(430, 242)} ${point(430, 314)} ${point(355, 314)}Z"/></clipPath>
    </defs>
    <rect width="1000" height="620" fill="url(#accord-grid)"/>
    <g class="accord-plan-drawing">
      <path d="M${point(-12, -12)} ${point(546, -12)} ${point(546, 422)} ${point(-12, 422)}Z" fill="#bcbcab" stroke="#183e59"/>
      <path d="M${point(-12, 422)} ${point(546, 422)} ${point(546, 422, -16)} ${point(-12, 422, -16)}Z" fill="#d5cebb" stroke="#183e59"/>
      <path d="M${point(546, -12)} ${point(546, 422)} ${point(546, 422, -16)} ${point(546, -12, -16)}Z" fill="#a4ad9e" stroke="#183e59"/>
      <g transform="matrix(.82 .34 -.82 .34 440 56)">
        <path d="M0 0H534V410H0Z" fill="#e7e1cf"/>
        <path d="M20 16H215V390H20ZM335 16H520V390H335Z" fill="#d5d4bf" stroke="#819384" stroke-width="1.5"/>
        <path d="M78 0V410M136 0V410M0 92H225M0 168H228M0 242H225M0 316H225M389 0V210M441 0V210M335 74H534M335 137H534M335 208H534" fill="none" stroke="#f7f2e5" stroke-width="9"/>
        <path d="M210 -5C292 60 210 141 257 216S339 327 287 418" class="accord-flood-contour" fill="none" stroke="#cc4b32" stroke-width="140"/>
        <path d="M260 -8C326 65 243 140 287 216S365 330 323 420" fill="none" stroke="#183e59" stroke-width="95"/>
        <path d="M260 -8C326 65 243 140 287 216S365 330 323 420" fill="none" stroke="#416779" stroke-width="78"/>
        <path d="M260 -8C326 65 243 140 287 216S365 330 323 420" class="accord-flow" fill="none" stroke="#c5d9d0" stroke-opacity=".7" stroke-width="1.5" stroke-dasharray="18 12"/>
        <path d="M245 -8C311 65 228 140 272 216S350 330 308 420M275 -8C341 65 258 140 302 216S380 330 338 420" class="accord-flow accord-flow-slow" fill="none" stroke="#b7d2c9" stroke-opacity=".5" stroke-width="1" stroke-dasharray="36 18"/>
        <path d="M194 22C257 82 185 146 232 225S303 330 258 404" fill="none" stroke="#173c55" stroke-width="9"/>
        <path d="M194 22C257 82 185 146 232 225S303 330 258 404" fill="none" stroke="#f4ebd8" stroke-width="5"/>
        ${Array.from({ length: 6 }, (_, i) => `<g data-garden="${i}"><rect x="${355 + i % 3 * 49}" y="${335 + Math.floor(i / 3) * 32}" width="40" height="22" rx="2" fill="#8e9c77"/><path d="M${360 + i % 3 * 49} ${340 + Math.floor(i / 3) * 32}h30m-30 6h30m-30 6h30" stroke="#eef0d9" stroke-width="2"/></g>`).join('')}
        <path d="M204 184H341V201H204Z" fill="#eae3d0" stroke="#183e59" stroke-width="3"/>
        <path d="M208 189H337" stroke="#b55137" stroke-width="2" stroke-dasharray="8 4"/>
      </g>
      ${houses.join('')}
      ${block(58, 326, 82, 56, 21, 'accord-civic')}
      ${block(76, 340, 44, 27, 47, 'accord-civic')}
      <g transform="translate(${point(98, 353, 48).replace(',', ' ')})"><path d="M-24 0A24 19 0 0 1 24 0L0 10Z" fill="#607e7a" stroke="#173c55"/><path d="M0-23V-38M0-38l18 5-18 5" fill="#bd4931" stroke="#173c55"/></g>
      ${Array.from({ length: 6 }, (_, i) => `<g data-wall="${i}">${block(193 + (i > 2 ? (i - 2) * 17 : 0), 22 + i * 61, 10, 32, 18, 'accord-wall')}</g>`).join('')}
      <path d="M${point(352, 239, 6)} ${point(434, 239, 6)} ${point(434, 318, 6)} ${point(352, 318, 6)}Z" fill="#ded9c6" stroke="#193e59" stroke-width="3"/>
      <path d="M${point(355, 242)} ${point(430, 242)} ${point(430, 314)} ${point(355, 314)}Z" fill="#9cafaa"/>
      <g clip-path="url(#accord-reservoir-clip)"><rect x="360" y="248" width="300" height="130" fill="#3b687d" data-reservoir/><rect x="360" y="215" width="300" height="190" fill="url(#accord-river-lines)"/></g>
      ${Array.from({ length: 6 }, (_, i) => `<g data-turbine="${i}" transform="translate(${point(319 + (i % 2) * 19, 225 + Math.floor(i / 2) * 32, 5).replace(',', ' ')})"><ellipse rx="12" ry="6" fill="#193e59"/><path d="M0-21V0" stroke="#193e59" stroke-width="2"/><g transform="translate(0 -21)"><circle r="3" fill="#193e59"/><path d="M0-12 0-3M10 6 3 1M-10 6-3 1" stroke="#bd4931" stroke-width="3"/></g></g>`).join('')}
      <g class="accord-map-labels" fill="#173c55">
        <path d="M126 111H45V72M764 230H909V184M583 313H802V350M275 346H140V387" fill="none" stroke="currentColor" stroke-width="1"/>
        <text x="45" y="59">01 / LOW QUAYS</text>
        <text x="757" y="170">02 / UPPER WORKS</text>
        <text x="712" y="374">03 / COMMONS</text>
        <text x="60" y="410">COUNCIL HOUSE</text>
        <text x="788" y="60" class="accord-map-caption">N</text><path d="m795 72-7 28 7-6 7 6Z" fill="none" stroke="currentColor"/>
        <path d="M817 407h120m-120-5v10m60-10v10m60-10v10" stroke="currentColor"/><text x="817" y="438">0</text><text x="891" y="438">200 m</text>
      </g>
    </g>
    <g class="accord-section-drawing">
      <text x="45" y="474" class="accord-section-title">A-A / THE WORKING WATERLINE</text>
      <path d="M42 573H950V604H42Z" fill="url(#accord-hatch)" stroke="#193e59"/>
      <path d="M42 514H284V573H42ZM709 530H950V573H709Z" fill="#dfd7c2" stroke="#193e59"/>
      <path d="M284 554H709V573H284Z" fill="#a8b9b1"/>
      <path d="M285 542Q350 536 420 542T555 542T709 542V573H285Z" fill="#406b7f" data-section-water/>
      <path d="M284 523H709" fill="none" stroke="#be4b31" stroke-width="2" stroke-dasharray="6 6" data-pressure-line/>
      <path d="M274 514V490H291V554H274Z" fill="#183e59" data-section-wall/>
      <path d="M110 514v-24h35v24m8 0v-36h27v36m7 0v-28h40v28M759 530v-22h40v22m10 0v-40h35v40m10 0v-27h53v27" fill="#eee8d8" stroke="#193e59"/>
      <path d="M495 503v50m-8-8 8 8 8-8" fill="none" stroke="#f3eddd" stroke-width="2"/>
      <text x="315" y="506" fill="#be4b31" data-section-label>RIVER / 9</text>
      <text x="727" y="591">CISTERN / PUMP / GRID</text>
      <text x="52" y="591">CITY FABRIC</text>
    </g>
  </svg>`;
}

export function shell(seed: number): string {
  return `
    <header class="accord-masthead">
      <div class="accord-identity"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M4 28 20 5l16 23M11 28l9-13 9 13M3 33h34" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 28h12" stroke="#bc472f" stroke-width="4"/></svg><div><p class="accord-eyebrow">Nacre / a city in common</p><h1 id="accord-title">Accord</h1></div></div>
      <nav aria-label="Campaign tools"><button data-action="rules">Rules</button><button data-action="minutes">Minutes</button><button data-notebook>Save</button><button data-action="new">New</button></nav>
    </header>
    <section class="accord-workbench" data-project-preview aria-label="City and council planning board">
      <div class="accord-board" data-view="city">
        <div class="accord-chart-heading"><div><p class="accord-eyebrow">Municipal survey / <span data-season-chart>01</span></p><strong data-chart-title>The Nacre estuary</strong></div>
          <button class="accord-forecast-button" data-action="forecast" aria-label="Open six-season forecast"><span>River <b data-pressure>9</b> / defence <b data-defence>10</b></span><span class="accord-spark" data-spark aria-hidden="true"></span></button>
        </div>
        <div class="accord-map">${cityDrawing(seed)}
          <div class="accord-view-switch" aria-label="Drawing view"><button data-view-choice="city" aria-pressed="true">City</button><button data-view-choice="section" aria-pressed="false">Section</button></div>
          <span class="accord-flood-tag" data-flood-tag>No flood exposure</span>
        </div>
        <div class="accord-council">
          <span class="accord-council-note">Council / <b data-quorum>2 yes to adopt</b></span>
          <svg class="accord-seating-arc" viewBox="0 0 600 110" preserveAspectRatio="none" aria-hidden="true"><path d="M35 99Q300-64 565 99M35 106Q300-57 565 106" fill="none" stroke="currentColor"/></svg>
          <div class="accord-seats">${DELEGATE_IDS.map(id => `<button class="accord-seat" data-delegate="${id}" aria-label="${DELEGATES[id].name}, ${DELEGATES[id].title}, inspect delegate">
            <span class="accord-seat-seal" aria-hidden="true">${DELEGATES[id].mark}</span><span class="accord-seat-name">${DELEGATES[id].surname}</span><span class="accord-seat-vote" data-vote="${id}">Awaiting</span>
          </button>`).join('')}</div>
        </div>
        <div class="accord-ledger" aria-label="Stored resources and policy forecast">
          ${(['water', 'energy', 'food', 'funds'] as const).map(key => `<div><span>${key === 'funds' ? 'Treasury' : key}</span><strong data-resource="${key}"></strong><span class="accord-reserve-track" aria-hidden="true"><i data-resource-fill="${key}"></i></span></div>`).join('')}
        </div>
      </div>
      <aside class="accord-policy" aria-label="Policy desk">
        <div class="accord-policy-heading"><p class="accord-eyebrow" data-season-label>Six seasons / one mandate</p><h2 data-phase-title>Make room for everyone.</h2><div class="accord-mandate"><span>Fabric <b data-integrity>84</b></span><span>Cohesion <b data-cohesion>62</b></span></div></div>
        <div class="accord-policy-body">
          <section data-stage="setup" class="accord-setup"><p class="accord-intro">The river rises.<br>The city must agree.</p><p>Allocate public works. Negotiate with three independent model delegates. Keep Nacre supplied through six tides.</p>
            <label for="accord-condition">Campaign waters</label><select id="accord-condition" data-condition>${CONDITIONS.map(id => `<option value="${id}" ${id === 'estuary' ? 'selected' : ''}>${SETUPS[id].name}</option>`).join('')}</select><p data-condition-note>${SETUPS.estuary.description}</p>
            <p class="accord-small">Every model vote matters. No model is called until you request a hearing.</p>
          </section>
          <section data-editor hidden>
            <div class="accord-allocation-title"><h3>Selected policy</h3><strong data-allocated>12 / 12 works</strong></div>
            <p class="accord-edit-hint" data-edit-hint>Release a work, then move it to another service.</p>
            <div class="accord-allocation-list">${FIELDS.map((field, i) => `<div class="accord-allocation" data-allocation="${field}">
              <label for="accord-${field}"><span class="accord-sector-number">0${i + 1}</span>${SECTORS[field].name}</label><output for="accord-${field}" data-output="${field}"></output>
              <input id="accord-${field}" type="range" min="0" max="6" step="1" data-field="${field}" aria-label="${SECTORS[field].name} works" title="${SECTORS[field].effect}">
            </div>`).join('')}</div>
          </section>
          <section data-stage="draft" hidden>
            <label class="accord-pledge-label" for="accord-pledge">Offer a next-season pact</label><select id="accord-pledge" data-pledge><option value="none">No future pledge</option>${DELEGATE_IDS.map(id => `<option value="${id}">${DELEGATES[id].surname}: 4 ${SECTORS[DELEGATES[id].field].short.toLowerCase()} next season</option>`).join('')}</select>
            <p class="accord-small" data-pledge-note>Optional: a yes delegate may promise reciprocal support. Broken pacts cost trust.</p>
          </section>
          <section data-stage="ballot" hidden>
            <p class="accord-ballot-summary" data-ballot-summary></p><div class="accord-offers" data-offers></div>
            <p class="accord-small">Votes bind this exact policy. Any amendment clears all three votes.</p>
          </section>
          <section data-stage="resolved" hidden><div data-season-report></div></section>
          <section data-stage="finish" hidden><div data-finish-summary></div></section>
          <p class="accord-pact-note" data-pact-note hidden></p>
        </div>
        <div class="accord-action-dock">
          <p class="accord-turn-budget" data-turn-budget></p>
          <div class="accord-main-actions"><button class="accord-primary" data-primary data-action="primary">Open the council</button><button class="accord-amend" data-action="amend" hidden>Amend</button></div>
          <p class="accord-notice" data-notice role="status" aria-live="polite">Six seasons. Keep fabric above 40 and cohesion above 30 at the finish.</p>
        </div>
      </aside>
    </section>
    <footer class="accord-footer"><div data-agent-host></div><span class="accord-edition">TIDAL COUNCIL / 075</span></footer>`;
}

export function render(root: HTMLElement, state: State, busy: boolean, view: BoardView) {
  root.dataset.phase = state.phase;
  root.dataset.season = String(state.season + 1);
  root.dataset.outcome = state.phase === 'won' || state.phase === 'lost' ? state.phase : '';
  const weather = forecast(state);
  const settled = state.phase === 'resolved' || state.phase === 'won' || state.phase === 'lost';
  const projection = settled ? state.history.at(-1)!.projection : projectPolicy(state);
  const isBallot = state.phase === 'ballot';
  const text = (selector: string, content: string | number) => { query(root, selector).textContent = String(content); };
  for (const section of root.querySelectorAll<HTMLElement>('[data-stage]')) {
    section.hidden = section.dataset.stage === 'finish' ? state.phase !== 'won' && state.phase !== 'lost' : section.dataset.stage !== state.phase;
  }
  query<HTMLElement>(root, '[data-editor]').hidden = state.phase !== 'draft' && !isBallot;
  text('[data-season-label]', state.phase === 'setup' ? 'Six seasons / one mandate' : `Season ${state.season + 1} of 6 / ${weather.name}`);
  text('[data-phase-title]', state.phase === 'setup' ? 'Make room for everyone.' : state.phase === 'draft' ? 'Draw the ordinance.' :
    isBallot ? majority(state) ? 'An accord is possible.' : 'The council is divided.' :
      state.phase === 'resolved' ? 'The tide has passed.' : state.phase === 'won' ? 'Accord secured.' : 'A city, divided.');
  text('[data-integrity]', state.resources.integrity);
  text('[data-cohesion]', state.resources.cohesion);
  text('[data-season-chart]', `0${state.season + 1}`);
  text('[data-chart-title]', `${weather.name} / ${SETUPS[state.condition].name}`);
  text('[data-pressure]', weather.pressure);
  text('[data-defence]', projection.defence);
  text('[data-flood-tag]', projection.flood ? `Flood exposure +${projection.flood}` : 'No flood exposure');
  query<HTMLElement>(root, '[data-flood-tag]').dataset.danger = String(projection.flood > 0);
  const board = query<HTMLElement>(root, '.accord-board');
  board.dataset.view = view;
  board.style.setProperty('--accord-flood', String(Math.min(.5, projection.flood * .08)));
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-view-choice]')) button.setAttribute('aria-pressed', String(button.dataset.viewChoice === view));
  query(root, '[data-city-svg]').setAttribute('viewBox', view === 'city' ? '20 0 950 445' : '20 445 950 175');
  query(root, '[data-spark]').innerHTML = SEASONS.map((season, i) => `<i style="--level:${(season.tide + season.storm + SETUPS[state.condition].pressure) / 16}" data-current="${i === state.season}"></i>`).join('');
  for (const field of FIELDS) {
    const input = query<HTMLInputElement>(root, `[data-field="${field}"]`);
    input.value = String(state.policy[field]);
    input.disabled = busy || state.phase !== 'draft';
    input.style.setProperty('--allocation', `${state.policy[field] / 6 * 100}%`);
    text(`[data-output="${field}"]`, state.policy[field]);
  }
  text('[data-allocated]', `${allocated(state.policy)} / ${WORKS} works`);
  text('[data-edit-hint]', isBallot ? 'Locked to this ballot. Amend to change.' : 'Release a work, then move it to another service.');
  const pledge = query<HTMLSelectElement>(root, '[data-pledge]');
  pledge.value = state.pledge;
  pledge.disabled = busy || state.season === SEASONS.length - 1;
  text('[data-pledge-note]', state.season === SEASONS.length - 1 ? 'The last tide: there is no future season to pledge.' :
    'Optional: a yes delegate may promise reciprocal support. Broken pacts cost trust.');
  const pactNote = query<HTMLElement>(root, '[data-pact-note]');
  pactNote.hidden = !state.pacts.length;
  pactNote.textContent = state.pacts.map(pact => `${pact.due === state.season ? 'Due now' : 'Next season'}: ${DELEGATES[pact.delegate].surname} pact, ${pact.minimum} ${SECTORS[pact.field].short.toLowerCase()} works.`).join(' ');
  for (const key of ['water', 'energy', 'food', 'funds'] as const) {
    const before = settled ? state.history.at(-1)!.before[key] : state.resources[key];
    const after = projection.after[key];
    text(`[data-resource="${key}"]`, `${before} \u2192 ${after}`);
    const item = query<HTMLElement>(root, `[data-resource="${key}"]`);
    item.dataset.danger = String(after < 0 || (key !== 'funds' && projection.shortage[key] > 0));
    item.title = `${key}: ${before} stored, ${after} after ${settled ? 'resolution' : 'this policy'}${!settled && state.phase === 'draft' && key === 'funds' ? ', including the next hearing' : ''}`;
    query<HTMLElement>(root, `[data-resource-fill="${key}"]`).style.width = `${Math.max(0, Math.min(100, after / (key === 'funds' ? 24 : CAPACITY) * 100))}%`;
  }
  for (const id of DELEGATE_IDS) {
    const decision = decisionFor(state, id);
    const seat = query<HTMLElement>(root, `[data-delegate="${id}"]`);
    seat.dataset.vote = decision?.vote ?? 'waiting';
    text(`[data-vote="${id}"]`, decision ? `${decision.vote}${decision.promise === 'reciprocate' ? ' / pact' : ''}` : 'Awaiting');
    seat.title = decision?.statement ?? supportRule(state, id).reason;
  }
  text('[data-quorum]', state.decisions.length ? `${state.decisions.filter(item => item.vote === 'yes').length} yes / 3 votes` : '2 yes to adopt');
  if (isBallot) {
    text('[data-ballot-summary]', majority(state) ? 'Majority secured. Enact this policy, or negotiate an amendment.' : 'No majority. Amend and reconvene, or invoke the emergency charter.');
    query(root, '[data-offers]').innerHTML = state.offers.length ? state.offers.map(offer => `<button class="accord-offer" data-take-offer="${offer.delegate}" ${busy || state.resources.funds < 2 ? 'disabled' : ''}>
      <span>${DELEGATES[offer.delegate].surname} offers <b>${offer.amount} work${offer.amount > 1 ? 's' : ''}</b></span><strong>${SECTORS[offer.from].short} \u2192 ${SECTORS[offer.to].short}</strong><span>Accept &amp; amend</span></button>`).join('') : '<p class="accord-small">No counteroffers on the table. Open a delegate seat to read the public record.</p>';
  }
  if (settled) {
    const report = state.history.at(-1)!;
    const contents = `<p class="accord-resolution-stamp">${report.mode === 'adopted' ? 'Ordinance enacted' : 'Emergency charter enacted'}</p>
      <p>${e(state.phase === 'resolved' ? `${weather.name} is behind you. ${report.projection.flood ? `Flood exposure ${report.projection.flood} damaged the low quays.` : 'The wall held. Every district is still supplied.'}` : state.ending)}</p>
      <dl class="accord-balance-sheet"><div><dt>City fabric</dt><dd>${state.resources.integrity} / 100</dd></div><div><dt>Public cohesion</dt><dd>${state.resources.cohesion} / 100</dd></div><div><dt>Adopted ordinances</dt><dd>${state.history.filter(item => item.mode === 'adopted').length} / ${state.history.length}</dd></div></dl>
      ${report.trustNotes.map(note => `<p class="accord-small">${e(note)}</p>`).join('')}
      <p class="accord-small">Conservation and every public vote are recorded in Minutes. Save exports a replay of accepted moves.</p>`;
    query(root, '[data-season-report]').innerHTML = contents;
    query(root, '[data-finish-summary]').innerHTML = contents + `<div class="accord-season-stamps">${state.history.map(item => `<span title="${e(SEASONS[item.season].name)}: ${item.mode}">${item.season + 1}<b>${item.mode === 'adopted' ? 'A' : 'E'}</b></span>`).join('')}</div>`;
  }
  const primary = query<HTMLButtonElement>(root, '[data-primary]');
  primary.textContent = busy ? 'Council in session...' : state.phase === 'setup' ? 'Open the council' :
    state.phase === 'draft' ? 'Call council \u00b7 2 crowns' : isBallot ? majority(state) ? 'Enact policy' : 'Emergency charter' :
      state.phase === 'resolved' ? 'Next season' : 'Start a new campaign';
  primary.disabled = busy || state.phase === 'draft' && (allocated(state.policy) !== WORKS || state.resources.funds < 2 || state.hearings >= MAX_HEARINGS);
  const amend = query<HTMLButtonElement>(root, '[data-action="amend"]');
  amend.hidden = !isBallot;
  amend.disabled = busy || state.amendments >= MAX_AMENDMENTS || state.hearings >= MAX_HEARINGS || state.resources.funds < 2;
  amend.textContent = `Amend (${MAX_AMENDMENTS - state.amendments})`;
  text('[data-turn-budget]', state.phase === 'setup' ? 'Local setup. You choose when to call a model.' : settled ?
    state.phase === 'resolved' ? 'No model request until the next hearing.' : 'Campaign complete / replay preserved' :
    `Hearings ${state.hearings}/${MAX_HEARINGS} \u00b7 amendments ${state.amendments}/${MAX_AMENDMENTS}`);
  for (const wall of root.querySelectorAll<SVGElement>('[data-wall]')) wall.dataset.active = String(Number(wall.dataset.wall) < state.policy.barrier);
  for (const turbine of root.querySelectorAll<SVGElement>('[data-turbine]')) turbine.dataset.active = String(Number(turbine.dataset.turbine) < state.policy.power);
  for (const garden of root.querySelectorAll<SVGElement>('[data-garden]')) garden.dataset.active = String(Number(garden.dataset.garden) < state.policy.food);
  query(root, '[data-reservoir]').setAttribute('y', String(303 - projection.after.water / CAPACITY * 58));
  const surface = 558 - weather.pressure * 2.6;
  query(root, '[data-section-water]').setAttribute('d', `M285 ${surface}Q350 ${surface - 6} 420 ${surface}T555 ${surface}T709 ${surface}V573H285Z`);
  query(root, '[data-pressure-line]').setAttribute('d', `M240 ${surface}H709`);
  const wallTop = 558 - projection.defence * 2.6;
  query(root, '[data-section-wall]').setAttribute('d', `M274 554V${wallTop}H291V554Z`);
  text('[data-section-label]', `RIVER ${weather.pressure} / DEFENCE ${projection.defence}`);
}

export const RULES = `
  <p class="accord-dialog-lede">Nacre is not yours to command. It is yours to hold together.</p>
  <p><strong>Win:</strong> survive six seasons with at least 40 city fabric and 30 public cohesion. Any unmet water, energy or food demand, a negative treasury, or zero fabric/cohesion ends the campaign. Before the final season, fewer than 2 treasury crowns also ends the campaign: the next hearing cannot be funded.</p>
  <ol><li><strong>Draw.</strong> Place exactly 12 works, 0-6 in each service. Release one allocation before increasing another. Read the river section and the stored \u2192 projected resource strip.</li>
  <li><strong>Negotiate.</strong> Call a model-controlled council. Each successful hearing costs 2 crowns; failure or cancellation costs nothing. Two actual yes votes adopt. Support being legal does not force a yes.</li>
  <li><strong>Amend.</strong> At most 3 hearings and 2 amendments per season. Accepting a counteroffer spends an amendment; every old vote is cleared. Delegates may offer one transfer of 1-2 works each per season, with at most two offers in a hearing. Counteroffers require enough treasury for both this hearing and the follow-up, and cannot be made at the final hearing.</li>
  <li><strong>Enact.</strong> Only your explicit Enact policy action resolves the city. A rejected ballot allows an emergency charter: wall 4, grid 3, water 2, food 3. It costs 3 additional crowns and 14 cohesion instead of the adopted-policy gain of 2. This is an explicit local constitutional rule, never pretend model approval.</li></ol>
  <h3>Conservation ledger</h3><table><thead><tr><th>Service</th><th>Exact seasonal rule</th></tr></thead><tbody>
  <tr><td>River</td><td>Pressure = tide + storm + campaign adjustment. Defence = 4 + 2 \u00d7 wall. Flood = max(0, pressure - defence).</td></tr>
  <tr><td>Water</td><td>Stored + rain + 2 \u00d7 cisterns - 6 consumption - flood contamination.</td></tr>
  <tr><td>Energy</td><td>Stored + 3 \u00d7 turbines - (5 base load + cisterns + ceil(wall / 2) + cold) - flood damage.</td></tr>
  <tr><td>Food</td><td>Stored + 2 \u00d7 gardens - 7 consumption - 2 \u00d7 flood damage.</td></tr>
  <tr><td>Treasury</td><td>Income 7 + floor(turbines / 2); upkeep 6 + 2 \u00d7 flood; subtract hearing and emergency costs. Crowns do not set the 12-work capacity.</td></tr>
  <tr><td>Fabric / cohesion</td><td>Fabric -12 per flood, +2 repair if wall has at least 4 works. Cohesion +2 for an adopted policy or -14 for emergency; -5 per flood; -6 per unit of unmet demand.</td></tr></tbody></table>
  <p>Water, energy and food stores cap at 18; excess is recorded as spill/curtailment. No amount of text can conjure resources or change the published weather. Red forecasts warn of a loss, even if two delegates are willing to approve.</p>
  <h3>Distinct, accountable delegates</h3><p>Vale cannot support any flood exposure. Reed cannot support an energy shortfall or insolvency. Moss cannot support unmet food or water demand. At trust 0-1, a delegate also requires 4 works in their priority service. No and abstain are always legal.</p>
  <p>A next-season pact offers 4 works in a chosen delegate's priority. Only that delegate can reciprocate with a yes vote. Next season, breaking your allocation promise or the delegate withholding otherwise-legal promised support costs 2 trust and 3 cohesion. An honored pact earns 1 trust and 2 cohesion. Hard safety constraints excuse a promised vote; under an unvoted emergency charter only your allocation promise is assessed. Trust is bounded 0-6.</p>
  <h3>A first ordinance</h3><p>The initial 3 wall / 3 grid / 2 water / 4 food is a sound first draft on the working estuary. The tide rises later: check the six-season forecast, build stored food early, and increase the wall before the storm. You do not need unanimity, counteroffers, or pacts to win.</p>
  <h3>Connection, controls, and replay</h3><p>Use Model to configure your own OpenAI-compatible tool model. Each hearing allows one response and one illegal-plan correction, at most 1,536 completion tokens per request. No model calls run on mount, next season, import, or restart. No automatic negotiation loops.</p>
  <p>All controls work with Tab and Enter; allocation sliders use arrow keys. City / Section changes only the drawing and does not cancel a turn. There are no global game shortcuts. New, restart, import, and Cancel invalidate pending responses. Reduced motion removes continuous flow, not live planning feedback.</p>
  <p>Save opens the shared notebook: automatic browser save, export, and atomic replay import. A replay reconstructs and validates every move; it never trusts an imported state or calls a model. Minutes contains the complete conservation record and public commitments only.</p>`;

export function minutes(state: State): string {
  const current = state.decisions.length ? `<h3>Current public ballot</h3>${state.decisions.map(item =>
    `<p><strong>${DELEGATES[item.delegate].name} / ${item.vote}${item.promise === 'reciprocate' ? ' / reciprocal pact' : ''}</strong><br>${e(item.statement)}</p>`).join('')}` : '';
  return `${current}<h3>Ordinance register</h3>${state.history.length ? state.history.map(item => {
    const p = item.projection;
    return `<article class="accord-minute"><h3>${item.season + 1}. ${SEASONS[item.season].name} / ${item.mode}</h3>
      <p>${FIELDS.map(field => `${SECTORS[field].short} ${item.policy[field]}`).join(' / ')}. River ${p.pressure}, defence ${p.defence}, flood ${p.flood}.</p>
      <table><thead><tr><th>Account</th><th>Conservation</th><th>Stored</th></tr></thead><tbody>
      <tr><td>Water</td><td>${item.before.water} + ${p.captured} capture - 6 use - ${p.flood} flood</td><td>${p.after.water} (${p.spill.water} spill)</td></tr>
      <tr><td>Energy</td><td>${item.before.energy} + ${p.generation} generation - ${p.load} load - ${p.flood} flood</td><td>${p.after.energy} (${p.spill.energy} curtailed)</td></tr>
      <tr><td>Food</td><td>${item.before.food} + ${p.harvest} harvest - 7 use - ${p.flood * 2} flood</td><td>${p.after.food} (${p.spill.food} surplus)</td></tr>
      <tr><td>Treasury</td><td>${item.before.funds} after hearings + ${p.income} income - ${p.expense} expenses</td><td>${p.after.funds}</td></tr></tbody></table>
      <p>Fabric ${p.after.integrity}; cohesion ${p.after.cohesion}. Unmet demand: water ${p.shortage.water}, energy ${p.shortage.energy}, food ${p.shortage.food}.</p>
      ${item.votes.map(vote => `<p><strong>${DELEGATES[vote.delegate].surname}: ${vote.vote}${vote.promise === 'reciprocate' ? ', public pact' : ''}.</strong> ${e(vote.statement)}</p>`).join('')}
      ${item.trustNotes.map(note => `<p>${e(note)}</p>`).join('')}</article>`;
  }).join('') : '<p>No season has been enacted yet. A successful hearing records votes, not a simulated season.</p>'}`;
}
