import type { EnemyId, LocationId, PersonId } from './data';
import { ENEMY_NAMES, PLACE_NAMES } from './data';
import { CHARACTERS } from './story';
import type { State } from './engine';
import { LANES } from './engine';

export function portrait(id: PersonId, small = false): string {
  const c = CHARACTERS[id];
  const hair = { you: '#22283f', lan: '#954238', mo: '#c8cee6', qiao: '#68a79b', su: '#453051', yan: '#e3d0a1' }[id];
  const backHair = id === 'lan' ? '<path d="M84 43Q126 93 82 147L69 130Q104 95 75 70" fill="#954238" stroke="#5d3034" stroke-width="7"/>' :
    id === 'yan' ? '<path d="M27 41L19 139 91 138 92 37" fill="#d4bf96"/>' :
      id === 'qiao' ? '<path d="M30 39L3 23 8 72 36 61M81 32L114 13 109 68 82 65" fill="#68a79b"/>' :
        id === 'su' ? '<ellipse cx="63" cy="24" rx="33" ry="23" fill="#453051"/><path d="M30 10L90 38M39 5L82 43" stroke="#e0b274" stroke-width="3"/>' : '';
  const fringe = id === 'mo' ? 'M29 41Q23 6 60 9Q98 8 91 58L73 31 66 53 56 29 44 51 40 36 29 65Z' :
    id === 'you' ? 'M27 49L18 30 38 29 31 15 53 21 64 5 72 22 91 15 96 44 80 39 68 56 63 33 43 49 40 35Z' :
      id === 'qiao' ? 'M24 48Q19 7 62 9Q102 6 96 53L82 40 75 55 58 32 44 53 41 34Z' :
        id === 'yan' ? 'M27 52Q18 11 59 7Q106 10 91 59L72 31 65 49 60 24 42 47 35 35Z' :
          'M26 49Q16 14 53 11Q95 8 94 53L81 43 66 22 57 39 42 32 36 56Z';
  const accessory = id === 'lan' ? '<path d="M27 54L53 57 51 73 26 69Z" fill="#9daaa9" stroke="#d9ad78" stroke-width="3"/><path d="M25 60L10 53" stroke="#393448" stroke-width="4"/>' :
    id === 'mo' ? '<path d="M24 29L100 36" stroke="#29263f" stroke-width="4"/><path d="M58 107L31 127 55 139 62 117 91 133 76 109Z" fill="#eee5d0" stroke="#8c93b6" stroke-width="2"/>' :
      id === 'qiao' ? '<circle cx="24" cy="60" r="12" fill="#cb955f" stroke="#344c5b" stroke-width="5"/><circle cx="94" cy="59" r="9" fill="#d3a466" stroke="#344c5b" stroke-width="4"/><path d="M28 118L40 104M88 115L81 100" stroke="#ece0ae" stroke-width="9"/>' :
        id === 'you' ? '<path d="M78 26L92 34" stroke="#e6b777" stroke-width="4"/><path d="M27 104L77 99 91 115 59 124 15 144 25 120Z" fill="#cb7754"/>' :
          id === 'yan' ? '<path d="M35 102L34 81 52 94 62 86 80 79 81 107" fill="#927452" stroke="#dbb47a" stroke-width="3"/><path d="M39 119L79 119M37 128L81 128M34 138L83 138" stroke="#d7b777" stroke-width="3"/>' :
            '<path d="M29 106L57 144 89 103" fill="#f0dec4"/><circle cx="58" cy="126" r="7" fill="#a883b9"/>';
  return `<svg class="ew-portrait${small ? ' ew-small-portrait' : ''}" viewBox="0 0 120 150" role="img" aria-label="${c.name}的原创肖像">
    <path d="M5 149V51Q7 3 60 2Q115 1 115 51V149Z" fill="#202b47"/><circle cx="60" cy="59" r="48" fill="${c.color}" opacity=".22"/>
    ${backHair}<path d="M11 151Q9 106 43 100L45 83 76 83 77 101Q109 108 113 151" fill="${c.color}" stroke="#22283e" stroke-width="3"/>
    <path d="M44 81L45 102Q60 115 77 101L75 81" fill="#e2ad93"/>
    <path d="M28 39Q60 11 92 41L89 70Q84 91 60 100Q35 89 30 71Z" fill="#f2c5a5"/>
    <path d="M29 64L36 78 42 84 37 58" fill="#dc9c89" opacity=".65"/>
    <path d="${fringe}" fill="${hair}" stroke="#2b293c" stroke-width="2"/>
    <path d="M37 60L50 58M70 58L84 59" stroke="#34304a" stroke-width="3" stroke-linecap="round"/>
    <path d="M39 62Q46 68 51 61M70 61Q76 68 82 62" fill="#fff2d7" stroke="#4b3d4d" stroke-width="1.5"/>
    <path d="M46 61V65M75 60V65" stroke="#445b69" stroke-width="4"/>
    <path d="M60 65L57 76 62 77M53 85Q60 88 68 84" fill="none" stroke="#ae796f" stroke-width="1.5"/>
    ${accessory}<path d="M6 148H114" stroke="#e1ac76" stroke-width="2"/></svg>`;
}

function island(x: number, y: number, scale: number, top = '#697b91') {
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <path d="M-170 0L-26-78 160-8 45 79Z" fill="${top}"/>
    <path d="M-170 0L45 79 14 183-81 100-137 96Z" fill="#253452"/>
    <path d="M45 79L160-8 112 111 14 183Z" fill="#182743"/>
    <path d="M-149 25L-74 64-48 126M67 69L40 147M-65 83L-75 119" fill="none" stroke="#ae735a" stroke-width="4" opacity=".7"/>
    <path d="M-169 0L45 79 158-8" fill="none" stroke="#d7a276" stroke-width="3"/></g>`;
}
function house(x: number, y: number, scale = 1, color = '#c9a788') {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M-37-56L3-77 43-52 5-30Z" fill="#f1d3a3"/>
    <path d="M-37-56L5-30V17L-37-6Z" fill="${color}"/><path d="M5-30L43-52V-8L5 17Z" fill="#53667c"/>
    <path d="M-44-54L-3-104 49-54 5-32Z" fill="#9d6559"/><path d="M-3-104L49-54 5-32Z" fill="#694953"/>
    <path d="M-27-30L-14-24V-7L-27-13ZM14-23L26-30V-13L14-6Z" fill="#f7c780"/></g>`;
}
function sails(x: number, y: number, scale = 1, hue = '#eed6b1') {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M0 18V-145M-71-113L68-103" stroke="#bc865e" stroke-width="5"/>
    <path d="M-64-115Q-30-60-69-13L-3 0V-109Z" fill="${hue}"/><path d="M5-109L66-103Q45-52 76-7L5 0Z" fill="${hue}" opacity=".76"/>
    <path d="M-57-107L-40-23M16-101L42-15" stroke="#b1816a" stroke-width="2"/><path d="M-87 8L0 49 88 9" fill="none" stroke="#d4a376" stroke-width="4"/></g>`;
}
function architecture(place: LocationId) {
  switch (place) {
    case 'kiln': return `${house(500, 320, 1.4)}${house(638, 332, .9)}<path d="M387 367L399 241 471 209 480 355" fill="none" stroke="#b78669" stroke-width="12"/>
      <path d="M430 231V295M469 212V265" stroke="#e9cf9b" stroke-width="2"/><path d="M418 292L442 285V316L419 323ZM457 263L477 258V281L458 287Z" fill="#ffc976"/>
      <path d="M554 236V174H573V247" fill="#35475e"/><path d="M560 174Q547 134 569 92" class="ew-smoke" stroke="#bcc5cf" opacity=".25" stroke-width="15" fill="none"/>`;
    case 'span': return `<path d="M210 353L443 207 819 342M214 406L445 270 814 392" fill="none" stroke="#e9c092" stroke-width="7"/>
      <path d="M313 352L311 249M733 355V231" stroke="#96745f" stroke-width="16"/>
      <path d="M231 294Q491 456 800 290M231 291Q472 169 799 289" fill="none" stroke="#c29467" stroke-width="4"/>
      ${Array.from({ length: 9 }, (_, i) => `<path d="M${280 + i * 51} ${322 + Math.sin(i / 3) * 25}v45" stroke="#b69a7e" stroke-width="3"/>`).join('')}
      ${house(583, 305, .8, '#bc8b67')}<path d="M555 227L590 208 610 223" fill="none" stroke="#ffbc6d" stroke-width="7"/>`;
    case 'bell': return `<path d="M469 351V178L529 145 590 174V351L530 386Z" fill="#b7b8cb"/><path d="M529 145V386L590 351V174Z" fill="#647393"/>
      <path d="M453 178L526 99 606 173 529 198Z" fill="#544e77"/><path d="M495 244V198Q528 157 558 195V250L530 264Z" fill="#273350"/>
      <path d="M529 183V224M512 228L545 217 550 244 508 255Z" fill="#deb980" stroke="#f2cda0" stroke-width="3"/>
      ${Array.from({ length: 6 }, (_, i) => `<path d="M${350 + i * 37} 270v${50 + i % 3 * 12}" stroke="#ded1b8"/><path d="M${345 + i * 37} ${320 + i % 3 * 12}l12-5v22l-12 5Z" fill="#d9b999"/>`).join('')}
      <path d="M329 280Q404 225 470 268" fill="none" stroke="#b5a2ad" stroke-width="3"/>`;
    case 'market': return `${house(403, 345, 1.1, '#d1a076')}${house(563, 281, .9, '#b98785')}${house(666, 356, 1.2, '#b9b894')}
      ${sails(441, 276, .8, '#dc996f')}${sails(606, 239, .85, '#c9c7b0')}
      <path d="M339 326Q524 245 738 319" stroke="#b99164" stroke-width="3" fill="none"/>
      ${Array.from({ length: 8 }, (_, i) => `<path d="M${358 + i * 46} ${317 - Math.sin(i / 2) * 22}l27-8-8 31Z" fill="${i % 2 ? '#a7bdc5' : '#edac7c'}"/>`).join('')}`;
    case 'garden': return `<path d="M357 352V234L507 154 679 235V350L531 437Z" fill="#75b4bf" opacity=".23"/>
      <path d="M357 352V234L507 154 679 235V350M357 234L531 331 679 235M531 331V437M412 267L509 179 630 263M468 297L509 212 580 298" fill="none" stroke="#b1c1bc" stroke-width="5"/>
      ${Array.from({ length: 8 }, (_, i) => { const x = 405 + i % 4 * 66, y = 330 + Math.floor(i / 4) * 42; return `<path d="M${x} ${y}q15-37 0-64" fill="none" stroke="#506f65" stroke-width="4"/><path d="M${x} ${y - 46}q-32-7-23-27 23 8 24 16 4-33 25-29 13 25-16 32 35-6 31 17-25 15-41-9Z" fill="${i % 2 ? '#ed9c61' : '#ce645a'}"/><circle cx="${x + 4}" cy="${y - 56}" r="7" fill="#ffe6a4"/>`; }).join('')}`;
    case 'reservoir': return `<ellipse cx="529" cy="342" rx="186" ry="79" fill="#66b2bf"/><ellipse cx="529" cy="342" rx="148" ry="56" fill="#27496c"/>
      <path d="M354 352Q470 466 700 350L657 453Q531 558 394 438Z" fill="#659bae" opacity=".7"/>
      <path d="M388 401Q518 488 655 415M411 439Q531 512 621 449" stroke="#a5d6cf" stroke-width="3" fill="none"/>
      <path d="M411 327L431 207 645 232 648 330" stroke="#bba085" stroke-width="9" fill="none"/>
      <path d="M445 238L475 200 516 223 485 260Z" fill="#e2b378"/><path d="M484 237Q508 350 603 342" stroke="#e7ccb3" fill="none" stroke-width="2"/>`;
    case 'archive': return `<path d="M534 125L681 203V352L533 439 373 349V210Z" fill="#1d2f51"/>
      ${[0, 1, 2, 3].map(i => `<g transform="translate(0 ${i * 45})"><path d="M377 210L534 122 679 202 537 286Z" fill="none" stroke="#887d85" stroke-width="15"/><path d="M386 218L537 293 670 217" fill="none" stroke="#c5a67c" stroke-width="4"/>
        ${[0, 1, 2].map(j => `<path d="M${403 + j * 43} ${234 + j * 22}l29 14v26l-29-14Z" fill="#a3928c"/><path d="M${412 + j * 43} ${246 + j * 22}l9 4" stroke="#f4d7a3" stroke-width="3"/>`).join('')}</g>`).join('')}
      <path d="M534 176V366" stroke="#eead69" stroke-width="4" stroke-dasharray="4 12"/>`;
    case 'observatory': return `<ellipse cx="527" cy="348" rx="195" ry="90" fill="#c7b096"/><ellipse cx="527" cy="337" rx="155" ry="66" fill="#6d6b82"/>
      <path d="M388 324V269M440 302V241M626 304V240M674 329V271" stroke="#d7c2a5" stroke-width="10"/>
      <path d="M528 332V197M457 192L599 191" stroke="#d2a66d" stroke-width="7"/>
      <ellipse cx="530" cy="202" rx="98" ry="37" fill="none" stroke="#debb7c" stroke-width="7" transform="rotate(-32 530 202)"/>
      <ellipse cx="530" cy="202" rx="94" ry="34" fill="none" stroke="#adbcc9" stroke-width="5" transform="rotate(52 530 202)"/>
      <circle cx="530" cy="202" r="21" fill="#f1c88a"/><path d="M399 359Q526 434 657 355" fill="none" stroke="#ebe0bf" stroke-width="6"/>`;
    case 'heart': return `<path d="M530 372L392 292 346 146 468 225 530 114 595 227 744 120 677 306Z" fill="#253855" stroke="#b88660" stroke-width="9"/>
      <path d="M382 178L420 268 499 328M711 157L643 282 565 323" fill="none" stroke="#e6b77b" stroke-width="11"/>
      <ellipse cx="531" cy="278" rx="76" ry="113" fill="#412e4b" stroke="#de9b64" stroke-width="13"/>
      <ellipse cx="531" cy="278" rx="43" ry="78" fill="#f2a261"/><path d="M531 210Q569 274 523 345Q491 287 531 210" fill="#ffe0a0"/>
      ${Array.from({ length: 7 }, (_, i) => `<path d="M531 388Q${290 + i * 82} 420 ${236 + i * 103} 545" fill="none" stroke="#bd845c" stroke-width="3"/>`).join('')}`;
  }
}
function caravan() {
  return `<g transform="translate(285 438) scale(.82)"><path d="M-82-13L-3-51 103-2 19 47Z" fill="#b77f59"/>
    <path d="M-81-13V28L20 79V47Z" fill="#724851"/><path d="M20 47L103-2V36L20 79Z" fill="#3b425e"/>
    <path d="M-81 0L19 52 102 10" fill="none" stroke="#e3b47d" stroke-width="5"/>
    <circle cx="-45" cy="43" r="19" fill="#25344e" stroke="#c6986b" stroke-width="6"/><circle cx="63" cy="54" r="18" fill="#25344e" stroke="#c6986b" stroke-width="6"/>
    <path d="M-66-20V-70Q-15-137 70-77L88 0 20 29Z" fill="#e5cda8"/>
    <path d="M-66-70L20-30 70-77M20-30V29M-23-115L-13-44" fill="none" stroke="#b18b73" stroke-width="4"/>
    <path d="M-67-17L20 27 84-3" fill="none" stroke="#f4dcad" stroke-width="6"/>
    <path d="M84-36L107-47V-10L89-2Z" fill="#fac274"/><path d="M-30-131V-193L40-163-30-149" fill="#bb6557" stroke="#ddb481" stroke-width="3"/>
    <path d="M108 23L158 1" stroke="#b98f66" stroke-width="7"/></g>`;
}
function enemyArt(id: EnemyId, x: number, y: number) {
  if (id === 'heart') return `<g transform="translate(${x - 25} ${y - 106}) scale(.58)">${portrait('yan').replace(/<svg[^>]*>|<\/svg>/g, '')}</g>`;
  const shape = id === 'wing' ? '<path d="M0-36L-96-76-61-3-23 17 0 4 24 17 74-7 101-72Z" fill="#b69281" stroke="#edc095" stroke-width="3"/><path d="M-72-58L-27 0M72-54L27 0" stroke="#544963" stroke-width="6"/><path d="M0-46L21-9 0 24-19-10Z" fill="#334560"/>' :
    id === 'hook' ? '<path d="M-25-79L29-64 28-16-21-29Z" fill="#b38970"/><path d="M-24-59L-55-22Q-74 12-36 18M29-44L61-6Q69 21 36 20" fill="none" stroke="#c09f80" stroke-width="10"/><path d="M-12-24L-27 8M15-19L28 19" stroke="#38425b" stroke-width="11"/>' :
      `<path d="M-28-75L5-93 35-74 32-10 0 10-32-8Z" fill="${id === 'clerk' ? '#b3a291' : '#7f91a0'}" stroke="#323a52" stroke-width="3"/><path d="M-22-65L22-63V-29L-22-30Z" fill="#2b3652"/><path d="M-21-18L-35 22M22-14L36 21" stroke="#b59175" stroke-width="9"/>`;
  return `<g transform="translate(${x} ${y}) scale(.7)">${shape}<path d="M-11-48L12-45" stroke="#ffd187" stroke-width="6"/><ellipse cx="0" cy="26" rx="43" ry="10" fill="#14213c" opacity=".55"/></g>`;
}
export function scene(state: State): string {
  const night = ['bell', 'archive', 'observatory', 'heart'].includes(state.location);
  const battle = state.battle;
  const sky = `<defs><linearGradient id="ew-sky" x2="0" y2="1"><stop stop-color="${night ? '#131d42' : '#303b66'}"/><stop offset=".62" stop-color="${night ? '#4f537b' : '#bb797f'}"/><stop offset="1" stop-color="${night ? '#ba827e' : '#eeb58c'}"/></linearGradient></defs>
    <path d="M0 0H1000V620H0Z" fill="url(#ew-sky)"/>
    <circle cx="785" cy="134" r="${night ? 67 : 92}" fill="${night ? '#c1d3d7' : '#f7c79a'}" opacity=".83"/>
    <path d="M0 242Q120 184 273 238T521 208Q631 178 706 217M612 452Q725 401 1000 454M-50 530Q152 466 337 513" fill="none" stroke="${night ? '#9ba2b6' : '#f0c3ab'}" stroke-width="25" opacity=".2"/>
    ${Array.from({ length: 24 }, (_, i) => `<circle cx="${(i * 137 + state.seed * 11) % 1000}" cy="${24 + (i * 53) % 225}" r="${i % 3 ? 1 : 2}" fill="#ffe7bd" opacity=".65"/>`).join('')}
    ${island(164, 218, .37, '#7c829a')}${house(167, 203, .35)}${island(872, 318, .47, '#897f96')}${sails(882, 295, .42)}
    <path d="M-40 302Q311 116 1050 322M-40 309Q311 123 1050 329" fill="none" stroke="#e6ba97" stroke-width="2" opacity=".55"/>`;
  let center: string;
  if (!battle) {
    center = `${state.location === 'span' ? island(576, 355, .7) : island(533, 356, 1.27, state.location === 'garden' ? '#788d87' : '#898594')}
      ${architecture(state.location)}<path d="M-40 464L140 379 454 531 454 555 138 410-40 493Z" fill="#49415d" stroke="#b68a75" stroke-width="3"/>
      <path d="M-10 449L141 378 453 526M-10 435L142 363 453 511" fill="none" stroke="#dfbc94" stroke-width="3"/>
      ${caravan()}<g class="ew-embers">${[0, 1, 2, 3, 4].map(i => `<path d="M${410 + i * 57} ${436 - i * 17}l3-9 3 6-3 8Z" fill="#ffd694" opacity=".8"/>`).join('')}</g>`;
  } else {
    const pos = (side: number, lane: number) => ({ x: 310 + side * 159 + lane * 69, y: 359 - side * 78 + lane * 48 });
    center = `<g opacity=".3" transform="translate(245 -70) scale(.62)">${architecture(state.location)}</g>`;
    for (let lane = 0; lane < 3; lane++) for (let side = 2; side >= 0; side--) {
      const p = pos(side, lane);
      const threat = battle.plan?.orders.some(o => ENEMY_NAMES[o.actor as EnemyId] &&
        (o.action === 'strike' && o.lane === lane || o.action === 'sweep' && Math.abs(o.lane - lane) <= 1));
      center += `<g ${side === 0 ? `data-pick-lane="${lane}" role="button" tabindex="0" aria-label="选择${LANES[lane]}站位"` : ''} class="ew-tile">
        <path d="M${p.x - 72} ${p.y}l70-40 78 40-73 43Z" fill="${side === 0 && threat ? '#935651' : side === 0 ? '#626d8b' : '#4c617e'}" stroke="${side === 0 && battle.heroLane === lane ? '#ffe0a2' : '#b58b75'}" stroke-width="${side === 0 && battle.heroLane === lane ? 4 : 2}"/>
        <path d="M${p.x - 72} ${p.y}v17l73 43 75-43v-17l-73 43Z" fill="#283850"/>
        ${side === 0 ? `<text x="${p.x}" y="${p.y + 33}" text-anchor="middle" fill="#ffebc7" font-size="18">${LANES[lane]}</text>` : ''}</g>`;
    }
    for (const ally of battle.allies) {
      const p = pos(1, ally.lane);
      center += `<g transform="translate(${p.x - 24} ${p.y - 86}) scale(.43)">${portrait(ally.id).replace(/<svg[^>]*>|<\/svg>/g, '')}</g>`;
    }
    for (const enemy of battle.enemies.filter(e => e.hp > 0)) {
      const p = pos(2, enemy.lane);
      center += enemyArt(enemy.id, p.x, p.y - 8);
      center += `<rect x="${p.x - 34}" y="${p.y + 10}" width="68" height="5" rx="2" fill="#17233d"/><rect x="${p.x - 34}" y="${p.y + 10}" width="${68 * enemy.hp / enemy.maxHp}" height="5" rx="2" fill="#eda879"/>`;
    }
    const hero = pos(0, battle.heroLane);
    center += `<g transform="translate(${hero.x - 30} ${hero.y - 109}) scale(.55)">${portrait('you').replace(/<svg[^>]*>|<\/svg>/g, '')}</g>`;
  }
  return `<svg class="ew-world-svg" viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${PLACE_NAMES[state.location]}${battle ? '三路战术地图' : '浮岛帆车立体场景'}">${sky}${center}</svg>`;
}
