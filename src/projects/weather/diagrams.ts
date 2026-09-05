import { escapeMarkup } from '../../core/page';
import { destinations, watches } from './data';
import type { Destination, Forecast, WatchId } from './data';

const ink = '#112e68';
const blue = '#244bce';
const ivory = '#f5f3df';
const yellow = '#e8f45a';
const pale = '#b5caed';

function callout(x: number, y: number, number: number): string {
  return `<g transform="translate(${x} ${y})">
    <circle r="28" fill="${ivory}" stroke="${ink}" stroke-width="2"/>
    <text y="14" text-anchor="middle" fill="${ink}" font-size="40" font-family="Arial, sans-serif" font-weight="700">${number}</text>
  </g>`;
}

function house(x: number, y: number, scale = 1): string {
  return `<g transform="translate(${x} ${y}) scale(${scale})" stroke="${ink}" stroke-width="3">
    <path d="M-38 0V-43L0-69 38-43V0Z" fill="${ivory}"/>
    <path d="M-49-40 0-76 49-40M0-69V0" fill="none"/>
    <path d="M-24-33H-10V-15H-24ZM13-33H27V-15H13Z" fill="${yellow}"/>
    <path d="M-42 1H43M-20 8H26" fill="none"/>
  </g>`;
}

function sky(watch: WatchId, stair: boolean): string {
  const backgrounds: Record<WatchId, string> = {
    dawn: '#dbe7f4',
    noon: ivory,
    dusk: '#b5c9ed',
    night: '#183568',
  };
  const background = backgrounds[watch];
  const sunY = stair ? 269 : 122;
  const stars = watch === 'night'
    ? [[63, 98], [164, 192], [279, 74], [405, 138], [526, 63], [612, 204], [862, 81], [901, 262], [687, 49]]
      .map(([x, y], index) => `<path d="M${x - 5} ${y}h10M${x} ${y - 5}v10" stroke="${ivory}" stroke-width="${index % 3 === 0 ? 3 : 1.5}"/>`).join('')
    : '';
  return `<rect width="960" height="620" fill="${background}"/>
    <rect width="960" height="620" fill="url(#weather-sky-grid)" opacity="${watch === 'night' ? '.14' : '.3'}"/>
    ${stars}
    <circle cx="730" cy="${sunY}" r="${watch === 'noon' ? 65 : 48}" fill="${yellow}"/>
    ${watch === 'night' ? `<circle cx="754" cy="${sunY - 14}" r="43" fill="${background}"/>` : ''}
    <g fill="none" stroke="${watch === 'night' ? pale : blue}" stroke-width="1.6" opacity=".45">
      <path d="M-30 166C170 46 274 200 475 134S801 69 1000 136"/>
      <path d="M-30 181C170 61 274 215 475 149S801 84 1000 151"/>
      <path d="M-30 196C170 76 274 230 475 164S801 99 1000 166"/>
    </g>`;
}

function stairScene(forecast: Forecast): string {
  const tide = 210 - forecast.reading * 8;
  const rain = Array.from({ length: forecast.reading * 2 + 6 }, (_, index) => {
    const x = 65 + (index * 137) % 745;
    const y = tide + 62 + (index * 61) % 262;
    return `<path d="M${x} ${y - 13}q-7 12-5 17q5 8 10 0q2-5-5-17Z" fill="${index % 3 === 0 ? yellow : blue}"/>
      <path d="M${x} ${y + 17}v${10 + forecast.wind * 3}" stroke="${blue}" stroke-width="2" opacity=".5"/>`;
  }).join('');
  const waves = Array.from({ length: 5 }, (_, index) => {
    const y = tide - 18 - index * 22;
    return `<path d="M0 ${y}C100 ${y - 20} 190 ${y + 20} 300 ${y}S520 ${y - 18} 660 ${y}S840 ${y + 18} 960 ${y}" fill="none" stroke="${pale}" stroke-width="2"/>`;
  }).join('');
  const seaLines = Array.from({ length: 5 }, (_, index) => `<path d="M${index % 2 ? 20 : -40} ${546 + index * 16}q95-10 190 0t190 0t190 0t190 0t190 0" fill="none" stroke="${pale}" stroke-width="2"/>`).join('');
  return `<path d="M0 0H960V${tide}C820 ${tide + 22} 735 ${tide - 19} 601 ${tide}S335 ${tide + 15} 210 ${tide}S76 ${tide - 20} 0 ${tide}Z" fill="${blue}"/>
    ${waves}
    <path d="M0 ${tide}C76 ${tide - 20} 120 ${tide + 17} 210 ${tide}S467 ${tide + 12} 601 ${tide}S820 ${tide + 22} 960 ${tide}" fill="none" stroke="${ink}" stroke-width="4"/>
    <path d="M0 513Q180 495 325 516T640 513T960 512V620H0Z" fill="${ink}"/>
    ${seaLines}
    <path d="M84 535V487H165V448H244V406H321V366H401V326H480V289H682V535Z" fill="${ivory}" stroke="${ink}" stroke-width="4"/>
    <path d="M124 535V503H204V465H283V426H360V387H440V346H519V311H684V535Z" fill="${blue}"/>
    <path d="M124 535V503H204V465H283V426H360V387H440V346H519V311H684" fill="none" stroke="${ink}" stroke-width="3"/>
    <path d="M180 497V529M260 454V529M342 416V529M421 376V529M500 339V529M583 311V529M651 311V529" stroke="${pale}" stroke-width="2"/>
    <path d="M113 480 171 438 252 396 330 356 410 316 488 278H690" fill="none" stroke="${ink}" stroke-width="4"/>
    <path d="M172 440V414M253 397V371M332 357V330M412 317V291M489 278V251M684 279V252" stroke="${ink}" stroke-width="3"/>
    <g stroke="${ink}" stroke-width="3">
      <path d="M581 288 590 174H633L644 288Z" fill="${ivory}"/>
      <path d="M587 211H637L640 237H585Z" fill="${blue}"/>
      <path d="M583 257H641L644 282H581Z" fill="${blue}"/>
      <path d="M584 174V151H640V174ZM579 151 612 126 645 151Z" fill="${yellow}"/>
      <path d="M603 152V174M622 152V174M609 128V109" fill="none"/>
    </g>
    ${rain}
    <path d="M781 446V${tide + 51}m-15 20 15-20 15 20" fill="none" stroke="${yellow}" stroke-width="9"/>
    <path d="M858 488V${tide + 20}" stroke="${ink}" stroke-width="2" stroke-dasharray="5 8"/>
    ${Array.from({ length: 12 }, (_, index) => `<path d="M${index % 3 === 0 ? 845 : 851} ${484 - index * 26}h${index % 3 === 0 ? 26 : 14}" stroke="${ink}" stroke-width="2"/>`).join('')}
    ${callout(205, tide + 19, 1)}
    ${callout(376, 257, 2)}
    ${callout(699, 302, 3)}`;
}

function glassTree(x: number, y: number, scale: number): string {
  return `<g transform="translate(${x} ${y}) scale(${scale})" stroke="${ink}" stroke-width="3">
    <path d="M-7 0-5-143-34-180M7 0 5-139 42-183M0-123V-240" fill="none" stroke-width="6"/>
    <path d="M0-255 81-175 48-94-37-103-78-180Z" fill="${ivory}"/>
    <path d="M0-255 13-159 81-175 0-255-37-103 13-159 48-94" fill="${pale}"/>
    <path d="M-78-180 13-159-37-103M13-159 0-255M13-159 48-94" fill="none"/>
    <path d="M-41-219-20-195M40-145 51-155" stroke="${blue}" stroke-width="6"/>
    <path d="M-18 4H23" stroke-width="4"/>
  </g>`;
}

function orchardScene(forecast: Forecast): string {
  const beads = Array.from({ length: forecast.reading + 3 }, (_, index) => {
    const x = 44 + (index * 131) % 879;
    const y = 203 + (index * 73) % 256;
    const size = 5 + index % 4;
    return `<path d="M${x} ${y - size}l${size} ${size}l-${size} ${size}l-${size}-${size}Z" fill="${yellow}" stroke="${ink}" stroke-width="1.8"/>
      <path d="M${x} ${y - size - 8}v-${forecast.wind * 3 + 5}" stroke="${blue}" stroke-width="2"/>`;
  }).join('');
  return `<path d="M0 367Q202 276 424 366T960 343V620H0Z" fill="${pale}" stroke="${blue}" stroke-width="3"/>
    <g opacity=".55">${glassTree(90, 363, .5)}${glassTree(295, 340, .56)}${glassTree(626, 365, .6)}${glassTree(865, 340, .45)}</g>
    <path d="M0 429Q191 359 398 433T960 412V620H0Z" fill="${ivory}" stroke="${ink}" stroke-width="3"/>
    <path d="M0 488Q226 394 443 480T960 459M0 518Q226 424 443 510T960 489M0 548Q226 454 443 540T960 519" fill="none" stroke="${blue}" stroke-width="2"/>
    ${glassTree(76, 440, .76)}
    ${glassTree(244, 455, 1.03)}
    ${glassTree(473, 430, 1.14)}
    ${glassTree(688, 469, .92)}
    ${glassTree(877, 439, .87)}
    <path d="M960 569C766 564 805 491 615 494S388 547 273 519 109 484 0 515V579C192 548 175 594 363 590S600 542 733 570 875 611 960 613Z" fill="${blue}" stroke="${ink}" stroke-width="3"/>
    <path d="M5 547C182 513 186 564 343 557S590 507 711 533 835 584 960 590" fill="none" stroke="${yellow}" stroke-width="3" stroke-dasharray="7 13"/>
    ${beads}
    ${callout(464, 181, 1)}
    ${callout(363, 382, 2)}
    ${callout(758, 567, 3)}`;
}

function desertScene(forecast: Forecast): string {
  const sound = Array.from({ length: forecast.reading }, (_, index) => {
    const radius = 64 + index * 16;
    return `<path d="M${330 - radius} 362Q330 ${362 - radius * 1.6} ${330 + radius} 362" fill="none" stroke="${index % 3 === 0 ? yellow : blue}" stroke-width="${index % 3 === 0 ? 5 : 2}"/>`;
  }).join('');
  const grains = Array.from({ length: forecast.wind * 4 }, (_, index) => {
    const x = 40 + (index * 149) % 887;
    const y = 260 + (index * 53) % 218;
    return `<path d="M${x} ${y}l${9 + forecast.wind} -4" stroke="${index % 2 ? ink : blue}" stroke-width="2" opacity=".7"/>`;
  }).join('');
  return `<path d="M0 395Q195 220 393 365T960 349V620H0Z" fill="${pale}" stroke="${ink}" stroke-width="3"/>
    ${sound}
    <path d="M0 441Q188 277 360 377T624 450 960 334V620H0Z" fill="${yellow}" stroke="${ink}" stroke-width="4"/>
    <path d="M0 450Q208 359 361 384L520 480 181 561Z" fill="${ivory}"/>
    <path d="M0 552Q187 487 290 418C486 549 666 351 960 464V620H0Z" fill="${blue}" stroke="${ink}" stroke-width="4"/>
    <path d="M290 418C343 506 471 560 592 620H0V552Q183 491 290 418Z" fill="${ivory}"/>
    <g fill="none" stroke="${blue}" stroke-width="2">
      <path d="M0 572Q164 520 292 445M0 590Q164 538 304 467M0 607Q180 555 319 489"/>
      <path d="M471 408Q625 496 827 375M486 425Q650 510 867 379M500 442Q670 527 910 388"/>
    </g>
    <g fill="none" stroke="${pale}" stroke-width="2">
      <path d="M487 553Q703 434 960 498M525 575Q703 456 960 520M553 598Q735 478 960 542"/>
    </g>
    ${grains}
    ${house(699, 420, .83)}
    <path d="M807 400V230M778 203V250Q807 281 836 250V203M786 399H828" fill="none" stroke="${ink}" stroke-width="8"/>
    <path d="M778 203V248M836 203V248" fill="none" stroke="${yellow}" stroke-width="4"/>
    ${callout(291, 419, 1)}
    ${callout(375, 167, 2)}
    ${callout(700, 451, 3)}`;
}

function marshScene(forecast: Forecast): string {
  const lag = forecast.reading * 8;
  const tree = `<path d="M269 365 283 298 271 247 292 208 286 151M282 295 326 269 340 221M274 257 236 222 229 186M291 207 321 184 327 149" fill="none" stroke-width="12" stroke-linejoin="round"/>
    <path d="M205 367Q275 346 350 368" fill="none" stroke-width="7"/>`;
  const reeds = [78, 107, 155, 502, 530, 748, 790, 839, 875].map((x, index) => {
    const y = 399 + index % 3 * 24;
    return `<path d="M${x} ${y}q-18-44-6-${70 + index % 3 * 15}M${x} ${y}q24-44 25-61M${x} ${y}q-27-25-32-51" fill="none" stroke="${ink}" stroke-width="5"/>
      <path d="M${x - 5} ${y - 82}v19M${x + 25} ${y - 69}v14" stroke="${blue}" stroke-width="8"/>`;
  }).join('');
  const fog = Array.from({ length: forecast.veils }, (_, index) => {
    const y = 160 + index * 23;
    return `<path d="M-40 ${y}C173 ${y - 56} 317 ${y + 29} 508 ${y - 8}S754 ${y + 24} 1000 ${y - 29}" fill="none" stroke="${ivory}" stroke-width="${18 + index % 3 * 6}" opacity="${.18 + index % 3 * .09}"/>`;
  }).join('');
  return `<path d="M0 361Q86 328 191 359T401 352 608 360 797 346 960 362V620H0Z" fill="${ink}"/>
    <path d="M0 369H960M0 414H960M0 479H960M0 548H960" stroke="${pale}" stroke-width="1.5" opacity=".48"/>
    <path d="M0 360Q118 299 195 361T394 362M633 362Q750 305 960 358" fill="${blue}"/>
    ${fog}
    <g stroke="${blue}" opacity=".85" transform="translate(${lag} 590) scale(1 -.6)">${tree}</g>
    <g stroke="${ink}">${tree}</g>
    <path d="M0 473 558 418 592 439 0 505Z" fill="${ivory}" stroke="${ink}" stroke-width="3"/>
    <path d="M45 469 60 498M115 462 130 490M185 455 202 481M255 448 274 474M325 441 345 466M398 434 418 460M470 427 490 450" stroke="${ink}" stroke-width="3"/>
    <path d="M0 487 576 429" stroke="${blue}" stroke-width="3"/>
    ${reeds}
    ${house(692, 361, .68)}
    <path d="M283 539H${283 + lag}m-13-9 13 9-13 9M283 539l13-9m-13 9 13 9" fill="none" stroke="${yellow}" stroke-width="4"/>
    <path d="M283 520V556M${283 + lag} 520V556" stroke="${yellow}" stroke-width="2" stroke-dasharray="4 5"/>
    <path d="M282 378H${282 + lag}" stroke="${yellow}" stroke-width="2" stroke-dasharray="4 7"/>
    ${callout(339, 198, 1)}
    ${callout(343 + lag, 490, 2)}
    ${callout(798, 365, 3)}`;
}

function rangeScene(forecast: Forecast): string {
  const snow = Array.from({ length: 7 + forecast.reading * 3 }, (_, index) => {
    const x = 146 + (index * 71) % 615;
    const ascent = (index * 37) % (45 + forecast.reading * 24);
    const y = 519 - ascent;
    return `<path d="M${x - 5} ${y}h10M${x} ${y - 5}v10M${x - 3} ${y - 3}l6 6" stroke="${index % 3 ? blue : ink}" stroke-width="2.4"/>
      ${index % 3 === 0 ? `<path d="M${x} ${y + 12}v18" stroke="${yellow}" stroke-width="4"/>` : ''}`;
  }).join('');
  const ladder = Array.from({ length: 12 }, (_, index) => `<path d="M805 ${507 - index * 21}h52" stroke="${index < forecast.reading ? yellow : pale}" stroke-width="${index < forecast.reading ? 8 : 4}"/>`).join('');
  return `<path d="M-95 565 149 204 271 347 438 124 571 340 735 169 994 572Z" fill="${pale}" stroke="${blue}" stroke-width="3"/>
    <path d="M-83 577 258 83 375 317 473 188 570 394 698 65 1005 576Z" fill="${ivory}" stroke="${ink}" stroke-width="4"/>
    <path d="M258 83 291 515 375 317ZM473 188 422 565 570 394ZM698 65 705 573 1005 576Z" fill="${blue}" stroke="${ink}" stroke-width="3"/>
    <path d="M-1 461 122 383 196 352 258 211M21 489 135 413 208 384 263 251M44 513 145 445 214 415 268 285" fill="none" stroke="${blue}" stroke-width="2"/>
    <path d="M584 422 624 397 694 276M571 467 633 430 698 320M559 513 642 468 702 365" fill="none" stroke="${blue}" stroke-width="2"/>
    <path d="M769 249 753 367 822 447 876 486M796 302 782 374 849 444 907 488M822 351 812 381 876 442 931 482" fill="none" stroke="${pale}" stroke-width="2"/>
    <path d="M0 578Q253 530 448 568T960 561V620H0Z" fill="${ivory}" stroke="${ink}" stroke-width="3"/>
    <path d="M181 534Q221 482 212 ${496 - forecast.reading * 22}m-12 19 12-19 13 17" fill="none" stroke="${yellow}" stroke-width="8"/>
    <path d="M355 533Q405 481 412 ${501 - forecast.reading * 17}m-13 17 13-17 10 20" fill="none" stroke="${yellow}" stroke-width="6"/>
    ${snow}
    <path d="M803 531V258H861V531" fill="${ink}" stroke="${ink}" stroke-width="5"/>
    ${ladder}
    ${house(663, 561, .65)}
    ${callout(497, 276, 1)}
    ${callout(288, 420, 2)}
    ${callout(833, 221, 3)}`;
}

function shelfScene(forecast: Forecast): string {
  const threads = Array.from({ length: 1 + Math.ceil(forecast.reading / 2) }, (_, index) => {
    const x = 43 + index * 88;
    const end = 164 + forecast.reading * 11 + index % 3 * 17;
    return `<path d="M${x} -25C${x + 113} 95 ${x - 67} 116 ${x + 52} ${end}" fill="none" stroke="${index % 2 ? blue : yellow}" stroke-width="${16 + index % 3 * 8}" opacity="${index % 2 ? '.7' : '.9'}"/>
      <path d="M${x + 12} -25C${x + 125} 95 ${x - 55} 116 ${x + 64} ${end}" fill="none" stroke="${ivory}" stroke-width="2"/>`;
  }).join('');
  return `<path d="M0 426Q257 441 429 430T960 431V620H0Z" fill="${ink}"/>
    ${threads}
    <path d="M0 336 152 329 289 352 413 345 534 377 651 389 819 446 710 465 748 513 538 540 484 577 315 559 199 583 0 562Z" fill="${ivory}" stroke="${ink}" stroke-width="4"/>
    <path d="M0 374 197 406 319 410 484 450 710 465 748 513 538 540 484 577 315 559 199 583 0 562Z" fill="${pale}"/>
    <path d="M197 406 199 583 315 559 319 410 405 509 484 577 484 450 538 540 644 494 710 465" fill="${blue}" stroke="${ink}" stroke-width="3"/>
    <path d="M0 373 197 406 319 410 484 450 710 465 819 446M55 391 56 548M119 401 123 566M254 429 250 553M555 466 562 513" fill="none" stroke="${ink}" stroke-width="2"/>
    <path d="M0 340 135 350 238 370 337 368" fill="none" stroke="${ink}" stroke-width="4"/>
    <path d="M58 340V317M142 350V324M224 367V341M311 368V342" stroke="${ink}" stroke-width="3"/>
    ${house(355, 358, 1.04)}
    <path d="M331 321H381M331 327H381" stroke="${ink}" stroke-width="4"/>
    <path d="M474 400V320M457 327H492M457 359H492" stroke="${ink}" stroke-width="4"/>
    <path d="M461 336H488M461 343H488M461 350H488" stroke="${yellow}" stroke-width="5"/>
    <g fill="none" stroke="${pale}" stroke-width="2">
      <path d="M769 526H923M707 551H856M42 603H241M587 590H808M814 579H960"/>
    </g>
    ${callout(573, 167, 1)}
    ${callout(356, 408, 2)}
    ${callout(792, 471, 3)}`;
}

const sceneRenderers = {
  stair: stairScene,
  orchard: orchardScene,
  desert: desertScene,
  marsh: marshScene,
  range: rangeScene,
  shelf: shelfScene,
} satisfies Record<Destination['landscape'], (forecast: Forecast) => string>;

export function renderLandscape(destination: Destination, watchId: WatchId): string {
  const forecast = destination.forecasts[watchId];
  const watch = watches.find((item) => item.id === watchId)!;
  const ticks = Array.from({ length: 32 }, (_, index) => {
    const x = index * 30;
    return `<path d="M${x} 0v${index % 4 ? 7 : 13}M${x} 620v-${index % 4 ? 7 : 13}" stroke="${ink}" stroke-width="2"/>`;
  }).join('');
  return `<svg class="weather-landscape-svg" viewBox="0 0 960 620" role="img"
    aria-labelledby="weather-scene-title weather-scene-description"
    data-weather-scene="${destination.id}" data-watch="${watchId}" data-reading="${forecast.reading}">
    <title id="weather-scene-title">${escapeMarkup(destination.name)} at ${escapeMarkup(watch.name)}: ${escapeMarkup(forecast.condition)}</title>
    <desc id="weather-scene-description">${escapeMarkup(destination.diagramDescription)} This is an original fictional landscape, not a real weather chart. The selected ${escapeMarkup(watch.time)} watch shows ${forecast.reading} ${escapeMarkup(destination.measure.unit)}, ${forecast.wind} ribbons of wind pull, and ${forecast.veils} veils of sky opacity. Yellow marks the measured phenomenon. Numbered features are explained below the illustration.</desc>
    <defs>
      <pattern id="weather-sky-grid" width="60" height="60" patternUnits="userSpaceOnUse">
        <path d="M60 0H0V60" fill="none" stroke="${blue}" stroke-width="1"/>
      </pattern>
      <clipPath id="weather-scene-clip"><path d="M0 0H960V620H0Z"/></clipPath>
    </defs>
    <g clip-path="url(#weather-scene-clip)">
      ${sky(watchId, destination.landscape === 'stair')}
      ${sceneRenderers[destination.landscape](forecast)}
    </g>
    ${ticks}
    <path d="M1 1H959V619H1Z" fill="none" stroke="${ink}" stroke-width="2"/>
  </svg>`;
}

export function renderAtlasMap(selectedId: string): string {
  const selected = destinations.find((destination) => destination.id === selectedId)!;
  const markers = destinations.map((destination) => {
    const [x, y] = destination.map;
    const active = destination.id === selectedId;
    return `<g transform="translate(${x} ${y})">
      ${active ? `<circle r="25" fill="none" stroke="${yellow}" stroke-width="3"/>` : ''}
      <circle r="18" fill="${active ? yellow : ivory}" stroke="${ink}" stroke-width="2"/>
      <text y="8" text-anchor="middle" font-family="Arial, sans-serif" font-size="23" font-weight="700" fill="${ink}">${Number(destination.number)}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 380 310" role="img" aria-labelledby="weather-map-title weather-map-description">
    <title id="weather-map-title">The six-station expedition chart</title>
    <desc id="weather-map-description">An invented archipelago chart, not to scale. Station ${selected.number}, ${escapeMarkup(selected.name)}, is highlighted. The numbered destination links below this map open each station.</desc>
    <defs>
      <pattern id="weather-map-grid" width="38" height="38" patternUnits="userSpaceOnUse">
        <path d="M38 0H0V38" fill="none" stroke="${pale}" stroke-width=".75"/>
      </pattern>
    </defs>
    <path d="M0 0H380V310H0Z" fill="${blue}"/>
    <path d="M0 0H380V310H0Z" fill="url(#weather-map-grid)" opacity=".6"/>
    <g fill="none" stroke="${pale}" stroke-width="1" opacity=".6">
      <path d="M34 266C-13 184 44 66 146 32S335 82 347 194 292 308 184 276 57 327 34 266Z"/>
      <path d="M43 249C5 182 63 78 148 45S319 83 332 189 287 294 187 264 72 303 43 249Z"/>
      <path d="M56 235C24 183 74 91 153 58S304 87 317 189 278 280 190 250 86 282 56 235Z"/>
    </g>
    <path d="M137 42 163 37 185 61 180 87 207 99 216 121 193 142 207 163 192 201 161 211 143 193 125 201 112 182 134 156 120 128 136 107 128 82Z" fill="${ivory}" stroke="${ink}" stroke-width="2"/>
    <path d="M228 87 251 90 269 119 259 145 230 151 215 132Z" fill="${pale}" stroke="${ink}" stroke-width="2"/>
    <path d="M267 181 303 183 336 215 328 245 300 268 276 254 254 225Z" fill="${ivory}" stroke="${ink}" stroke-width="2"/>
    <path d="M60 90 85 83 104 104 97 135 66 144 49 122ZM70 198 93 187 114 212 100 247 80 256 63 235Z" fill="${pale}" stroke="${ink}" stroke-width="2"/>
    <path d="M153 58 167 81 144 106 153 130M168 152 157 176 176 194M283 209 311 233 289 247" fill="none" stroke="${blue}" stroke-width="2"/>
    <path d="M91 222 181 179 298 228 250 124 165 66 77 116" fill="none" stroke="${yellow}" stroke-width="2" stroke-dasharray="3 7"/>
    ${markers}
    <path d="M344 59V24m-7 13 7-13 7 13" fill="none" stroke="${ivory}" stroke-width="2"/>
    <text x="344" y="80" fill="${ivory}" text-anchor="middle" font-family="Arial, sans-serif" font-size="18">N</text>
    <path d="M20 282H81M20 277V286M50 277V286M81 277V286" stroke="${ivory}" stroke-width="2"/>
  </svg>`;
}
