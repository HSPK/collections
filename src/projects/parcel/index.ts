import './style.css';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { LEVELS } from './data';
import {
  bagCount,
  compileLevel,
  coordinates,
  createSession,
  deliveredCount,
  getPhase,
  remainingMoves,
  solve,
  takeTurn,
  undoTurn,
} from './engine';
import type { Direction, GameSession, GameState, Level, MoveResult, ParcelDefinition } from './engine';

const DIRECTION_LABELS: Record<Direction, string> = { up: 'up', right: 'right', down: 'down', left: 'left' };
const DIRECTION_GLYPHS: Record<Direction, string> = { up: '↑', right: '→', down: '↓', left: '←' };
const ROTATIONS: Record<Direction, number> = { up: -90, right: 0, down: 90, left: 180 };
const INK = '#203e3c';
const TILE_SIZE = 72;
const MAP_INSET = 32;

const icon = (content: string, className = '') =>
  `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
const ENVELOPE = icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7M3 18l6-6m12 6-6-6"/>');
const UNDO = icon('<path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12" transform="translate(0 -2)"/>');
const RESET = icon('<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>');
const HINT = icon('<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 .8-1 1.5-1 2H9c0-.5 0-1.2-1-2Z"/>');
const CHECK = icon('<path d="m5 12 4 4L19 6"/>');

function directionIcon(direction: Direction): string {
  return icon(`<path d="M4 12h16m-7-7 7 7-7 7" transform="rotate(${ROTATIONS[direction]} 12 12)"/>`);
}

function shapeMarkup(parcel: ParcelDefinition): string {
  const shapes = {
    circle: '<circle cx="20" cy="20" r="18"/>',
    square: '<rect x="3" y="3" width="34" height="34" rx="5"/>',
    triangle: '<path d="M20 1 39 37H1Z" stroke-linejoin="round"/>',
    diamond: '<path d="m20 1 19 19-19 19L1 20Z" stroke-linejoin="round"/>',
  };
  const pointed = parcel.shape === 'triangle' || parcel.shape === 'diamond';
  return `<g fill="${parcel.color}" stroke="${INK}" stroke-width="1.5">${shapes[parcel.shape]}</g>
    <text x="20" y="${parcel.shape === 'triangle' ? 33 : pointed ? 28 : 29}" text-anchor="middle" fill="${INK}" font-size="${pointed ? 24 : 27}" font-weight="800" font-family="Arial, sans-serif">${escapeMarkup(parcel.id)}</text>`;
}

function parcelBadge(parcel: ParcelDefinition): string {
  return `<svg class="parcel-letter" viewBox="0 0 40 40" aria-hidden="true">${shapeMarkup(parcel)}</svg>`;
}

function packageArt(parcel: ParcelDefinition): string {
  return `<g stroke="${INK}" stroke-width="1.8" stroke-linejoin="round">
    <path d="m8 19 28-11 28 11-28 12Z" fill="#f8d28d"/>
    <path d="M8 19v33l28 12V31Z" fill="#caa46c"/>
    <path d="M36 31v33l28-12V19Z" fill="#e8bd79"/>
    <path d="m24 13 27 12v12l-9 4V29L15 17" fill="#fbf3dc"/>
    </g><svg x="19" y="27" width="38" height="38" viewBox="0 0 40 40">${shapeMarkup(parcel)}</svg>`;
}

function addressArt(parcel: ParcelDefinition, delivered: boolean): string {
  return `<g stroke="${INK}" stroke-width="1.8" stroke-linejoin="round">
    <path d="M12 28h48v35H12Z" fill="#fffaf0"/>
    <path d="M7 29 36 9l29 20Z" fill="${parcel.color}"/>
    <path d="M10 29h52v9H10Z" fill="${parcel.color}"/>
    <path d="M20 29v9m11-9v9m11-9v9m11-9v9" opacity=".35"/>
    </g><svg x="17" y="29" width="38" height="38" viewBox="0 0 40 40">${shapeMarkup(parcel)}</svg>
    ${delivered ? `<circle cx="60" cy="14" r="11" fill="#203e3c"/><path d="m55 14 3 3 6-7" fill="none" stroke="#fffaf0" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>` : ''}`;
}

function wallArt(level: Level, index: number): string {
  if (level.definition.scenery === 'canal') {
    return `<rect x="4" y="4" width="64" height="64" rx="8" fill="#b9d3cf" stroke="#8caea7"/>
      <path d="M12 23q6-5 12 0t12 0t12 0t12 0M12 38q6-5 12 0t12 0t12 0t12 0M12 53q6-5 12 0t12 0t12 0t12 0" fill="none" stroke="#7fa9a1" stroke-width="2"/>`;
  }
  if (level.definition.scenery === 'town' && index % 3 !== 0) {
    return `<rect x="4" y="4" width="64" height="64" rx="8" fill="#d0d8c0" stroke="#a9b69a"/>
      <path d="M18 32h37v26H18Z" fill="#abb998" stroke="#80916c" stroke-width="1.5"/>
      <path d="m13 33 23-18 24 18Z" fill="#bec9ad" stroke="#80916c" stroke-width="1.5"/>
      <path d="M25 39h7v8h-7Zm16 0h7v8h-7Z" fill="#dce1cf"/>
      <path d="M7 62h57" stroke="#80916c" stroke-width="2"/>`;
  }
  return `<rect x="4" y="4" width="64" height="64" rx="9" fill="#ccd9bc" stroke="#a5b793"/>
    <g fill="#aabf94" stroke="#7e986e" stroke-width="1.3">
    <circle cx="27" cy="30" r="15"/><circle cx="46" cy="32" r="14"/><circle cx="34" cy="43" r="15"/>
    </g><path d="M12 58h48m-40-6v11m15-11v11m15-11v11" fill="none" stroke="#80916c" stroke-width="2"/>`;
}

function vanArt(direction: Direction): string {
  return `<g transform="translate(36 38) rotate(${ROTATIONS[direction]}) scale(.82)">
    <rect x="-21" y="-25" width="13" height="9" rx="3" fill="${INK}"/>
    <rect x="12" y="-25" width="12" height="9" rx="3" fill="${INK}"/>
    <rect x="-21" y="16" width="13" height="9" rx="3" fill="${INK}"/>
    <rect x="12" y="16" width="12" height="9" rx="3" fill="${INK}"/>
    <path d="M-28-14q0-6 6-6h39q12 0 14 11v18q-2 11-14 11h-39q-6 0-6-6Z" fill="#ec7355" stroke="${INK}" stroke-width="2.5"/>
    <path d="M15-13h9q3 2 3 7V6q0 5-3 7h-9Z" fill="#cce5df" stroke="${INK}" stroke-width="2"/>
    <rect x="-22" y="-13" width="29" height="26" rx="3" fill="#fff4d7" stroke="${INK}" stroke-width="1.5"/>
    <path d="m-19-7 11 8L4-7m-23 15 7-6M4 8l-7-6" fill="none" stroke="${INK}" stroke-width="1.8"/>
    <path d="M31-11v6m0 10v6" stroke="#fff4d7" stroke-width="3"/>
    </g>`;
}

function drawMap(level: Level, state: GameState, id = 'parcel-map'): string {
  const width = MAP_INSET + level.width * TILE_SIZE + 8;
  const height = MAP_INSET + level.height * TILE_SIZE + 8;
  const at = coordinates(level, state.position);
  const streetDescription = Array.from({ length: level.height }, (_, row) => {
    const cells = Array.from({ length: level.width }, (_, column) => {
      const position = row * level.width + column;
      const tile = level.tiles[position];
      if (tile.kind === 'wall') return 'blocked';
      const waiting = level.parcels.find((_, index) => state.parcelLocations[index] === position);
      const address = level.parcels.find((parcel) => parcel.destination === position);
      const landmark = waiting ? `parcel ${waiting.id}` : address ? `address ${address.id}`
        : position === level.start ? 'post office' : tile.exit ? `exit ${tile.exit}` : 'street';
      return position === state.position ? `van at ${landmark}` : landmark;
    });
    return `Row ${row + 1}, left to right: ${cells.join(', ')}.`;
  }).join(' ');
  const parts = [
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title ${id}-desc">
      <title id="${id}-title">${escapeMarkup(level.definition.title)} street map</title>
      <desc id="${id}-desc">${level.height} rows and ${level.width} columns. Your mail van is at row ${at.row}, column ${at.column}. Cubes are pickups; matching lettered shops are destinations. Unlettered green blocks or water cannot be crossed. Street arrows restrict the direction of exit. ${escapeMarkup(streetDescription)}</desc>`,
  ];
  for (let x = 0; x < level.width; x += 1) {
    parts.push(`<text class="parcel-coordinate" x="${MAP_INSET + x * TILE_SIZE + 36}" y="24" text-anchor="middle" font-size="26">${x + 1}</text>`);
  }
  for (let y = 0; y < level.height; y += 1) {
    parts.push(`<text class="parcel-coordinate" x="15" y="${MAP_INSET + y * TILE_SIZE + 45}" text-anchor="middle" font-size="26">${y + 1}</text>`);
  }
  level.tiles.forEach((tile, index) => {
    const x = index % level.width;
    const y = Math.floor(index / level.width);
    parts.push(`<g transform="translate(${MAP_INSET + x * TILE_SIZE} ${MAP_INSET + y * TILE_SIZE})">`);
    if (tile.kind === 'wall') {
      parts.push(wallArt(level, index));
    } else {
      parts.push('<rect x=".5" y=".5" width="71" height="71" fill="#f7edcf" stroke="#e0d4b5"/>');
      const roads: string[] = [];
      if (y > 0 && level.tiles[index - level.width].kind === 'street') roads.push('M36 2v10');
      if (x < level.width - 1 && level.tiles[index + 1].kind === 'street') roads.push('M60 36h10');
      if (y < level.height - 1 && level.tiles[index + level.width].kind === 'street') roads.push('M36 60v10');
      if (x > 0 && level.tiles[index - 1].kind === 'street') roads.push('M2 36h10');
      parts.push(`<path d="${roads.join(' ')}" stroke="#cabf9f" stroke-width="2" stroke-linecap="round"/>`);
      if (index === level.start) {
        parts.push(`<rect x="9" y="13" width="54" height="46" rx="5" fill="#eee4c9" stroke="${INK}" stroke-width="1.5" stroke-dasharray="4 4"/>
          <path d="M21 24h30v24H21Zm0 1 15 12 15-12" fill="#fffcf0" stroke="${INK}" stroke-width="2"/>`);
      }
      if (tile.exit) {
        parts.push(`<path d="M17 36h36m-14-14 14 14-14 14" transform="rotate(${ROTATIONS[tile.exit]} 36 36)" fill="none" stroke="#346c65" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`);
      }
      level.parcels.forEach((parcel, parcelIndex) => {
        if (parcel.destination === index) parts.push(addressArt(parcel, state.parcelLocations[parcelIndex] === 'delivered'));
        if (state.parcelLocations[parcelIndex] === index) parts.push(packageArt(parcel));
      });
      if (state.position === index) {
        parts.push(`<rect x="3" y="3" width="66" height="66" rx="9" fill="none" stroke="${INK}" stroke-width="2.5" stroke-dasharray="5 3"/>`);
        const waiting = level.parcels.find((_, parcelIndex) => state.parcelLocations[parcelIndex] === index);
        const destination = level.parcels.find((parcel) => parcel.destination === index);
        if (waiting || destination) {
          parts.push(`<g transform="translate(-8 10) scale(.82)">${vanArt(state.facing)}</g>`);
          parts.push(`<svg x="35" y="1" width="37" height="37" viewBox="0 0 40 40">${shapeMarkup((waiting ?? destination)!)}</svg>`);
        } else {
          parts.push(vanArt(state.facing));
        }
      }
    }
    parts.push('</g>');
  });
  parts.push('</svg>');
  return parts.join('');
}

function moveMessage(level: Level, result: MoveResult): string {
  if (!result.moved) {
    const blockedMessages = {
      wall: 'No road there! Blocks and water are off limits. No move spent.',
      edge: 'That is the edge of this district. Turn back toward a street. No move spent.',
      'one-way': `One-way street: leave this tile ${DIRECTION_LABELS[level.tiles[result.state.position].exit ?? 'right']}. No move spent.`,
      complete: 'This round is delivered. Undo to revisit your last move, replay, or choose another route.',
      budget: 'No moves left. Undo a turn or restart this round to continue.',
    };
    return blockedMessages[result.blocked!];
  }
  const messages = result.events.map((event) => {
    if (event.type === 'pickup') return `Parcel ${event.parcelId} is on board.`;
    if (event.type === 'delivery') return `Parcel ${event.parcelId} delivered!`;
    return `Bag full: ${event.parcelId} stays on this street. Deliver a parcel, then return for it.`;
  });
  const phase = getPhase(level, result.state);
  if (phase === 'complete') return `${messages.join(' ')} Round complete in ${result.state.steps} moves!`;
  if (phase === 'exhausted') return `${messages.join(' ')} No moves left. Undo or restart to finish the deliveries.`;
  const at = coordinates(level, result.state.position);
  const position = messages.length ? '' : `Van at row ${at.row}, column ${at.column}. `;
  return `${messages.join(' ')} ${position}${remainingMoves(level, result.state)} moves left.`.trim();
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'parcel');
  const { root, signal, report, onCleanup } = page;
  root.dataset.workspace = 'true';
  const levels = LEVELS.map(compileLevel);
  const sessions = new Map(levels.map((level) => [level.definition.id, createSession(level)]));
  let selected = 0;
  let hintDirection: Direction | null = null;

  root.innerHTML = `
    <div class="parcel-site">
      <div class="parcel-workspace-heading"><h1>Parcel <em>Panic!</em></h1><button type="button" class="parcel-button" data-guide>Field guide</button></div>
      <header class="parcel-masthead">
        <div class="parcel-brand">
          <p class="parcel-eyebrow">${ENVELOPE} THE LITTLE POST OFFICE <span>NO. 022</span></p>
          <h2>Parcel <em>Panic<span>!</span></em></h2>
          <p class="parcel-lede">Small streets. Big deliveries. Plot a clever route and get every parcel home.</p>
        </div>
        <div class="parcel-postmark" aria-hidden="true">
          <span>SPECIAL DELIVERY</span><svg viewBox="0 0 72 72">${vanArt('right')}</svg><strong>TAKE THE SCENIC ROUTE?</strong><span>BETTER CHECK YOUR MOVES.</span>
        </div>
      </header>

      <section class="parcel-routebar" aria-label="Choose a delivery route">
        <label class="parcel-route-picker" for="parcel-level">
          <span class="parcel-eyebrow">YOUR DELIVERY ROUND</span>
          <select id="parcel-level" data-level>
            ${levels.map((level, index) => `<option value="${index}">${String(index + 1).padStart(2, '0')} · ${escapeMarkup(level.definition.title)}</option>`).join('')}
          </select>
        </label>
        <button type="button" class="parcel-button" data-routes>Routes</button>
        <div class="parcel-progress">
          <p><strong data-progress>0 of 5</strong> stamped <span>this visit</span></p>
          <div class="parcel-route-stamps" aria-label="Route progress">
            ${levels.map((level, index) => `<button type="button" data-route="${index}" aria-label="Route ${index + 1}: ${escapeMarkup(level.definition.title)}">
              <span>${String(index + 1).padStart(2, '0')}</span><span class="parcel-stamp-check">${CHECK}</span>
            </button>`).join('')}
          </div>
        </div>
      </section>

      <div class="parcel-workbench">
        <section class="parcel-map-sheet" data-project-preview aria-labelledby="parcel-route-title">
          <header class="parcel-map-heading">
            <div><p class="parcel-eyebrow" data-district></p><h2 id="parcel-route-title" data-title></h2></div>
            <button type="button" class="parcel-button" data-enlarge aria-label="Enlarge route map">Map +</button>
            <span class="parcel-round-number" data-round aria-hidden="true"></span>
          </header>
          <div class="parcel-play-area">
            <div class="parcel-board-area">
              <div class="parcel-map-surround">
                <div class="parcel-map" data-map tabindex="0" role="group" aria-describedby="parcel-keyboard parcel-capacity-rule"></div>
              </div>
              <div class="parcel-map-bottom">
                <p class="parcel-position" data-position></p>
                <span class="parcel-map-scale" data-board-load></span>
              </div>
              <div class="parcel-map-legend" aria-label="Map key">
                <span><svg viewBox="0 0 72 72" aria-hidden="true">${packageArt(LEVELS[0].parcels[0])}</svg>Pick up</span>
                <span><svg viewBox="0 0 72 72" aria-hidden="true">${addressArt(LEVELS[0].parcels[0], false)}</svg>Deliver</span>
                <span>${ENVELOPE}Post office</span>
                <span><i class="parcel-block-key" aria-hidden="true"></i>No road</span>
                <span data-arrow-key hidden>${directionIcon('right')}One-way exit</span>
              </div>
            </div>

            <div class="parcel-control-panel">
              <div class="parcel-dashboard">
                <div><span>Delivered</span><strong data-delivered></strong></div>
                <div><span>Moves used</span><strong data-moves></strong></div>
                <div class="parcel-remaining"><span>Moves left</span><strong data-remaining></strong></div>
              </div>
              <div class="parcel-driving">
                <div class="parcel-dpad" role="group" aria-label="Drive the mail van">
                  <button type="button" data-direction="up" aria-label="Drive up">${directionIcon('up')}</button>
                  <button type="button" data-direction="left" aria-label="Drive left">${directionIcon('left')}</button>
                  <span class="parcel-dpad-center" aria-hidden="true">${ENVELOPE}</span>
                  <button type="button" data-direction="right" aria-label="Drive right">${directionIcon('right')}</button>
                  <button type="button" data-direction="down" aria-label="Drive down">${directionIcon('down')}</button>
                </div>
                <div class="parcel-driving-copy">
                  <p id="parcel-keyboard">Tap a direction, or focus the map for <strong>arrow keys</strong>. <kbd>Z</kbd> undoes.</p>
                </div>
              </div>
              <div class="parcel-actions">
                <button type="button" class="parcel-button" data-action="undo" data-undo>${UNDO}<span>Undo</span></button>
                <button type="button" class="parcel-button" data-action="restart">${RESET}<span>Restart</span></button>
                <button type="button" class="parcel-button" data-action="hint" data-hint-button>${HINT}<span>Route hint</span></button>
              </div>
              <button type="button" class="parcel-button" data-details>Mailbag & manifest</button>
            </div>
            <p class="parcel-feedback" data-feedback role="status" aria-live="polite" aria-atomic="true"></p>
          </div>

          <section class="parcel-result" data-result hidden aria-labelledby="parcel-result-title">
            <div class="parcel-result-mark" data-result-mark aria-hidden="true">${CHECK}</div>
            <div><p class="parcel-eyebrow" data-result-label></p><h3 id="parcel-result-title" data-result-title></h3><p data-result-copy></p>
              <div class="parcel-result-actions">
                <button type="button" class="parcel-button" data-action="undo">Undo last move</button>
                <button type="button" class="parcel-button parcel-button-primary" data-action="next" data-next>Next route ${directionIcon('right')}</button>
                <button type="button" class="parcel-button" data-action="restart">Replay this route</button>
              </div>
            </div>
          </section>
        </section>

        <aside class="parcel-desk" aria-label="Delivery details and instructions">
          <p class="parcel-briefing" data-briefing></p>
          <section class="parcel-dispatch" aria-labelledby="parcel-slip-title">
            <header class="parcel-slip-header"><div><p class="parcel-eyebrow">LITTLE POST · DISPATCH SLIP</p><h2 id="parcel-slip-title">On your round</h2></div>${ENVELOPE}</header>
            <div class="parcel-bag-heading"><h3>In the mailbag</h3><span data-bag-count></span></div>
            <div class="parcel-bag" data-bag></div>
            <p class="parcel-capacity-note" id="parcel-capacity-rule" data-capacity></p>
            <div class="parcel-manifest-heading"><h3>Delivery manifest</h3><span>TO / STATUS</span></div>
            <ul class="parcel-deliveries" data-deliveries></ul>
            <p class="parcel-slip-footer">Match the <strong>letter + shape</strong>, not just the color. Address coordinates never move.</p>
          </section>

          <section class="parcel-field-guide" aria-labelledby="parcel-guide-title">
            <p class="parcel-eyebrow">A NOTE FROM DISPATCH</p>
            <h2 id="parcel-guide-title">A first-class plan.</h2>
            <p class="parcel-no-rush">No timer. A good route takes a little thought.</p>
            <ol>
              <li><span>01</span><p><strong>Pick up by driving over.</strong> Parcels board automatically when your bag has room.</p></li>
              <li><span>02</span><p><strong>Deliver to the same letter.</strong> Drive onto its shop with the parcel on board. Delivery is automatic.</p></li>
              <li><span>03</span><p><strong>Stay within your moves.</strong> Every successful step costs one. Walls, edges, and wrong-way attempts are free.</p></li>
            </ol>
            <div class="parcel-route-tip"><span>${HINT} THIS ROUTE'S FIELD NOTE</span><p data-tip></p></div>
          </section>
          <p class="parcel-margin-note">Wrong turn? No problem.<br><span>Undo remembers everything.</span></p>
        </aside>
      </div>
      <footer class="parcel-footer"><span>${ENVELOPE} THANK YOU FOR CHOOSING THE LITTLE POST.</span><p>Five handmade routes. No rush, no accounts.<br>Progress stays while this page is open; replaying clears that route’s stamp.</p></footer>
    </div>`;

  const map = query<HTMLDivElement>(root, '[data-map]');
  const selector = query<HTMLSelectElement>(root, '[data-level]');
  const feedback = query<HTMLParagraphElement>(root, '[data-feedback]');
  const resultPanel = query<HTMLElement>(root, '[data-result]');
  const nextButton = query<HTMLButtonElement>(root, '[data-next]');
  const directionButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-direction]'));
  const routeButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-route]'));
  const mapDetail = document.createElement('div');
  mapDetail.className = 'parcel-map parcel-map-detail';
  createWorkspaceDialog(page, {
    id: 'parcel-map-detail', title: 'Route map in detail', content: [mapDetail],
    triggers: [query(root, '[data-enlarge]')],
  });
  const dispatchDialog = createWorkspaceDialog(page, {
    id: 'parcel-dispatch', title: 'Dispatch and mailbag',
    content: [query(root, '.parcel-briefing'), query(root, '.parcel-dispatch')],
    triggers: [query(root, '[data-details]')],
  });
  const routesDialog = createWorkspaceDialog(page, {
    id: 'parcel-routes', title: 'Route stamps this visit', content: [query(root, '.parcel-progress')],
    triggers: [query(root, '[data-routes]')],
  });
  createWorkspaceDialog(page, {
    id: 'parcel-guide', title: 'The field guide',
    content: [query(root, '.parcel-masthead'), query(root, '.parcel-map-legend'), query(root, '.parcel-driving-copy'),
      query(root, '.parcel-field-guide'), query(root, '.parcel-margin-note'), query(root, '.parcel-footer')],
    triggers: [query(root, '[data-guide]')],
  });
  query(root, '.parcel-desk').remove();
  const status = document.createElement('p');
  status.className = 'parcel-status';
  status.setAttribute('role', 'status');
  const statusRow = document.createElement('div');
  statusRow.className = 'parcel-status-row';
  const feedbackButton = document.createElement('button');
  feedbackButton.type = 'button';
  feedbackButton.className = 'parcel-button';
  feedbackButton.textContent = 'Turn details';
  statusRow.append(status, feedbackButton);
  query(root, '.parcel-map-sheet').append(statusRow);
  const feedbackDialog = createWorkspaceDialog(page, {
    id: 'parcel-feedback', title: 'Dispatch feedback', content: [feedback], triggers: [feedbackButton],
  });
  const resultDialog = createWorkspaceDialog(page, {
    id: 'parcel-result-dialog', title: 'Round result', content: [resultPanel],
  });
  resultDialog.dialog.addEventListener('close', () => map.focus({ preventScroll: true }), { signal });
  function sizeMapLabels() {
    for (const text of root.querySelectorAll<SVGTextElement>('.parcel-map text')) {
      const transform = text.getScreenCTM();
      if (!transform) continue;
      const scale = Math.hypot(transform.a, transform.b);
      if (scale > 0) text.style.fontSize = `${Math.max(Number(text.getAttribute('font-size')), 14 / scale)}px`;
    }
  }
  const mapResize = new ResizeObserver(sizeMapLabels);
  mapResize.observe(map);
  mapResize.observe(mapDetail);
  onCleanup(() => mapResize.disconnect());
  const session = (): GameSession => sessions.get(levels[selected].definition.id)!;
  const completeCount = () => levels.filter((level) =>
    getPhase(level, sessions.get(level.definition.id)!.current) === 'complete').length;
  const nextRoute = () => {
    for (let offset = 1; offset < levels.length; offset += 1) {
      const index = (selected + offset) % levels.length;
      if (getPhase(levels[index], sessions.get(levels[index].definition.id)!.current) !== 'complete') return index;
    }
    return -1;
  };
  const setText = (selectorText: string, text: string) => {
    query<HTMLElement>(root, selectorText).textContent = text;
  };
  const say = (message: string, tone = 'neutral') => {
    feedback.textContent = message;
    feedback.dataset.tone = tone;
    const summary = message.split('. ')[0];
    status.textContent = summary.length > 44 ? `${summary.slice(0, 41)}…` : summary;
    status.dataset.tone = tone;
    if (tone === 'warning' || tone === 'hint') {
      if (!resultDialog.dialog.open) feedbackDialog.open();
    }
  };

  function render(): void {
    const level = levels[selected];
    const { current, history } = session();
    const phase = getPhase(level, current);
    const delivered = deliveredCount(current);
    const remaining = remainingMoves(level, current);
    const load = bagCount(current);
    const at = coordinates(level, current.position);
    const completed = completeCount();
    root.dataset.phase = phase;
    root.dataset.level = level.definition.id;
    setText('[data-district]', `ROUTE ${String(selected + 1).padStart(2, '0')} · ${level.definition.district.toUpperCase()}`);
    setText('[data-title]', level.definition.title);
    setText('[data-round]', String(selected + 1).padStart(2, '0'));
    setText('[data-briefing]', level.definition.briefing);
    setText('[data-tip]', level.definition.tip);
    setText('[data-delivered]', `${delivered} / ${level.parcels.length}`);
    setText('[data-moves]', `${current.steps} / ${level.definition.moveBudget}`);
    setText('[data-remaining]', String(remaining));
    query<HTMLElement>(root, '.parcel-remaining').dataset.low = String(remaining <= 4 && phase !== 'complete');
    setText('[data-position]', `YOU · row ${at.row}, column ${at.column}`);
    setText('[data-board-load]', `Bag: ${load} / ${level.definition.capacity}`);
    setText('[data-bag-count]', `${load} / ${level.definition.capacity} slots`);
    setText('[data-capacity]', `Capacity: ${level.definition.capacity} parcel${level.definition.capacity === 1 ? '' : 's'}. Full bag? You can still cross a parcel, but it stays put. Return with a free slot.`);
    setText('[data-progress]', `${completed} of ${levels.length}`);
    map.innerHTML = drawMap(level, current);
    mapDetail.innerHTML = drawMap(level, current, 'parcel-map-detail-art');
    sizeMapLabels();
    map.setAttribute('aria-label', `${level.definition.title} route map. Van at row ${at.row}, column ${at.column}. ${remaining} moves left. Focus here to use arrow keys.`);
    query<HTMLElement>(root, '[data-arrow-key]').hidden = !level.tiles.some((tile) => tile.exit);
    query<HTMLButtonElement>(root, '[data-undo]').disabled = history.length === 0;
    query<HTMLButtonElement>(root, '[data-hint-button]').disabled = phase !== 'playing';
    directionButtons.forEach((button) => {
      const direction = button.dataset.direction as Direction;
      button.disabled = phase !== 'playing';
      button.dataset.suggested = String(direction === hintDirection);
      button.setAttribute('aria-label', `Drive ${direction}${direction === hintDirection ? ', suggested next move' : ''}`);
    });

    const onBoard = level.parcels.filter((_, index) => current.parcelLocations[index] === 'bag');
    query<HTMLElement>(root, '[data-bag]').innerHTML = Array.from({ length: level.definition.capacity }, (_, index) => {
      const parcel = onBoard[index];
      return parcel
        ? `<div class="parcel-bag-slot is-filled">${parcelBadge(parcel)}<span><strong>Parcel ${escapeMarkup(parcel.id)}</strong><small>${escapeMarkup(parcel.name)}</small></span></div>`
        : `<div class="parcel-bag-slot">${ENVELOPE}<span>Empty slot</span></div>`;
    }).join('');
    query<HTMLElement>(root, '[data-deliveries]').innerHTML = level.parcels.map((parcel, index) => {
      const location = current.parcelLocations[index];
      const destination = coordinates(level, parcel.destination);
      const pickup = typeof location === 'number' ? coordinates(level, location) : null;
      const status = location === 'delivered' ? 'Delivered ✓' : location === 'bag' ? 'On board' : `Pickup · r${pickup!.row}, c${pickup!.column}`;
      return `<li class="${location === 'delivered' ? 'is-delivered' : ''}">${parcelBadge(parcel)}
        <div><strong>${escapeMarkup(parcel.name)}</strong><span>Address ${escapeMarkup(parcel.id)} · row ${destination.row}, col ${destination.column}</span><small>${status}</small></div></li>`;
    }).join('');
    routeButtons.forEach((button, index) => {
      const route = levels[index];
      const routeSession = sessions.get(route.definition.id)!;
      const isComplete = getPhase(route, routeSession.current) === 'complete';
      const status = isComplete ? 'complete' : routeSession.current.steps ? 'in progress' : 'not started';
      button.classList.toggle('is-complete', isComplete);
      button.setAttribute('aria-pressed', String(index === selected));
      button.setAttribute('aria-label', `Route ${index + 1}: ${route.definition.title}, ${status}`);
      selector.options[index].textContent = `${String(index + 1).padStart(2, '0')} · ${route.definition.title}${isComplete ? ' ✓' : ''}`;
    });
    selector.value = String(selected);

    resultPanel.hidden = phase === 'playing';
    if (phase !== 'playing') {
      const won = phase === 'complete';
      resultPanel.dataset.result = phase;
      query<HTMLElement>(root, '[data-result-mark]').innerHTML = won ? CHECK : ENVELOPE;
      setText('[data-result-label]', won ? 'DELIVERY CONFIRMED' : 'A LITTLE REROUTING REQUIRED');
      setText('[data-result-title]', won ? completed === levels.length ? 'All five, first class!' : 'Signed, sealed, delivered.' : 'The meter says zero.');
      setText('[data-result-copy]', won
        ? `${level.parcels.length} parcel${level.parcels.length === 1 ? '' : 's'} delivered in ${current.steps} moves, with ${remaining} to spare. ${completed === levels.length ? 'Every route is stamped. Pick a favorite to replay.' : `${completed} of ${levels.length} routes stamped. Your next round is waiting.`}`
        : `${delivered} of ${level.parcels.length} delivered. Undo to recover moves and rethink a turn, or start this round afresh. There is no timer.`);
      nextButton.hidden = !won || nextRoute() === -1;
      const next = nextRoute();
      if (won && next !== -1) nextButton.innerHTML = `Next: ${escapeMarkup(levels[next].definition.title)} ${directionIcon('right')}`;
      feedbackDialog.close();
      resultDialog.open();
    } else {
      resultDialog.close();
    }
  }

  function drive(direction: Direction): void {
    const level = levels[selected];
    const result = takeTurn(level, session(), direction);
    sessions.set(level.definition.id, result.session);
    hintDirection = null;
    render();
    const phase = getPhase(level, result.session.current);
    say(moveMessage(level, result.move), !result.move.moved || phase === 'exhausted' ? 'warning' : phase === 'complete' ? 'success' : 'neutral');
  }

  function chooseLevel(index: number, focusMap: boolean): void {
    if (!Number.isInteger(index) || index < 0 || index >= levels.length) return;
    selected = index;
    routesDialog.close();
    dispatchDialog.close();
    feedbackDialog.close();
    hintDirection = null;
    render();
    const level = levels[selected];
    const { current } = session();
    const phase = getPhase(level, current);
    say(phase === 'complete' ? 'This route is stamped! Replay to take another round, or undo to revisit the finish.'
      : phase === 'exhausted' ? 'This route is out of moves. Undo or restart to plan a fresh approach.'
        : current.steps ? `Round resumed exactly where you left it. ${remainingMoves(level, current)} moves left.`
          : `${level.definition.capacity} bag slot${level.definition.capacity === 1 ? '' : 's'}, ${level.definition.moveBudget} moves. Plan a little, then make your first delivery.`);
    if (focusMap && !resultDialog.dialog.open) map.focus({ preventScroll: true });
  }

  function action(name: string): void {
    const level = levels[selected];
    if (name === 'undo' || name === 'restart') feedbackDialog.close();
    if (name === 'next') {
      const next = nextRoute();
      if (next !== -1) chooseLevel(next, true);
    } else if (name === 'restart') {
      sessions.set(level.definition.id, createSession(level));
      hintDirection = null;
      render();
      say(`A fresh ${level.definition.title} round. All parcels are back, the bag is empty, and all ${level.definition.moveBudget} moves are restored.`);
    } else if (name === 'undo') {
      const previous = session();
      const restored = undoTurn(previous);
      sessions.set(level.definition.id, restored);
      hintDirection = null;
      render();
      const at = coordinates(level, restored.current.position);
      say(restored === previous ? 'No moves to undo yet.' : `Last move undone. Van, bag, parcels, and deliveries restored. Row ${at.row}, column ${at.column}; ${remainingMoves(level, restored.current)} moves left.`);
    } else if (name === 'hint') {
      const answer = solve(level, session().current);
      if (answer.status === 'solved' && answer.moves.length) {
        hintDirection = answer.moves[0];
        render();
        say(`Verified hint: go ${DIRECTION_LABELS[hintDirection]} ${DIRECTION_GLYPHS[hintDirection]}. From here, all deliveries fit in ${answer.moves.length} more moves. The marked arrow is just a suggestion; you do the driving.`, 'hint');
      } else if (answer.status === 'unsolvable') {
        say(`No complete route fits in your ${remainingMoves(level, session().current)} remaining moves from here. Undo a turn or restart; the hint has not moved anything.`, 'warning');
      } else if (answer.status === 'limit') {
        const message = 'The hint search reached its limit, so no route is being guessed. You can still plan, undo, or restart.';
        say(message, 'warning');
        report(message);
      }
    }
  }

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || !root.contains(button) || button.disabled) return;
    if (button.dataset.direction) drive(button.dataset.direction as Direction);
    else if (button.dataset.route !== undefined) chooseLevel(Number(button.dataset.route), true);
    else if (button.dataset.action) action(button.dataset.action);
  }, { signal });
  selector.addEventListener('change', () => chooseLevel(Number(selector.value), false), { signal });
  map.addEventListener('pointerdown', () => map.focus({ preventScroll: true }), { signal });
  root.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (!(target instanceof Element) ||
        target.closest('dialog, button, select, input, textarea, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
    const keys: Record<string, Direction> = { ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left' };
    const direction = keys[event.key];
    if (!direction && event.key.toLowerCase() !== 'z') return;
    event.preventDefault();
    if (event.repeat) return;
    if (direction) drive(direction);
    else action('undo');
  }, { signal });
  onCleanup(() => {
    sessions.clear();
    hintDirection = null;
  });

  chooseLevel(0, false);
  return { destroy: page.destroy };
}
