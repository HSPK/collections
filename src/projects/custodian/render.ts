import { escapeMarkup } from '../../core/page';
import { CAMPAIGN, CARGO, PACKAGING, PACKINGS, REGULATIONS, TRAVELLERS, cargoById } from './data';
import type { Cargo, CargoId } from './data';
import { acceptedBond, measurements, totalScore, won } from './engine';
import type { Case, State } from './engine';

export const PANES = ['dossier', 'evidence', 'parley', 'audit'] as const;
export type Pane = typeof PANES[number];
const e = escapeMarkup;

function glyph(shape: Cargo['shape'], x: number, y: number): string {
  const paths: Record<Cargo['shape'], string> = {
    leaves: '<path d="M-26 22Q-43-26 0-34Q7 6-26 22M3 25Q-1-18 35-18Q39 17 3 25M-24 24L-1-12M5 27L24-5"/>',
    keys: '<path d="M-38-25H38V25H-38ZM-26-25V25M-13-25V25M0-25V25M13-25V25M26-25V25"/><path d="M-21-25V4M-7-25V4M19-25V4" stroke-width="7"/>',
    sun: '<circle r="19"/><path d="M0-35V-26M0 26V35M-35 0H-26M26 0H35M-25-25L-19-19M19 19L25 25M-25 25L-19 19M19-19L25-25"/>',
    moths: '<path d="M0 18Q-55 12-30-26Q-8-24 0 5Q8-24 30-26Q55 12 0 18M0-9V30M-7-21L0-9L7-21"/><circle cx="-22" cy="-4" r="7"/><circle cx="22" cy="-4" r="7"/>',
    seeds: '<ellipse cx="-15" cy="-12" rx="10" ry="16" transform="rotate(-30)"/><ellipse cx="19" cy="5" rx="10" ry="16" transform="rotate(30)"/><ellipse cx="-12" cy="20" rx="10" ry="16" transform="rotate(60)"/>',
    wave: '<path d="M-36 18Q-15-8 1 10Q18 25 32 6M-37-2Q-7-39 19-17Q31-3 13 2Q22-12 7-12Q-2-13-8 2M-35 32H35"/>',
    pearls: '<circle cx="-22" cy="-12" r="12"/><circle cx="10" cy="-22" r="10"/><circle cx="26" cy="8" r="13"/><circle cx="-7" cy="22" r="14"/><path d="M-26-18L-20-22M21 4L27-1M-13 18L-6 13"/>',
    tree: '<path d="M0 30V-31M0 13L-26-7L-17-28L0-14L20-29L31-7L0 13M-20 32H20M0-14L-26-7M0-14L31-7"/>',
    crystal: '<path d="M0-36L29-10L20 27L-12 35L-31 1ZM0-36L5 0L-12 35M5 0L29-10M5 0L20 27M5 0L-31 1"/>',
    clock: '<circle r="30"/><path d="M0-23V0L17 10M-9-38H9M-9 38H9M-38-9V9M38-9V9"/><path d="M-23-19L22 20M-21 22L20-22" stroke-dasharray="3 5"/>',
  };
  return `<g transform="translate(${x} ${y})" fill="none" stroke="#bdffdd" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${paths[shape]}</g>`;
}

function portrait(number: number): string {
  const color = TRAVELLERS[number - 1].color;
  const heads = [
    '<path d="M-42-25Q-57-92 0-99Q57-92 42-25L26-49L-17-38L-37-47Z" fill="#41443a"/><path d="M-47-51L45-78" stroke="#dcc1a0" stroke-width="7"/>',
    '<path d="M-61 25Q-80-115 0-123Q80-115 61 25L33 5Q58-90 0-92Q-58-90-33 5Z" fill="#576c52"/><path d="M-51-51Q0-80 51-51" fill="none" stroke="#dbd1ad" stroke-width="3"/>',
    '<path d="M-55-68L-36-104L44-96L58-61Z" fill="#284d52"/><path d="M-66-61L64-61L37-46L-42-46Z" fill="#d0a566"/><path d="M-28-19H28" stroke="#e4c991" stroke-width="3"/><circle cx="-17" cy="-20" r="16" fill="none" stroke="#253d3a" stroke-width="5"/><circle cx="18" cy="-20" r="16" fill="none" stroke="#253d3a" stroke-width="5"/>',
    '<path d="M-47-8Q-72-65-31-71Q-47-120 2-96Q43-118 38-77Q79-62 47-10L30-59L0-43L-31-61Z" fill="#b59657"/><path d="M-30-40L5 31L32-34" fill="none" stroke="#f4e0ad" stroke-width="2"/>',
    '<path d="M-41-57L0-107L42-57Z" fill="#555969"/><path d="M-31-40H32V9H-31Z" fill="#9ba4a6" stroke="#273a3c" stroke-width="3"/><path d="M-22-22H-8M9-22H23" stroke="#e8dfb9" stroke-width="3"/>',
    '<path d="M-51-55Q-58-100 0-101Q61-97 49-51L34-65L-25-56Z" fill="#694943"/><path d="M-57-61L57-74L60-51L-54-37Z" fill="#ad6d4e"/><path d="M-18-83L18-89" stroke="#ecdbb9" stroke-width="3"/>',
  ];
  return `<g transform="translate(362 170)">
    <path d="M-130 153Q-118 45-47 41L0 60L47 41Q118 45 130 153Z" fill="${color}" stroke="#294d49" stroke-width="3"/>
    <path d="M-22 21V52L0 77L22 52V21" fill="#c7ac83"/><path d="M-45-50Q-52 31 0 39Q52 31 45-50Q0-100-45-50Z" fill="#d4bb93" stroke="#536056" stroke-width="2"/>
    ${heads[number - 1]}
    <path d="M-24-19H-16M17-19H25M0-15L-5 3H3M-12 17Q0 23 13 16" fill="none" stroke="#3c4840" stroke-width="3" stroke-linecap="round"/>
    <path d="M-48 49L-24 97L0 78L24 97L48 49M0 79V148" fill="none" stroke="#f0dfb8" stroke-width="2"/>
    <circle cx="61" cy="99" r="14" fill="#d7bc86"/><path d="M54 99H68M61 92V106" stroke="#536f63" stroke-width="2"/>
  </g>`;
}

export function deskMarkup(state: State): string {
  const active = state.active;
  const scanned = Boolean(active?.inspected.includes('scan'));
  const seal = active?.inspected.includes('seal');
  const number = active?.number ?? 0;
  const cargo = scanned && active ? active.plan.cargo : [];
  const latest = state.phase === 'review' || state.phase === 'finished' ? state.audits.at(-1) : null;
  return `<svg viewBox="0 0 720 470" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${active ? 'A merchant waits behind wired glass. A sealed parcel lies on the scanner.' : 'An empty customs desk, wired glass, unopened forms and a dormant scanner.'}">
    <defs>
      <linearGradient id="cu-glass" x2="1" y2="1"><stop stop-color="#82aaa0"/><stop offset=".55" stop-color="#365e59"/><stop offset="1" stop-color="#b2bda1"/></linearGradient>
      <linearGradient id="cu-desk" x2="0" y2="1"><stop stop-color="#a59572"/><stop offset="1" stop-color="#6c755f"/></linearGradient>
      <linearGradient id="cu-wrapper" x2="1" y2="1"><stop stop-color="#d9c498"/><stop offset="1" stop-color="#a58c64"/></linearGradient>
      <radialGradient id="cu-light"><stop stop-color="#ceffdc" stop-opacity=".28"/><stop offset="1" stop-color="#ceffdc" stop-opacity="0"/></radialGradient>
      <pattern id="cu-wire" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0H46V46" fill="none" stroke="#d0d4b2" stroke-opacity=".13"/></pattern>
      <pattern id="cu-grain" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 3H2M5 6H7" stroke="#fce8bf" stroke-opacity=".11"/></pattern>
      <clipPath id="cu-window"><rect x="119" y="17" width="486" height="280" rx="80"/></clipPath>
      <clipPath id="cu-scan-clip"><rect data-cu-scan-clip x="262" y="310" width="0" height="118"/></clipPath>
    </defs>
    <rect width="720" height="470" fill="#355650"/>
    <path d="M0 0H90V302H0M630 0H720V302H630" fill="#405e55"/>
    <rect x="105" y="2" width="514" height="307" rx="93" fill="#233f3c" stroke="#c2b088" stroke-width="3"/>
    <g clip-path="url(#cu-window)">
      <rect x="118" y="16" width="487" height="282" fill="url(#cu-glass)"/>
      <path d="M180 300V154L221 112L261 153V300M443 300V116L491 76L538 116V300" fill="#2e5550" opacity=".4"/>
      <path d="M132 16L265 16L465 298H393ZM482 16L507 16L605 153V204Z" fill="#f7ecd0" opacity=".12"/>
      ${active ? portrait(number) : '<circle cx="362" cy="131" r="64" fill="none" stroke="#d5d9b8" stroke-opacity=".35"/><path d="M334 135L355 155L393 105" fill="none" stroke="#d5d9b8" stroke-width="3" stroke-opacity=".4"/><text x="362" y="230" fill="#e4e2be" text-anchor="middle" font-size="15" letter-spacing="5">GATE BETWEEN WORLDS</text>'}
      <rect x="118" y="16" width="487" height="282" fill="url(#cu-wire)"/>
    </g>
    <rect x="13" y="32" width="67" height="82" rx="3" fill="#233f3c" stroke="#968c69"/>
    <text x="47" y="53" fill="#c4b88f" text-anchor="middle" font-size="10" letter-spacing="2">PORT</text>
    <text x="47" y="88" fill="#e6d4aa" text-anchor="middle" font-family="Georgia,serif" font-size="34">73</text>
    <g fill="#b49d74"><circle cx="39" cy="144" r="4"/><circle cx="53" cy="144" r="4"/><circle cx="67" cy="144" r="4"/></g>
    <path d="M659 53V200M678 53V200M649 77H688M649 93H688M649 109H688M649 125H688M649 141H688M649 157H688M649 173H688" stroke="#9bab8d" opacity=".45"/>
    <path d="M0 289H720V470H0Z" fill="url(#cu-desk)"/><path d="M0 295H720" stroke="#dac69c" stroke-width="5"/>
    <rect y="298" width="720" height="172" fill="url(#cu-grain)"/>
    <ellipse cx="371" cy="376" rx="220" ry="112" fill="url(#cu-light)"/>
    <path d="M226 331L469 312L531 420L262 447Z" fill="#203f3b" stroke="#c4ae82" stroke-width="3"/>
    <path d="M245 340L457 323L508 411L275 432Z" fill="#548d7d" stroke="#a9d6b0"/>
    <path d="M267 354L452 338M273 368L461 353M283 383L473 372M293 400L484 390M304 415L494 405" stroke="#acdcc0" stroke-opacity=".3"/>
    <g ${!active ? 'opacity=".45"' : ''}>
      <path d="M284 332L402 308L467 336L345 365Z" fill="#e0cba3" stroke="#786e50" stroke-width="2"/>
      <path d="M284 332L345 365V415L284 380Z" fill="#a28c64" stroke="#786e50" stroke-width="2"/>
      <path d="M345 365L467 336V389L345 415Z" fill="url(#cu-wrapper)" stroke="#786e50" stroke-width="2"/>
      <path d="M322 324L385 353V405M284 354L345 388L467 360" fill="none" stroke="#f2e3bd" stroke-width="5"/>
      <circle cx="385" cy="375" r="13" fill="${seal ? '#5c8771' : '#ac5140'}" stroke="#ead5aa" stroke-width="2"/>
      <path d="M380 375H390M385 370V380" stroke="#edd5ac" stroke-width="2"/>
    </g>
    ${scanned ? `<g clip-path="url(#cu-scan-clip)">
      <rect x="262" y="310" width="225" height="118" fill="#164f43" opacity=".96"/>
      ${cargo.map((id, i) => glyph(cargoById(id).shape, cargo.length === 1 ? 372 : 322 + i * 103, 367)).join('')}
      <path d="M269 319H480V419H269Z" fill="none" stroke="#baffce" stroke-dasharray="3 5"/>
    </g><path data-cu-scan-line d="M262 310V428" stroke="#deffe7" stroke-width="3"/>` : ''}
    ${seal && active ? `<g transform="translate(528 336)"><path d="M14 17L38 49" stroke="#263e35" stroke-width="11" stroke-linecap="round"/><circle r="29" fill="#bacdad" stroke="#e1d0a3" stroke-width="6"/><circle r="21" fill="none" stroke="#557f6c" stroke-width="${active.plan.packing === 'stasis' ? '5' : '2'}"/><text y="8" text-anchor="middle" fill="#294d41" font-family="Georgia,serif" font-size="25">${active.plan.packing === 'paper' ? 'P' : active.plan.packing === 'cradle' ? 'C' : 'S'}</text></g>` : ''}
    <path d="M23 448H175M545 448H696" stroke="#d3bc8e" stroke-width="2" opacity=".4"/>
    <text x="694" y="284" text-anchor="end" fill="#d9c69c" font-size="11" letter-spacing="2">NOTHING LEAVES UNRECORDED</text>
  </svg>
  <button class="cu-paper cu-docket" type="button" data-pane="dossier" aria-label="Inspect declaration">
    <span class="cu-kicker">FORM 73 / ${number ? String(number).padStart(2, '0') : 'UNFILED'}</span>
    <strong>${active ? 'Declaration' : 'Your first shift'}</strong>
    <span class="cu-paper-lines" aria-hidden="true"></span><span class="cu-paper-seal">${active ? 'UNVERIFIED' : 'READ FIRST'}</span>
  </button>
  <button class="cu-paper cu-regulations" type="button" data-action="rules" aria-label="Open port regulations">
    <span class="cu-kicker">PORT AUTHORITY</span><strong>Crossing<br>regulations</strong><span>Edition ${number >= 5 ? 'III' : number >= 3 ? 'II' : 'I'}</span>
  </button>
  <button class="cu-parcel-hit" type="button" data-pane="evidence" aria-label="Inspect parcel and recorded evidence">Inspect parcel</button>
  ${latest ? `<div class="cu-result-stamp ${latest.correct ? 'is-correct' : ''}">${latest.correct ? 'CLEARED BY AUDIT' : 'CITED BY AUDIT'}</div>` : ''}`;
}

export function updateScan(root: HTMLElement, state: State, progress: number): void {
  const width = 225 * progress / 100;
  root.querySelector('[data-cu-scan-clip]')?.setAttribute('width', String(width));
  root.querySelector('[data-cu-scan-line]')?.setAttribute('transform', `translate(${width} 0)`);
  const readout = root.querySelector<HTMLElement>('[data-cu-scan-readout]');
  if (readout && state.active?.inspected.includes('scan')) {
    const count = progress < 35 ? 0 : progress < 75 ? 1 : 2;
    const found = state.active.plan.cargo.slice(0, count);
    readout.textContent = found.length ? `Authenticated spectrum: ${found.map(id => cargoById(id).name).join(' + ')}${count < state.active.plan.cargo.length ? ' | sweep farther right' : ' | scan complete'}` : 'Move the glass sweep right to resolve the cargo signatures.';
  }
}

function emptyFile(): string {
  return `<div class="cu-document-heading"><span class="cu-kicker">OFFICER'S COPY / 73</span><h2>A desk at the edge<br>of the possible.</h2></div>
    <p>The evening shift is six travellers long. Outside the wired glass, someone is carrying an hour that does not belong to them.</p>
    <p>Read what they claim. Measure what they brought. Decide what may cross.</p>
    <div class="cu-note"><strong>No merchant has been generated.</strong> Configure your model, then call the first traveller. There is no offline substitute and no request on page load.</div>
    <h3>The short procedure</h3><ol><li>Call a traveller. The model chooses real hidden cargo.</li><li>Inspect papers, weigh, take a thermal reading, check licences or scan. Compare against the catalogue.</li><li>Negotiate once, if useful. Then stamp Admit, Quarantine or Return.</li></ol>
    <p class="cu-small">Five correct rulings and remaining public trust earn a permanent commission. A perfect shift is not required.</p>
    <button type="button" data-action="help">Read the officer's guide</button>`;
}

export function dossierMarkup(state: State): string {
  const active = state.active;
  if (!active) return emptyFile();
  const traveller = TRAVELLERS[active.number - 1];
  const declaration = active.plan.declaration;
  return `<div class="cu-document-heading"><span class="cu-kicker">ENTRY DECLARATION / ${String(active.number).padStart(2, '0')}</span>
    <h2>${e(traveller.name)}</h2><p>${e(traveller.title)}<br>Arriving from ${e(traveller.origin)}</p></div>
    <span class="cu-tag">Merchant claims / not measurements</span>
    <dl class="cu-facts"><div><dt>Declared contents</dt><dd>${e(declaration.contents)}</dd></div><div><dt>Declared gross mass</dt><dd>${declaration.mass} kg</dd></div><div><dt>Declared temperature</dt><dd>${declaration.temperature}&deg;C</dd></div><div><dt>Licence claimed</dt><dd>${e(declaration.licence)}</dd></div></dl>
    <blockquote>${e(declaration.testimony)}</blockquote><p class="cu-small">Signed by ${e(traveller.name)}. A signature certifies authorship, not truth.</p>
    <div class="cu-note"><strong>Officer's reminder</strong> Return takes priority over quarantine. Lying alone is not a cargo offence: rule on the physical consignment and official registry.</div>
    <h3>Published sourcing docket</h3><p>${traveller.cargo.map(id => cargoById(id).name).join(', ')}. One or two different goods; one outer container.</p>
    <button type="button" data-action="rules">Compare with the cargo catalogue</button>`;
}

function possibleConsignments(active: Case): string[] {
  const known = active.inspected;
  if (!known.includes('weigh') && !known.includes('thermal') && !known.includes('scan') && !active.certified.length) return [];
  const facts = measurements(active);
  const traveller = TRAVELLERS[active.number - 1];
  const sets: CargoId[][] = [];
  traveller.cargo.forEach((id, i) => {
    sets.push([id]);
    traveller.cargo.slice(i + 1).forEach(second => sets.push([id, second]));
  });
  return sets.filter(ids => {
    if (ids.reduce((sum, id) => sum + cargoById(id).value, 0) < traveller.minimumValue) return false;
    if (active.certified.some(id => !ids.includes(id))) return false;
    if (known.includes('scan') && (ids.length !== active.plan.cargo.length || !ids.every(id => active.plan.cargo.includes(id)))) return false;
    const temperatures = ids.map(id => cargoById(id).temperature);
    if (known.includes('thermal') && (Math.min(...temperatures) !== facts.cold || Math.max(...temperatures) !== facts.hot)) return false;
    return PACKINGS.some(packing => {
      if (PACKAGING[packing].price > traveller.wallet) return false;
      if (known.includes('seal') && packing !== facts.packing) return false;
      return !known.includes('weigh') || ids.reduce((sum, id) => sum + cargoById(id).mass, PACKAGING[packing].mass) === facts.mass;
    });
  }).map(ids => ids.map(id => cargoById(id).name).join(' + '));
}

export function evidenceMarkup(state: State): string {
  const active = state.active;
  if (!active) return `<h2>No parcel on record</h2><p>The glass is dark until a model-backed consignment arrives. Use the five instruments below the desk to create authoritative records.</p><div class="cu-note">A scan costs one charge and two minutes. Other readings cost one minute. Opening documents is free.</div>`;
  const facts = measurements(active);
  const has = (channel: Case['inspected'][number]) => active.inspected.includes(channel);
  const candidates = possibleConsignments(active);
  const compare = (same: boolean) => `<span class="cu-comparison ${same ? '' : 'is-mismatch'}">${same ? 'Matches declaration' : 'Declaration conflicts'}</span>`;
  return `<div class="cu-document-heading"><span class="cu-kicker">INSTRUMENT RECORD / ${active.number}</span><h2>What the parcel says.</h2></div>
    <p class="cu-small">Only locally computed measurements appear here. Empty fields are unknown, not evidence of safety.</p>
    <dl class="cu-facts">
      <div><dt>Scale / gross mass</dt><dd data-evidence-mass>${has('weigh') ? `${facts.mass} kg ${compare(facts.mass === active.plan.declaration.mass)}` : 'Not weighed'}</dd></div>
      <div><dt>Thermal envelope</dt><dd data-evidence-thermal>${has('thermal') ? `${facts.cold} to ${facts.hot}&deg;C ${compare(facts.cold === active.plan.declaration.temperature && facts.hot === active.plan.declaration.temperature)}` : 'Not measured'}</dd></div>
      <div><dt>Official licence registry</dt><dd data-evidence-licence>${has('registry') ? `${facts.licence} ${compare(facts.licence === active.plan.declaration.licence)}` : 'Not queried'}</dd></div>
      <div><dt>Container microseal</dt><dd data-evidence-seal>${has('seal') ? `${PACKAGING[facts.packing].name} / ${PACKAGING[facts.packing].mass} kg tare<br><span class="cu-small">${PACKAGING[facts.packing].seal}. Seal verified; packing never alters measured temperature.</span>` : 'Not magnified'}</dd></div>
      <div><dt>Spectral scan</dt><dd>${has('scan') ? `${active.plan.cargo.length} authenticated signature${active.plan.cargo.length > 1 ? 's' : ''}. Use the luminous sweep on the desk.` : 'No scan recorded'}</dd></div>
      <div><dt>Paid certification</dt><dd data-evidence-certified>${active.certified.length ? active.certified.map(id => cargoById(id).name).join(' + ') : 'None. A merchant can sell a truthful partial disclosure.'}</dd></div>
    </dl>
    <h3>Evidence comparison</h3>${candidates.length ? `<p>${candidates.length} candidate consignment${candidates.length > 1 ? 's' : ''} fit the recorded evidence and public sourcing docket:</p><ul>${candidates.map(name => `<li>${name}</li>`).join('')}</ul><p class="cu-small">This compares identities only, not admissibility. Check the registry, containment and current directives.</p>` : '<p>Weigh, take a thermal reading, scan, or buy certification to narrow the catalogue. An unverified declaration is never used to eliminate candidates.</p>'}
    <button type="button" data-action="rules">Open regulations &amp; catalogue</button>`;
}

export function parleyMarkup(state: State, busy: boolean): string {
  const active = state.active;
  if (!active) return '<h2>A price for certainty.</h2><p>Once a traveller arrives, ask for a quarantine bond or a certified disclosure. The model may offer terms or refuse. No one speaks for an absent merchant.</p>';
  const bargain = active.bargain;
  if (!bargain) return `<div class="cu-document-heading"><span class="cu-kicker">ONE NEGOTIATION / ONE MINUTE</span><h2>Everything has a price.<br>Even candour.</h2></div>
    <p>The merchant decides whether to deal and how much to offer. You decide whether to accept. No time is spent until a valid model response arrives.</p>
    <div class="cu-offer"><h3>Request a quarantine bond</h3><p>The merchant may pay 2-4 credits from their remaining wallet. Accepting binds your next stamp to Quarantine; the bond offsets its 2-credit fee. It does not legalise prohibited cargo.</p><button type="button" data-question="bond" ${busy || state.phase !== 'inspection' || state.minutes < 1 ? 'disabled' : ''}>Request bond</button></div>
    <div class="cu-offer"><h3>Purchase certified disclosure</h3><p>The merchant may price one or two real cargo identities at 1-3 credits. You see how many before buying, not which ones. Certification is truthful; spoken testimony may not be.</p><button type="button" data-question="disclosure" ${busy || state.phase !== 'inspection' || state.minutes < 1 ? 'disabled' : ''}>Request disclosure</button></div>`;
  const plan = bargain.plan;
  return `<div class="cu-document-heading"><span class="cu-kicker">RECORDED NEGOTIATION</span><h2>${bargain.question === 'bond' ? 'A bond for safe passage.' : 'The price of a name.'}</h2></div>
    <span class="cu-tag">Spoken testimony / unverified</span><blockquote>${e(plan.testimony)}</blockquote>
    ${plan.response === 'refuse' ? '<div class="cu-note"><strong>Offer refused.</strong> The interview used one minute. No credits changed hands. Use physical evidence and make your ruling.</div>' :
      `<div class="cu-offer"><h3>${bargain.question === 'bond' ? `Merchant offers ${plan.amount} credits` : `${plan.disclosed.length} certified identit${plan.disclosed.length === 1 ? 'y' : 'ies'} for ${plan.amount} credits`}</h3>
      <p>${bargain.question === 'bond' ? 'Accept to bind Quarantine. Payment occurs only when you stamp. An incorrect quarantine still costs public trust.' : 'Accept to pay and reveal the listed identities. This is a partial disclosure unless both cargo slots are certified.'}</p>
      ${bargain.resolved === 'pending' && state.phase === 'inspection' ? `<div class="cu-inline"><button type="button" data-settle="yes" ${busy || (bargain.question === 'disclosure' && state.credits < plan.amount) ? 'disabled' : ''}>Accept ${bargain.question === 'bond' ? 'bond' : 'disclosure'}</button><button type="button" data-settle="no" ${busy ? 'disabled' : ''}>Decline offer</button></div>` : `<strong>${bargain.resolved === 'pending' ? 'Offer lapsed when the parcel was stamped.' : `Offer ${bargain.resolved}.`}</strong>`}</div>`}
    ${active.certified.length ? `<h3>Certified identities</h3><p>${active.certified.map(id => cargoById(id).name).join(' + ')}</p>` : ''}
    ${acceptedBond(active) ? '<div class="cu-note">Bond accepted. Only the Quarantine stamp is available.</div>' : ''}`;
}

export function auditMarkup(state: State): string {
  const good = state.audits.filter(item => item.correct).length;
  return `${state.phase === 'finished' ? `<div class="cu-ending"><span class="cu-kicker">SHIFT CLOSED / ${won(state) ? 'COMMISSION GRANTED' : 'COMMISSION WITHHELD'}</span><h2>${won(state) ? 'The worlds may sleep.' : 'The gate remembers.'}</h2><p>${won(state) ? 'You kept an impossible border without making every stranger an enemy. A brass nameplate is waiting for tomorrow.' : 'Your temporary commission ends here. The review board returns your stamps with a request: learn what the papers cannot tell you.'}</p><strong data-ending>${won(state) ? 'Victory' : 'Shift lost'} / ${good} of 6 correct / ${totalScore(state)} points</strong><p>${state.trust} public trust, ${state.credits} credits and ${state.minutes} minutes remain. Pass requires at least five correct rulings and trust above zero.</p><button type="button" data-action="restart">Begin a new shift</button></div>` :
    `<div class="cu-document-heading"><span class="cu-kicker">INDEPENDENT PORT AUDIT</span><h2>The permanent record.</h2><p>${good} correct / ${state.audits.length} filed</p></div>`}
    ${state.audits.length ? [...state.audits].reverse().map(audit => `<article class="cu-audit ${audit.correct ? 'is-correct' : ''}"><div class="cu-kicker">${audit.number} / ${e(TRAVELLERS[audit.number - 1].name)} / ${audit.delta > 0 ? '+' : ''}${audit.delta} POINTS</div><h3>${audit.verdict.toUpperCase()} &mdash; ${audit.correct ? 'correct ruling' : `required ${audit.required.toUpperCase()}`}</h3><p>Actual cargo: ${audit.cargo.map(id => cargoById(id).name).join(' + ')}. ${PACKAGING[audit.packing].name}.</p><ul>${audit.reasons.map(reason => `<li>${e(reason)}</li>`).join('')}</ul><p class="cu-small">Merchant utility: ${audit.merchantUtility}. ${audit.bond ? `Bond paid: ${audit.bond} credits.` : 'No bond paid.'} This audit is computed locally.</p></article>`).join('') : '<p>Every stamp creates a permanent local audit: actual cargo, applicable rules, your ruling and the merchant\'s objective score. No model decides the result.</p>'}`;
}

export function paneMarkup(pane: Pane, state: State, busy: boolean): string {
  return pane === 'dossier' ? dossierMarkup(state) : pane === 'evidence' ? evidenceMarkup(state) :
    pane === 'parley' ? parleyMarkup(state, busy) : auditMarkup(state);
}

export function rulesMarkup(state: State): string {
  const number = state.active?.number ?? state.audits.length + 1;
  return `<p class="cu-note"><strong>Priority: Return &gt; Quarantine &gt; Admit.</strong> Prohibited or unlicensed cargo is returned. Otherwise unsafe containment means quarantine. Everything else must be admitted. A false claim alone is not a reason to refuse entry.</p>
    <p>Regulations in force for traveller ${Math.min(number, 6)} are marked ACTIVE. New directives arrive at travellers 3 and 5.</p>
    <div class="cu-rule-list">${REGULATIONS.map(rule => `<article class="${rule.from <= number ? 'is-active' : ''}"><span class="cu-kicker">REG ${rule.id} / ${rule.from <= number ? 'ACTIVE' : `FROM TRAVELLER ${rule.from}`}</span><h3>${rule.title}</h3><p>${rule.body}</p></article>`).join('')}</div>
    <h3>Packaging reference</h3><p>Gross mass is cargo mass plus container tare. Stasis makes hot or cold goods safe, but does not change a thermometer reading.</p>
    <table><thead><tr><th>Container</th><th>Tare</th><th>Merchant cost</th></tr></thead><tbody>${PACKINGS.map(packing => `<tr><td>${PACKAGING[packing].name}</td><td>${PACKAGING[packing].mass} kg</td><td>${PACKAGING[packing].price} cr</td></tr>`).join('')}</tbody></table>
    <h3>Fictional cargo catalogue</h3><p>A consignment contains one or two different goods, each in one unit. Thermal readings show the coldest and hottest goods, not an average.</p>
    <div class="cu-catalogue">${CARGO.map(cargo => `<article><h3>${cargo.name}</h3><p class="cu-catalogue-values">${cargo.mass} kg / ${cargo.temperature}&deg;C / ${cargo.licence === 'none' ? 'no licence' : `${cargo.licence} licence`}</p><p>${cargo.note}</p></article>`).join('')}</div>`;
}

export const HELP = `<p class="cu-note"><strong>You are the officer. The model is the merchant.</strong> Nothing is requested on mount. Configure Model, then explicitly call a traveller. An unavailable or invalid model never creates substitute cargo.</p>
  <h3>Read, measure, compare, stamp</h3><p>Click the loose declaration or regulations on the desk. The File button opens a larger dossier; on small screens it is the primary document reader. All documents and the catalogue are free to read.</p>
  <p>Scale measures gross mass. Thermal measures the temperature range. Registry checks the real licence. Seal uses a magnifier to verify packaging. Scan authenticates hidden cargo IDs; sweep the glass using the slider, arrow keys, or Full sweep. Readings are recorded once per case, never rerolled.</p>
  <p>Use the Evidence comparison to narrow the merchant's published sourcing docket. It never treats a claim as a fact. You can solve many cases without a scanner.</p>
  <h3>A finite shift</h3><p>You start with ${CAMPAIGN.minutes} minutes, ${CAMPAIGN.credits} credits and ${CAMPAIGN.scans} scanner charges. Scale, thermal, registry and seal cost one minute each; scan costs two minutes and one charge. Refill costs four credits and one minute. Stamping and calling are free, so running out of time never traps the desk.</p>
  <p>Quarantine costs two credits. A merchant bond offsets the fee, but binds your ruling. A paid disclosure buys real identity evidence. Each merchant will negotiate only once: one explicit model turn, which can refuse, set a price, or offer a bond. Failed and cancelled plans spend nothing.</p>
  <h3>The review board</h3><p>Each correct ruling earns 20 points; each error loses 12. A wrong admission loses 3 trust, a wrong return loses 2, and a wrong quarantine loses 1. The shift always lasts six travellers. Win with at least five correct rulings and trust above zero. Remaining minutes and credits add to the final score.</p>
  <h3>Keyboard &amp; records</h3><p>W: weigh. T: thermal. L: licence registry. M: microseal. X: scan. D: dossier. R: regulations. Stamps have no single-key shortcuts. Shortcuts pause inside dialogs and form fields. Every desk target is also a labelled button.</p>
  <p>Notebook automatically saves validated moves. Export or import a replay without calling a model. Replays include the chosen hidden cargo for deterministic reconstruction, so they are not an anti-cheat format. They never contain connection credentials. Restart cancels a pending turn and clears this shift.</p>
  <p class="cu-small">Every model decision is bounded to one request plus at most one correction. A cancelled provider request may still incur provider charges. Only fictional game observations are sent.</p>`;
