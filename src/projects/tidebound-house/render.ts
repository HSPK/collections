import { escapeMarkup } from '../../core/markup';
import { GUEST_IDS, GUESTS, SCENE_IDS, SCENES } from './data';
import type { GuestId, ItemId, SceneId } from './data';
import { hasQuest, tide, unlocked, watch } from './engine';
import type { State } from './engine';

export function portrait(id: GuestId, full = false): string {
  const guest = GUESTS[id];
  const details: Record<GuestId, string> = {
    shen: '<path d="M21 30Q20 7 39 8Q60 8 59 31L50 20 39 24 28 19Z" fill="#dddac8"/><g fill="none" stroke="#e8d9ac" stroke-width="2"><circle cx="31" cy="35" r="7"/><path d="M39 34h3m0 0a7 7 0 1 0 10-6"/></g><path d="M27 54l12 22 13-22" fill="#d6d1b5"/><path d="M20 58l-5 44h17l7-26-12-22m25 0 12 48H47L39 76" fill="#597d94"/><path d="M52 72h7v8h-7z" fill="#e9c579"/>',
    lin: '<path d="M20 36Q14 9 34 7q27-5 25 30L47 17 27 26Z" fill="#342e34"/><path d="M56 31q17 25 2 48" stroke="#342e34" stroke-width="9" fill="none"/><path d="M18 56L7 88l25-6 7-29 8 29 25 6-12-32Z" fill="#dd8068"/><path d="M22 71l38 15" stroke="#f4dab7" stroke-width="4"/><path d="M60 59l6 44" stroke="#727d83" stroke-width="10"/><ellipse cx="60" cy="58" rx="6" ry="3" fill="#ecd8af"/>',
    he: '<path d="M20 30Q6 10 27 8q7-12 18 0 22-4 17 18l-8-4-7 3-9-5-9 8Z" fill="#49392f"/><circle cx="52" cy="18" r="4" fill="#e0b25c"/><path d="M21 53Q3 60 8 101h64Q78 67 57 53Z" fill="#8c785f"/><path d="M25 55l-8 48h47l-10-48-14 9Z" fill="#ccaa63"/><path d="M29 79h24v16H29Z" fill="#b39250"/><path d="M31 89l5-8 5 8m1 0 5-8 5 8" fill="#eee1b2"/>',
    yu: '<ellipse cx="61" cy="25" rx="10" ry="11" fill="#383c45"/><path d="M19 31Q13 5 39 7q22 0 21 29L45 19 22 30Z" fill="#383c45"/><path d="M24 52l-6 51h43l-7-51-14 10Z" fill="#879b76"/><path d="M30 49h18v12H30Z" fill="#728866"/><path d="M22 59l38 30" stroke="#d2c4a2" stroke-width="4"/><path d="M47 81h22v20H47Z" fill="#d3b885"/><path d="M47 81l11 9 11-9" fill="none" stroke="#82735e"/><circle cx="33" cy="41" r="1" fill="#9a6c55"/><circle cx="45" cy="41" r="1" fill="#9a6c55"/>',
    tang: '<path d="M19 37Q9 26 20 15q4-13 17-8 15-8 23 7 12 10 1 24L50 22l-9 5-9-5Z" fill="#614c45"/><path d="M22 55L10 99h61L58 55 40 64Z" fill="#bc8da6"/><path d="M27 77h25v23H27Z" fill="#a97996"/><path d="M39 88V68m0 7q-13-13-15-3 2 9 15 9m0-9q9-15 14-5 0 8-14 11" fill="#9da778" stroke="#657958" stroke-width="2"/><ellipse cx="39" cy="15" rx="35" ry="7" fill="#d8bd83"/><path d="M20 15Q22-3 40-2q15 0 19 17" fill="#e7ca90"/><path d="M21 12h37" stroke="#a17d59" stroke-width="3"/>',
  };
  // Rounded forms, individual clothing and objects remain recognizable at room scale.
  const body = `<ellipse cx="40" cy="106" rx="29" ry="5" fill="#162c3440"/><path d="M26 91l-2 18h12l4-16 5 16h12l-4-18" fill="#354c55"/><path d="M21 57Q9 71 13 84m45-27q15 13 9 27" fill="none" stroke="${guest.color}" stroke-width="11" stroke-linecap="round"/><ellipse cx="40" cy="32" rx="19" ry="23" fill="#e2ba99"/><path d="M37 43q4 3 8-1" fill="none" stroke="#926954" stroke-width="1.5"/><path d="M29 33h3m15 0h3" stroke="#433f3b" stroke-width="2.5" stroke-linecap="round"/>${details[id]}`;
  return full ? `<svg viewBox="0 -6 80 120" role="img" aria-label="${guest.name}：${guest.design}" xmlns="http://www.w3.org/2000/svg">${body}</svg>` : body;
}
export function keepsake(item: ItemId): string {
  const drawings: Partial<Record<ItemId, string>> = {
    compass: '<circle cx="24" cy="24" r="17" fill="#d9b770"/><circle cx="24" cy="24" r="13" fill="#5c929d"/><path d="M29 12l-2 16-9 9 2-16Z" fill="#f4e8c7"/><circle cx="24" cy="24" r="3" fill="#d37f65"/>',
    needle: '<path d="M8 40L34 8q13-5 5 8L8 40" fill="#c4d5ce" stroke="#596e71" stroke-width="2"/><path d="M36 12q-17 15-9 23t15-5" fill="none" stroke="#c97d69" stroke-width="3"/>',
    ribbon: '<path d="M8 8q14-7 16 11Q40-1 43 13q0 13-18 10l12 21-14-6-9 6 5-21Q0 24 8 8Z" fill="#c4869b"/><circle cx="23" cy="22" r="5" fill="#e9c994"/>',
    bell: '<path d="M24 6v5m-3-5h6M13 26q0-17 11-17t11 17l5 9H8Z" fill="#d9b46c" stroke="#866f4e" stroke-width="2"/><circle cx="24" cy="38" r="5" fill="#a57c55"/><path d="M21 16q-5 3-5 11" fill="none" stroke="#f6e4b8" stroke-width="3"/>',
    lens: '<ellipse cx="24" cy="24" rx="17" ry="20" fill="#8bc0c3" stroke="#d7b876" stroke-width="3"/><path d="M14 29l15-17M21 35l13-15" stroke="#f6efce" stroke-width="3"/>',
    knot: '<path d="M9 39Q42 5 20 9T30 39 9 9q-8 15 30 30" fill="none" stroke="#7ea9ac" stroke-width="5"/>',
    brace: '<path d="M8 7h12v13h20v13H20v9H8Z" fill="#b17d55"/><path d="M11 10v29m12-14h14" stroke="#e4b781" stroke-width="2"/>',
    tea: '<path d="M8 15h26v12q0 13-13 13T8 27Z" fill="#d8d3b3"/><path d="M34 19q16 0 9 13l-9 1" fill="none" stroke="#d8d3b3" stroke-width="4"/><ellipse cx="21" cy="15" rx="13" ry="4" fill="#997854"/><path d="M19 10q-5-5 0-9m9 9q-5-5 0-9" fill="none" stroke="#f3dab4" stroke-width="2"/>',
  };
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${drawings[item] ?? '<path d="M7 33l8-21 21-4 7 24-17 10Z" fill="#8eb6b0" stroke="#d5bf8e" stroke-width="2"/><path d="M15 12l11 30M7 33l29-25" stroke="#dce4cf" fill="none"/>'}</svg>`;
}

function architecture(): string {
  const boards = Array.from({ length: 16 }, (_, i) => `<path d="M280 ${273 + i * 19}h525" stroke="#9a6946" stroke-opacity=".16"/>`).join('');
  const ripples = Array.from({ length: 16 }, (_, i) => `<path d="M${(i * 137) % 1150} ${587 + (i % 6) * 23}q45-9 92 0t100 0" fill="none" stroke="${i % 3 ? '#acc9c1' : '#ecd2a0'}" stroke-width="${i % 3 ? 2 : 4}" opacity=".36"/>`).join('');
  return `<defs>
    <linearGradient id="tb-sky" x2="0" y2="1"><stop stop-color="#263f50"/><stop offset=".62" stop-color="#659394"/><stop offset="1" stop-color="#c1b9a0"/></linearGradient>
    <linearGradient id="tb-sea" x2=".2" y2="1"><stop stop-color="#719d9e"/><stop offset="1" stop-color="#264f63"/></linearGradient>
    <linearGradient id="tb-room" x2=".8" y2="1"><stop stop-color="#e3ba78"/><stop offset="1" stop-color="#a27255"/></linearGradient>
    <linearGradient id="tb-wall" x2="1" y2=".7"><stop stop-color="#dbc6a2"/><stop offset="1" stop-color="#b99775"/></linearGradient>
    <radialGradient id="tb-glow"><stop stop-color="#ffda86" stop-opacity=".8"/><stop offset="1" stop-color="#ffda86" stop-opacity="0"/></radialGradient>
    <pattern id="tb-rain" width="82" height="97" patternUnits="userSpaceOnUse" patternTransform="rotate(14)"><path d="M20 9v23M70 50v12" stroke="#d5e3d7" stroke-width="1" opacity=".22"/></pattern>
    <pattern id="tb-roof" width="34" height="18" patternUnits="userSpaceOnUse"><path d="M0 0h34v18H0Z" fill="#8c6970"/><path d="M0 17h34M17 0v16" stroke="#4e5660" stroke-width="2"/><path d="M1 2h31" stroke="#c49289" opacity=".6"/></pattern>
  </defs>
  <rect width="1200" height="740" fill="url(#tb-sky)"/>
  <circle cx="901" cy="93" r="40" fill="#dcd6b5" opacity=".8"/><circle cx="890" cy="80" r="37" fill="#395967"/>
  <path d="M0 397Q108 341 213 389T474 391 711 358 974 401 1200 354V575H0Z" fill="#638e8c" opacity=".7"/>
  <path d="M0 453l78-79 61 24 80-105 28 66 61-13 31 61 54 44 293-26 152-94 88-84 39-11 34 63 91 37 110-31v282H0Z" fill="#4e7272"/>
  <path d="M0 521q74-29 116-10l149 39 118-6 410-20 97-44 126-74 42-59 35 4 30 57 77 24v180H0Z" fill="#899881"/>
  <path d="M0 589q131-40 266-13t207 22 250-25 261 14 216-17v170H0Z" fill="url(#tb-sea)"/>
  <path d="M0 581q131-40 266-13t207 22 250-25 261 14 216-17" fill="none" stroke="#e3d7b7" stroke-width="8"/>
  <path d="M211 605Q248 572 295 561L830 551Q947 528 1036 358" fill="none" stroke="#d9c99d" stroke-width="15" opacity=".75"/>
  ${ripples}
  <g fill="#385e67"><path d="M94 337v-80h29v80m40 10V242h27v105"/><path d="M86 258l28-19 74-5 8 27-67 8Z"/><path d="M108 343h97v12h-97"/></g>
  <g fill="#a4b7a0" opacity=".5"><path d="M98 254h15v66H98m70-81h9v83h-9"/><path d="M94 245l82-9 8 5-82 12Z"/></g>
  <g stroke="#e0c991" stroke-width="5"><path d="M57 498h167M61 516h160"/><path d="M63 479v58m154-58v58"/></g>
  <g fill="#ba8765"><path d="M66 485h29l-5 24H71Z"/><path d="M110 482h28l-3 24h-21Z"/><path d="M161 485h29l-5 24h-19Z"/></g>
  <g fill="#aec094" stroke="#637e65" stroke-width="2"><path d="M80 485q-23-27-22-4 11 15 22 4 17-28 20-8-7 16-20 8"/><path d="M124 482q-26-28-17-10 0 18 17 10 3-26 13-23 10 6-13 23"/><path d="M174 485q-18-25-20-9 5 12 20 9 14-28 22-15 1 10-22 15"/></g>
  <g stroke="#705d4b" stroke-width="9"><path d="M858 555l193 34m-177-24v41m44-31v46m46-37v35m51-24v30"/></g>
  <path d="M917 628q44 22 92 0l-13 26h-61Z" fill="#bc8b63" stroke="#5a6057" stroke-width="3"/><path d="M958 620v-74l32 60h-32" fill="#d6c7a2" stroke="#5e6660" stroke-width="3"/>
  <g id="tb-tower"><path d="M984 323l20-177h58l24 177Z" fill="#c7c5aa" stroke="#425f67" stroke-width="5"/><path d="M1001 179l64 1m-69 51 75 1m-81 49 88 1" stroke="#9aab9d" stroke-width="6"/>
  <path d="M997 146v-48h70v48Z" fill="#dba96e" stroke="#425563" stroke-width="6"/><path d="M990 98l43-37 42 37Z" fill="#9c7876" stroke="#425563" stroke-width="4"/>
  <path d="M1008 102v41m24-41v41m24-41v41" stroke="#53636a" stroke-width="5"/><path d="M1020 293v-27q14-19 25 0v27" fill="#516b6b"/><path d="M977 323h116" stroke="#d6d2b2" stroke-width="8"/></g>
  <g id="tb-house">
    <ellipse cx="547" cy="585" rx="293" ry="31" fill="#233f4940"/>
    <path d="M277 265L548 80 820 265v306H277Z" fill="url(#tb-wall)" stroke="#425863" stroke-width="7"/>
    <path d="M280 272h523v143H280Zm0 158h523v130H280Z" fill="url(#tb-room)"/>
    <path d="M345 249L548 110l197 139Z" fill="#a98565"/>
    <path d="M334 248l215-132 193 132" stroke="#6b5e52" stroke-width="9" fill="none"/>
    <path d="M255 266L547 62l296 204-16 16L547 94 272 282Z" fill="url(#tb-roof)" stroke="#485b63" stroke-width="5"/>
    <path d="M720 196V65h44v161Z" fill="#ac9783" stroke="#465b61" stroke-width="5"/><path d="M714 64h57" stroke="#d3b99a" stroke-width="8"/>
    <path d="M187 157q14-14 28 0 14-14 28 0" fill="none" stroke="#d3cdb2" stroke-width="3" opacity=".65"/>
    ${boards}
    <g fill="#6b6254"><path d="M280 410h523v19H280m0 128h523v20H280m244-308h19v310H524"/><path d="M278 264h20v301h-20m510-301h16v301h-16"/></g>
    <path d="M316 284h106v93H316Z" fill="#789c96" stroke="#8e674f" stroke-width="8"/>
    <path d="M323 291h92v78h-92Z" fill="#adbb9e"/><path d="M370 292v77m-45-44h90" stroke="#816c52" stroke-width="5"/>
    <path d="M307 282q-8 56 18 67l12-66m92-1q9 59-11 67l-11-65" fill="#dcbd91"/>
    <g fill="#705e50"><path d="M452 283h55v110h-55Z"/><path d="M450 394h60v7h-60Z"/></g>
    <g fill="#d3b97f"><path d="M459 290h10v27h-10m15-27h8v27h-8m12-27h14v27h-14m-40 13h12v27h-12m17-27h8v27h-8m13-27h9v27h-9m-39 13h8v21h-8m13-21h14v21h-14"/></g>
    <path d="M342 388h115m-101 0v20m87-20v20" stroke="#715b4d" stroke-width="9"/>
    <path d="M363 376l32-7 21 9-33 6Z" fill="#f1d8aa"/><path d="M389 374l17 4" stroke="#8f8970"/>
    <path d="M566 285h116v84H566Z" fill="#639295" stroke="#8e674f" stroke-width="7"/>
    <path d="M624 286v82m-57-43h114" stroke="#aa8a63" stroke-width="5"/>
    <path d="M566 281q-12 64 21 77l12-75m82-2q12 61-21 76l-12-74" fill="#b98073"/>
    <path d="M570 386h154v17H570" fill="#8e684f"/><path d="M578 379q30-21 51 0t47 0 41 0v10H578" fill="#c8ac86"/>
    <path d="M738 303h37v95h-37" fill="#826550"/><path d="M750 315h15v8h-15m0 20h15v8h-15m0 20h15v8h-15" fill="#d4b47d"/>
    <g id="tb-hearth"><path d="M314 450h73v99h-73Z" fill="#8f8070"/><path d="M324 507q28-42 53 0v35h-53Z" fill="#42535a"/><path d="M307 448h86v11h-86" fill="#c5a782"/><path d="M342 465h19v13h-19" fill="#b4a28a"/></g>
    <path d="M390 505h118v18H390m9 0v29m99-29v29" fill="none" stroke="#795b49" stroke-width="9"/>
    <path d="M397 504l49-13 55 12-50 15Z" fill="#d8ae73"/>
    <g fill="#ebd4a6"><ellipse cx="426" cy="503" rx="7" ry="3"/><ellipse cx="477" cy="503" rx="7" ry="3"/></g>
    <path d="M427 439h30l-3 28h-24Z" fill="#f1c77d"/><path d="M442 430v-9" stroke="#635c51" stroke-width="3"/>
    <path d="M570 504h163v14H570m7 0v35m147-35v35" stroke="#745847" stroke-width="8" fill="#bb986b"/>
    <path d="M595 494l41-8 23 10-36 9Z" fill="#d7c493"/><path d="M663 489l33 6m-18-15 12 15" stroke="#765f4d" stroke-width="5"/>
    <g stroke="#655a4e" stroke-width="3"><path d="M747 465v81m-14-80h29m-13-14v28"/><circle cx="750" cy="508" r="19" fill="#a17e59"/></g>
    <path d="M765 433h17v20h-17" fill="#cfac75"/><path d="M682 450h50" stroke="#695849" stroke-width="4"/><path d="M690 452v18m15-18v12m15-12v22" stroke="#b9b894" stroke-width="6"/>
    <path d="M519 167h59v60h-59Z" fill="#527b80" stroke="#735d4e" stroke-width="6"/><path d="M550 168v57m-29-29h56" stroke="#b9a074" stroke-width="4"/>
    <g id="tb-heart"><circle cx="548" cy="219" r="25" fill="none" stroke="#d6b37c" stroke-width="9"/><path d="M548 193v-32" stroke="#665e52" stroke-width="3"/></g>
    <path d="M268 580h552m-513 0-6 21m107-21-1 21m159-21 1 21m112-21 6 21" stroke="#6d6050" stroke-width="9"/>
    <path d="M259 572h573v11H259Z" fill="#c4ac7e"/><path d="M253 546h37m-34 0v28m567-28h22m-6 0v28" stroke="#b99e73" stroke-width="5"/>
  </g>
  <g fill="#e8d5a1" opacity=".6"><path d="M487 632h122l-21 5h-78Zm-30 20h171l-18 5H478Zm24 20h126l-19 4h-86Z"/><path d="M1004 552h54l8 5h-66Zm-14 14h81l-2 5h-76Z"/></g>
  <path d="M166 625l39-12 27 4-41 15Z" fill="#af936e"/><path d="M172 622l42-6" stroke="#e0c49b" stroke-width="2"/>
  <g fill="#aed5c8"><path d="M254 620l11-8 7 12-9 5Zm-35 23 6-9 8 7-4 7Zm46 5 8-6 5 9-8 3Z"/></g>
  <g class="tb-rain" aria-hidden="true"><rect width="1280" height="840" x="-40" y="-60" fill="url(#tb-rain)" pointer-events="none"/></g>`;
}

export function createWorld(host: HTMLElement, initial: State, signal: AbortSignal, onSelect: (id: SceneId) => void, onGuest: (id: GuestId) => void) {
  host.innerHTML = `<svg class="tb-world-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 740" role="group" aria-label="可探索的海屋剖面与海岸；也可使用下方地点选择">
    ${architecture()}
    <g data-lights pointer-events="none"></g><g data-room-picks></g><g data-people></g>
    <g data-you pointer-events="none"></g>
  </svg>`;
  const svg = host.querySelector<SVGSVGElement>('svg')!;
  const picks = host.querySelector<SVGGElement>('[data-room-picks]')!;
  const people = host.querySelector<SVGGElement>('[data-people]')!;
  const lights = host.querySelector<SVGGElement>('[data-lights]')!;
  const you = host.querySelector<SVGGElement>('[data-you]')!;
  let state = initial, selected: SceneId = 'hall', wide = false, compact = host.clientWidth < 650;
  picks.innerHTML = SCENE_IDS.map(id => {
    const scene = SCENES[id];
    return `<g data-scene="${id}" role="button" tabindex="0" aria-label="查看${scene.name}" transform="translate(${scene.x},${scene.y})"><rect class="tb-hit" x="-91" y="-48" width="182" height="82" rx="13"/><g class="tb-sign" transform="translate(0,36)"><rect x="-79" y="-18" width="158" height="36" rx="6"/><text text-anchor="middle" y="9">${scene.name}</text></g></g>`;
  }).join('');
  function camera() {
    if (!compact || wide) svg.setAttribute('viewBox', '0 0 1200 740');
    else {
      const scene = SCENES[selected];
      const x = Math.max(0, Math.min(640, scene.x - 280)), y = Math.max(25, Math.min(340, scene.y - 210));
      svg.setAttribute('viewBox', `${x} ${y} 560 400`);
    }
  }
  function update(next: State, scene: SceneId = selected) {
    state = next; selected = scene;
    host.dataset.tide = String(tide(state)); host.dataset.watch = watch(state);
    for (const id of SCENE_IDS) {
      const pick = picks.querySelector<SVGGElement>(`[data-scene="${id}"]`)!;
      pick.dataset.locked = String(!unlocked(state, id));
      pick.setAttribute('aria-pressed', String(selected === id));
      pick.setAttribute('aria-label', `查看${SCENES[id].name}${unlocked(state, id) ? '' : '，道路未开'}`);
    }
    lights.innerHTML = `${hasQuest(state, 'hearth') ? '<ellipse cx="425" cy="496" rx="125" ry="100" fill="url(#tb-glow)"/><path d="M336 538q-8-19 10-27 0 12 8 14 8-10 6-20 19 16 6 33Z" fill="#f3b565"/>' : ''}
      ${hasQuest(state, 'beacon') ? '<path d="M1034 121L762 56v130Z" fill="#f5d494" opacity=".13"/><ellipse cx="1034" cy="121" rx="83" ry="70" fill="url(#tb-glow)"/>' : ''}
      ${hasQuest(state, 'heart') ? '<circle cx="548" cy="219" r="56" fill="url(#tb-glow)"/><circle cx="548" cy="219" r="12" fill="#d2e0bf"/>' : ''}`;
    const counts = new Map<SceneId, number>();
    people.innerHTML = GUEST_IDS.map(id => {
      const guest = state.guests[id], location = SCENES[guest.location];
      const index = counts.get(guest.location) ?? 0; counts.set(guest.location, index + 1);
      const x = location.x - 70 + index * 33, y = location.y - 60;
      return `<g data-portrait="${id}" role="button" tabindex="0" aria-label="查看${GUESTS[id].name}，${location.name}" transform="translate(${x},${y}) scale(.64)">
        <title>${escapeMarkup(GUESTS[id].name + '：' + guest.intention)}</title><rect x="-4" y="-5" width="88" height="120" rx="12" fill="transparent"/>
        ${portrait(id)}<circle cx="65" cy="8" r="9" fill="${guest.promise === 'done' ? '#d9ce90' : guest.promise === 'broken' ? '#d98275' : '#94bcb5'}" stroke="#455c63" stroke-width="2"/>
      </g>`;
    }).join('');
    const at = SCENES[state.location];
    you.innerHTML = `<g transform="translate(${at.x + 55},${at.y - 8})"><path d="M0-30q-10 0-10 10v22h20v-22q0-10-10-10" fill="#f1e4bf" stroke="#56747a" stroke-width="2"/><path d="M-6-26q6-13 12 0" fill="#756759"/><path d="M-8 2h16" stroke="#dfb97c" stroke-width="3"/><text x="0" y="-36" text-anchor="middle" fill="#faf0d4" font-size="22">你</text></g>`;
    camera();
  }
  function pick(event: Event) {
    if (!(event.target instanceof Element)) return;
    const room = event.target.closest('[data-scene]'), person = event.target.closest('[data-portrait]');
    if (person) onGuest(person.getAttribute('data-portrait') as GuestId);
    else if (room) onSelect(room.getAttribute('data-scene') as SceneId);
  }
  svg.addEventListener('click', pick, { signal });
  svg.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(event); }
  }, { signal });
  svg.addEventListener('focusin', event => {
    if (!(event.target instanceof Element)) return;
    const room = event.target.closest('[data-scene]'), person = event.target.closest('[data-portrait]');
    if (room) { selected = room.getAttribute('data-scene') as SceneId; camera(); }
    if (person) { selected = state.guests[person.getAttribute('data-portrait') as GuestId].location; camera(); }
  }, { signal });
  const observer = new ResizeObserver(entries => {
    compact = entries[0].contentRect.width < 650; camera();
  });
  observer.observe(host);
  update(initial);
  return { update, overview() { wide = !wide; camera(); return wide; }, destroy() { observer.disconnect(); host.replaceChildren(); } };
}
