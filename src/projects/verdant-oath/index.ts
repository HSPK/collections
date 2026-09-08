import './style.css';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError, requireRule } from '../../core/agents/errors';
import { choice, integer } from '../../core/agents/schema';
import { GameSession } from '../../core/games/session';
import { createGameNotebook } from '../../core/games/notebook';
import { createProjectPage, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog } from '../../core/workspace';
import { observation, ritualTool, SYSTEM } from './agent';
import {
  CHARMS, CHOICES, COMPANIONS, ELEMENTS, ENDINGS, LOCATIONS, OPTIONS, PLACES, SIDE_QUESTS, SKILLS, SPIRITS, STANCES,
} from './data';
import type { Command } from './data';
import { definition, inspectLayout } from './engine';
import { draw, panelContent, shell } from './render';
import type { Panel, ViewState } from './render';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'verdant-oath');
  page.root.dataset.workspace = 'true';
  page.root.lang = 'zh-CN';
  page.root.setAttribute('aria-labelledby', 'vo-title');
  page.root.innerHTML = shell();
  const session = new GameSession(definition, 84);
  const view: ViewState = {
    draft: structuredClone(session.state.layout), actor: 'pen', element: 'wood', dirty: false, sound: false,
  };
  let busy = false;
  const notice = query<HTMLElement>(page.root, '[data-notice]');
  const panels = new Map<Panel, { content: HTMLElement; dialog: HTMLDialogElement; open(): void; close(): void }>();
  const titles: Record<Panel, string> = { map: '祈芽岭季候图', bag: '行囊与同行者', journal: '空契环约簿', people: '相遇的人与灵', help: '缔灵师入门', story: '此地的声音', new: '重新启程' };
  for (const key of Object.keys(titles) as Panel[]) {
    const content = document.createElement('section');
    const dialog = createWorkspaceDialog(page, { id: `verdant-oath-${key}`, title: titles[key], content: [content], className: 'vo-dialog', closeLabel: '关闭' });
    panels.set(key, { content, ...dialog });
  }
  function say(message: string) {
    notice.textContent = message;
    for (const panel of panels.values()) {
      if (panel.dialog.open) query(panel.content, '[data-panel-notice]').textContent = message;
    }
  }
  function redrawPanel(key: Panel) {
    const panel = panels.get(key)!;
    const scroll = panel.content.parentElement!;
    const top = scroll.scrollTop;
    const focused = document.activeElement instanceof HTMLButtonElement && panel.content.contains(document.activeElement)
      ? [...document.activeElement.attributes].find(a => a.name.startsWith('data-')) : undefined;
    panel.content.innerHTML = panelContent(key, session.state) + '<p data-panel-notice role="status" aria-live="polite"></p>';
    for (const button of panel.content.querySelectorAll<HTMLButtonElement>('button')) {
      if (busy && button.dataset.action !== 'restart') button.disabled = true;
    }
    scroll.scrollTop = top;
    if (focused) panel.content.querySelector<HTMLButtonElement>(`[${focused.name}="${CSS.escape(focused.value)}"]`)?.focus({ preventScroll: true });
  }
  function render() {
    if (page.signal.aborted) return;
    draw(page.root, session.state, view, busy);
    for (const [key, panel] of panels) if (panel.dialog.open) redrawPanel(key);
  }
  const agent = createAgentConsole(page, {
    gameId: 'verdant-oath', host: query(page.root, '[data-agent-host]'), locale: 'zh-CN',
    preflight: () => session.assertCanDispatch(32768),
    onBusyChange(value) { busy = value; render(); },
  });
  let audio: AudioContext | undefined;
  const voices = new Set<OscillatorNode>();
  function chime() {
    if (!view.sound || page.signal.aborted || !audio) return;
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'sine'; osc.frequency.value = 392 + session.state.party.length * 66;
    gain.gain.setValueAtTime(.035, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .35);
    osc.connect(gain); gain.connect(audio.destination);
    voices.add(osc);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); voices.delete(osc); };
    osc.start(); osc.stop(audio.currentTime + .4);
  }
  function syncDraft() {
    view.draft = structuredClone(session.state.layout);
    view.dirty = false;
    if (view.actor !== 'pen' && !session.state.party.some(p => p.id === view.actor)) view.actor = 'pen';
  }
  page.onCleanup(session.subscribe(() => { syncDraft(); render(); }));
  function dispatch(command: Command, message?: string): boolean {
    if (busy) { say('灵正在应答；请先等待或取消，不能同时改动世界。'); return false; }
    try {
      session.dispatch(command);
      say(message ?? session.state.log.at(-1) ?? '行动已记入约簿。');
      chime();
      return true;
    } catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      say(error.message);
      return false;
    }
  }
  function openPanel(key: Panel) {
    if (key === 'new') agent.cancel();
    redrawPanel(key);
    panels.get(key)!.open();
  }
  function editCell(cell: number) {
    if (session.state.phase !== 'ritual' || busy) return;
    if (PLACES[session.state.location].walls.includes(cell)) { say('这里是残墙或虚空，不能落位。'); return; }
    if (view.actor !== 'pen') {
      const actor = view.actor;
      if (view.draft.formation.some(f => f.cell === cell && f.id !== actor)) { say('伙伴阵位不能重叠，请选择另一格。'); return; }
      view.draft.formation = [...view.draft.formation.filter(f => f.id !== actor), { id: actor, cell }];
      say(`${SPIRITS[actor].name}站位草稿已移动；靠近自身元素才能接引。`);
    } else {
      const index = view.draft.runes.findIndex(r => r.cell === cell);
      if (index >= 0) {
        if (index === view.draft.runes.length - 1 && view.draft.runes[index].element === view.element) view.draft.runes.pop();
        else view.draft.runes[index].element = view.element;
      } else {
        if (view.draft.runes.length >= 11) { say('最多十一字；请先撤字或清阵。'); return; }
        view.draft.runes.push({ cell, element: view.element });
      }
    }
    view.dirty = true;
    render();
  }
  async function answer() {
    if (busy) return;
    try {
      requireRule(!view.dirty, '草稿须先落笔，才能请灵应答。');
      const cost = inspectLayout(session.state);
      requireRule(session.state.focus >= cost.cost, '息力不足。撤阵休息，或换字避开额外地形消耗。');
      requireRule(session.state.inventory.dew >= cost.dew, '露珠不足；可改用无需供露的应和或护阵仪态。');
    } catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      say(error.message);
      return;
    }
    const committed = await agent.turn({
      label: `${PLACES[session.state.location].name} · 第${session.state.turns + 1}次应答`,
      system: SYSTEM, observation: observation(session.state), tool: ritualTool,
      validate(plan) { session.preview({ type: 'agent', plan }); },
      getRevision: () => session.revision,
      commit(plan) { session.dispatch({ type: 'agent', plan }); },
    });
    if (page.signal.aborted) return;
    if (committed) { say(session.state.log.at(-1) ?? '灵已应答。'); chime(); }
  }
  page.root.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!target || target.disabled) return;
    if (target.dataset.panel) { openPanel(choice(target.dataset.panel, Object.keys(titles) as Panel[], '阅读页')); return; }
    if (target.dataset.cell !== undefined) { editCell(integer(Number(target.dataset.cell), '阵格', 0, 24)); return; }
    if (target.dataset.element) {
      view.element = choice(target.dataset.element, ELEMENTS, '元素'); view.actor = 'pen'; render(); return;
    }
    if (target.dataset.travel) {
      if (dispatch({ type: 'travel', location: choice(target.dataset.travel, LOCATIONS, '地点') })) panels.get('map')!.close();
      return;
    }
    if (target.dataset.craft) { dispatch({ type: 'craft', charm: choice(target.dataset.craft, CHARMS, '符饰') }); return; }
    if (target.dataset.equip) { dispatch({ type: 'equip', charm: choice(target.dataset.equip, CHARMS, '符饰') }, '符饰已佩戴，将影响下一场仪式的费用或裂隙。'); return; }
    if (target.dataset.learn) { dispatch({ type: 'learn', skill: choice(target.dataset.learn, SKILLS, '成长') }, '成长技已学会。它不会消耗伙伴的选择权。'); return; }
    for (const type of ['recruit', 'train', 'evolve'] as const) {
      if (target.dataset[type]) { dispatch({ type, id: choice(target.dataset[type], COMPANIONS, '伙伴') }); return; }
    }
    if (target.dataset.quest) { dispatch({ type: 'quest', id: choice(target.dataset.quest, SIDE_QUESTS, '支线') }); return; }
    if (target.dataset.choice) { dispatch({ type: 'choose', id: choice(target.dataset.choice, CHOICES, '承诺'), option: choice(target.dataset.option, OPTIONS, '选择') }); return; }
    if (target.dataset.finish) { if (dispatch({ type: 'finish', ending: choice(target.dataset.finish, ENDINGS, '去处') })) panels.get('journal')!.close(); return; }
    switch (target.dataset.action) {
      case 'gather': dispatch({ type: 'gather' }); break;
      case 'rest': dispatch({ type: 'rest' }); break;
      case 'begin': dispatch({ type: 'begin' }); break;
      case 'retreat': dispatch({ type: 'retreat' }); break;
      case 'layout': dispatch({ type: 'layout', layout: view.draft }, '阵式已落笔。按请灵应答，才会消耗真实的一次模型调用。'); break;
      case 'answer': void answer(); break;
      case 'undo': view.draft.runes.pop(); view.dirty = true; render(); break;
      case 'clear': view.draft = { runes: [], formation: [], stance: view.draft.stance }; view.dirty = true; render(); break;
      case 'restart': agent.cancel(); session.reset(84); panels.get('new')!.close(); say('新的空契环在手。旅程已重置，没有请求模型。'); break;
      case 'sound':
        view.sound = !view.sound;
        if (view.sound) {
          audio ??= new AudioContext();
          void audio.resume().then(chime).catch(error => {
            if (!(error instanceof DOMException)) throw error;
            view.sound = false; say('浏览器未能开启声音；旅程仍可静音进行。'); render();
          });
        }
        render(); break;
    }
  }, { signal: page.signal });
  query<HTMLSelectElement>(page.root, '[data-actor]').addEventListener('change', event => {
    view.actor = choice((event.target as HTMLSelectElement).value, ['pen', ...COMPANIONS], '落位对象');
    render();
  }, { signal: page.signal });
  query<HTMLSelectElement>(page.root, '[data-stance]').addEventListener('change', event => {
    if (busy) return;
    view.draft.stance = choice((event.target as HTMLSelectElement).value, STANCES, '仪态');
    view.dirty = true; render();
  }, { signal: page.signal });
  page.root.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]') ||
      (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable="true"]'))) return;
    if (session.state.phase !== 'ritual' || busy) return;
    if (['1', '2', '3'].includes(event.key)) {
      event.preventDefault(); view.element = ELEMENTS[Number(event.key) - 1]; view.actor = 'pen'; render();
    } else if (event.key === 'Backspace') {
      event.preventDefault(); view.draft.runes.pop(); view.dirty = true; render();
    } else if (event.target instanceof HTMLButtonElement && event.target.dataset.cell !== undefined) {
      const cell = Number(event.target.dataset.cell);
      const next = event.key === 'ArrowRight' && cell % 5 < 4 ? cell + 1 : event.key === 'ArrowLeft' && cell % 5 > 0 ? cell - 1 :
        event.key === 'ArrowDown' && cell < 20 ? cell + 5 : event.key === 'ArrowUp' && cell >= 5 ? cell - 5 : -1;
      if (next >= 0) { event.preventDefault(); query<HTMLButtonElement>(page.root, `[data-cell="${next}"]`).focus(); }
    }
  }, { signal: page.signal });
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const updateMotion = () => { page.root.dataset.reducedMotion = String(media.matches); };
  updateMotion();
  media.addEventListener('change', updateMotion, { signal: page.signal });
  page.onCleanup(() => {
    agent.cancel();
    for (const voice of voices) { voice.stop(); voice.disconnect(); }
    voices.clear();
    if (audio) void audio.close();
  });
  createGameNotebook(page, {
    gameId: 'verdant-oath', session, trigger: query(page.root, '[data-notebook]'), locale: 'zh-CN',
    beforeRestore: () => { agent.cancel(); },
    afterRestore: () => { syncDraft(); render(); },
    onNotice: say,
  });
  render();
  return { destroy: page.destroy, setPaused(paused) { page.root.dataset.paused = String(paused); } };
}
