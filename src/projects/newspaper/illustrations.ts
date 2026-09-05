import { escapeMarkup } from '../../core/page';
import type { IllustrationId } from './data';

const repeat = (count: number, draw: (index: number) => string): string =>
  Array.from({ length: count }, (_, index) => draw(index)).join('');

const drawings: Record<IllustrationId, () => string> = {
  cloud: () => `
    <g class="nw-svg-fine">
      ${repeat(7, (i) => `<path d="M31 ${63 + i * 19}h${75 + (i % 3) * 18}M${722 - (i % 2) * 15} ${158 + i * 18}h48"/>`)}
      <path d="M34 265h95m559-12h74M40 277h42m-53 11h79"/>
    </g>
    <g class="nw-svg-accent"><circle cx="697" cy="74" r="42"/><path d="M666 92a35 35 0 0 0 55-41"/></g>
    <path d="M47 430h718M40 439h732"/>
    <path class="nw-svg-wash" d="M49 337l35-29 44 28v88H49zM127 356l38-23 49 23v68h-87zM212 319l46-37 45 36v106h-91zM483 337l41-28 39 28v87h-80zM564 362l49-31 45 31v62h-94zM657 326l46-35 49 35v98h-95z"/>
    <g class="nw-svg-fine">
      ${repeat(6, (i) => `<path d="M${58 + i * 12} 347v70M${221 + i * 12} 330v87M${666 + i * 12} 340v78"/>`)}
      ${repeat(4, (i) => `<path d="M137 ${367 + i * 12}h68M575 ${371 + i * 12}h70M494 ${350 + i * 15}h57"/>`)}
    </g>
    <path class="nw-svg-paper" d="M284 347l108-46 108 46v13H284zm11 13h193v64H295z"/>
    <path d="M286 347h211m-101-33 67 28H320zM373 424v-44a20 20 0 0 1 40 0v44"/>
    ${repeat(4, (i) => `<path d="M${314 + i * 49} 367v50m7-50v50"/>`)}
    <g class="nw-svg-fine">${repeat(6, (i) => `<path d="M${330 + i * 20} 327l-8 15"/>`)}</g>
    <path class="nw-svg-paper" d="M76 273h20v151H76zM697 270h20v154h-20z"/>
    <g class="nw-svg-fine">
      ${repeat(7, (i) => `<path d="M76 ${279 + i * 20}l20 20m601-20 20 20M96 ${279 + i * 20}l-20 20m641-20-20 20"/>`)}
    </g>
    <path d="M85 277l93-92m529 91-88-89M287 356l38-134m252 135-30-131"/>
    <circle cx="86" cy="268" r="8"/><circle cx="707" cy="268" r="8"/>
    <path class="nw-svg-paper" d="M161 151c-13-32 25-62 61-51 14-48 71-62 108-29 36-47 96-37 115-4 38-19 92-9 106 28 50-13 97 9 95 51 40 7 49 42 21 60-22 17-48 19-74 12-30 37-73 37-105 15-37 28-84 23-111-2-45 24-80 10-99-15-51 20-89-1-89-26-29 2-48-11-47-28 1-18 24-24 42-21z"/>
    <path d="M180 148c22-26 53-29 76-11m-27-34c27-12 56-8 71 9m35-39c24-5 45 3 60 23m54-23c22 14 31 28 32 46m68-20c-25 1-37 12-46 26m85-6c-12 7-21 18-23 32m68-1c-27-8-47 0-58 17M204 189c43 26 90 5 119 12s53 24 91 7 70 15 109-4 64 3 101-13"/>
    <g class="nw-svg-fine">
      ${repeat(35, (i) => `<path d="M${212 + i * 12} ${167 + Math.sin(i * 0.5) * 7}l-11 ${22 + Math.cos(i * 0.3) * 6}"/>`)}
      <path d="M236 89c17-21 42-26 62-18m60-12c17-12 39-10 51-3M48 451c81-8 107 6 172 0s104-3 164 1 102-10 168-3 123 5 201-1M93 460h92m50 1h131m53 0h92m45-1h130"/>
    </g>
    <g class="nw-svg-accent"><path d="M548 391h24v33h-24z"/><circle cx="560" cy="400" r="3"/><path d="M559 410v7"/></g>
    <path d="M335 405h25v8h-25m5 0v11m15-11v11M436 405h25v8h-25m5 0v11m15-11v11"/>`,
  seeds: () => `
    <g class="nw-svg-fine">
      <path d="M22 299c95-50 126-22 179-54 77-44 92 7 167-3s103-21 157 13 134-19 252 32M29 319c93-11 120-7 167-12m403 1c67-4 117 6 178 17"/>
      <ellipse cx="113" cy="350" rx="61" ry="16"/><path d="M64 350c32-14 64-14 98 0"/><ellipse cx="685" cy="384" rx="59" ry="13"/><ellipse cx="691" cy="387" rx="38" ry="5"/>
      ${repeat(8, (i) => `<path d="M${44 + i * 89} ${411 + (i % 3) * 13}l23-2m-13 8h37"/>`)}
    </g>
    <g class="nw-svg-accent"><circle cx="673" cy="91" r="40"/><path class="nw-svg-solid" d="M685 53a40 40 0 0 0 0 76c-22-25-22-50 0-76z"/></g>
    <path class="nw-svg-paper" d="M191 328V220a205 155 0 0 1 410 0v108l-27 17H217z"/>
    ${repeat(5, (i) => `<path class="nw-svg-fine" d="M${195 + i * 5} 250v-30a${201 - i * 5} ${151 - i * 5} 0 0 1 ${402 - i * 10} 0v30"/>`)}
    <path d="M215 327V221a181 131 0 0 1 362 0v106M218 324h356M254 321V183m284 138V183M323 320V107m146 213V108M225 174h342"/>
    <path class="nw-svg-wash" d="M233 315h324v28H233zm0 34h324v86H233z"/>
    <path d="M244 315l8-25h291l9 25M250 300h294"/>
    <path d="M395 290c0-58 15-81 0-138m2 56-43-23m48 49 48-33m-55-22 24-30"/>
    <path class="nw-svg-paper" d="M354 185c-39 0-54-20-58-38 30 0 55 7 58 38zm96 16c33 0 52-18 54-38-30 0-51 11-54 38zm-54-35c-26-20-30-47-14-69 19 21 26 44 14 69zm23-6c-4-27 14-51 39-51-4 27-13 44-39 51z"/>
    <g class="nw-svg-fine"><path d="M354 185l-41-29m137 45 39-28m-93-7-12-53m35 47 29-40M378 291l-15 19m30-18-4 18m13-18 18 18"/></g>
    ${repeat(4, (row) => repeat(6, (col) => `<rect x="${242 + col * 51}" y="${357 + row * 18}" width="43" height="13" rx="1"/><path class="nw-svg-fine" d="M${258 + col * 51} ${363 + row * 18}h10"/>`))}
    <g class="nw-svg-accent"><path d="M500 252c-6-8-1-16 5-17 9 3 11 13 5 18-4 3-7 1-10-1zM519 276c-7-7-2-15 4-17 10 2 11 12 6 17-3 3-7 3-10 0z"/></g>
    <path d="M192 344h409m-372 94h337m-339-97-20 33m358-33 20 33"/>`,
  train: () => `
    <path class="nw-svg-fine" d="M28 115h744M28 125h744m-678-10v61m614-61v61M40 381h718M32 419h740"/>
    ${repeat(27, (i) => `<path class="nw-svg-fine" d="M${40 + i * 27} 405l-13 14"/>`)}
    <path class="nw-svg-wash" d="M41 335h717v34H41z"/>
    <path class="nw-svg-paper" d="M60 310V208q0-37 37-37h552q54 0 80 45l25 58v36z"/>
    <path d="M63 188h602q25 0 40 24M60 288h689M82 304h644M128 171v-29h82v29m328 0v-29h65v29"/>
    <g class="nw-svg-fine">${repeat(17, (i) => `<path d="M${142 + i * 26} 155h15m-15 6h15"/>`)}</g>
    <path class="nw-svg-wash" d="M89 211h81v54H89zm97 0h45v54h-45zm132 0h75v54h-75zm91 0h75v54h-75zm91 0h48v54h-48zm130 0h31q25 0 36 27l11 27h-78z"/>
    <path d="M247 202h55v99h-55zm13 12h28v49h-28m14-61v99M564 202h49v99h-49zm12 12h25v49h-25m13-61v99"/>
    <g class="nw-svg-fine">
      ${repeat(4, (i) => `<path d="M${99 + i * 17} 222l13 31M${331 + i * 17} 222l13 31M${420 + i * 17} 222l13 31"/>`)}
      <path d="M99 276h63m173 0h51m32 0h60m156 0h72"/>
    </g>
    <g class="nw-svg-accent"><path d="M246 195h58m259 0h52M247 310h56m259 0h53"/><path d="M242 382h69m246 0h65"/></g>
    <path d="M100 311v18h96v-18m405 0v18h96v-18M94 351h104m396 0h108"/>
    ${repeat(4, (i) => {
      const x = [111, 179, 611, 680][i];
      return `<circle class="nw-svg-paper" cx="${x}" cy="354" r="19"/><circle cx="${x}" cy="354" r="8"/>`;
    })}
    <path d="M215 334h361m-340-17v17m319-17v17M230 319l8 5 8-7 8 7 8-7 8 7 8-7 8 7 8-7 8 7m179-5 8 5 8-7 8 7 8-7 8 7 8-7 8 7 8-7 8 7"/>
    <path d="M45 395h713"/>
    <g class="nw-svg-fine">${repeat(13, (i) => `<path d="M${61 + i * 54} 381v13m-18 0v10"/>`)}</g>
    <path class="nw-svg-fine" d="M108 73h99m28 0h28m345 2h128M28 444h743"/>
    <path d="M343 369v10m-4-5h8M418 369v10m-4-5h8"/>`,
  river: () => `
    <g class="nw-svg-fine">
      ${repeat(9, (i) => `<path d="M28 ${36 + i * 18}c35-10 47 10 82 0s47 10 81 0m-156 ${275 + i * 8}c35-10 47 10 82 0s47 10 81 0"/>`)}
      ${repeat(6, (i) => `<path d="M654 ${52 + i * 24}c30-8 45 7 99-1M678 ${301 + i * 24}c28-8 40 6 74-1"/>`)}
    </g>
    <path class="nw-svg-wash" d="M26 204h745v82H26z"/>
    <g class="nw-svg-fine">
      ${repeat(3, (row) => `<path d="M28 ${218 + row * 24}h740"/>${repeat(13, (col) => `<path d="M${35 + col * 59 + (row % 2) * 27} ${204 + row * 24}v24"/>`)}`)}
    </g>
    <path class="nw-svg-paper" d="M250 164h197v165H250z"/>
    <path d="M266 166v161m163-161v161M266 213h163M266 274h163M280 216l63 24 70-24m-133 54 63-24 70 24"/>
    <g class="nw-svg-fine">${repeat(7, (i) => `<path d="M${277 + i * 23} 179v23m0 82v30"/>`)}</g>
    <path class="nw-svg-paper" d="M526 29c-1 71-26 96-28 145-3 46 90 61 96 100 7 47-61 84-58 165h72c-5-71 59-116 58-166-2-70-100-74-98-105 3-42 31-83 25-139z"/>
    <path d="M543 30c1 76-28 107-28 143 0 52 99 58 100 104 2 45-65 87-59 161m19-408c3 66-23 105-25 139-4 43 99 54 98 106 0 53-66 98-58 163"/>
    <path d="M517 145l19 7m-21 29 19-3m30 38-9 17m42 5-11 14m30 21-17 2m10 33-17-7m-6 36-20-7m9 31-19-5"/>
    <path class="nw-svg-accent nw-svg-route" d="M558 42c1 68-24 102-24 129 0 52 99 61 98 105-1 48-64 93-60 145"/>
    <path class="nw-svg-paper" d="M360 86h114v76H360z"/>
    <path d="M350 87l67-36 66 36zm25 21h20v25h-20zm64 0h20v25h-20zM409 162v-48h17v48"/>
    <path class="nw-svg-fine" d="M360 151h44m27 0h42"/>
    <g>
      <path d="M214 113c-34-25-58-19-52 1 7 23 67 15 52 43-11 20-61 7-70 26 16-11 72 5 80-25 7-28-43-26-50-40-7-15 17-15 40-5z"/>
      <path d="M365 365c-25-18-45-16-47 0-2 19 37 17 33 35-4 14-32 10-43 23 16-8 47-1 52-20 6-23-33-26-31-37 2-9 16-7 36-1z"/>
      <path d="M697 151c-22-14-36-6-31 7 5 12 30 8 33 22 3 10-13 19-26 19 20 6 42-6 35-24-5-15-28-16-30-23-1-6 9-5 19-1z"/>
    </g>
    <path d="M72 431h80m-80-5v12m40-12v12m40-12v12"/>`,
  repair: () => `
    <path d="M34 387h733v18H34zm28 19-9 51m682-51 10 51M57 126h669"/>
    <g class="nw-svg-fine"><path d="M81 136h616M77 411h630"/><path d="M347 55v69m8-69v69m24-45v45m13-69v69m26-42v42m14-59v59m15-71v71"/></g>
    <path class="nw-svg-paper" d="M315 217h183v160H315z"/>
    <path d="M327 231h160v45H327zM328 286h113v76H328z"/>
    <g class="nw-svg-fine">
      ${repeat(12, (i) => `<path d="M${334 + i * 9} 291v65"/>`)}
      ${repeat(13, (i) => `<path d="M${336 + i * 11} 241v${i % 3 === 0 ? 16 : 9}"/>`)}
    </g>
    <circle cx="466" cy="307" r="13"/><circle cx="466" cy="345" r="9"/>
    <path d="M347 217v-18h116v18m-104-1v-7h92v7"/>
    <path class="nw-svg-paper" d="M98 378l20-17h100l20 17zm50-18v-79h36v79z"/>
    <circle class="nw-svg-paper" cx="166" cy="202" r="91"/><circle cx="166" cy="202" r="82"/>
    ${repeat(12, (i) => {
      const a = (i * Math.PI) / 6;
      const x = (166 + Math.cos(a) * 81).toFixed(2);
      const y = (202 + Math.sin(a) * 81).toFixed(2);
      return `<path class="nw-svg-fine" d="M166 202L${x} ${y}"/>`;
    })}
    <path class="nw-svg-wash" d="M168 188c-30-40-27-63-4-58 21 4 23 31 10 58m6 17c49-6 68 8 51 25-16 16-39 5-55-17m-19-4c-20 47-42 57-48 33-4-21 17-39 45-42"/>
    <circle class="nw-svg-paper" cx="166" cy="202" r="13"/>
    <path class="nw-svg-paper" d="M554 366c-16-23-21-52-4-83h88c18 28 17 61-3 83z"/>
    <path d="M557 282c0-58 71-58 71 0m-58-1c-1-39 47-39 45 0M542 307l-39-19 14 31 20 12m25-55h70m-42-10v10m-19 7h43"/>
    <g class="nw-svg-fine">${repeat(7, (i) => `<path d="M${555 + i * 12} 300c-6 19-6 37 2 53"/>`)}</g>
    <path d="M675 340h54v37h-54zM681 333h43v8h-43zm0 44h43v7h-43"/>
    ${repeat(5, (i) => `<path class="nw-svg-fine" d="M677 ${346 + i * 6}h48"/>`)}
    <path class="nw-svg-accent" d="M54 76c24-28 42 30 67 0s43 33 70 0 43 29 70 0M523 165c24-26 34 25 55 0s34 29 56 0 38 29 60 0M701 384c-3 44-50 45-62 23"/>
    <path d="M214 368c34 2 13 55 62 54s21-42 49-45M260 331l38 48m-41-51 10-8m-12 6 10-8"/>`,
  shadow: () => `
    <g class="nw-svg-accent"><circle cx="124" cy="83" r="40"/><path d="M124 25v-9m0 135v-9M66 83H55m138 0h-11M84 43l-8-8m88 88 8 8"/></g>
    <path class="nw-svg-fine" d="M216 63h180m48 0h76M232 83h93m243 28h156M270 129h162"/>
    <path class="nw-svg-wash" d="M22 268h55v-71h68v94h60v-68h55v108h79v106H22zm492 61h41V178h61v-46h54v163h50v-61h54v203H514z"/>
    <g class="nw-svg-fine">
      ${repeat(5, (i) => `<path d="M${88 + i * 10} 214v68M${565 + i * 10} 193v118M${624 + i * 9} 154v164"/>`)}
      ${repeat(5, (i) => `<path d="M33 ${293 + i * 24}h29m96 12h34m525-29h43"/>`)}
    </g>
    <path class="nw-svg-paper" d="M67 345l322-127 352 160-317 79z"/>
    <path d="M67 345v22l357 104 317-76v-17M424 457v14M94 344l297-115 318 146-285 71z"/>
    <g class="nw-svg-fine">
      <path d="M174 378l298-111m-216 135 295-99m-220 121 299-86M198 304l341 112m-249-148 337 125"/>
    </g>
    <path class="nw-svg-solid" d="M402 364l281 26 28-10-305-27z"/>
    <path class="nw-svg-paper" d="M383 353l4 26q14 12 30 0l4-26z"/>
    <ellipse cx="402" cy="353" rx="19" ry="6"/>
    <path d="M400 352l-17-151m5 1 16 149"/>
    <path class="nw-svg-fine" d="M390 359l3 17m6-16 1 20m7-20v19m7-20-2 16"/>
    <ellipse class="nw-svg-accent" cx="401" cy="379" rx="32" ry="11"/>
    <path d="M228 343l-7-43 11-19 14 19 1 43m-22-26 22 1m-19 24-6 14m25-14 8 14m-30-53-17 18m38-18 19 10"/>
    <circle class="nw-svg-paper" cx="233" cy="269" r="10"/>
    <path d="M508 351l2-41 14-11 14 16-4 36m-23-22 25 1m-25 20-7 14m28-14 6 15m-24-53-19 5m41-1 20 20"/>
    <circle class="nw-svg-paper" cx="524" cy="286" r="10"/>
    <path class="nw-svg-accent" d="M657 401l15-17m-13-4 11 3m-38 18 10-11"/>
    <path class="nw-svg-fine" d="M279 389l21-7m-10 12 21-7"/>`,
  clock: () => `
    <g class="nw-svg-fine">
      ${repeat(8, (i) => `<path d="M${111 + i * 7} ${189 + i * 11}l-41 39M${629 + i * 8} ${116 + i * 13}l52-18"/>`)}
      <path d="M54 431h695M94 443h211m173 0h227"/>
    </g>
    <path class="nw-svg-paper" d="M400 59a166 166 0 1 0 144 83l-21 12A142 142 0 1 1 400 83z"/>
    <path d="M400 70a155 155 0 1 0 134 77"/>
    ${repeat(12, (i) => {
      if (i === 1 || i === 2) return '';
      const a = (i * Math.PI) / 6 - Math.PI / 2;
      const x1 = (400 + Math.cos(a) * 126).toFixed(2);
      const y1 = (225 + Math.sin(a) * 126).toFixed(2);
      const x2 = (400 + Math.cos(a) * 111).toFixed(2);
      const y2 = (225 + Math.sin(a) * 111).toFixed(2);
      return `<path d="M${x1} ${y1}L${x2} ${y2}"/>`;
    })}
    <path d="M400 225l-56-39m56 39 16-116m-17 116 10 23"/>
    <circle class="nw-svg-paper" cx="400" cy="225" r="10"/><circle class="nw-svg-solid" cx="400" cy="225" r="3"/>
    <g class="nw-svg-accent"><path d="M416 31c73 1 132 47 155 99m-10-1 10 1 2-12"/><path class="nw-svg-route" d="M421 71a155 155 0 0 1 99 54"/></g>
    <path class="nw-svg-paper" d="M533 372h172v16H533zM547 389v39m144-39v39M549 345h138v21H549zM559 365v7m116-7v7"/>
    <path class="nw-svg-fine" d="M553 352h130m-130 7h130M552 391l-10 35m147-35 11 35"/>
    <path class="nw-svg-paper" d="M129 352h105l15 61H114z"/>
    <path d="M129 365h108m-91-22v17m71-17v17"/>
    ${repeat(3, (row) => repeat(4, (col) => `<path class="nw-svg-fine" d="M${135 + col * 25 - row * 3} ${377 + row * 12}h10"/>`))}`,
};

export function renderIllustration(id: IllustrationId, description: string): string {
  return `<svg class="nw-illustration nw-illustration--${id}" viewBox="0 0 800 480"
    xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeMarkup(description)}"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <title>${escapeMarkup(description)}</title>
    ${drawings[id]()}
  </svg>`;
}
