import { escapeMarkup, query } from '../../core/page';
import { progression } from '../../core/rpg/progression';
import {
  CHARMS, CHOICES, CHOICE_DATA, COMPANIONS, CURVE, ELEMENT_NAMES, ENDINGS, ITEM_NAMES, ITEMS,
  LOCATIONS, PLACES, RECIPES, SIDE_DATA, SIDE_QUESTS, SKILLS, SKILL_NAMES, SPIRITS, CHARM_HELP,
} from './data';
import type { CompanionId, Element, Layout, State } from './data';
import { endingReason, inspectLayout, objective, travelReason } from './engine';
import { ACTS, CHARACTERS, ENDING_STORY, PLACE_STORY, PROLOGUE, QUEST_STORY, RULES } from './story';
import { AgentValidationError } from '../../core/agents/errors';

export interface ViewState {
  draft: Layout;
  element: Element;
  actor: 'pen' | CompanionId;
  dirty: boolean;
  sound: boolean;
}
export type Panel = 'map' | 'bag' | 'journal' | 'people' | 'help' | 'story' | 'new';
const esc = escapeMarkup;
const paragraphs = (s: string) => s.split('\n').filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
export function portrait(id: string, evolved = false): string {
  const body = id === 'bud' ? `
    <path d="M44 83Q18 65 30 47Q40 29 58 45Q82 20 91 45Q112 63 83 88Z" fill="#6eac7e"/>
    <path d="M41 76Q22 93 37 97L52 83M75 81Q84 102 95 91L88 74" fill="#42795b"/>
    <path d="M48 40Q24 14 24 43Q31 61 45 58M75 41Q91 10 100 34Q103 54 82 57" fill="#b4d58f"/>
    <ellipse cx="63" cy="63" rx="30" ry="26" fill="#fff8df"/><path d="M64 39Q47 15 65 13Q85 7 78 27" fill="none" stroke="#71986b" stroke-width="7"/>
    <circle cx="53" cy="64" r="3" fill="#294e45"/><circle cx="74" cy="64" r="3" fill="#294e45"/>
    <path d="M58 72Q64 77 70 71" stroke="#536855" fill="none" stroke-width="2"/>
    <ellipse cx="43" cy="71" rx="6" ry="3" fill="#eeb4a3"/><ellipse cx="82" cy="71" rx="6" ry="3" fill="#eeb4a3"/>
    ${evolved ? '<path d="M22 35Q60 -5 105 35Q89 25 80 37Q65 23 51 36Q38 23 22 35" fill="#fff9dc" stroke="#d1b66c" stroke-width="2"/><path d="M62 12V34M42 19L49 32M83 19L75 32" stroke="#d1b66c" fill="none"/>' : ''}` :
    id === 'tide' ? `<path d="M24 37Q46 15 82 30Q113 44 95 76Q79 106 42 90Q15 79 21 52Q34 84 60 80Q90 71 77 51Q57 30 24 37" fill="#a3e0d2" fill-opacity=".88" stroke="#f6ffec" stroke-width="3"/>
      <path d="M24 37Q4 21 12 58L26 60M87 30Q98 7 111 22L98 43" fill="#65a4a3"/><circle cx="47" cy="43" r="3" fill="#365d66"/><circle cx="63" cy="40" r="3" fill="#365d66"/>
      <ellipse cx="57" cy="74" rx="10" ry="13" fill="#fff5d9"/><path d="M39 50Q49 54 53 49" stroke="#6b8384" fill="none"/>
      ${evolved ? '<ellipse cx="60" cy="60" rx="52" ry="42" fill="none" stroke="#e9ffec" stroke-width="5"/><path d="M80 102L93 112M85 96L105 100" stroke="#d4bb70" stroke-width="3"/>' : ''}` :
    id === 'coal' ? `<path d="M40 79L30 101L45 98L53 77M74 79L84 102L95 94L83 76M58 83L54 106L64 106L66 83" fill="#5d6860"/>
      <path d="M42 46L37 23L24 19M62 39V13L76 6M77 44L86 25L102 30" fill="none" stroke="#e08c79" stroke-width="9" stroke-linecap="round"/>
      <ellipse cx="62" cy="63" rx="36" ry="27" fill="#cb8169" stroke="#f7d6b7" stroke-width="3"/>
      <path d="M29 60Q61 75 96 57" fill="none" stroke="#a56a5b" stroke-width="3"/>
      <circle cx="50" cy="57" r="3" fill="#423f3b"/><circle cx="74" cy="57" r="3" fill="#423f3b"/><path d="M55 67Q64 74 71 67" fill="none" stroke="#423f3b" stroke-width="2"/>
      ${evolved ? '<path d="M35 71L42 78L49 71L45 84L36 81ZM60 76L67 81L74 75L71 87L61 88ZM81 69L92 65L90 78L81 82Z" fill="#fff5d8"/>' : '<ellipse cx="61" cy="43" rx="13" ry="3" fill="#ffd890"/>'}` :
    id === 'fold' ? `<path d="M43 82L27 111M76 81L93 106" stroke="#a4a079" stroke-width="7"/><path d="M25 75L42 35L85 31L101 72L65 94Z" fill="#eee9cf" stroke="#acb89b" stroke-width="2"/><path d="M35 33L57 10L94 26L80 62L47 61Z" fill="#fff8e1" stroke="#c5c6a4" stroke-width="2"/><path d="M44 48L79 40M42 54L51 62M76 49L70 58" fill="none" stroke="#c1a55f" stroke-width="3"/><path d="M31 72L80 84M47 78L89 68" stroke="#c8bd99" stroke-width="2"/>` :
    id === 'lan' || id === 'wen' || id === 'he' ? `<path d="M29 108Q34 65 58 61Q88 64 100 108" fill="${id === 'wen' ? '#467c7a' : '#799473'}"/>
      <path d="M58 64L35 95L65 89L87 98L75 65" fill="#eeeacb"/><ellipse cx="63" cy="43" rx="23" ry="26" fill="#e7c4a0"/>
      <path d="M40 46Q29 6 63 11Q98 7 86 47L76 27L46 33Z" fill="${id === 'lan' ? '#e9eddf' : id === 'wen' ? '#cc8b79' : '#355f52'}"/>
      ${id === 'lan' ? '<circle cx="38" cy="21" r="14" fill="#e9eddf"/><circle cx="83" cy="17" r="13" fill="#e9eddf"/><path d="M72 41L77 54" stroke="#bd9b57" stroke-width="2"/>' : ''}
      <circle cx="54" cy="43" r="2.5" fill="#3b554a"/><circle cx="73" cy="43" r="2.5" fill="#3b554a"/><path d="M58 55Q65 60 71 53" fill="none" stroke="#896e60" stroke-width="2"/>
      ${id === 'he' ? '<path d="M40 26Q30 6 50 12L59 22" fill="#c5cc88"/><circle cx="75" cy="91" r="9" fill="none" stroke="#daba73" stroke-width="3"/>' : ''}
      ${id === 'wen' ? '<circle cx="87" cy="48" r="7" fill="none" stroke="#c6c0a0" stroke-width="4"/>' : ''}` :
      `<path d="M22 68Q7 33 39 28Q61 2 82 27Q116 32 101 64Q90 95 62 90Q30 105 22 68" fill="#eff4d7"/>
       <path d="M29 45Q8 12 30 17L48 36M82 32Q107 1 106 37L96 53" fill="#91b297"/><path d="M38 83L27 110M60 89L57 112M82 85L92 107" stroke="#9bb793" stroke-width="3"/>
       <ellipse cx="60" cy="59" rx="23" ry="19" fill="#faf4de"/><circle cx="53" cy="57" r="3" fill="#557568"/><circle cx="69" cy="57" r="3" fill="#557568"/>
       <path d="M54 66Q61 72 68 65" stroke="#82917b" fill="none" stroke-width="2"/>`;
  return `<svg viewBox="0 0 120 120" aria-hidden="true" class="vo-portrait"><ellipse cx="63" cy="109" rx="34" ry="6" fill="#234c46" opacity=".12"/>${body}</svg>`;
}

export function landscape(s: State): string {
  const p = PLACES[s.location], [sky, mid, dark, accent] = p.palette;
  const tree = (x: number, y: number, scale: number, tint = mid) => `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M0 190Q14 95 4 0L25 -8Q14 96 34 190" fill="${dark}" opacity=".65"/><path d="M9 90L-64 38M17 55L80 2" stroke="${dark}" stroke-width="9" fill="none"/><path d="M-120 31Q-147 -17 -91 -44Q-100 -100 -31 -89Q2 -140 65 -93Q121 -106 140 -51Q192 -14 131 21Q69 46 15 16Q-58 65 -120 31" fill="${tint}"/><path d="M-106 -10Q-71 -66 -26 -37Q7 -91 56 -59Q107 -68 123 -19" fill="none" stroke="${sky}" opacity=".4" stroke-width="21" stroke-linecap="round"/></g>`;
  const village = `<g stroke="${dark}" stroke-width="3">
    <path d="M84 390V291L190 258L263 304V407" fill="#f5edd1"/><path d="M62 303Q125 210 217 243L279 319Q169 291 62 303" fill="${mid}"/>
    <path d="M111 331V371H142V331ZM188 330V393H220V333Z" fill="${dark}"/><path d="M707 366V271L812 240L901 289V391" fill="#eee8c9"/>
    <path d="M684 285Q747 211 837 221L923 301Q804 273 684 285" fill="${accent}"/><path d="M742 315V355H774V315ZM829 315V380H864V315Z" fill="${dark}"/>
    <path d="M95 298Q450 153 888 297" fill="none" stroke-width="2"/>${[150, 235, 335, 645, 745, 840].map((x, i) => `<path d="M${x} ${250 - Math.sin(i) * 20}q-8 18 5 31q23 -15 9 -29" fill="${i % 2 ? '#f8e9b9' : accent}"/>`).join('')}</g>`;
  const forest = `<g fill="none" stroke-linecap="round">
    <path d="M183 459Q231 364 202 276Q160 204 229 176" stroke="${dark}" stroke-width="17"/>
    <path d="M185 458Q124 483 105 532M192 445Q221 478 233 521" stroke="${dark}" stroke-width="7"/>
    <path d="M833 491Q779 425 810 329Q843 265 805 226" stroke="${dark}" stroke-width="14"/>
    <path d="M801 436Q749 414 736 444M818 468Q853 498 898 500" stroke="${dark}" stroke-width="6"/></g>
    <path d="M223 177Q124 107 173 97Q206 84 233 144Q267 87 291 125Q292 173 223 177" fill="#c4d699"/>
    <path d="M218 158Q158 123 182 116Q212 122 218 158M233 156Q261 112 270 131Q260 155 233 156" fill="#f3f2d3"/>
    <path d="M803 235Q753 168 775 160Q807 159 815 210Q850 157 869 185Q865 230 803 235" fill="${mid}"/>
    <g stroke="#567e60" stroke-width="3" fill="#a9c68c">${[129, 248, 762, 883].map((x, i) => `<path d="M${x} ${500 + i * 4}q-6 -48 13 -72q-5 53 -13 72M${x + 3} ${479 + i * 4}q-38 -6 -24 -21q20 2 24 21M${x + 6} ${461 + i * 4}q30 -31 32 -9q-9 16 -32 9"/>`).join('')}</g>
    <g fill="${accent}"><path d="M138 387q20 -32 45 -1Z"/><path d="M844 381q17 -25 34 0Z"/></g><path d="M161 387V409M861 381V400" stroke="#f6edd0" stroke-width="5"/>`;
  const ruins = `<g stroke="#b1b79b" stroke-width="3"><path d="M120 420L153 194L224 170L228 387Z" fill="#f5f0d8"/><path d="M151 196L224 170L244 187L172 217Z" fill="#fffbe5"/><path d="M770 402L755 182L830 166L864 376Z" fill="#e3e2c9"/><path d="M755 183L790 116L854 105L832 169Z" fill="#fff8df"/><path d="M71 449L227 409L281 460L126 483ZM720 474L833 418L938 449L828 492Z" fill="#f3ecd3"/></g><path d="M193 192Q210 255 169 337M829 167Q805 253 847 352" stroke="${mid}" stroke-width="13" fill="none"/>`;
  const river = `<path d="M673 180Q335 259 598 369Q857 491 252 700H676Q1030 475 730 350Q488 260 754 180" fill="#c9ebe0"/><path d="M696 208Q422 278 653 379Q881 476 462 673" fill="none" stroke="#f7ffe8" stroke-width="7" opacity=".7"/><g fill="none" stroke="${accent}" stroke-width="3">${[170, 285, 825, 915].map((x, i) => `<path d="M${x} 291v94"/><ellipse cx="${x}" cy="${341 + i * 9}" rx="26" ry="12"/><path d="M${x - 22} ${341 + i * 9}q22 -40 44 0"/>`).join('')}</g>`;
  const canopy = `<path d="M-40 570Q475 289 1050 541L1040 598Q449 417 -40 641" fill="#8b9262"/><path d="M172 418Q99 102 267 116M837 432Q921 178 756 93" fill="none" stroke="${dark}" stroke-width="17"/><path d="M730 247L870 233L901 326L764 337Z" fill="#e8d5a1"/><path d="M706 249L804 176L892 243Z" fill="${accent}"/><path d="M760 330L729 410M878 327L909 402" stroke="${dark}" stroke-width="5"/>${[157, 200, 843, 907].map(x => `<path d="M${x} 150V308" stroke="${dark}" stroke-width="2"/><path d="M${x - 10} 279l24 -3l8 41l-29 7Z" fill="#f4e7bd"/>`).join('')}`;
  const kiln = `<path d="M115 436Q83 231 206 238Q334 225 304 436Z" fill="#c3a08a" stroke="#947d6e" stroke-width="4"/><path d="M145 431V362Q208 273 267 362V434Z" fill="#685f55"/><path d="M164 428Q156 371 183 363Q168 390 211 376Q243 365 247 430" fill="${accent}" opacity=".8"/><path d="M171 240L179 161L228 159L237 242" fill="#c3a08a"/><path class="vo-mist" d="M201 151Q124 107 211 79Q291 29 204 -20" stroke="#f3d0bc" stroke-width="36" stroke-linecap="round" fill="none" opacity=".6"/><path d="M734 446Q737 364 790 371Q848 361 857 446Z" fill="#cbb79c"/><path d="M775 431Q779 397 805 401" fill="none" stroke="#f2dac0" stroke-width="5"/>`;
  const snow = `<g fill="#f9fbef"><path d="M-20 511Q125 344 291 480Q192 481 89 578Z"/><path d="M715 512Q830 371 1040 473V612Z"/><path d="M166 349Q208 305 245 343L228 358Z"/></g><g stroke="#bbcfd0" fill="none" stroke-width="5"><path d="M0 591Q139 561 210 612M822 509Q730 540 780 624M905 514L886 626"/></g>${[110, 175, 825, 900].map(x => `<path d="M${x} 489q-16 -80 17 -91q21 27 -1 40q25 29 -16 51" fill="#e3e9df" stroke="#c2cfbf" stroke-width="2"/>`).join('')}`;
  const summit = `<path d="M85 448Q88 141 308 169M932 440Q967 144 738 161" stroke="${dark}" stroke-width="22" fill="none"/><path d="M132 354Q469 108 875 351" stroke="#b7c59e" stroke-width="12" fill="none"/><g opacity=".6"><path d="M501 58L546 128L502 180L457 129Z" fill="#fff2c5" stroke="#c7b170" stroke-width="3"/><path d="M501 58V180M457 129H546" stroke="#fffce4" stroke-width="3"/><ellipse cx="503" cy="120" rx="83" ry="62" fill="none" stroke="${accent}" stroke-width="2"/></g>`;
  const object = p.kind === 'village' ? village : p.kind === 'forest' ? forest : p.kind === 'river' ? river : p.kind === 'ruins' ? ruins : p.kind === 'canopy' ? canopy : p.kind === 'kiln' ? kiln : p.kind === 'snow' ? snow : p.kind === 'summit' ? summit : '';
  return `<svg class="vo-landscape" viewBox="0 0 1000 660" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="vo-sky" x2="0" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="#fcf5df"/></linearGradient>
    <radialGradient id="vo-light"><stop stop-color="#fffbe3" stop-opacity=".9"/><stop offset="1" stop-color="#fffbe3" stop-opacity="0"/></radialGradient>
    <filter id="vo-paper"><feTurbulence baseFrequency=".45" numOctaves="2" seed="${s.seed % 91}" result="grain"/><feColorMatrix in="grain" type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".09"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter></defs>
    <g filter="url(#vo-paper)"><path fill="url(#vo-sky)" d="M0 0H1000V660H0Z"/>
    <circle cx="569" cy="182" r="248" fill="url(#vo-light)"/>
    <path d="M-20 328Q155 91 352 244Q569 64 746 216Q909 76 1030 290V660H0Z" fill="${mid}" opacity=".24"/>
    <path d="M-10 401Q129 260 320 338Q522 202 745 349Q869 243 1040 368V660H0Z" fill="${mid}" opacity=".5"/>
    ${p.kind !== 'snow' ? tree(80, 189, .9) + tree(929, 211, .85) : tree(56, 193, .9, '#e4eee2') + tree(960, 220, .8, '#d7e5df')}
    <path d="M-10 489Q214 338 468 425Q744 355 1010 481V670H-10Z" fill="${mid}"/>
    <path d="M-20 592Q273 372 535 443Q729 414 1030 531V690H0Z" fill="${sky}" opacity=".67"/>
    ${object}
    <ellipse cx="505" cy="510" rx="264" ry="109" fill="#fcf5df" opacity=".42"/>
    <path d="M319 663Q446 534 673 430L700 456Q538 563 518 666" fill="#eee8c8" opacity=".6"/>
    <g fill="${dark}" opacity=".67"><path d="M0 628Q23 527 81 558Q56 572 76 646Q96 534 157 566Q106 579 114 659H0ZM844 660Q861 557 907 546Q897 617 923 648Q920 564 984 519L1000 660Z"/></g>
    <g fill="${accent}">${[68, 143, 221, 795, 865, 930].map((x, i) => `<path d="M${x} ${585 + i % 3 * 18}q-20 -30 -24 -4q-23 -3 -10 16q19 10 34 -12q17 15 27 -3q4 -20 -13 -12Z"/>`).join('')}</g>
    </g><g class="vo-pollen" fill="${s.location === 'frost' ? '#ffffff' : '#fff0bc'}">${Array.from({ length: 15 }, (_, i) => `<circle cx="${(i * 137 + 70) % 970}" cy="${(i * 79 + 91) % 610}" r="${2 + i % 3}"/>`).join('')}</g>
  </svg>`;
}

export function shell(): string {
  return `<header class="vo-header"><div class="vo-brand"><h1 id="vo-title">森语契约</h1><span>祈芽岭 · 见习缔灵师手记</span></div>
    <nav aria-label="旅程工具">${[['map', '地图'], ['bag', '行囊'], ['journal', '约簿'], ['people', '人物'], ['help', '帮助']].map(([id, label]) => `<button data-panel="${id}">${label}</button>`).join('')}<button data-notebook>存档</button><button data-panel="new">新旅程</button></nav></header>
    <main class="vo-workbench" data-project-preview>
      <section class="vo-scene" aria-label="祈芽岭地景与元素阵地">
        <div data-landscape></div>
        <div class="vo-place"><span data-season></span><h2 data-place></h2><button data-panel="story" aria-label="听此地的故事">故事</button></div>
        <div class="vo-objective"><span data-act></span><p data-objective></p></div>
        <div class="vo-wild" data-wild></div><div class="vo-travellers" data-travellers></div>
        <div class="vo-board" role="group" aria-label="五行五列元素阵地" hidden>
          <svg class="vo-lines" viewBox="0 0 500 500" aria-hidden="true"><path data-trail/><path data-ink/><path data-fracture/></svg>
          ${Array.from({ length: 25 }, (_, cell) => `<button class="vo-cell" data-cell="${cell}" type="button" aria-label="第${Math.floor(cell / 5) + 1}行第${cell % 5 + 1}列"></button>`).join('')}
        </div>
        <div class="vo-ending" data-ending hidden></div>
        <p class="vo-scene-caption" data-scene-caption></p>
      </section>
      <aside class="vo-hud"><span data-level></span><span data-focus></span><span data-bond></span><span data-gear></span></aside>
    </main>
    <section class="vo-controls" aria-label="当前行动">
      <div data-travel-controls class="vo-action-row"><button data-action="gather">拾取落物</button><button data-action="rest">叶檐休息</button><button class="vo-primary" data-action="begin">展开仪式</button><button data-panel="map">沿季候旅行</button></div>
      <div data-ritual-controls hidden>
        <div class="vo-tools"><div class="vo-palette" role="group" aria-label="选择阵字">${(['wood', 'ember', 'water'] as const).map((id, i) => `<button data-element="${id}" aria-pressed="false">${ELEMENT_NAMES[id]}<small>${i + 1}</small></button>`).join('')}</div>
          <label class="vo-picker">落位<select data-actor aria-label="落字或伙伴站位"><option value="pen">书写阵字</option></select></label>
          <label class="vo-picker">仪态<select data-stance aria-label="仪态"><option value="echo">应和</option><option value="guard">护阵 · 需共伞</option><option value="offer">燃愿 · 两露</option></select></label>
          <button data-action="undo">撤字</button><button data-action="clear">清阵</button>
        </div>
        <div class="vo-action-row"><button data-action="layout">落笔布阵</button><button class="vo-primary" data-action="answer">请灵应答</button><button data-action="retreat">撤阵休整</button><span data-cost></span></div>
      </div>
      <p class="vo-notice" data-notice role="status" aria-live="polite">先拾取落物；打开地图去苔林。只有「请灵应答」会请求模型。</p>
    </section>
    <footer class="vo-footer"><div data-agent-host></div><button class="vo-sound" data-action="sound" aria-pressed="false">声音关</button></footer>`;
}

export function draw(root: HTMLElement, s: State, v: ViewState, busy: boolean): void {
  const p = PLACES[s.location], ritual = s.phase === 'ritual', ended = s.phase === 'ending' || s.phase === 'lost';
  root.dataset.phase = s.phase;
  root.dataset.location = s.location;
  const land = query<HTMLElement>(root, '[data-landscape]');
  if (land.dataset.location !== s.location) { land.innerHTML = landscape(s); land.dataset.location = s.location; }
  query(root, '[data-place]').textContent = p.name;
  query(root, '[data-season]').textContent = `${p.season} · 季候迁徙中`;
  query(root, '[data-act]').textContent = ACTS[s.completed.length < 2 ? 0 : s.completed.length < 5 ? 1 : 2].title;
  query(root, '[data-objective]').textContent = objective(s);
  const progress = progression(s.xp, CURVE);
  query(root, '[data-level]').textContent = `见习${progress.level}级 · 历练${s.xp}${s.skillPoints ? ` · 成长点${s.skillPoints}` : ''}`;
  query(root, '[data-focus]').textContent = `息 ${s.focus}/12${ritual ? ` · 裂 ${s.strain}/7` : ''}`;
  query(root, '[data-bond]').textContent = `同行 ${s.party.length}/3`;
  query(root, '[data-gear]').textContent = s.equipped ? ITEM_NAMES[s.equipped] : '未戴符饰';
  query<HTMLElement>(root, '[data-travel-controls]').hidden = ritual || ended;
  query<HTMLElement>(root, '[data-ritual-controls]').hidden = !ritual;
  query<HTMLElement>(root, '.vo-board').hidden = !ritual;
  const wildId = s.location === 'ruins' ? 'fold' : s.location === 'kiln' ? 'coal' : s.location === 'river' ? 'tide' : 'wild';
  query(root, '[data-wild]').innerHTML = `${portrait(wildId)}<span>${esc(p.wild)}</span>${ritual ? `<meter min="0" max="${p.need}" value="${s.harmony}" aria-label="仪式共鸣">${s.harmony}</meter>` : ''}`;
  query(root, '[data-travellers]').innerHTML = `<div>${portrait('he')}<span>简禾</span></div>${s.party.map(sp => `<div>${portrait(sp.id, sp.evolved)}<span>${sp.evolved ? SPIRITS[sp.id].evolved : SPIRITS[sp.id].name} · 羁绊${sp.bond}</span></div>`).join('')}`;
  query(root, '[data-scene-caption]').textContent = ritual ? (v.actor === 'pen' ? '木起，火经木，水收；格须相连。' : `点格安排${SPIRITS[v.actor].name}的真实站位。`) : '借暖留阴，借水留路，借火许熄。';
  const ending = query<HTMLElement>(root, '[data-ending]');
  ending.hidden = !ended;
  if (ended) {
    const story = ENDING_STORY[s.phase === 'lost' ? 'lost' : s.ending!];
    ending.innerHTML = `<h2>${story.title}</h2><p>${esc(story.text.slice(0, 74))}……</p><button data-panel="journal">阅读完整结局</button><button data-panel="new">重新启程</button>`;
  }
  for (const element of root.querySelectorAll<HTMLButtonElement>('[data-element]')) element.setAttribute('aria-pressed', String(element.dataset.element === v.element));
  const actor = query<HTMLSelectElement>(root, '[data-actor]');
  const signature = s.party.map(sp => sp.id).join();
  if (actor.dataset.party !== signature) {
    actor.innerHTML = '<option value="pen">书写阵字</option>' + s.party.map(sp => `<option value="${sp.id}">${SPIRITS[sp.id].name}站位</option>`).join('');
    actor.dataset.party = signature;
  }
  actor.value = v.actor;
  const stance = query<HTMLSelectElement>(root, '[data-stance]');
  stance.value = v.draft.stance; stance.disabled = busy;
  if (ritual) {
    const board = query<HTMLElement>(root, '.vo-board');
    if (s.harmony > Number(board.dataset.harmony ?? 0)) board.dataset.pulse = board.dataset.pulse === 'a' ? 'b' : 'a';
    board.dataset.harmony = String(s.harmony);
    const fractures = ['M0 30L22 52L9 83L40 98', 'M500 370L472 349L489 321L454 290', 'M130 500L142 468L120 449L152 430', 'M410 0L382 27L405 53L369 70', 'M0 277L39 281L61 256L85 287', 'M308 500L328 469L310 445L341 411'];
    query(root, '[data-fracture]').setAttribute('d', fractures.slice(0, s.strain).join(' '));
    const path = (cells: number[]) => cells.map((cell, i) => `${i ? 'L' : 'M'}${cell % 5 * 100 + 50},${Math.floor(cell / 5) * 100 + 50}`).join(' ');
    query(root, '[data-trail]').setAttribute('d', path(p.trail));
    query(root, '[data-ink]').setAttribute('d', path(v.draft.runes.map(r => r.cell)));
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-cell]')) {
      const cell = Number(button.dataset.cell), rune = v.draft.runes.find(r => r.cell === cell);
      const sp = v.draft.formation.find(f => f.cell === cell);
      const terrain = p.walls.includes(cell) ? '阻' : p.marsh.includes(cell) ? '湿' : p.thorns.includes(cell) ? '荆' : '土';
      button.dataset.terrain = terrain;
      button.dataset.rune = rune?.element ?? '';
      button.dataset.anchor = cell === p.source ? '起' : cell === p.target ? '终' : '';
      button.disabled = busy || p.walls.includes(cell);
      const label = `第${Math.floor(cell / 5) + 1}行第${cell % 5 + 1}列，${terrain}地${cell === p.source ? '，起点' : cell === p.target ? '，终点' : ''}${rune ? `，${ELEMENT_NAMES[rune.element]}字` : ''}${sp ? `，${SPIRITS[sp.id].name}站位` : ''}`;
      button.setAttribute('aria-label', label);
      button.innerHTML = `<span class="vo-rune">${rune ? ELEMENT_NAMES[rune.element] : cell === p.source ? '起' : cell === p.target ? '终' : ''}</span><small>${terrain === '土' ? '·' : terrain}</small>${sp ? `<span class="vo-cell-spirit">${portrait(sp.id, s.party.find(c => c.id === sp.id)?.evolved)}</span>` : ''}`;
    }
  }
  let cost = '写好后落笔；无效阵式不会请求模型。', valid = false;
  if (ritual) {
    try { const result = inspectLayout(s, v.draft); valid = true; cost = `每答耗${result.cost}息${result.dew ? '、两露' : ''} · ${v.dirty ? '草稿未落笔' : '阵式已落笔'}`; }
    catch (error) { if (!(error instanceof AgentValidationError)) throw error; cost = error.message; }
  }
  query(root, '[data-cost]').textContent = cost;
  const disabled: Record<string, boolean> = {
    gather: busy || s.gathered.includes(s.location), rest: busy || (s.focus === 12 && s.strain === 0),
    begin: busy || s.location === 'village' || s.completed.includes(s.location),
    layout: busy || !valid || !v.dirty, answer: busy || v.dirty || !valid, retreat: busy, undo: busy, clear: busy,
  };
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action]')) {
    const action = button.dataset.action!;
    if (action in disabled) button.disabled = disabled[action];
  }
  query(root, '[data-action="answer"]').textContent = busy ? '灵正在应答…' : '请灵应答';
  const sound = query(root, '[data-action="sound"]');
  sound.textContent = v.sound ? '声音开' : '声音关'; sound.setAttribute('aria-pressed', String(v.sound));
}

export function panelContent(panel: Panel, s: State): string {
  if (panel === 'story') return `<div class="vo-reading"><h3>${PLACES[s.location].name}</h3>${paragraphs(PLACE_STORY[s.location])}<h3>${PLACES[s.location].wild}在意什么</h3><p>${PLACES[s.location].goal}</p><p>${PLACES[s.location].trait}</p></div>`;
  if (panel === 'help') return `<div class="vo-reading">${paragraphs(RULES)}</div>`;
  if (panel === 'new') return `<p>重新启程会替换本地自动存档。若想保留当前旅程，请先在存档中导出回放。打开此页已经取消尚未完成的模型应答。</p><button class="vo-primary" data-action="restart">开始新的旅程</button>`;
  if (panel === 'map') return `<p>道路由已履行的约定开放。旧地可回访；模型不会替你旅行。每处落物仅拾取一次。</p><div class="vo-map">${LOCATIONS.map((id, i) => {
    const reason = travelReason(s, id);
    return `<section style="--place:${PLACES[id].palette[1]}"><span>${i + 1} · ${PLACES[id].season}</span><h3>${PLACES[id].name}</h3><p>${id === s.location ? '你在这里' : reason ?? '道路已开放'}${s.gathered.includes(id) ? ' · 落物已拾' : ''}</p><button data-travel="${id}" ${reason ? 'disabled' : ''}>前往${PLACES[id].name}</button></section>`;
  }).join('')}</div>`;
  if (panel === 'bag') return `<section><h3>行囊 · 只借落下之物</h3><p>${ITEMS.map(id => `${ITEM_NAMES[id]} ${s.inventory[id]}`).join('　')}</p><p>采集各地一次；总容量七十二，单类二十四。休息只恢复息力，不生成物资。</p></section>
    <section><h3>符饰 · 同时佩戴一枚</h3><div class="vo-supply">${CHARMS.map(id => `<article><h4>${ITEM_NAMES[id]}</h4><p>${CHARM_HELP[id]}</p><p>材料：${RECIPES[id].map(c => `${ITEM_NAMES[c.item]}${c.amount}`).join('、')}</p><button data-craft="${id}" ${s.crafted.includes(id) ? 'disabled' : ''}>制作${ITEM_NAMES[id]}</button><button data-equip="${id}" ${!s.crafted.includes(id) || s.equipped === id ? 'disabled' : ''}>佩戴${ITEM_NAMES[id]}</button></article>`).join('')}</div></section>
    <section><h3>成长 · ${s.skillPoints}点可用</h3><p>历练${s.xp}，当前${progression(s.xp, CURVE).level}级。四、九、十五、二十三、三十二历练升级。</p>${SKILLS.map(id => `<p><button data-learn="${id}" ${s.skills.includes(id) || !s.skillPoints ? 'disabled' : ''}>学习${SKILL_NAMES[id]}</button> ${id === 'listen' ? '每次有效应答额外一共鸣。' : id === 'shelter' ? '开放护阵仪态，每次抵消一裂。' : '免荆棘耗息；无需棉芽即可登树冠。'}</p>`).join('')}</section>
    <section><h3>同行者 · 结契不是收服</h3>${COMPANIONS.map(id => {
      const spirit = s.party.find(p => p.id === id);
      return `<article class="vo-companion">${portrait(id, spirit?.evolved)}<div><h4>${spirit?.evolved ? SPIRITS[id].evolved : SPIRITS[id].name} · ${ELEMENT_NAMES[SPIRITS[id].element]}</h4><p>${SPIRITS[id].goal}</p><p>${SPIRITS[id].ability}</p><p>${spirit ? `羁绊${spirit.bond} · ${spirit.trained ? '已训练' : '未训练'} · ${spirit.evolved ? '已蜕变' : '待成长'}` : `在${PLACES[SPIRITS[id].home].name}仪式完成后当面结契，需一落枝。`}</p>
      <button data-recruit="${id}" ${spirit ? 'disabled' : ''}>与${SPIRITS[id].name}结契</button><button data-train="${id}" ${!spirit || spirit.trained ? 'disabled' : ''}>训练${SPIRITS[id].name}</button><button data-evolve="${id}" ${!spirit || spirit.evolved ? 'disabled' : ''}>蜕变${SPIRITS[id].name}</button><p>训练：一落枝、两息，羁绊加一；蜕变：羁绊三、个人支线、一季珀。各仅一次。</p>${spirit ? `<details><summary>最近的共同记忆</summary>${spirit.memory.map(m => `<p>${esc(m)}</p>`).join('')}</details>` : ''}</div></article>`;
    }).join('')}</section>`;
  if (panel === 'people') return `<div class="vo-reading">${CHARACTERS.map(c => `<article class="vo-character">${portrait(c.id, s.party.find(p => p.id === c.id)?.evolved)}<h3>${c.name}</h3><p>${c.role}</p><p><strong>形貌：</strong>${c.design}</p><p>${c.biography}</p><p><strong>愿望：</strong>${c.goal}</p><p><strong>缺点：</strong>${c.flaw}</p><p><strong>牵系：</strong>${c.bond}</p><p><strong>同行作用：</strong>${c.mechanic}</p></article>`).join('')}</div>`;
  const terminal = s.phase === 'lost' ? ENDING_STORY.lost : s.ending ? ENDING_STORY[s.ending] : null;
  return `${terminal ? `<section class="vo-reading"><h3>${terminal.title}</h3>${paragraphs(terminal.text)}</section>` : ''}<p><strong>眼前目标：</strong>${esc(objective(s))}</p>
    <section><h3>不可代答的承诺</h3>${CHOICES.map(id => {
      const q = CHOICE_DATA[id], chosen = s.choices[id];
      return `<article><h4>${q.name}</h4>${chosen ? `<p>已承诺：${q.labels[q.options.indexOf(chosen)]}</p>` : `<p>在${PLACES[q.location].name}完成相关仪式后，当面决定。${id === 'ledger' ? '公开旧账让石庭仪式每次多一共鸣；暂存只保眼前安稳。' : id === 'roots' ? '拆锁使现有伙伴羁绊各加一，并开放轮守的可能；留锁仍可自愿作桥。' : '让暖季才可轮守；随灵才可迁徙。两者都需放弃原样的村庄。'}</p>${q.options.map((option, i) => `<button data-choice="${id}" data-option="${option}" ${s.location !== q.location || !s.completed.includes(q.requires) || s.phase !== 'travel' ? 'disabled' : ''}>${q.labels[i]}</button>`).join('')}`}</article>`;
    }).join('')}</section>
    <section><h3>去处 · 仪式不是替你选择</h3>${ENDINGS.map(id => `<article><h4>${ENDING_STORY[id].title}</h4><p>${endingReason(s, id) ?? '条件已履行，可以走向这一种生活。'}</p><button data-finish="${id}" ${endingReason(s, id) || s.phase !== 'travel' ? 'disabled' : ''}>选择${ENDING_STORY[id].title.split(' · ')[0]}</button></article>`).join('')}</section>
    <section><h3>十三项约定 · ${s.quests.length}已履行</h3>${Object.entries(QUEST_STORY).map(([id, q]) => `<details><summary>${s.quests.some(done => done === id) ? '已履行' : '待履行'} · ${q.title}</summary><p>${q.text}</p>${s.quests.some(done => done === id) ? `<p>${q.after}</p>` : ''}</details>`).join('')}
      <h3>此地支线</h3>${SIDE_QUESTS.filter(id => SIDE_DATA[id].location === s.location).map(id => `<article><h4>${SIDE_DATA[id].title}</h4><p>${QUEST_STORY[id].text}</p><p>交付：${SIDE_DATA[id].spend.map(c => `${ITEM_NAMES[c.item]}${c.amount}`).join('、')}；历练加二${SIDE_DATA[id].companion ? '，对应伙伴羁绊加一' : ''}。</p><button data-quest="${id}" ${s.quests.includes(id) || s.phase !== 'travel' || !s.completed.includes(SIDE_DATA[id].requires) ? 'disabled' : ''}>履行${SIDE_DATA[id].title}</button></article>`).join('') || '<p>此地没有额外支线，旧地仍可回访。</p>'}</section>
    <details><summary>从空契环开始</summary>${paragraphs(PROLOGUE)}${ACTS.map(act => `<h3>${act.title}</h3>${paragraphs(act.text)}`).join('')}</details>
    <details><summary>近期见闻</summary>${s.log.map(m => `<p>${esc(m)}</p>`).join('')}</details>`;
}
