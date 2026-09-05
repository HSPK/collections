import { escapeMarkup } from '../../core/page';
import { destinations } from './data';
import type { DestinationId } from './data';

const scenes: Record<DestinationId, { label: string; markup: string }> = {
  'aster-quay': {
    label: 'Aster Quay: a blue-and-cream lighthouse, coral harbor houses, and a little ferry on a striped blue sea.',
    markup: `
      <rect width="800" height="490" fill="#dce8e9"/>
      <circle cx="611" cy="111" r="60" fill="#e99675"/>
      <path d="M0 179Q92 145 176 173T340 151T512 165T800 139V287H0Z" fill="#adc6cd"/>
      <path d="M0 218Q117 186 221 211T450 197T800 211V490H0Z" fill="#537e98"/>
      <path d="M0 287Q148 258 275 287T525 290T800 267V490H0Z" fill="#244f75"/>
      <path d="M0 337Q120 307 232 333T444 337T658 327T800 339M0 396Q116 373 230 394T459 392T690 392T800 403M0 459Q139 439 259 456T489 454T800 453" fill="none" stroke="#77aab7" stroke-width="15"/>
      <g fill="none" stroke="#bdd5d8" stroke-width="3">
        <path d="M30 304h66m66 4h44m259-13h86m69 11h73m-509 59h83m50 6h114m-366 58h57m446-3h61m47 1h61M341 466h64"/>
        <path d="M477 248h91m87-5h87m-335 10h30"/>
      </g>
      <path d="M15 269 39 236H202L229 269Z" fill="#234766"/>
      <path d="M60 228 72 90H126L142 228Z" fill="#fff4da"/>
      <path d="M67 149H132L135 176H64ZM74 96H124L127 119H72Z" fill="#315d7e"/>
      <path d="M65 90H133L122 72H76Z" fill="#d16e58"/>
      <rect x="78" y="52" width="40" height="22" fill="#315d7e"/>
      <path d="M72 52 98 35 124 52Z" fill="#d16e58"/>
      <path d="M98 22V35M65 78H133" fill="none" stroke="#234766" stroke-width="3"/>
      <path d="M88 230V199Q103 184 117 199V230" fill="#315d7e"/>
      <g fill="#234766">
        <rect x="265" y="218" width="352" height="17"/>
        <path d="M281 234h9v48h-9zm65 0h9v41h-9zm88 0h9v52h-9zm87 0h9v43h-9zm75 0h9v42h-9z"/>
      </g>
      <path d="M290 160 327 130 367 160V221H290Z" fill="#d96d55"/>
      <path d="M282 160 327 123 373 160" fill="none" stroke="#fff0d5" stroke-width="7"/>
      <path d="M375 177 410 146 448 177V221H375Z" fill="#f3d3ac"/>
      <path d="M369 177 410 141 454 177" fill="none" stroke="#315d7e" stroke-width="6"/>
      <path d="M459 146 504 113 551 146V221H459Z" fill="#e59173"/>
      <path d="M452 146 504 108 558 146" fill="none" stroke="#fff0d5" stroke-width="7"/>
      <path d="M556 180 583 157 611 180V221H556Z" fill="#f7e6c6"/>
      <g fill="#234766">
        <path d="M304 177h13v20h-13zm31 0h13v20h-13zm63 12h20v32h-20zm80-25h15v19h-15zm34 0h15v19h-15zm-18 35h16v22h-16zm82-12h12v19h-12z"/>
      </g>
      <path d="M624 226H800V244H615Z" fill="#f4d1a8"/>
      <path d="M660 244v58m52-58v59m57-59v43" stroke="#234766" stroke-width="10"/>
      <path d="M611 215H800M630 198v31m64-31v31m66-31v31" fill="none" stroke="#234766" stroke-width="5"/>
      <path d="M566 196v-64l34 12-34 12" fill="#d96d55" stroke="#234766" stroke-width="3"/>
      <g transform="translate(242 317)">
        <path d="M-16 43H172L144 77H18Z" fill="#f5e6c9"/>
        <path d="M14 33H139V48H14Z" fill="#d96d55"/>
        <path d="M36-7H120V33H36Z" fill="#f7edda"/>
        <path d="M30-8H125L110-23H41Z" fill="#cf624d"/>
        <path d="M47 2h17v20H47zm27 0h17v20H74zm27 0h10v20h-10" fill="#315d7e"/>
        <path d="M77-23V-65M77-59l29 9-29 10" fill="#e5a47b" stroke="#234766" stroke-width="3"/>
        <path d="M31 65h95" stroke="#d96d55" stroke-width="5"/>
      </g>
      <path d="M667 490v-92m0 46-33-22m33 6 30-30m-10 92v-63m0 36 28-22M13 490v-51m0 30 25-17" fill="none" stroke="#e4bc92" stroke-width="5"/>
      <g fill="none" stroke="#315d7e" stroke-width="3">
        <path d="M346 84q10-10 20 0 10-10 20 0m56-25q8-8 16 0 8-8 16 0M195 115q9-9 18 0 9-9 18 0"/>
      </g>
    `,
  },
  'bellwether-steps': {
    label: 'Bellwether Steps: apricot houses climbing a steep hill, zigzagging cream stairways, and a grocery basket on a pulley.',
    markup: `
      <rect width="800" height="490" fill="#e7e7d9"/>
      <circle cx="120" cy="102" r="54" fill="#e59d79"/>
      <path d="M0 329 148 266 287 232 403 157 581 122 800 20V490H0Z" fill="#be7970"/>
      <path d="M0 392 155 337 314 310 438 235 593 218 800 143V490H0Z" fill="#985c5c"/>
      <path d="M0 450 155 405 302 389 484 320 640 307 800 238V490H0Z" fill="#6c5666"/>
      <g stroke="#294d68" stroke-width="5">
        <path d="M511 88h121v145H511Z" fill="#efc99f"/>
        <path d="M502 88 572 47 642 88Z" fill="#cc6955"/>
        <path d="M653 54h107v153H653Z" fill="#dc8c6e"/>
        <path d="M645 54 706 18 768 54Z" fill="#f4dbb4"/>
        <path d="M330 168h119v149H330Z" fill="#e6a77e"/>
        <path d="M321 169 390 121 459 169Z" fill="#f8e4bd"/>
        <path d="M147 249h112v132H147Z" fill="#eecd9f"/>
        <path d="M138 249 204 209 268 249Z" fill="#ce735c"/>
        <path d="M474 326h126v164H474Z" fill="#d67b60"/>
        <path d="M463 326 537 279 611 326Z" fill="#f2d7ad"/>
        <path d="M649 266h134v224H649Z" fill="#ecb78e"/>
        <path d="M639 266 716 212 793 266Z" fill="#cb6a55"/>
        <path d="M31 392h115v98H31Z" fill="#df9a76"/>
        <path d="M22 392 88 349 156 392Z" fill="#f5dbb3"/>
      </g>
      <g fill="#2c526b">
        <path d="M531 111h21v34h-21zm49 0h21v34h-21zm-49 53h21v34h-21zm49 0h21v34h-21zM675 80h20v31h-20zm40 0h20v31h-20zm-22 50h24v48h-24zM350 192h22v33h-22zm44 0h22v33h-22zm-25 57h29v60h-29zM166 272h21v28h-21zm43 0h21v28h-21zm-25 47h29v53h-29zM495 351h21v32h-21zm45 0h21v32h-21zm-18 68h31v71h-31zM672 290h25v40h-25zm50 0h25v40h-25zm-50 62h25v40h-25zm50 0h25v40h-25zm-41 80h39v58h-39zM52 413h22v30H52zm43 0h22v30H95z"/>
      </g>
      <path d="M302 490V423H406V345H296V276H478V206H462V143H504" fill="none" stroke="#f6e3bf" stroke-width="43"/>
      <path d="M283 470h38m-38-15h38m-38-15h38m67-17v-18m-38 18v-18m56-3h38m-38-16h38m-38-16h38m-38-16h38m-110-8v-18m39 18v-18m-38-7h-38m38-16h-38m183-24h-38m38-16h-38m38-16h-38m22-49h-38m38-16h-38m38-16h-38" fill="none" stroke="#a78273" stroke-width="3"/>
      <path d="M241 253 374 166M250 260 383 173" fill="none" stroke="#244b66" stroke-width="2"/>
      <path d="M298 217v32m-21 0h45l-6 26h-32Z" fill="#c87053" stroke="#244b66" stroke-width="3"/>
      <path d="M511 119 443 195" fill="none" stroke="#294d68" stroke-width="2"/>
      <path d="m481 151-11 13 16 13 11-13m-40 16-10 11 14 13 10-11" fill="#f8eed4"/>
      <path d="M549 38V13m-13 0h26l-4 22h-18Z" fill="#365875" stroke="#294d68" stroke-width="3"/>
      <path d="M196 489v-39m-24 0h48m-44 0v39m41-39v39m-33-57h29v32h-29" fill="none" stroke="#f6dfb5" stroke-width="5"/>
      <path d="M242 489v-24m-13 0h28l-4 24" fill="#30556f"/>
      <path d="M243 466v-40m0 15-13-13m13 24 14-18" fill="none" stroke="#8ba49b" stroke-width="5"/>
      <path d="M25 173h91m-36-9h84m-6-67h83" stroke="#f7efdd" stroke-width="9"/>
    `,
  },
  morrowmere: {
    label: 'Morrowmere: blue stilt houses and a lingering moon reflected in a still lake, with a small orange boat in the foreground.',
    markup: `
      <rect width="800" height="490" fill="#d2dfdf"/>
      <circle cx="555" cy="86" r="42" fill="#fff3d5"/>
      <path d="M0 156Q135 91 249 164T461 149T655 160T800 134V253H0Z" fill="#a3bcc5"/>
      <path d="M0 196Q138 163 264 193T501 179T800 193V260H0Z" fill="#799cad"/>
      <rect y="247" width="800" height="243" fill="#537c96"/>
      <path d="M0 265H800M0 393H800M0 434H800" stroke="#6991a7" stroke-width="13"/>
      <g fill="#234d6d">
        <path d="M103 206h9v74h-9zm83 0h9v74h-9zm107 9h9v62h-9zm86 0h9v62h-9zm170-20h9v85h-9zm89 0h9v85h-9z"/>
        <path d="M0 223H458V234H0Zm476-18H800V216H476Z"/>
      </g>
      <g>
        <path d="M88 143 147 98 209 143V220H88Z" fill="#e6ac8e"/>
        <path d="M79 143 147 88 218 143" fill="none" stroke="#f4e5c8" stroke-width="9"/>
        <path d="M271 163 338 117 402 163V222H271Z" fill="#f0d6b2"/>
        <path d="M263 163 338 108 410 163" fill="none" stroke="#335978" stroke-width="9"/>
        <path d="M530 130 598 79 668 130V204H530Z" fill="#cb7d71"/>
        <path d="M521 130 598 70 677 130" fill="none" stroke="#f3e1c3" stroke-width="9"/>
      </g>
      <g fill="#335c7d">
        <path d="M108 160h23v30h-23zm51 0h23v30h-23zm139 20h21v29h-21zm52 0h21v42h-21zm201-33h23v33h-23zm53 0h23v33h-23z"/>
      </g>
      <g opacity=".35">
        <path d="M88 284H209V346L147 391 88 346Z" fill="#e6ac8e"/>
        <path d="M271 284H402V335L338 381 271 335Z" fill="#f0d6b2"/>
        <path d="M530 286H668V361L598 410 530 361Z" fill="#cb7d71"/>
        <path d="M108 306h23v30h-23zm51 0h23v30h-23zm139-2h21v29h-21zm52 0h21v29h-21zm201 9h23v33h-23zm53 0h23v33h-23z" fill="#1d4669"/>
      </g>
      <ellipse cx="471" cy="363" rx="28" ry="37" fill="#eedeba" opacity=".85"/>
      <path d="M425 347h91m-93 15h111m-95 14h99M91 312h149m-121 53h112m61-44h131m80 102h156m-72-87h117" stroke="#7196aa" stroke-width="4"/>
      <path d="M214 125V221M267 122V218M214 139Q239 152 267 137" fill="none" stroke="#234d6d" stroke-width="3"/>
      <path d="m225 144-1 23 17 2 2-23m5 1 1 28 11-1-1-29" fill="#fff1d6"/>
      <path d="M42 490V348m0 40-24-21m24 55 29-31m-43 99V395m0 25-18-18M740 490V346m0 49-23-20m23 52 26-27m-9 90V386m0 36 17-17" fill="none" stroke="#214d6c" stroke-width="5"/>
      <path d="M326 431H476L448 457H352Z" fill="#d98365"/>
      <path d="M343 430q54-20 117 0" fill="#efcb9f"/>
      <path d="m407 418 57-36" stroke="#e9ddc0" stroke-width="6"/>
      <path d="M15 185h179m175-36h143m166 27h122" stroke="#d8e3df" stroke-width="12" opacity=".6"/>
      <path d="M657 59q11-10 22 0 11-10 22 0M354 70q8-8 16 0 8-8 16 0" fill="none" stroke="#537994" stroke-width="3"/>
    `,
  },
  threadfall: {
    label: 'Threadfall: coral wooden houses suspended on a rope bridge between sheer pink cliffs, above a winding blue river.',
    markup: `
      <rect width="800" height="490" fill="#dce5df"/>
      <circle cx="409" cy="91" r="51" fill="#f4c299"/>
      <path d="M196 347 349 169 425 275 543 166 655 351V490H162Z" fill="#9cb4bd"/>
      <path d="M205 418 364 278 459 362 558 289 646 443V490H182Z" fill="#537a91"/>
      <path d="M0 97 78 71 142 105 206 90 249 127 201 192 211 245 171 325 185 396 138 490H0Z" fill="#d9987e"/>
      <path d="M0 97 78 71 142 105 206 90 249 127 128 145 91 132 0 157Z" fill="#f0c3a0"/>
      <path d="M57 150 82 238 46 317 81 387 39 490M136 161 150 238 116 317 133 379 99 459" fill="none" stroke="#b77568" stroke-width="16"/>
      <path d="M800 50 714 86 669 72 590 116 550 171 588 246 565 326 619 393 605 490H800Z" fill="#d18b73"/>
      <path d="M800 50 714 86 669 72 590 116 550 171 621 155 679 118 730 126 800 96Z" fill="#f0c3a0"/>
      <path d="M665 172 630 223 659 295 637 369 671 490M749 134 712 225 738 295 709 363 749 452" fill="none" stroke="#b47164" stroke-width="17"/>
      <path d="M359 490Q315 451 399 420T418 372" fill="none" stroke="#b1d4d2" stroke-width="24"/>
      <path d="M179 185Q379 304 613 172M179 153Q379 272 613 140" fill="none" stroke="#294c64" stroke-width="5"/>
      <path d="M183 215Q397 330 620 204" fill="none" stroke="#294c64" stroke-width="14"/>
      <path d="M184 209Q397 324 619 198" fill="none" stroke="#ecd0a9" stroke-width="7"/>
      <g fill="none" stroke="#294c64" stroke-width="3">
        <path d="M205 167v52m39-36v54m40-40v55m42-43v54m43-44v56m45-57v54m45-65v54m43-69v51m43-73v49m41-76v48"/>
      </g>
      <g stroke="#294c64" stroke-width="4">
        <path d="M255 170h71v69H255Z" fill="#d7755c"/>
        <path d="M247 170 291 136 334 170Z" fill="#f2d6ae"/>
        <path d="M364 198h75v72H364Z" fill="#edbd92"/>
        <path d="M355 198 402 159 448 198Z" fill="#cc6954"/>
        <path d="M478 170h75v67H478Z" fill="#d7755c"/>
        <path d="M470 170 515 135 561 170Z" fill="#f2d6ae"/>
      </g>
      <g fill="#294c64">
        <path d="M271 185h15v24h-15zm28 0h13v41h-13zm80 27h15v25h-15zm29 0h15v40h-15zm85-27h15v25h-15zm29 0h15v39h-15z"/>
      </g>
      <path d="M181 114v109M617 115v105" stroke="#294c64" stroke-width="7"/>
      <path d="m183 118 34 6-8 14-26-4m435-15 32-6 4 15-35 9" fill="#d9785e"/>
      <path d="M233 106Q388 158 560 89" fill="none" stroke="#294c64" stroke-width="2"/>
      <path d="m275 118 18 5-11 29-17-6m61-12 20 2-5 26-21-2m79-25 16-1 4 23-17 1m66-41 19-5 8 27-17 5" fill="#f8e9cb"/>
      <path d="M38 55h135m432-9h114M342 42h78" stroke="#f5edda" stroke-width="11"/>
      <path d="M51 443h64m-41-29h54m557 46h77m-70-37h44" stroke="#f0c3a0" stroke-width="4"/>
      <path d="M347 105q9-9 18 0 9-9 18 0m112-42q7-7 14 0 7-7 14 0" fill="none" stroke="#53778e" stroke-width="3"/>
    `,
  },
  'orchard-of-tides': {
    label: 'Orchard of Tides: pale round fruit on sculptural coral trees standing in shallow blue water, with a picking boat and a tied ladder.',
    markup: `
      <rect width="800" height="490" fill="#ecd4ba"/>
      <circle cx="613" cy="106" r="60" fill="#da8d6e"/>
      <path d="M0 211Q116 180 230 207T466 194T800 206V490H0Z" fill="#9dbec3"/>
      <path d="M0 294Q145 272 271 300T530 283T800 304V490H0Z" fill="#6f9da9"/>
      <path d="M0 399Q140 382 278 404T544 397T800 392V490H0Z" fill="#345f7f"/>
      <path d="M0 224h178m53 8h218m128-8h223M55 332h156m-125 18h62m273-21h161m65 15h153M10 436h172m195 5h160m116-9h147" stroke="#c3d7d1" stroke-width="3"/>
      <g fill="none" stroke="#7e6268" stroke-width="16">
        <path d="M150 337V151m0 73-74-63m74 27 64-69m-64 139-55-27m119-112V91m-99 104v-82m-39 49H51"/>
        <path d="M394 302V115m0 94-72-62m72 27 60-63m-60 129 65-43m-137-50v-36m132 0V79"/>
        <path d="M643 377V220m0 65-78-61m78 18 64-66m-64 143 55-32m-133-63v-46m142-2v-29"/>
      </g>
      <g fill="none" stroke="#bb7667" stroke-width="9">
        <path d="M145 333V146m0 72-66-55m66 19 66-65m-65 135-49-24"/>
        <path d="M389 298V117m0 87-64-54m64 18 61-54m-61 120 67-42"/>
        <path d="M638 374V218m0 60-69-52m69 11 66-60m-66 135 58-28"/>
      </g>
      <g fill="#fff0d3" stroke="#d2a27f" stroke-width="2">
        <circle cx="77" cy="152" r="25"/><circle cx="145" cy="126" r="29"/><circle cx="215" cy="96" r="26"/>
        <circle cx="102" cy="227" r="21"/><circle cx="210" cy="197" r="22"/><circle cx="48" cy="104" r="20"/>
        <circle cx="391" cy="99" r="28"/><circle cx="321" cy="116" r="24"/><circle cx="453" cy="85" r="27"/>
        <circle cx="462" cy="191" r="23"/><circle cx="342" cy="226" r="20"/>
        <circle cx="641" cy="204" r="28"/><circle cx="563" cy="175" r="25"/><circle cx="705" cy="153" r="29"/>
        <circle cx="703" cy="278" r="21"/><circle cx="749" cy="233" r="23"/>
      </g>
      <g stroke="#b87b66" stroke-width="3">
        <path d="m76 132 2-10m68-21 2-12m69-20 1-10m174 3 1-12m-72 46 1-11m130-20 2-10m187 111 1-12m64-40 2-11m-144 9 1-10"/>
      </g>
      <g fill="#ddd1b3">
        <path d="M137 309h25v39h-25zm244-26h24v36h-24zm248 72h29v38h-29z"/>
      </g>
      <path d="m438 126-56 208m79-202-56 208m27-180 17 5m-23 18 18 5m-24 19 17 5m-23 19 17 5m-24 19 17 5m-23 19 17 5m-24 20 18 5" fill="none" stroke="#efe0bd" stroke-width="6"/>
      <path d="M393 306q-34 3-18-13t23 8" fill="none" stroke="#315e7b" stroke-width="3"/>
      <g transform="translate(240 368)">
        <path d="M0 22H187L155 59H31Z" fill="#d78063"/>
        <path d="M14 22Q91-1 173 22" fill="#f3ddba"/>
        <path d="M78 2h47l-6 21H84Z" fill="#a97257"/>
        <circle cx="87" cy="0" r="10" fill="#f9e7c5"/><circle cx="109" cy="-3" r="12" fill="#f9e7c5"/>
        <path d="m150 1 58-46" stroke="#edddbb" stroke-width="6"/>
      </g>
      <path d="M7 470h98m-72-12h42m469 12h100m-78-12h58M100 359h75m454 43h64m-350-63h86" stroke="#a8c5c5" stroke-width="3"/>
      <path d="M283 76q8-8 16 0 8-8 16 0" fill="none" stroke="#7f8f98" stroke-width="3"/>
    `,
  },
  'paper-fen': {
    label: 'Paper Fen: angular folded-paper houses, origami birds, and a paper boat among blue reeds under soft pink rain.',
    markup: `
      <rect width="800" height="490" fill="#e8d9cf"/>
      <path d="M0 194Q131 163 264 196T504 175T800 193V490H0Z" fill="#b6c7c4"/>
      <path d="M0 259Q103 240 240 267T531 252T800 278V490H0Z" fill="#7da3ac"/>
      <path d="M0 366Q151 343 305 372T598 351T800 374V490H0Z" fill="#4f7c96"/>
      <g fill="none" stroke="#c0aa9f" stroke-width="2" opacity=".65">
        <path d="m58 51-9 23m63-25-9 23m53-20-9 23m74-48-9 23m61 3-9 23m68-31-9 23m62-28-9 23m66 4-9 23m66-28-9 23m63-24-9 23m65 2-9 23m63-22-9 23m-633 60-9 23m73-19-9 23m67-26-9 23m473-4-9 23m73-19-9 23"/>
      </g>
      <path d="M63 253 151 177 239 252 219 295 90 295Z" fill="#f4e8ca"/>
      <path d="m151 177 13 118h55l20-43Z" fill="#dcab91"/>
      <path d="M41 249 150 140 258 249 151 220Z" fill="#f9ecd0"/>
      <path d="M150 140 151 220 258 249Z" fill="#d69077"/>
      <path d="M151 220 87 257l-46-8 110-29" fill="#dfc6a8"/>
      <path d="M115 259h21v36h-21zm69-9 21 7v24h-21z" fill="#315c78"/>
      <path d="M334 199 415 129 499 203 482 259 354 259Z" fill="#edc3a5"/>
      <path d="m415 129 13 130h54l17-56Z" fill="#cf8c75"/>
      <path d="M312 204 414 91 522 204 415 174Z" fill="#f8e7c9"/>
      <path d="M414 91 415 174 522 204Z" fill="#c68170"/>
      <path d="M415 174 353 210l-41-6Z" fill="#dcc09f"/>
      <path d="M376 224h23v35h-23zm70-9 21 5v24h-21z" fill="#315c78"/>
      <path d="M554 258 641 190 732 261 707 311H574Z" fill="#f7e5c6"/>
      <path d="m641 190 8 121h58l25-50Z" fill="#daa38b"/>
      <path d="M533 264 640 154 754 264 641 231Z" fill="#fff0d2"/>
      <path d="M640 154 641 231 754 264Z" fill="#d4937b"/>
      <path d="M641 231 574 270l-41-6Z" fill="#dfc4a5"/>
      <path d="M599 275h23v36h-23zm74-8 23 7v24h-23z" fill="#315c78"/>
      <path d="M454 151v-58l-24-19 35 10 10 77Z" fill="#eed6b5"/>
      <path d="m430 74 14-14 35 10-14 14Z" fill="#a76d60"/>
      <path d="M72 309h143m132-39h133m88 53h137" stroke="#d4dbcd" stroke-width="3"/>
      <g fill="none" stroke="#294f70" stroke-width="5">
        <path d="M40 490V325m0 68-26-39m26 68 27-56m4 124V357m0 66 22-43m-81 110V393M730 490V332m0 64-23-35m23 66 31-60m-8 123V399m0 43 23-34M261 376V261m0 61-26-42m26 66 26-49"/>
      </g>
      <path d="M317 392 389 327 449 392 516 357 474 434H357Z" fill="#f3e4c4"/>
      <path d="M389 327 406 392H317Z" fill="#dba48a"/>
      <path d="M317 392H449L474 434H357Z" fill="#eac6a6"/>
      <path d="M406 392 516 357 474 434Z" fill="#c9836e"/>
      <path d="M378 435h106m-128 16h105" stroke="#abc6c4" stroke-width="3"/>
      <g>
        <path d="m242 114 61 27 45-53-18 61-27-8-37 21 18-29Z" fill="#fff0d2"/>
        <path d="m303 141 45-53-18 61Z" fill="#ce8f78"/>
        <path d="m539 91 42 22 34-41-13 46-21-5-28 16 13-22Z" fill="#fff0d2"/>
        <path d="m581 113 34-41-13 46Z" fill="#ce8f78"/>
      </g>
      <path d="M124 391h105m-78 21h51m414 37h88m-478 30h149m162-80h41" stroke="#9cbbbc" stroke-width="3"/>
    `,
  },
  cinderstep: {
    label: 'Cinderstep: a rust-red terraced mountain, blue-roofed pottery kilns, cream stone stairs, and large clay pots.',
    markup: `
      <rect width="800" height="490" fill="#ebd7b8"/>
      <circle cx="630" cy="95" r="53" fill="#df9c6e"/>
      <path d="M0 291 93 255 215 147 359 76 497 168 605 184 800 294V490H0Z" fill="#be6b55"/>
      <path d="m215 147 144-71 138 92-116-31-66 22Z" fill="#e4aa7a"/>
      <path d="M0 338 155 286 282 214 437 207 558 264 687 262 800 325V490H0Z" fill="#a95c4e"/>
      <path d="M0 416 149 358 269 324 421 328 579 348 688 321 800 361V490H0Z" fill="#874e48"/>
      <path d="m239 169 78 9 69-19 55 17m-279 60 70-14 72 11 132-7m-201 52 62-10 93 14 119-3M18 353l95-25 72-3m371-14 71-17 113 18" fill="none" stroke="#da936c" stroke-width="5"/>
      <path d="M322 490V426H458V364H344V298H499V236H433V195" fill="none" stroke="#e7c398" stroke-width="36"/>
      <path d="M306 476h32m-32-14h32m-32-14h32m79-22v-15m-34 15v-15m75-4h32m-32-15h32m-32-15h32m-81-13v-15m-35 15v-15m-17-10h32m-32-14h32m-32-14h32m85-12v-15m-36 15v-15m109-1h-32m32-15h-32m-34-15v-15m-18-5h32" fill="none" stroke="#a07761" stroke-width="3"/>
      <g stroke="#2e4e64" stroke-width="4">
        <path d="M132 271q0-64 57-64t57 64v54H132Z" fill="#dc9470"/>
        <path d="M128 266q5-65 61-65t62 65Z" fill="#3c6176"/>
        <path d="M556 287q0-56 51-56t51 56v60H556Z" fill="#e0a47b"/>
        <path d="M551 280q8-54 56-54t56 54Z" fill="#31576f"/>
        <path d="M274 183h66v83h-66Z" fill="#e4b182"/>
        <path d="M263 183 307 157 351 183Z" fill="#385b70"/>
      </g>
      <path d="M175 200v-50h25v52M594 228v-44h22v44" fill="#cb8769" stroke="#2e4e64" stroke-width="4"/>
      <path d="M169 137q-21-22 5-43t-2-34m422 111q21-22-2-41t1-38" fill="none" stroke="#f4e8d0" stroke-width="13"/>
      <path d="M165 325v-37q24-27 49 0v37m365 22v-33q28-28 55 0v33" fill="#304a5b"/>
      <path d="M177 325v-29q12-13 25 0v29m389 22v-26q14-14 31 0v26" fill="#e5a068"/>
      <path d="M290 205h15v21h-15zm20 34h17v27h-17z" fill="#31546a"/>
      <path d="M19 490v-24h238v24M35 466v-13h207v13" fill="#5c4946"/>
      <g>
        <path d="M58 452q-22-34 0-70h46q23 35 0 70Z" fill="#e0a47b"/>
        <ellipse cx="81" cy="382" rx="25" ry="8" fill="#f0bc8a"/>
        <ellipse cx="81" cy="382" rx="15" ry="4" fill="#85504a"/>
        <path d="M130 451q-24-30-12-56h56q12 26-12 56Z" fill="#c77b5e"/>
        <ellipse cx="146" cy="395" rx="29" ry="8" fill="#e8b488"/>
        <path d="M187 452v-25q-18-11-12-31h39q6 20-12 31v25Z" fill="#ebbf90"/>
        <path d="M177 404q-25-11-23 12t29 10" fill="none" stroke="#e4ad7e" stroke-width="7"/>
      </g>
      <path d="M689 490v-82m0 37-27-27m27 15 24-30m11 87v-47m0 22 18-21" fill="none" stroke="#d9a77d" stroke-width="6"/>
      <path d="M617 405h48m-22-12h35M80 165h78m365-112h84" stroke="#f1e2c6" stroke-width="7"/>
      <path d="M381 84v-24m-12 7 24 10m-23 0 22-10" stroke="#365971" stroke-width="3"/>
    `,
  },
  'lantern-end': {
    label: 'Lantern End: a snowy midnight-blue village, warm coral paper lanterns, a tiny tram, and a fox on the far hill.',
    markup: `
      <rect width="800" height="490" fill="#203d60"/>
      <circle cx="566" cy="90" r="42" fill="#ecd5af"/>
      <circle cx="582" cy="76" r="39" fill="#203d60"/>
      <g fill="#e6dbc2">
        <circle cx="74" cy="67" r="2"/><circle cx="178" cy="34" r="2.5"/><circle cx="269" cy="76" r="2"/>
        <circle cx="355" cy="32" r="2"/><circle cx="457" cy="106" r="2"/><circle cx="682" cy="49" r="2.5"/>
        <circle cx="742" cy="116" r="2"/><circle cx="113" cy="161" r="2"/><circle cx="401" cy="150" r="2"/>
        <circle cx="621" cy="164" r="2"/><circle cx="311" cy="129" r="2"/><circle cx="218" cy="152" r="2"/>
      </g>
      <path d="M0 248Q113 182 226 249T453 224T644 235T800 189V490H0Z" fill="#496c89"/>
      <path d="M0 305Q109 264 217 302T449 283T653 297T800 265V490H0Z" fill="#9bb8c3"/>
      <path d="M0 391Q118 339 254 377T503 357T800 383V490H0Z" fill="#c9d8d7"/>
      <g>
        <path d="M64 241 130 186 200 241V336H64Z" fill="#294867"/>
        <path d="M49 243 130 170 215 243 199 255 131 196 66 253Z" fill="#e6e6d8"/>
        <path d="M311 251 366 206 426 251V334H311Z" fill="#355675"/>
        <path d="M298 254 366 189 440 253 425 264 367 216 311 264Z" fill="#e8e6d7"/>
        <path d="M581 259 660 193 739 259V365H581Z" fill="#254463"/>
        <path d="M564 260 660 175 756 260 739 272 660 205 580 272Z" fill="#e6e6d8"/>
        <path d="M155 200v-51h22v70m512-21v-48h24v68" fill="#355675"/>
        <path d="M148 149h36m498 1h38" stroke="#e2e2d3" stroke-width="8"/>
      </g>
      <g fill="#e8b37f">
        <path d="M84 265h23v31H84zm57 0h23v31h-23zm194 8h21v27h-21zm38 0h21v27h-21zm234 8h28v38h-28zm57 0h28v38h-28z"/>
      </g>
      <path d="M116 336v-28h25v28m208-2v-25h22v25m268 31v-39h31v39" fill="#d39170"/>
      <path d="M95 265v31m58-31v31m465-15v38m57-38v38" stroke="#294867" stroke-width="3"/>
      <path d="M0 430Q260 398 511 422T800 433M0 444Q260 412 511 436T800 447" fill="none" stroke="#688b9e" stroke-width="4"/>
      <g transform="translate(258 354)">
        <rect width="176" height="67" rx="8" fill="#c77860"/>
        <path d="M-9 2h194l-10-15H2Z" fill="#e6d9bd"/>
        <path d="M11 14h27v30H11zm38 0h28v30H49zm39 0h28v30H88zm45 0h29v53h-29" fill="#f0cb93"/>
        <path d="M0 54H123M147-13v-20l23-14" fill="none" stroke="#294969" stroke-width="4"/>
        <circle cx="33" cy="69" r="10" fill="#294969"/><circle cx="145" cy="69" r="10" fill="#294969"/>
      </g>
      <path d="M19 80Q211 172 423 64M461 73Q637 145 800 82" fill="none" stroke="#112e4d" stroke-width="5"/>
      <g>
        <path d="M74 104v31m114 0v32m113-28v34m230-79v39m134-17v32m101-47v28" stroke="#e7bf91" stroke-width="3"/>
        <path d="M54 140q20-13 40 0l-4 49q-16 12-32 0Z" fill="#e09970"/>
        <path d="M168 174q20-13 40 0l-4 49q-16 12-32 0Z" fill="#d68465"/>
        <path d="M281 181q20-13 40 0l-4 49q-16 12-32 0Z" fill="#e6ae7b"/>
        <path d="M511 142q20-13 40 0l-4 49q-16 12-32 0Z" fill="#d68465"/>
        <path d="M645 157q20-13 40 0l-4 49q-16 12-32 0Z" fill="#e6ae7b"/>
        <path d="M746 137q20-13 40 0l-4 49q-16 12-32 0Z" fill="#df946e"/>
      </g>
      <g fill="none" stroke="#f3ca96" stroke-width="2" opacity=".85">
        <path d="M74 139v52m-20-32h39m-37 16h36m96-1v50m-19-31h38m-36 17h35m95-29v49m-18-31h37m-36 18h35m213-76v49m-18-30h37m-36 17h35m99-32v49m-18-31h37m-36 18h35m100-70v49m-18-31h37m-36 18h35"/>
      </g>
      <path d="m499 298 16-7 22 5 15-13-3 17-14 10h-25l-16-5m19-11-2-8 9 6m-7 18-4 12m21-13 4 11" fill="#bb6d55" stroke="#bb6d55" stroke-width="3"/>
      <path d="m494 305-12-1 8-11 9 5" fill="#e5d6bf"/>
      <path d="M74 473h104m-81-15h50m397 13h154m-118-13h56" stroke="#a8c1c7" stroke-width="3"/>
    `,
  },
};

export function landscapeMarkup(id: DestinationId): string {
  const scene = scenes[id];
  return `<svg class="pp-landscape" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 490" width="800" height="490" role="img" aria-label="${escapeMarkup(scene.label)}" stroke-linecap="round" stroke-linejoin="round">${scene.markup}</svg>`;
}

export function atlasMarkup(): string {
  const route = destinations.map(({ point }) => `${point.x},${point.y}`).join(' ');
  return `
    <svg class="pp-map-drawing" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 300" width="420" height="300" role="img" aria-label="An imaginary archipelago. A dotted coral route joins the eight numbered destination buttons." stroke-linecap="round" stroke-linejoin="round">
      <rect width="420" height="300" fill="#e3e9e5"/>
      <g fill="none" stroke="#afc2c6" stroke-width=".8" opacity=".7">
        <path d="M0 75H420M0 150H420M0 225H420M105 0V300M210 0V300M315 0V300" stroke-dasharray="2 5"/>
        <path d="M12 20h21m-13 7h27m305 116h26m-15 7h24m-238 29h27m-13 7h29m-97 88h22m-11 6h31m173-228h19m-6 6h20M7 115h23m-13 6h31"/>
      </g>
      <g fill="#f7efdd" stroke="#8daab2" stroke-width="1.3">
        <path d="M35 37 63 23 79 31 94 18 119 23 136 10 171 21 194 15 226 29 236 46 226 65 240 82 225 99 189 91 171 111 155 108 143 127 153 148 138 169 107 160 90 169 67 149 46 151 23 132 28 108 15 91 34 70 24 53Z"/>
        <path d="m292 18 33 7 13 19 30 1 20 20-6 27 15 24-16 20 8 34-14 28 7 25-24 17-8 33-28 12-24-9-25 12-29-21 2-31 21-17-1-22 23-21-10-23 12-19-11-25 16-16-6-25Z"/>
        <path d="m49 189 26-11 21 11 28-1 12 19 36-6 23 18 1 31-20 17-33-7-22 16-29-9-13 8-31-16-4-24-17-15Z"/>
        <path d="m228 164 11-12 17 4 5 18-12 11-19-4Z"/>
        <path d="m190 133 14-7 9 11-5 13-16-1Z"/>
      </g>
      <g fill="none" stroke="#aab8b5" stroke-width="1.5">
        <path d="m111 64 9-15 10 15m-4 0 10-19 11 19m53 17 9-17 9 17m-2 0 7-12 7 12M296 135l9-17 10 17m-5 0 9-21 12 21m-2 0 8-14 8 14M59 227l8-15 9 15m-2 0 10-21 12 21"/>
      </g>
      <polyline points="${route}" fill="none" stroke="#e9b39e" stroke-width="8" opacity=".25"/>
      <polyline points="${route}" fill="none" stroke="#bb6654" stroke-width="2" stroke-dasharray="2 7"/>
      <g transform="translate(389 260)" stroke="#59768b" fill="none">
        <path d="M0-17V17M-12 0H12" stroke-width="1"/>
        <path d="M0-17-4-6 0-9 4-6Z" fill="#59768b" stroke-width="1"/>
      </g>
      <text x="389" y="237" text-anchor="middle" font-family="monospace" font-size="14" fill="#59768b">N?</text>
      <path d="M18 283h52m-52-4v8m52-8v8" stroke="#59768b" stroke-width="1.5"/>
      <text x="78" y="287" font-family="monospace" font-size="13" fill="#59768b">a little farther</text>
    </svg>`;
}
