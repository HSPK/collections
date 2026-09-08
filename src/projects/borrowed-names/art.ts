import { escapeMarkup } from '../../core/markup';
import { NPCS, SCENE_IDS, SCENES } from './data';
import type { NpcId, SceneId } from './data';

// All paths and engraving marks are authored here; no downloaded art or image service.
export function portrait(id: NpcId, suffix = 'scene'): string {
  const n = NPCS[id].portrait, uid = `bn-face-${id}-${suffix}`;
  const skin = ['#c59b78', '#d8b49a', '#b7afa0', '#b7917c', '#ab866a', '#c3aa94'][n];
  const features = [
    '<path d="M42 61Q34 24 70 22Q103 17 111 58L98 50 91 33 72 51 46 64Z"/><path d="M44 44 37 103 49 113 53 65M106 46 112 101 103 112 99 64"/>',
    '<path d="M40 70Q24 17 76 16Q121 21 110 79L100 77 96 46 73 33 56 54 51 89 40 100Z"/><path d="M51 21Q75 3 99 26" stroke="#de6858" stroke-width="8"/>',
    '<path d="M43 59Q42 24 66 27Q88 12 107 45L102 61 88 41 55 49Z" fill="#adb8ae"/><path d="M40 68H62M87 68H109" stroke="#051b22" stroke-width="2"/><circle cx="60" cy="69" r="13" fill="none" stroke="#bec9b9"/><circle cx="92" cy="69" r="13" fill="none" stroke="#bec9b9"/><path d="M73 69H79" stroke="#bec9b9"/>',
    '<path d="M37 61Q32 30 53 27Q70 9 105 32L112 64 98 55 91 36 58 48 45 74Z"/><path d="M39 42 43 23 104 25 109 42Z" fill="#b8cfc5"/><path d="M74 25v15M67 33h15" stroke="#b34f40" stroke-width="3"/>',
    '<path d="M38 61Q24 36 59 22Q102 10 118 51L104 65 98 39 56 49 48 78Z"/><path d="M32 40Q63 16 111 32L115 46Q64 35 32 55Z" fill="#8b5540"/><path d="M53 94 68 98" stroke="#ded1a8"/>',
    '<path d="M42 57Q39 28 65 25L105 40 105 70 95 52 56 47Z"/><path d="M27 38 56 17 105 24 121 47 88 43 50 50Z" fill="#102d35"/><path d="M53 23 103 28 109 37 50 35Z" fill="#954537"/><path d="M77 27v11M72 32h10" stroke="#d9b57a" stroke-width="2"/>',
  ][n];
  const marks = Array.from({ length: 25 }, (_, i) => `<path d="M${18 + i * 5} 157l${18 + (i % 4) * 2} -${29 + i % 7}" opacity=".18"/>`).join('');
  return `<svg viewBox="0 0 150 180" role="img" aria-label="${NPCS[id].name}的原创版画肖像" class="bn-portrait">
    <defs><linearGradient id="${uid}" x2="1" y2="1"><stop stop-color="#456f70"/><stop offset="1" stop-color="#081a22"/></linearGradient></defs>
    <path d="M1 1H149V179H1Z" fill="url(#${uid})" stroke="#83988a"/>
    <circle cx="103" cy="47" r="37" fill="#b96149" opacity=".25"/>
    <path d="M7 180 24 133 52 116 97 114 126 136 148 180" fill="${n === 3 ? '#99a99d' : n === 1 ? '#783d35' : '#18383e'}"/>
    <path d="M60 97 57 125 75 142 94 121 91 96" fill="${skin}"/>
    <path d="M47 47Q73 27 102 48L106 77 97 104 79 118 60 109 46 89Z" fill="${skin}"/>
    <path d="M80 43 99 54 100 80 91 103 78 111 85 87 79 74Z" fill="#4d5046" opacity=".44"/>
    <g fill="#11272c">${features}</g>
    <g fill="none" stroke="#152a2e" stroke-width="1.7"><path d="M52 62q10 -5 17 0M84 61q10 -4 15 2M55 72l12 -1M85 71l11 1M76 69l-4 18 8 1M65 98q12 5 22 -2"/></g>
    <g fill="#071e28"><circle cx="62" cy="72" r="2"/><circle cx="91" cy="72" r="2"/></g>
    <path d="M25 141 56 119 74 146 95 119 125 141M76 145v35" fill="none" stroke="#b1b8a0" stroke-width="1.5"/>
    <g stroke="#d4ccb0" fill="none">${marks}<path d="M52 82 58 83M51 87 59 89M89 88l7 -4M90 93l5 -3M59 104l7 3M62 110l6 2" opacity=".45"/></g>
    <path d="M8 9H29M8 9V29M142 171h-21M142 171v-20" stroke="#d4c3a1" fill="none"/>
    <circle cx="117" cy="148" r="9" fill="#be5749"/><path d="M113 144h8v8h-8zM117 142v12" stroke="#edd3ac" fill="none"/>
  </svg>`;
}

function buildings(index: number): string {
  return Array.from({ length: 14 }, (_, i) => {
    const x = i * 82 - 62, h = 100 + (i * 43 + index * 27) % 145, y = 326 - h;
    const windows = Array.from({ length: 12 }, (_, j) => {
      const wx = x + 14 + j % 3 * 18, wy = y + 28 + Math.floor(j / 3) * 31;
      return `<path d="M${wx} ${wy}h9v17h-9Z" fill="${(i + j + index) % 5 === 0 ? '#d78259' : '#477278'}" opacity="${(i + j) % 3 ? '.28' : '.7'}"/>`;
    }).join('');
    return `<path d="M${x} 364V${y}l36 -16 39 10V364" fill="${i % 2 ? '#112c38' : '#0b2430'}" stroke="#36505a" stroke-width="1"/>
      <path d="M${x + 75} ${y - 6}v369l-18 -9V${y}" fill="#071e29"/>${windows}<path d="M${x - 2} ${y}h80" stroke="#718e85" opacity=".35"/>`;
  }).join('');
}

function prop(id: SceneId): string {
  switch (id) {
    case 'ferry': return `<path d="M120 381 384 384 338 429 169 426Z" fill="#122c32" stroke="#7d8c78" stroke-width="3"/><path d="M209 381V305h120v76" fill="#193d43"/><path d="M195 305 269 272 343 305" fill="#102631" stroke="#a59572" stroke-width="3"/><path d="M230 319h69v41h-69z" fill="#dc9d62" opacity=".7"/><path d="M92 526 645 342 698 370 244 592" fill="#3e4a41"/><g stroke="#8b9c82" opacity=".6">${Array.from({ length: 12 }, (_, i) => `<path d="M${115 + i * 40} ${530 - i * 14}l73 15"/>`).join('')}</g><path d="M509 440V313M640 396V289" stroke="#233d3b" stroke-width="9"/><path d="M513 337 643 309" stroke="#b89c69" fill="none"/>`;
    case 'alley': return `<path d="M54 142 298 190 312 425 44 535Z" fill="#17303a"/><path d="M739 166 966 103 961 534 726 426Z" fill="#142e36"/><path d="M144 199 265 220 268 391 148 428Z" fill="#07181f" stroke="#65837a"/><path d="M164 311 254 300 290 416 122 459Z" fill="#695944"/><g stroke="#a68862" fill="none"><path d="M175 309v94M203 307v89M230 305v80"/></g><path d="M773 245h86v124h-86z" fill="#772e2c"/><text x="792" y="278" fill="#ffb58a" font-size="27" writing-mode="tb">抵名</text><path d="M650 410q35 -102 98 -7Z" fill="#af5840"/><path d="M699 368v141q-19 23 -23 -2" fill="none" stroke="#baa581" stroke-width="4"/>`;
    case 'theater': return `<path d="M188 137 500 83 812 137 780 427H221Z" fill="#17333b" stroke="#727d65" stroke-width="3"/><path d="M225 187h553v213H225Z" fill="#061a22"/><path d="M221 151q57 43 133 27l-13 140 -71 84 -48 2Z" fill="#863c36"/><path d="M778 151q-63 43 -132 27l14 140 67 84 51 2Z" fill="#94483b"/><path d="M343 401 659 401 757 463 236 463Z" fill="#655749"/><path d="M429 204q63 -44 126 0l-14 92 -49 36 -53 -38Z" fill="#c0b591"/><path d="M443 238l34 6 -19 15ZM543 238l-34 6 19 15ZM482 284q15 9 28 -2" stroke="#203c3d" fill="#253638" stroke-width="3"/><path d="M251 153q240 82 503 0" stroke="#ba9b68" fill="none" stroke-width="6"/>`;
    case 'registry': return `<path d="M184 113H822V440H184Z" fill="#2c4142" stroke="#8c947c" stroke-width="3"/><path d="M421 150h170v282H421Z" fill="#071e28"/><g fill="#47605a" stroke="#9a9c7a">${Array.from({ length: 24 }, (_, i) => `<rect x="${209 + (i % 4 < 2 ? i % 4 * 89 : 413 + i % 2 * 89)}" y="${155 + Math.floor(i / 4) * 43}" width="68" height="31"/><path d="M${228 + (i % 4 < 2 ? i % 4 * 89 : 413 + i % 2 * 89)} ${169 + Math.floor(i / 4) * 43}h26" stroke="#bdb28d"/>`).join('')}</g><path d="M330 461 663 461 616 407 376 407Z" fill="#6b6954"/><path d="M441 416h97l19 29H423Z" fill="#d5c99f"/><path d="M486 420v22" stroke="#a6493b" stroke-width="2"/>`;
    case 'clinic': return `<path d="M198 161 791 154 797 443H188Z" fill="#34504b"/><path d="M233 191h528v218H233Z" fill="#0e2c30"/><path d="M399 175v262M602 175v262" stroke="#8ba493" stroke-width="3"/><path d="M250 181q74 27 134 -2v212l-22 -9 -25 10 -26 -9 -29 10 -33 -8Z" fill="#89988b"/><path d="M621 178q65 30 134 0v216l-33 -11 -32 12 -30 -9 -32 3Z" fill="#9b9d87"/><path d="M441 325h126v74H441Z" fill="#b1ad90"/><path d="M446 306h55v31h-55Z" fill="#d0c9ab"/><path d="M460 394v57M556 394v57" stroke="#739085" stroke-width="5"/><path d="M714 124h44M736 102v44" stroke="#ef8265" stroke-width="9"/><path d="M400 425h76l10 21h-98Z" fill="#c4c5a1"/>`;
    case 'pump': return `<path d="M158 384V241q0 -61 59 -61h194" stroke="#6f8575" stroke-width="40" fill="none"/><path d="M644 179h109q63 0 63 68v175" stroke="#567e78" stroke-width="45" fill="none"/><path d="M157 385V244q0 -58 56 -58h198" stroke="#b2a078" stroke-width="4" fill="none"/><circle cx="501" cy="299" r="135" fill="#18393e" stroke="#987d55" stroke-width="18"/><circle cx="501" cy="299" r="110" fill="#0a252f" stroke="#50776c" stroke-width="5"/><g stroke="#ab8e62" stroke-width="13">${Array.from({ length: 8 }, (_, i) => `<path d="M501 299v-106" transform="rotate(${i * 45} 501 299)"/>`).join('')}</g><circle cx="501" cy="299" r="35" fill="#a26849" stroke="#ceb481" stroke-width="5"/><path d="M350 439h300l43 34H306Z" fill="#314d48"/><rect x="662" y="306" width="66" height="97" rx="8" fill="#b8aa82"/><circle cx="695" cy="340" r="24" fill="#203d41"/><path d="M695 321v19l14 4" stroke="#ddd2a4" stroke-width="3" fill="none"/>`;
    case 'tower': return `<path d="M379 71 616 71 655 439H336Z" fill="#1b3d46" stroke="#68877e" stroke-width="3"/><path d="M344 88 496 18 650 89Z" fill="#152b37" stroke="#ab9672" stroke-width="4"/><circle cx="498" cy="190" r="89" fill="#142a35" stroke="#a59670" stroke-width="9"/><circle cx="498" cy="190" r="71" fill="none" stroke="#4f7472" stroke-width="3"/><g stroke="#b7b593" stroke-width="3">${Array.from({ length: 12 }, (_, i) => `<path d="M498 112v14" transform="rotate(${i * 30} 498 190)"/>`).join('')}</g><path d="M498 139v52l45 25" fill="none" stroke="#de9870" stroke-width="7"/><path d="M477 309h43v98h-43Z" fill="#c14d3b"/><path d="M472 309 391 574H629L526 309Z" fill="#ce513e" opacity=".14"/><path d="M456 340h85v50h-85Z" fill="none" stroke="#f09466" stroke-width="4"/><path d="M478 355h42v19h-42ZM497 348v34" stroke="#f1c790" fill="none" stroke-width="3"/>`;
    case 'court': return `<path d="M157 156 501 82 852 156 818 185H190Z" fill="#2b4a49" stroke="#8a9d83" stroke-width="3"/><path d="M209 184v217M312 160v236M696 160v236M801 184v217" stroke="#9a9f83" stroke-width="22"/><path d="M196 187v213M791 187v213" stroke="#d1c398" stroke-width="3"/><path d="M324 177h360v190H324Z" fill="#102c32"/><circle cx="504" cy="256" r="62" fill="none" stroke="#749989" stroke-width="4"/><path d="M463 245h82M504 216v92M473 227l-19 50h38ZM535 227l-19 50h38Z" stroke="#b8af83" fill="none" stroke-width="4"/><path d="M239 405h154l49 98H202Z" fill="#3b3930"/><path d="M433 405h143l28 98H411Z" fill="#677365"/><path d="M622 405h144l38 98H602Z" fill="#7b5844"/><path d="M249 431h86M454 433h85M641 433h85" stroke="#dbc79a" stroke-width="2"/><path d="M156 517h702M113 542h787" stroke="#839887" stroke-width="6"/>`;
  }
}

export function diorama(id: SceneId, found: boolean): string {
  const scene = SCENES[id], index = SCENE_IDS.indexOf(id), uid = `bn-${id}`;
  const rain = Array.from({ length: 52 }, (_, i) => `<path d="M${(i * 71 + index * 13) % 1050} ${(i * 83) % 550}l-8 29" opacity="${.09 + i % 4 * .04}"/>`).join('');
  return `<svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${scene.name}：${scene.sub}的原创雨夜立体街景">
    <defs>
      <linearGradient id="${uid}-sky" x2="0" y2="1"><stop stop-color="#061724"/><stop offset=".58" stop-color="#244650"/><stop offset="1" stop-color="#061b27"/></linearGradient>
      <linearGradient id="${uid}-street" x2=".3" y2="1"><stop stop-color="#244a50"/><stop offset=".5" stop-color="#0b2936"/><stop offset="1" stop-color="#071a25"/></linearGradient>
      <radialGradient id="${uid}-light"><stop stop-color="${scene.color}" stop-opacity=".24"/><stop offset="1" stop-color="${scene.color}" stop-opacity="0"/></radialGradient>
    </defs>
    <path d="M0 0h1000v600H0Z" fill="url(#${uid}-sky)"/>
    <circle cx="630" cy="170" r="200" fill="url(#${uid}-light)"/>
    ${buildings(index)}
    <path d="M0 360 490 328 1000 357V600H0Z" fill="url(#${uid}-street)"/>
    <g fill="none" stroke="#60948e" opacity=".19"><path d="M0 471 1000 461M0 518 1000 497M0 569 1000 560M500 340 250 600M525 340 866 600"/></g>
    <g opacity=".24" fill="${scene.color}"><path d="M439 404 513 392 560 600 360 600Z"/><path d="M751 397h22l91 203H760Z"/></g>
    ${prop(id)}
    <g stroke="#162f39" fill="none" stroke-width="3"><path d="M0 70Q435 180 1000 38M0 103Q490 226 1000 82"/></g>
    <path d="M89 86h57v204H89Z" fill="#173339" stroke="${scene.color}" stroke-width="2"/><text x="118" y="112" fill="${scene.color}" font-size="28" text-anchor="middle" writing-mode="tb" letter-spacing="7">${scene.sign}</text>
    <path d="M888 0 948 0 948 600 920 600Z" fill="#061720"/><path d="M924 124h-41v61h41" fill="#b44c39"/><path d="M882 135h35M882 148h35M882 161h35" stroke="#ffc18a" opacity=".6"/>
    <g transform="translate(478 452) rotate(-8)"><path d="M-42 -25 44 -25 50 32 -44 32Z" fill="#cfbd8d" stroke="#eee1b0"/><path d="M-32 -13h50M-32 -5h36M-32 4h40" stroke="#637263"/><circle cx="23" cy="14" r="12" fill="${found ? '#447e6c' : '#b94a37'}"/><path d="M17 9h12v10H17ZM23 6v17" stroke="#e6c799" fill="none"/></g>
    <path d="M0 544 118 516 223 600H0ZM1000 526 895 513 789 600h211Z" fill="#051720"/>
    <g class="bn-rain" stroke="#abc9be" stroke-width="1">${rain}</g>
    <g fill="none" stroke="#95b1a1" opacity=".28">${Array.from({ length: 15 }, (_, i) => `<ellipse cx="${44 + i * 67}" cy="${493 + i % 4 * 22}" rx="${8 + i % 5 * 4}" ry="2"/>`).join('')}</g>
  </svg>`;
}

export function cityMap(current: SceneId, visited: readonly SceneId[]): string {
  const blocks = Array.from({ length: 28 }, (_, i) => {
    const x = 95 + i % 7 * 118, y = 60 + Math.floor(i / 7) * 128;
    return `<path d="M${x} ${y}l66 -12 23 49 -63 18Z" fill="#29484c" stroke="#61786c" opacity=".7"/>`;
  }).join('');
  const labels = SCENE_IDS.map(id => {
    const scene = SCENES[id];
    return `<g transform="translate(${scene.x} ${scene.y})"><circle r="${id === current ? 18 : 10}" fill="${id === current ? '#e87757' : visited.includes(id) ? '#c4c69f' : '#3f6768'}" stroke="#ded4aa"/><text y="-25" text-anchor="middle" fill="#e0dcc3" font-size="23">${escapeMarkup(scene.name)}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 950 530" role="img" aria-label="雾津实体街区地图，红点为当前位置">
    <path d="M0 0h950v530H0Z" fill="#0a2630"/>${blocks}
    <path d="M5 451Q222 526 445 381T947 429" stroke="#386b72" stroke-width="59" fill="none"/>
    <path d="M140 415 350 390 270 215 565 220 765 185 560 65M350 390 530 435 750 400 765 185M350 390 565 220M560 65 350 390" stroke="#b49a6e" stroke-width="5" fill="none"/>
    <path d="M142 421 352 396M533 441 749 406" stroke="#799f93" stroke-width="2"/>
    <path d="M76 66v60M47 96h59M59 78l35 35" stroke="#ab9e75"/><text x="70" y="49" fill="#c4bd96" font-size="21">北</text>
    ${labels}<text x="43" y="503" fill="#8aaca4" font-size="21">雾津实测图 · 道路依身份与案情开放</text>
  </svg>`;
}
