import type { IllustrationId } from './data';

const dimension = '<path class="scale-art-dimension" d="M76 295H484M76 287V303M484 287V303"/>';
const verticalDimension = '<path class="scale-art-dimension" d="M456 35V283M448 35H464M448 283H464"/>';

function helix(): string {
  const strand = (offset: number) => Array.from({ length: 81 }, (_, index) => {
    const y = 28 + index * 3;
    const x = 280 + 57 * Math.sin((y - 28) / 28 + offset);
    return `${index ? 'L' : 'M'}${x.toFixed(2)} ${y}`;
  }).join(' ');
  const rungs = Array.from({ length: 16 }, (_, index) => {
    const y = 35 + index * 15;
    const reach = 57 * Math.sin((y - 28) / 28);
    return `<path d="M${280 - reach} ${y}H${280 + reach}"/>`;
  }).join('');
  return `<g class="scale-art-fine">${rungs}</g>
    <path class="scale-art-ribbon" d="${strand(0)}"/>
    <path class="scale-art-ribbon scale-art-rust" d="${strand(Math.PI)}"/>
    <path class="scale-art-dimension" d="M220 295H340M220 287V303M340 287V303"/>`;
}

function quarter(): string {
  const edge = Array.from({ length: 48 }, (_, index) => {
    const angle = index * Math.PI / 24;
    const x1 = 280 + 98 * Math.cos(angle);
    const y1 = 153 + 98 * Math.sin(angle);
    const x2 = 280 + 105 * Math.cos(angle);
    const y2 = 153 + 105 * Math.sin(angle);
    return `<path d="M${x1} ${y1}L${x2} ${y2}"/>`;
  }).join('');
  return `<circle class="scale-art-ochre" cx="280" cy="153" r="112"/>
    <g class="scale-art-fine">${edge}</g><circle cx="280" cy="153" r="88"/>
    <path d="M215 170Q223 211 260 220M345 170Q337 211 300 220"/>
    <path d="M222 188l-17-5m23 17-16 2m28 10-14 7m22-5-1 16M338 188l17-5m-23 17 16 2m-28 10 14 7m-22-5 1 16"/>
    <text class="scale-art-numeral" x="280" y="174" text-anchor="middle">25</text>
    <path d="M257 93h46M257 102h46"/>${dimension}`;
}

function sun(cx = 280, cy = 151, radius = 98): string {
  const rays = Array.from({ length: 24 }, (_, index) => {
    const angle = index * Math.PI / 12;
    return `<path d="M${cx + (radius + 9) * Math.cos(angle)} ${cy + (radius + 9) * Math.sin(angle)}L${cx + (radius + 20) * Math.cos(angle)} ${cy + (radius + 20) * Math.sin(angle)}"/>`;
  }).join('');
  return `<g class="scale-art-rust">${rays}<circle class="scale-art-orange" cx="${cx}" cy="${cy}" r="${radius}"/></g>`;
}

function earth(cx = 280, cy = 153, radius = 107): string {
  const scale = radius / 107;
  return `<g transform="translate(${cx - 280 * scale} ${cy - 153 * scale}) scale(${scale})">
    <circle class="scale-art-sea" cx="280" cy="153" r="107"/>
    <g class="scale-art-land">
      <path d="M206 76l24-13 25 6 9 16-19 16 6 16-16 17-12 2-10 22-12-7-5-21-13-8 6-25z"/>
      <path d="M234 153l19 5 13 24 19 8-5 23-22 22-8-21-11-16 1-20-12-17z"/>
      <path d="M312 64l35 16 10 18 15 5 7 22-22 6-13-10-21 7-6-17-22-7-3-13z"/>
      <path d="M305 125l20 4 17 21-9 21-12 7-10 25-16-12-4-27-13-13 9-23z"/>
      <path d="M344 206l18-5 15 16-15 14-21-9z"/>
    </g>
    <path class="scale-art-fine" d="M177 153h206M190 108q90 28 180 0M190 198q90-28 180 0M280 46c-66 54-66 160 0 214M280 46c66 54 66 160 0 214"/>
  </g>`;
}

function galaxy(): string {
  const stars = Array.from({ length: 85 }, (_, index) => {
    const angle = index * 2.39996;
    const distance = 20 + Math.sqrt(index / 84) * 172;
    const x = 280 + Math.cos(angle) * distance;
    const y = 150 + Math.sin(angle) * distance * 0.61;
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${index % 5 ? 1.6 : 2.5}"/>`;
  }).join('');
  return `<g class="scale-art-orbits">
    <path d="M264 141C184 89 350 44 420 109S360 250 191 218"/>
    <path d="M296 159C376 211 210 256 140 191S200 50 369 82"/>
    <path d="M254 131C161 81 109 163 177 202"/>
    <path d="M306 169C399 219 451 137 383 98"/>
    <path d="M242 125C325 78 393 136 340 173M318 175C235 222 167 164 220 127"/>
    </g><g class="scale-art-stars">${stars}</g>
    <ellipse class="scale-art-orange" cx="280" cy="150" rx="45" ry="13" transform="rotate(25 280 150)"/>
    <ellipse class="scale-art-paper" cx="280" cy="150" rx="16" ry="8" transform="rotate(25 280 150)"/>
    ${dimension}`;
}

const drawings: Record<IllustrationId, string> = {
  dna: helix(),
  bacterium: `<g transform="rotate(-16 280 151)">
    <path class="scale-art-fine" d="M130 126C89 57 64 138 27 83M129 154C81 138 63 175 25 157M135 180C86 227 63 172 28 230M411 128C458 74 483 123 526 86M413 162C459 167 491 224 529 190"/>
    <rect class="scale-art-sage" x="127" y="92" width="290" height="118" rx="59"/>
    <rect x="137" y="102" width="270" height="98" rx="49"/>
    <path class="scale-art-rust" d="M205 132c22-41 21 63 57 30s-25-49-3-31 34 59 50 19 31 30 42 10"/>
    <g class="scale-art-stars"><circle cx="163" cy="153" r="3"/><circle cx="199" cy="175" r="3"/><circle cx="234" cy="117" r="3"/><circle cx="283" cy="182" r="3"/><circle cx="339" cy="115" r="3"/><circle cx="369" cy="184" r="3"/><circle cx="391" cy="143" r="3"/></g>
    </g>${dimension}`,
  blood: `<path class="scale-art-orange" d="M137 151C143 71 245 49 326 76s123 67 84 130-152 73-227 27c-29-18-49-42-46-82Z"/>
    <path d="M145 160C163 216 236 248 316 232s92-54 83-95"/>
    <ellipse class="scale-art-paper" cx="279" cy="147" rx="67" ry="36" transform="rotate(12 279 147)"/>
    <path class="scale-art-rust" d="M204 148c13 48 104 68 148 15M169 143c4-29 27-46 56-53M353 209c20-9 34-23 40-36"/>
    ${dimension}`,
  sand: `<path class="scale-art-ochre" d="M169 66l118-34 109 69 35 99-80 66-141-15-70-103z"/>
    <path d="M169 66l68 65 50-99M237 131l159-30-53 83 88 16M237 131l-27 120 133-67 8 82M140 148l97-17M287 32l56 152"/>
    <g class="scale-art-fine"><path d="M185 90l42 44M180 102l40 42M175 114l37 39M170 126l34 37M272 209l55-27M281 219l52-27M290 229l46-26M369 136l30 50M365 150l21 35"/></g>
    ${dimension}`,
  quarter: quarter(),
  tennis: `<circle class="scale-art-sage" cx="280" cy="151" r="111"/>
    <path class="scale-art-seam" d="M204 70C312 115 212 224 324 253M343 59C255 118 390 172 345 241"/>
    <path class="scale-art-fine" d="M186 120l11-12m-13 28 9-8m169 66 10-10m-18 28 9-9m-137 12 8-8"/>
    ${dimension}`,
  whale: `<path class="scale-art-fine" d="M57 231h113M381 235h112M38 247h54M127 259h150"/>
    <path class="scale-art-sea" d="M65 139C117 95 224 96 311 132c59 24 107 41 145 14l-3-35 31 23 41-28-9 43-38 16c-19 44-117 64-192 58-88-7-168-31-213-51-18-8-22-20-8-33Z"/>
    <path class="scale-art-paper" d="M63 158c87 36 163 54 244 49 65-4 98-10 135-32-36 40-117 54-177 42-88-17-148-30-192-45-9-4-14-8-10-14Z"/>
    <path class="scale-art-sea" d="M230 175c16 29 21 59 59 79l-4-57"/>
    <path d="M315 130l-2-19 27 28M59 151c49 10 94 12 123 5"/>
    <circle class="scale-art-stars" cx="112" cy="139" r="4"/>
    <path class="scale-art-fine" d="M103 175c25 17 61 26 99 33M122 174c32 17 53 23 80 27M145 174c20 10 39 17 61 21"/>
    <path class="scale-art-rust" d="M156 99c4-27-21-33-34-42m37 40c5-27 12-39 28-50m-31 41c-4-26-1-43 1-54"/>
    ${dimension}`,
  tree: `<path class="scale-art-sage" d="M278 29c-35-2-33 21-61 25-9 2-3 18-27 24-23 7-18 21-37 30-20 11-7 27-19 40-19 24-3 35 14 40-1 26 24 27 43 23-2 23 39 21 61 13 26 20 48 10 59 0 28 11 54 5 63-13 36 6 51-16 29-35 28-31 1-47-17-53 6-30-25-27-36-37-5-29-32-11-43-31-9-11-15-17-29-26Z"/>
    <path class="scale-art-ochre" d="M259 86l-3 196-29 11h106l-26-13-14-193-11 80z"/>
    <path d="M266 124l4 159M284 177l9 104M269 188l-42-30M293 153l47-23M290 208l43-29M279 150l-26-32"/>
    <path class="scale-art-fine" d="M152 174l43-22 27 8M183 105l24 20 26-13M333 91l-11 26M338 158l39 15M154 207l44-14M78 293h114M352 293h69"/>
    ${verticalDimension}`,
  tower: `<path class="scale-art-ochre" d="M274 56h12c-1 87 7 173 103 229h-60c-15-40-33-62-49-62s-34 22-49 62h-60c96-56 104-142 103-229Z"/>
    <path class="scale-art-paper" d="M280 106l-13 75h26zM254 202h52l-26-12z"/>
    <path d="M280 26v30M268 58h24M260 111h40M246 177h68M224 202h112M183 269h49M328 269h49"/>
    <path class="scale-art-fine" d="M268 116l26 20-30 17 33 19M262 157l-15 24 24 20M299 157l15 24-24 20M238 207l-22 30 29-3-50 38M322 207l22 30-29-3 50 38"/>
    <path d="M146 286h267"/>${verticalDimension}`,
  marathon: `<g class="scale-art-fine"><path d="M63 61h133v78H63zM337 74h145v78H337zM153 204h165v54H153zM224 39v76M275 39v76M48 188h58M369 218h130M415 185v81"/></g>
    <path class="scale-art-route" d="M68 247c74 0 16-86 104-83s56-124 123-120 3 147 67 126 78 12 119-67"/>
    <circle class="scale-art-paper" cx="68" cy="247" r="8"/>
    <path d="M479 104V53h31v28h-31"/>
    <path class="scale-art-stars" d="M480 53h10v9h-10zM500 53h10v9h-10zM490 62h10v9h-10zM480 71h10v9h-10zM500 71h10v9h-10z"/>
    ${dimension}`,
  moon: `<circle class="scale-art-ochre" cx="280" cy="150" r="110"/>
    <path class="scale-art-paper" d="M229 69c-9 12-2 26-21 29l-15 35 17 22-10 29 24 24 30-5 2-33 27-11-17-41 4-31z"/>
    <path class="scale-art-soft" d="M310 79l27 12 20 43-27 6-28-19zM322 179l39-14 21 31-17 33-34-14z"/>
    <g><circle cx="302" cy="187" r="22"/><circle cx="302" cy="187" r="14"/><circle cx="331" cy="107" r="14"/><circle cx="236" cy="130" r="12"/><circle cx="254" cy="223" r="9"/><circle cx="303" cy="71" r="7"/><circle cx="194" cy="168" r="6"/><circle cx="360" cy="169" r="8"/></g>
    ${dimension}`,
  earth: `${earth()}${dimension}`,
  'moon-distance': `${earth(126, 159, 65)}
    <circle class="scale-art-ochre" cx="445" cy="159" r="24"/>
    <circle cx="453" cy="152" r="6"/><circle cx="439" cy="168" r="5"/>
    <path class="scale-art-dashed" d="M126 159H445"/>
    <path class="scale-art-dimension" d="M126 249H445M126 241V257M445 241V257M126 231v-22M445 231v-39"/>`,
  sun: `${sun()}
    <path class="scale-art-rust" d="M213 121c31-45 105-34 128 6M227 195c31 19 56 23 88 7M243 88l9 9m71 62 15 4m-99-14-8 3"/>
    <ellipse class="scale-art-stars" cx="310" cy="116" rx="6" ry="4"/>
    <ellipse class="scale-art-stars" cx="239" cy="164" rx="4" ry="3"/>${dimension}`,
  au: `<ellipse class="scale-art-dashed" cx="280" cy="156" rx="205" ry="100" transform="rotate(-10 280 156)"/>
    ${sun(184, 164, 42)}${earth(443, 112, 25)}
    <path class="scale-art-dimension" d="M184 164L443 112M179 154l9 20M438 102l9 20"/>
    <path class="scale-art-fine" d="M77 242h61M110 266h91M383 48h45"/>`,
  proxima: `${sun(91, 157, 47)}
    <g class="scale-art-rust"><circle class="scale-art-orange" cx="463" cy="157" r="21"/><path d="M463 121v-11M463 193v11M427 157h-11M499 157h11M436 130l-8-8M490 184l8 8M490 130l8-8M436 184l-8 8"/></g>
    <path class="scale-art-dashed" d="M160 157h84M313 157h102"/>
    <path class="scale-art-dimension" d="M257 139l-12 36m36-36-12 36m36-36-12 36M91 257H463M91 249v16M463 249v16"/>`,
  galaxy: galaxy(),
};

/** Original decorative plates: 560 × 330 viewBox units, individually rescaled, no physical coordinate system. */
export function illustration(id: IllustrationId): string {
  return `<svg class="scale-art" viewBox="0 0 560 330" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <g class="scale-art-registration"><path d="M20 36v12m-6-6h12M540 36v12m-6-6h12M20 288v12m-6-6h12M540 288v12m-6-6h12"/></g>
    <g class="scale-art-drawing">${drawings[id]}</g>
  </svg>`;
}
