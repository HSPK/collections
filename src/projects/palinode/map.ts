import { escapeMarkup } from '../../core/markup';
import { locationStates } from './engine';
import type { Evaluation } from './engine';
import { ERAS, PLACES } from './world';
import type { Era, PlaceId } from './world';

function house(x: number, y: number, width: number, depth: number, height: number, roof = '#b99a7c'): string {
  const windows = Array.from({ length: Math.max(1, Math.floor(width / 15)) }, (_, index) => {
    const left = x + 8 + index * 15;
    return `<path d="M${left} ${y + 11}v8m0 7v7" stroke="#6c7067" stroke-width="3"/>`;
  }).join('');
  return `<g stroke="#827e6c" stroke-width="1.1">
    <path d="M${x} ${y}h${width}v${height}h-${width}z" fill="#e0d2b3"/>
    <path d="m${x + width} ${y} ${depth} -${depth * .65}v${height}l-${depth} ${depth * .65}z" fill="#c1b59b"/>
    <path d="m${x} ${y} ${depth} -${depth * .65}h${width}l-${depth} ${depth * .65}z" fill="${roof}"/>
    <path d="m${x + 4} ${y - 3} ${depth - 2} -${depth * .65 - 2}m12 0 ${width - 22} 0" fill="none" opacity=".55"/>
    ${windows}
    <path d="M${x + width / 2 - 3} ${y + height}v-9h7v9" fill="#867d67"/>
  </g>`;
}

function tree(x: number, y: number, scale = 1): string {
  return `<g transform="translate(${x} ${y}) scale(${scale})" stroke="#758574" stroke-width="1.2">
    <ellipse cy="11" rx="14" ry="5" fill="#b1b69b" stroke="none" opacity=".4"/>
    <path d="M0 11V-7m0 10-7-8m7 4 8-9" fill="none" stroke="#777563" stroke-width="2"/>
    <path d="M-12-5c-8-8 0-15 6-14 2-10 17-10 19 0 11 1 12 14 3 17-2 9-18 8-20-1z" fill="#b4c2a6"/>
    <path d="m-6-13 6 6 7-7M0-7v8" fill="none" opacity=".6"/>
  </g>`;
}

function baseMap(id: string): string {
  const blocks = [
    [75, 129, 58, 23, 37], [159, 98, 38, 22, 33], [227, 84, 64, 20, 32],
    [99, 198, 53, 21, 38], [170, 175, 37, 22, 31], [69, 288, 62, 22, 41],
    [149, 281, 44, 20, 29], [128, 355, 66, 21, 35], [209, 396, 45, 23, 36],
    [57, 433, 73, 20, 39], [153, 459, 41, 19, 33], [241, 499, 52, 23, 35],
    [615, 76, 51, 19, 32], [737, 86, 51, 21, 32], [786, 230, 39, 21, 31],
    [621, 271, 46, 21, 34], [697, 277, 63, 23, 40], [788, 326, 38, 20, 33],
    [563, 470, 40, 23, 30], [737, 491, 49, 23, 36], [620, 551, 59, 19, 31],
    [451, 80, 32, 18, 24], [333, 126, 41, 17, 30],
  ].map(([x, y, width, depth, height]) => house(x, y, width, depth, height)).join('');
  return `<svg class="palinode-city-svg" viewBox="0 0 900 630" aria-label="Hand-drafted map of Aven. Select a numbered place to read its records." role="group">
    <defs>
      <pattern id="${id}-water" width="27" height="19" patternUnits="userSpaceOnUse" patternTransform="rotate(-19)">
        <path d="M2 12h13m6-8h5" stroke="#658f89" stroke-width=".75" opacity=".46"/>
      </pattern>
      <pattern id="${id}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
        <path d="M0 0v6" stroke="#969b80" stroke-width=".6"/>
      </pattern>
    </defs>
    <path d="M49 59 851 40 859 570 734 597 142 588 48 539z" fill="#e9dfc7" stroke="#b6ac92" stroke-width="1" stroke-dasharray="3 5"/>
    <path d="m539 8-1 89c-3 105-55 101-54 191 2 83-59 125-51 201l-31 141h112l12-133c-9-77 65-131 54-207-9-74 47-94 51-192l6-90z" fill="#a5c3b8"/>
    <path d="m539 8-1 89c-3 105-55 101-54 191 2 83-59 125-51 201l-31 141h112l12-133c-9-77 65-131 54-207-9-74 47-94 51-192l6-90z" fill="url(#${id}-water)"/>
    <path d="m538 30-2 67c-3 105-55 101-54 191 2 83-59 125-51 201l-25 118m225-577-2 68c-4 98-60 118-51 192 11 76-63 130-54 207l-10 111" fill="none" stroke="#6b9288" stroke-width="2"/>
    <g stroke="#f6efdc" stroke-width="18" fill="none" stroke-linejoin="round">
      <path d="m60 228 234-63 176 20m-187-112-60 225 141 58-48 204M59 392l328-78M87 515l205-66 133 18"/>
      <path d="m634 121 187 49m-206 89 216 145m-134-337-23 291 32 200m-144-199 209 80"/>
    </g>
    <g stroke="#d0c4a8" stroke-width="1" fill="none">
      <path d="m60 217 228-62 183 20m-185-98-50 218 142 55-49 212M59 382l327-78"/>
      <path d="m632 111 190 49m-205 89 217 145m-148-331-22 288 33 207"/>
      <path d="m84 81 104-29 196 20M62 485l68 65 170 32m307-41 173 19 48-112"/>
    </g>
    <g opacity=".83">${blocks}</g>
    <g class="palinode-map-trees">
      ${[[64, 85], [205, 137], [305, 177], [113, 317], [92, 501], [325, 438], [357, 551], [639, 228], [799, 131], [825, 462], [583, 548]].map(([x, y]) => tree(x, y, .7)).join('')}
    </g>
    <g class="palinode-map-ghost" fill="none" stroke="#9f6353" stroke-dasharray="5 5" stroke-width="1.7">
      <path d="M340 374 395 339 560 370 642 405M377 351l12 15m0-23 12 15m0-23 12 15"/>
      <path d="m260 219 106-35 41 27v94l-103 33-44-28z"/>
    </g>
    <g data-scene="steps" fill="#ded4bb" stroke="#8b8b73" stroke-width="1.2">
      <path d="m371 357 45-13 40 30-45 16z"/>
      <path d="m378 353 40 31m-33-34 40 31m-33-34 40 31m-33-34 40 31m-33-34 40 31"/>
      <path d="m367 356 6-8 43-12 9 7" fill="none" stroke-width="3"/>
    </g>
    <g data-scene="wall" stroke="#8f8870" stroke-width="1.5">
      <path d="m455 230 23 6-7 84-27 62-16 107-20-6 16-110 28-66z" fill="#d5cfb5"/>
      <path d="m462 231-3 76-29 68-15 109" fill="none"/>
      <path d="m450 252 22 3m-24 20 22 3m-23 22 21 4m-28 20 20 6m-28 13 20 8m-29 12 20 7m-27 17 20 4m-25 18 20 4m-22 18 20 4m-24 18 20 4" opacity=".5"/>
    </g>
    <g data-scene="footbridge" stroke="#6a796c" fill="#ede3c9" stroke-width="1.5">
      <path d="m412 342 151 12 5 15-151-12z"/>
      <path d="m413 335 151 12v7l-151-12zm4 14 151 12v8l-151-12z"/>
      <path d="m430 337v9m19-8v9m19-7v9m19-8v9m19-7v9m19-8v9m19-7v9"/>
      <path d="m419 358 150 12" stroke="#9a9982" stroke-width="6" opacity=".3"/>
    </g>
    <g data-scene="tram" stroke="#7f8270" stroke-width="1.4">
      <path d="M384 241 643 298v26l-15-3v-12l-26-5v12l-19-5v-12l-28-6v12l-18-4v-13l-29-7v14l-18-4v-14l-28-6v14l-17-4v-14l-27-6v14l-34-8z" fill="#b6b29a"/>
      <path d="m377 232 275 59-7 11-273-60z" fill="#d2ccb4"/>
      <path d="m379 233 271 59m-274-53 270 59" fill="none" stroke-width="2"/>
      <g fill="#527f74" stroke="#486d61">
        <path d="m490 243 67 14v20l-67-14z"/><path d="m490 243 8-6 67 14-8 6z" fill="#a3b5a1"/><path d="m557 257 8-6v20l-8 6z" fill="#426b62"/>
        <path d="m497 248 10 2v8l-10-2zm16 3 10 2v8l-10-2zm16 3 10 2v8l-10-2z" fill="#ece3c7"/>
      </g>
      <path d="m515 242 8-10 12 3-8 10M385 209v28m251 27v29m-251-84 251 55" fill="none" stroke="#788c7b"/>
    </g>
    <g data-scene="ferry" stroke="#758f82" fill="none">
      <path d="m443 372 80 11" stroke-dasharray="4 4"/>
      <path d="m485 379 26 3-7 8-18-3z" fill="#cfb292"/><path d="m494 380 2-12"/>
    </g>
    <g data-scene="quay-stop" stroke="#657b6a" stroke-width="1.4">
      <path d="m373 250 51 11-4 7-51-11z" fill="#789685"/><path d="M374 256v18m44-8v17"/>
    </g>
    <g data-scene="hill-stop" stroke="#657b6a" stroke-width="1.4">
      <path d="m286 225 51 11-4 7-51-11z" fill="#789685"/><path d="M287 231v18m44-8v17"/>
    </g>
    <g class="palinode-place" data-place="hall" role="button" tabindex="0" aria-label="02 The Long Room">
      <path class="palinode-place-halo" d="m237 190 108-35 77 52v111l-115 37-71-48z"/>
      ${house(258, 228, 106, 39, 75, '#ad7862')}
      <path d="m254 228 58-45 93 18-38 27z" fill="#bc8e73" stroke="#8e7862" stroke-width="1.5"/>
      <path d="m267 224 47-35 76 15m-68-16 70 18m-61-16 66 18m-55-16 62 17m-54-15 59 17m-53-15 52 16m-45-14 48 15" fill="none" stroke="#997862" opacity=".6"/>
      <path d="M282 207v-41h14v31" fill="#b39175" stroke="#816e59"/><path d="M279 164h20v7h-20z" fill="#c5aa86" stroke="#816e59"/>
      <path d="M263 286h97v10h-97z" fill="#d6c79f"/>
      <text data-map-hall x="311" y="294" text-anchor="middle" font-size="7.5" letter-spacing="1.2" fill="#625c4c">LONG ROOM</text>
      <g data-scene="rehearsal" stroke="#ad704f" stroke-width="2"><path d="M269 241v9m15-9v9m15-9v9m15-9v9m15-9v9m15-9v9"/></g>
      <g data-scene="reading-room" stroke="#507c6f" stroke-width="2"><path d="M269 241v9m15-9v9m15-9v9m15-9v9m15-9v9m15-9v9"/></g>
      <circle class="palinode-map-number" cx="253" cy="321" r="13"/><text class="palinode-map-numeral" x="253" y="325">02</text>
      <text class="palinode-map-name" x="274" y="330">THE LONG ROOM</text>
    </g>
    <g class="palinode-place" data-place="archive" role="button" tabindex="0" aria-label="04 Municipal Archive">
      <path class="palinode-place-halo" d="m657 135 109-15 51 44-9 72-133 11-33-49z"/>
      ${house(669, 161, 91, 31, 52, '#a0a691')}
      <path d="m663 162 51-35 51 35z" fill="#ddd6ba" stroke="#7d806d" stroke-width="1.5"/>
      <path d="m678 158 36-24 35 24z" fill="#bcc1a8" stroke="#878b75"/>
      <path d="M680 169v38m17-38v38m34-38v38m17-38v38" stroke="#efe5cc" stroke-width="7"/>
      <path d="M677 167h76M667 210h98m-103 5h108" stroke="#8d8d75" stroke-width="2"/>
      <path d="M709 209v-28q5-10 11 0v28" fill="#7f8d7c" stroke="#6c7a68"/>
      <circle class="palinode-map-number" cx="659" cy="237" r="13"/><text class="palinode-map-numeral" x="659" y="241">04</text>
      <text class="palinode-map-name" x="680" y="246">THE ARCHIVE</text>
    </g>
    <g class="palinode-place" data-place="garden" role="button" tabindex="0" aria-label="05 Orchard Square">
      <ellipse class="palinode-place-halo" cx="681" cy="411" rx="103" ry="71"/>
      <path d="m611 386 90-25 66 43-90 43z" fill="#c4c7a7" stroke="#99a287" stroke-width="1.2"/>
      <path d="m618 387 81-21 59 37-81 38z" fill="url(#${id}-hatch)"/>
      <path d="m628 421 106-49m-122 19 134 35" stroke="#e5dec3" stroke-width="7"/>
      ${tree(674, 395, 1.3)}${tree(718, 411, .9)}${tree(646, 415, .7)}
      <path d="m742 385 14 7m-15-4 14 7m-14-7v6m13 1v6" stroke="#8d866a" stroke-width="1.7"/>
      <circle class="palinode-map-number" cx="623" cy="461" r="13"/><text class="palinode-map-numeral" x="623" y="465">05</text>
      <text class="palinode-map-name" x="644" y="469">ORCHARD SQUARE</text>
    </g>
    <g class="palinode-place" data-place="quay" role="button" tabindex="0" aria-label="01 Tidemark Quay">
      <path class="palinode-place-halo" d="m362 336 92 16-6 67-107 7z"/>
      <circle class="palinode-map-number" cx="328" cy="389" r="13"/><text class="palinode-map-numeral" x="328" y="393">01</text>
      <text class="palinode-map-name" x="305" y="418">TIDEMARK QUAY</text>
    </g>
    <g class="palinode-place" data-place="bridge" role="button" tabindex="0" aria-label="03 Ilex Crossing">
      <path class="palinode-place-halo" d="m440 229 151 42-17 111-152-13z"/>
      <circle class="palinode-map-number" cx="562" cy="325" r="13"/><text class="palinode-map-numeral" x="562" y="329">03</text>
      <text class="palinode-map-name" x="583" y="339">ILEX CROSSING</text>
    </g>
    ${[
      { scene: 'ending-return', people: [[383, 367], [392, 372], [402, 377], [412, 380], [421, 381]] },
      { scene: 'ending-procession', people: [[397, 245], [409, 248], [420, 250], [431, 253], [441, 255]] },
      { scene: 'ending-reading', people: [[284, 310], [295, 307], [306, 311], [317, 308], [328, 313]] },
    ].map(({ scene, people }) => `<g data-scene="${scene}" fill="#a55f48" stroke="#f1e6cc" stroke-width="1">${people.map(([x, y]) => `<circle cx="${x}" cy="${y - 4}" r="2.8"/><path d="m${x - 2} ${y}h4l1 8h-6z"/>`).join('')}</g>`).join('')}
    <text x="514" y="476" transform="rotate(-72 514 476)" fill="#527e76" font-size="15" letter-spacing="5" font-style="italic">RIVER ILEX</text>
    <g class="palinode-map-cartography" fill="#837b65" stroke="#837b65">
      <path d="M799 520v39m-17-20h34m-17-25-4 13 4-4 4 4z" fill="none"/>
      <text x="799" y="507" text-anchor="middle" stroke="none" font-size="11">N</text>
      <path d="M62 568h109m-109-4v8m55-8v8m54-8v8"/>
      <text x="62" y="588" stroke="none" font-size="10" letter-spacing="1.4">0</text>
      <text x="112" y="588" stroke="none" font-size="10" letter-spacing="1.4">50</text>
      <text x="162" y="588" stroke="none" font-size="10" letter-spacing="1.4">100 m</text>
      <text x="61" y="40" stroke="none" font-size="11" letter-spacing="2">AVEN / BOROUGH SURVEY</text>
      <text data-map-year x="837" y="41" text-anchor="end" stroke="none" font-size="16">2026</text>
    </g>
  </svg>`;
}

export function mountMap(container: HTMLElement, id: string, onPlace: (place: PlaceId) => void, signal: AbortSignal) {
  container.innerHTML = baseMap(id);
  const places = Array.from(container.querySelectorAll<SVGGElement>('[data-place]'));
  for (const element of places) {
    const place = PLACES.find((item) => item.id === element.dataset.place);
    if (!place) throw new Error('Unknown map place.');
    element.addEventListener('click', () => onPlace(place.id), { signal });
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onPlace(place.id);
      }
    }, { signal });
  }
  return {
    update(evaluation: Evaluation, era: Era, selected: PlaceId, pinned?: Evaluation) {
      for (const layer of container.querySelectorAll<SVGGElement>('[data-scene]')) {
        const scene = layer.dataset.scene;
        const visible = scene === 'ferry' ? !evaluation.facts.tram && !evaluation.facts.footbridge : !!(scene && evaluation.facts[scene]);
        layer.style.display = visible ? '' : 'none';
      }
      const year = container.querySelector('[data-map-year]');
      if (year) year.textContent = ERAS[era].year;
      const states = locationStates(evaluation, era);
      const oldStates = pinned ? locationStates(pinned, 3) : undefined;
      for (const element of places) {
        const place = PLACES.find((item) => item.id === element.dataset.place)!;
        element.setAttribute('aria-label', `${place.number} ${place.name}: ${states[place.id]}. Read records.`);
        element.setAttribute('aria-pressed', String(place.id === selected));
        element.classList.toggle('palinode-place-changed', !!oldStates && oldStates[place.id] !== states[place.id]);
      }
      container.dataset.era = ERAS[era].year;
      container.dataset.crossing = evaluation.facts.tram ? 'tram' : evaluation.facts.footbridge ? 'footbridge' : 'ferry';
      container.dataset.shore = evaluation.facts.steps ? 'steps' : 'wall';
      container.setAttribute('aria-label', `${ERAS[era].year} city map. ${escapeMarkup(states.hall)}.`);
    },
  };
}
