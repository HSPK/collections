import { escapeMarkup } from '../../core/page';

export type DiagramId =
  | 'portable-horizon'
  | 'tuesday-preserver'
  | 'compass-for-second-thoughts'
  | 'letterweight-for-unsent-words'
  | 'hinge-for-an-absent-room'
  | 'listening-thimble'
  | 'window-for-borrowed-weather'
  | 'rain-receipt'
  | 'foldable-pause'
  | 'shadow-mender';

interface ObjectDrawing {
  description: string;
  markup: string;
}

const drawings: Record<DiagramId, ObjectDrawing> = {
  'portable-horizon': {
    description: 'An open walnut traveling case holds a pale strip of sky. A thin brass horizon crosses the lid, with a small sun above it. A winding key and folding feet let the case stand on a table.',
    markup: `
      <path d="M123 290 418 317 516 259 224 237Z" fill="#d8d6c7" stroke="none"/>
      <path d="M138 273 138 112Q138 96 154 94L435 69Q452 68 452 85L452 254Z" fill="#bea586"/>
      <path d="m154 111 280-24 0 152-280 19Z" fill="#e0e8dc"/>
      <path d="m154 197 280-21 0 63-280 19Z" fill="#a2b2a0" stroke="none"/>
      <path d="m154 204 280-21" stroke="#405e46" stroke-width="3"/>
      <circle cx="347" cy="143" r="24" fill="#f5eddb" stroke="none"/>
      <path d="m154 111 280-24 0 152-280 19Z"/>
      <path d="m138 273 66 32 291-23-43-28Z" fill="#b19573"/>
      <path d="m138 273 0 17 66 32 291-24 0-16M204 305v17" fill="#d3b997"/>
      <path d="m165 274 48 19 252-19-25-11Z" fill="#eee6d5"/>
      <path d="m249 313 0 17q0 8 9 7l66-5q9-1 9-9v-16" stroke-width="6"/>
      <path d="m162 300-6 30m304-30 7 17" stroke-width="5"/>
      <path d="m170 254 0 17m254-34v28" stroke="#b75c3b" stroke-width="6"/>
      <circle cx="451" cy="204" r="12" fill="#e7d7a6"/>
      <path d="m452 191 14-8m-8 2 4 9"/>
      <path d="m110 119 0 155m-8-154 16-2m-16 155 16 4M191 349l248-19m-248 13v12m248-31v12" opacity=".45"/>
      <path d="M350 115v-45h53M91 198h53" stroke-dasharray="4 5" opacity=".6"/>
    `,
  },
  'tuesday-preserver': {
    description: 'A glass preserving jar encloses several soft, folded sheets of a day. Its brass clasp seals an oversized porcelain lid. Seven small marks beside it represent the week, with the second mark filled.',
    markup: `
      <ellipse cx="301" cy="329" rx="122" ry="16" fill="#d8d6c7" stroke="none"/>
      <path d="M210 131q-20 18-20 42v124q0 29 109 29t110-29V173q0-24-20-42" fill="#e5eadd"/>
      <ellipse cx="299" cy="292" rx="91" ry="19" fill="#c6d2bc" stroke="none"/>
      <path d="m223 272 43-24 99 9 20 33-99 9Z" fill="#ece3d3"/>
      <path d="m219 236 56-17 103 19-35 31-94-7Z" fill="#f4eee0"/>
      <path d="m226 204 42-26 105 27-30 35-101-12Z" fill="#c7d1bb"/>
      <path d="m251 165 62-13 45 38-92 18Z" fill="#f4eee0"/>
      <path d="m244 212 62 12m-65 14 73 12m-61 30 65 6" opacity=".45"/>
      <path d="M205 141q94 29 190 0M211 171v100" stroke="#ffffff" stroke-width="5" opacity=".8"/>
      <path d="M203 104h193v30q-96 32-193 0Z" fill="#c4ad76"/>
      <ellipse cx="299" cy="103" rx="98" ry="25" fill="#f3eddd"/>
      <ellipse cx="299" cy="97" rx="71" ry="12" opacity=".35"/>
      <path d="M181 113v52h35m202-52v52h-35" stroke-width="5"/>
      <path d="M282 119v45h34v-44" fill="#b6a06b"/>
      <path d="M291 132h16v20h-16Z" fill="#efe5cf"/>
      <path d="M395 131q53 11 37 55l-17 39-31-15 19-37q-15-14-8-42Z" fill="#49634d"/>
      <path d="m398 190 19 8" stroke="#f2ecde"/>
      <path d="M458 122h28M458 290h28m-14-168v168" opacity=".4"/>
      <g transform="translate(120 132)">
        <circle cy="0" r="5"/><circle cy="24" r="5" fill="#b75c3b" stroke="#b75c3b"/>
        <circle cy="48" r="5"/><circle cy="72" r="5"/><circle cy="96" r="5"/>
        <circle cy="120" r="5"/><circle cy="144" r="5"/>
      </g>
    `,
  },
  'compass-for-second-thoughts': {
    description: 'An eight-sided pocket compass has two independent needles, one green and one rust-red. Neither agrees with the usual directions. A dotted route turns back on itself outside the dial.',
    markup: `
      <ellipse cx="302" cy="321" rx="118" ry="13" fill="#d8d6c7" stroke="none"/>
      <circle cx="299" cy="69" r="25" fill="#c3ae79"/>
      <circle cx="299" cy="69" r="14" fill="#eee8d9"/>
      <path d="m241 102 117 0 63 63 0 93-63 61H241l-62-61v-93Z" fill="#ac946a"/>
      <path d="m249 112 101 0 59 58 0 82-58 57H249l-58-57v-82Z" fill="#d8c9a2"/>
      <circle cx="300" cy="210" r="91" fill="#f4efdf"/>
      <circle cx="300" cy="210" r="75" stroke-dasharray="1 9" stroke-width="6"/>
      <circle cx="300" cy="210" r="60" opacity=".3"/>
      <path d="M300 121v19m0 140v19m-89-89h19m140 0h19m-151-62 12 12m100 100 12 12m-124 0 12-12m100-100 12-12"/>
      <path d="m300 210 40-69-21 84Z" fill="#345943"/>
      <path d="m300 210-40 69 21-84Z" fill="#a9b7a1"/>
      <path d="m300 210-61-29 45 45Z" fill="#b75c3b"/>
      <path d="m300 210 61 29-45-45Z" fill="#e0baa1"/>
      <circle cx="300" cy="210" r="9" fill="#d8c9a2"/>
      <path d="M82 285q80-17 55-112t29-98m-11 3 11-3-1 12" stroke-dasharray="5 7" opacity=".6"/>
      <path d="M449 124q78 44 19 97t29 83m-5-13 5 13-15-1" stroke-dasharray="5 7" opacity=".6"/>
      <path d="M253 338h94m-94-5v10m94-10v10" opacity=".45"/>
    `,
  },
  'letterweight-for-unsent-words': {
    description: 'A smooth, dark basalt letterweight rests on a blank envelope. A narrow opening in the stone holds the end of a folded sentence. A cutaway inset shows a small chamber inside the otherwise solid stone.',
    markup: `
      <path d="m111 266 262-37 123 65-264 39Z" fill="#f3eddd"/>
      <path d="m111 266 173 33 89-70m-143 98 52-28 214-5" opacity=".65"/>
      <path d="M162 234q-4-66 61-88t126 11q67 37 46 91t-130 47q-100-2-103-61Z" fill="#536056"/>
      <path d="M179 220q7-53 63-64t102 14" stroke="#acb7a5" opacity=".6"/>
      <path d="M208 224q61-23 124 1" stroke="#182c23" stroke-width="9"/>
      <path d="m243 215-9-63 47-40 9 69 24 42-36-13Z" fill="#e9deca"/>
      <path d="m234 152 37 21 19 8m-9-69-10 61 7 37" opacity=".65"/>
      <path d="m249 145 17 10m-15 1 13 8m20 28 15 11" opacity=".45"/>
      <path d="M335 220h48l49-93" stroke-dasharray="4 6" opacity=".7"/>
      <circle cx="457" cy="99" r="47" fill="#eee8d9"/>
      <path d="M418 108q-2-42 37-43t42 43Z" fill="#b7c0b1"/>
      <path d="M440 108V93q0-16 15-16t16 16v15Z" fill="#eee8d9"/>
      <path d="M429 85v20m9-29v11m40-11v29m9-19v19" opacity=".45"/>
      <path d="m166 340 183-1m-183-6v12m183-12v12" opacity=".4"/>
    `,
  },
  'hinge-for-an-absent-room': {
    description: 'A brass hinge is attached to a freestanding door jamb. One hinge leaf has screw holes; the other is fixed to the dotted outline of a door that does not exist. A drafting arc marks the empty space it would open into.',
    markup: `
      <path d="m134 317 152-44 201 43-159 42Z" fill="#e2dfd0" stroke="none"/>
      <path d="M174 310V67l36-10v244Z" fill="#d3bea0"/>
      <path d="m210 57 25 12v242l-25-10Z" fill="#b19777"/>
      <path d="m185 83 15-5m-15 207 15-5" opacity=".45"/>
      <path d="m210 151 55 17v93l-55-18Z" fill="#cbb780"/>
      <path d="m271 168 77-44v93l-77 44Z" fill="#dac995"/>
      <path d="m264 166 8 2v94l-8 3Z" fill="#a78d58"/>
      <path d="m263 177 11-3m-11 22 11-3m-11 22 11-3m-11 22 11-3" stroke-width="3"/>
      <ellipse cx="229" cy="179" rx="5" ry="7"/>
      <ellipse cx="229" cy="229" rx="5" ry="7"/>
      <ellipse cx="321" cy="151" rx="5" ry="7"/>
      <ellipse cx="321" cy="202" rx="5" ry="7"/>
      <path d="m226 175 6 8m-6 42 6 8m-3-86-6 8m6 43-6 8"/>
      <path d="m277 165 117-71v182l-117 71Z" stroke-dasharray="6 7" opacity=".7"/>
      <path d="M273 344q153 0 216-100" stroke-dasharray="4 6" opacity=".5"/>
      <path d="m478 248 11-4-1 12" opacity=".5"/>
      <path d="M121 66v243m-8-241 16-4m-16 247 16-4" opacity=".4"/>
      <circle cx="378" cy="196" r="4" stroke-dasharray="2 3"/>
    `,
  },
  'listening-thimble': {
    description: 'An oversized copper thimble is shown in elevation and from below. Its domed shell has quiet rows of perforations. The bottom view reveals an entirely empty interior; dotted waves end just outside the rim.',
    markup: `
      <ellipse cx="268" cy="310" rx="104" ry="16" fill="#d8d6c7" stroke="none"/>
      <path d="M188 286 204 132q5-63 67-63t65 63l18 154q-80 40-166 0Z" fill="#c49d7e"/>
      <path d="M204 132q62 28 132 0" opacity=".5"/>
      <path d="M195 258q72 35 153 0l6 28q-80 40-166 0Z" fill="#9c795b"/>
      <ellipse cx="271" cy="284" rx="82" ry="22" fill="#d7ba94"/>
      <ellipse cx="271" cy="283" rx="64" ry="12" fill="#34483a"/>
      <g fill="#745c48" stroke="none">
        <circle cx="231" cy="143" r="3"/><circle cx="256" cy="149" r="3"/><circle cx="281" cy="151" r="3"/><circle cx="306" cy="146" r="3"/>
        <circle cx="224" cy="166" r="3"/><circle cx="248" cy="173" r="3"/><circle cx="273" cy="177" r="3"/><circle cx="299" cy="174" r="3"/><circle cx="322" cy="167" r="3"/>
        <circle cx="221" cy="192" r="3"/><circle cx="246" cy="198" r="3"/><circle cx="272" cy="202" r="3"/><circle cx="300" cy="198" r="3"/><circle cx="324" cy="192" r="3"/>
        <circle cx="217" cy="219" r="3"/><circle cx="243" cy="225" r="3"/><circle cx="272" cy="229" r="3"/><circle cx="301" cy="225" r="3"/><circle cx="327" cy="219" r="3"/>
      </g>
      <path d="M225 118q4-30 30-34" stroke="#ebd0ad" stroke-width="5"/>
      <circle cx="462" cy="139" r="45" fill="#c49d7e"/>
      <circle cx="462" cy="139" r="34" fill="#eee8d9"/>
      <path d="M438 115q24-22 48 0" opacity=".45"/>
      <path d="M355 276h36l42-99" stroke-dasharray="4 6" opacity=".5"/>
      <path d="M141 145q-30 40 0 81m-24-101q-48 60 0 121m-24-141q-65 80 0 161" stroke-dasharray="2 8" opacity=".55"/>
      <path d="M223 343h98m-98-6v12m98-12v12" opacity=".4"/>
    `,
  },
  'window-for-borrowed-weather': {
    description: 'A circular leaded window sits on a small wooden stand rather than in a wall. One half holds slanting rain and the other a low sun. A shallow tray beneath the sill catches a few borrowed drops.',
    markup: `
      <path d="m157 327 274 0 36 20-346 0Z" fill="#d8d6c7" stroke="none"/>
      <path d="m228 268-29 68h27l28-65m89-3 30 68h27l-31-65" fill="#b39772"/>
      <circle cx="299" cy="176" r="120" fill="#a69e89"/>
      <circle cx="299" cy="176" r="104" fill="#d1dfd5"/>
      <path d="M299 73a104 104 0 0 1 0 207Z" fill="#e9dec2" stroke="none"/>
      <circle cx="347" cy="165" r="29" fill="#be885c" stroke="none"/>
      <path d="M204 145q10-27 28-16 9-33 33-12 26-9 33 22" fill="#a2b7a6" stroke="none"/>
      <path d="m226 162-7 15m38-20-7 15m34-8-7 15m-41 21-7 15m38-21-7 15m-30 17-7 15m43-22-7 15" stroke="#6a897b" stroke-width="3"/>
      <path d="M299 72v208M198 154h202M216 236h166m-150-139 67 57 66-57m-66 139-47 32m47-32 47 32" stroke-width="5"/>
      <circle cx="299" cy="176" r="104"/>
      <path d="M170 296h258l-17 18H187Z" fill="#c1aa85"/>
      <path d="M219 296h161l-13 9H232Z" fill="#a6b7a3"/>
      <path d="M451 91v188m-7-188h14m-14 188h14" opacity=".4"/>
      <path d="M143 185h-42m42 8h-23m23-16h-31" opacity=".5"/>
      <path d="m462 186 31-15-4 20 14-3" stroke-dasharray="4 5" opacity=".5"/>
    `,
  },
  'rain-receipt': {
    description: 'A narrow zinc funnel sits on a squat mechanical recorder. A dry paper receipt curls out of its front and lists three small marks instead of a rainfall total. A single drop waits above the funnel.',
    markup: `
      <ellipse cx="292" cy="326" rx="140" ry="18" fill="#d8d6c7" stroke="none"/>
      <path d="m214 216 57-28 122 16-45 35Z" fill="#a9b9a9"/>
      <path d="m214 216 134 23v84l-134-24Z" fill="#6f8873"/>
      <path d="m348 239 45-35v86l-45 33Z" fill="#49634d"/>
      <path d="m196 101 120-19 88 24-99 73-10 44-28-5-5-42Z" fill="#b6c4ba"/>
      <ellipse cx="300" cy="102" rx="104" ry="26" fill="#dce4d9"/>
      <ellipse cx="300" cy="102" rx="86" ry="16" fill="#8fa79a"/>
      <path d="m220 117 61 52m-16 7 41 3" opacity=".55"/>
      <path d="M301 42q-16 19-16 27a16 16 0 0 0 32 0q0-8-16-27Z" fill="#91aa9b"/>
      <path d="m233 249 94 16v14l-94-16Z" fill="#273f33"/>
      <path d="m244 258 70 12 2 45q1 22 38 24-67 20-102-3 12-7 3-22Z" fill="#f2ead7"/>
      <path d="m260 282 36 6m-32 7 30 5m-27 7 21 4" stroke-width="3" opacity=".6"/>
      <circle cx="378" cy="248" r="9" fill="#c9b77d"/>
      <path d="m378 248 28 6v17" stroke-width="4"/>
      <path d="m225 301-5 15m159-19 5 15" stroke-width="5"/>
      <path d="M154 103v197m-7-197h14m-14 197h14" opacity=".4"/>
      <path d="M412 125h57v66" stroke-dasharray="4 6" opacity=".55"/>
      <path d="m462 183 7 8 7-8" opacity=".55"/>
    `,
  },
  'foldable-pause': {
    description: 'Six linen panels form a small concertina screen. Alternating folds cast long shadows, but the central two panels enclose an unmarked interval. A second, compact side view shows the pause folded flat.',
    markup: `
      <path d="m102 278 294 61 107-56-288-64Z" fill="#d8d6c7" stroke="none"/>
      <path d="m114 123 65 28v159l-65-31Z" fill="#c4ccb7"/>
      <path d="m179 151 61-43v158l-61 44Z" fill="#f2ead8"/>
      <path d="m240 108 64 38v160l-64-40Z" fill="#d9dbc7"/>
      <path d="m304 146 64-38v158l-64 40Z" fill="#f5eedf"/>
      <path d="m368 108 63 40v159l-63-41Z" fill="#c4ccb7"/>
      <path d="m431 148 60-25v158l-60 26Z" fill="#f2ead8"/>
      <path d="m125 141 44 19v130l-44-21m65-110 39-29v125l-39 28m189-153 41 25v131l-41-28m63-103 39-17v131l-39 18" opacity=".3"/>
      <path d="M240 126v116m64-81v116m64-151v116" stroke-dasharray="3 6" opacity=".5"/>
      <path d="M156 93q120-62 278 0m-12-10 12 10-16 2" stroke-dasharray="5 6" opacity=".6"/>
      <path d="m224 349 77 11 59-9-76-11Z" fill="#b6bfa8"/>
      <path d="m224 349 0 8 77 11 59-9v-8m-59 9v8"/>
      <path d="m232 350 68 10 50-8m-107-1 57 7 38-5" opacity=".6"/>
      <path d="M83 126v151m-6-151h12m-12 151h12" opacity=".4"/>
    `,
  },
  'shadow-mender': {
    description: 'Two ash rails hold a stretched, irregular piece of shadow. A blunt needle draws pale thread through a visible tear. A small spool at the side holds dark thread that disappears into the specimen.',
    markup: `
      <path d="m108 293 297 38 87-47-290-40Z" fill="#d8d6c7" stroke="none"/>
      <path d="m134 121 35-12 32 202-36 11Z" fill="#c8af89"/>
      <path d="m404 86 35-7 28 205-36 12Z" fill="#c8af89"/>
      <path d="m160 146 69-29 35 23 53-24 44 13 52-16 19 141-63 23-44-14-53 27-33-18-60 17Z" fill="#3b4d40"/>
      <path d="m286 142-17 30 32 21-25 29 35 31-17 20" stroke="#ece2c9" stroke-width="5"/>
      <path d="m270 151 21 13m-24 9 27 13m-12 6 28 12m-38 9 27 14m-15 5 27 14m-18 7 21 12" stroke="#b5ac83" stroke-width="3"/>
      <path d="m149 151 18-4m-14 36 19-4m-14 36 19-4m-13 36 18-4m234-116 16-4m-12 37 16-4m-12 37 16-4m-12 37 16-4" stroke-width="3"/>
      <path d="m339 200 104-141" stroke="#c8cbbf" stroke-width="7"/>
      <path d="m339 200 104-141" stroke="#273f33" stroke-width="1.5"/>
      <ellipse cx="439" cy="66" rx="3" ry="9" transform="rotate(36 439 66)" fill="#eee8d9"/>
      <path d="M440 66q56 5 44 55t30 76" stroke="#ad9673"/>
      <path d="M482 232h49v62h-49Z" fill="#bac1af"/>
      <ellipse cx="506" cy="232" rx="32" ry="10" fill="#d2bc96"/>
      <ellipse cx="506" cy="294" rx="32" ry="10" fill="#d2bc96"/>
      <path d="M482 243h49m-49 8h49m-49 8h49m-49 8h49m-49 8h49m-49 8h49" stroke="#34483a" stroke-width="4"/>
      <path d="M483 271q-22-5-41-28" stroke="#34483a" stroke-width="3"/>
      <path d="M174 344h250m-250-6v12m250-12v12" opacity=".4"/>
    `,
  },
};

export function renderDiagram(id: DiagramId, title: string, instance: string): string {
  const drawing = drawings[id];
  const prefix = escapeMarkup(`museum-${instance}-${id}`);
  return `
    <svg class="museum-diagram" viewBox="0 0 600 390" role="img"
      aria-labelledby="${prefix}-title ${prefix}-description" xmlns="http://www.w3.org/2000/svg">
      <title id="${prefix}-title">${escapeMarkup(title)}: imagined object study</title>
      <desc id="${prefix}-description">${escapeMarkup(drawing.description)}</desc>
      <g fill="none" stroke="#273f33" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M25 40V25h15m520 0h15v15M25 350v15h15m520 0h15v-15" opacity=".24"/>
        ${drawing.markup}
      </g>
    </svg>`;
}
