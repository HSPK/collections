import './style.css';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError } from '../../core/agents/errors';
import { choice } from '../../core/agents/schema';
import { GameSession } from '../../core/games/session';
import { createGameNotebook } from '../../core/games/notebook';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog } from '../../core/workspace';
import { councilTool, observation, SYSTEM } from './agent';
import { CONDITIONS, DELEGATE_IDS, DELEGATES, EMERGENCY_POLICY, FIELDS, SEASONS, SECTORS, SETUPS } from './data';
import type { Command, DelegateId } from './data';
import { decisionFor, definition, forecast, legalVotes, majority, projectPolicy, supportRule } from './engine';
import { cityDrawing, minutes, render, RULES, shell } from './render';
import type { BoardView } from './render';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'accord');
  page.root.dataset.workspace = 'true';
  page.root.dataset.reducedMotion = String(context.reducedMotion);
  page.root.setAttribute('aria-labelledby', 'accord-title');
  const session = new GameSession(definition, 1);
  page.root.innerHTML = shell(session.seed);
  let busy = false;
  let drawnSeed = session.seed;
  let boardView: BoardView = 'city';
  let inspected: DelegateId = 'vale';
  const notice = query<HTMLElement>(page.root, '[data-notice]');
  const say = (message: string) => { notice.textContent = message; };
  function content(markup = '') {
    const element = document.createElement('section');
    element.className = 'accord-dialog-content';
    element.innerHTML = markup;
    return element;
  }
  const rules = createWorkspaceDialog(page, {
    id: 'accord-rules', title: 'The council charter', content: [content(RULES)], className: 'accord-dialog',
  });
  const minuteContent = content();
  const register = createWorkspaceDialog(page, {
    id: 'accord-minutes', title: 'Council minutes', content: [minuteContent], className: 'accord-dialog',
  });
  const outlookContent = content();
  const outlook = createWorkspaceDialog(page, {
    id: 'accord-outlook', title: 'Six-season forecast', content: [outlookContent], className: 'accord-dialog',
  });
  const delegateContent = content();
  const delegateDialog = createWorkspaceDialog(page, {
    id: 'accord-delegate', title: 'Delegate seat', content: [delegateContent], className: 'accord-dialog',
  });
  const emergencyContent = content();
  const emergency = createWorkspaceDialog(page, {
    id: 'accord-emergency', title: 'Emergency charter', content: [emergencyContent], className: 'accord-dialog',
  });
  const newContent = content(`<p>Start a fresh six-season campaign. The current local save will be replaced; export it from Save first if you want to keep it. Opening this dialog cancels a pending council turn.</p>
    <label for="accord-new-condition">Campaign waters</label><select id="accord-new-condition">${CONDITIONS.map(id => `<option value="${id}">${SETUPS[id].name}</option>`).join('')}</select>
    <div class="accord-dialog-actions"><button data-action="new-confirm">Start new campaign</button><button data-action="restart-confirm">Restart this campaign</button></div>`);
  const newCampaign = createWorkspaceDialog(page, {
    id: 'accord-new', title: 'New campaign', content: [newContent], className: 'accord-dialog',
  });

  function renderDelegate() {
    const state = session.state;
    const delegate = DELEGATES[inspected];
    const decision = decisionFor(state, inspected);
    delegateContent.innerHTML = `<p class="accord-eyebrow">${delegate.title} / trust ${state.trust[inspected]} of 6</p><h3 class="accord-dialog-lede">${delegate.name}</h3>
      <p>${delegate.goal}</p><p><strong>Hard constraint:</strong> ${delegate.constraint} At trust 0-1, ${delegate.field} also needs at least 4 works.</p>
      <p><strong>Legal votes for this policy:</strong> ${legalVotes(state, inspected).join(', ')}. ${supportRule(state, inspected).reason}</p>
      <p><strong>Offer budget:</strong> 1 transfer per delegate per season, 1-2 works. At most 2 offers per hearing. ${state.offeredBy.includes(inspected) ? 'This delegate has already used their offer.' : 'This delegate has not used their offer.'}</p>
      ${decision ? `<blockquote><p>${escapeMarkup(decision.statement)}</p><footer>${decision.vote.toUpperCase()}${decision.promise === 'reciprocate' ? ' / reciprocal public pact' : ''}</footer></blockquote>` : '<p>No binding decision yet. Request a hearing when your draft is ready.</p>'}
      <p class="accord-small">Public decisions only. The delegate may refuse a legal policy; a hard constraint may never be waived.</p>`;
  }
  function draw() {
    if (page.signal.aborted) return;
    if (drawnSeed !== session.seed) {
      query(page.root, '[data-city-svg]').outerHTML = cityDrawing(session.seed);
      drawnSeed = session.seed;
    }
    render(page.root, session.state, busy, boardView);
    if (register.dialog.open) minuteContent.innerHTML = minutes(session.state);
    if (delegateDialog.dialog.open) renderDelegate();
  }
  const agent = createAgentConsole(page, {
    gameId: 'accord', host: query(page.root, '[data-agent-host]'),
    onBusyChange(value) { busy = value; draw(); },
  });
  function dispatch(command: Command, message: string) {
    try {
      session.dispatch(command);
      say(message);
    } catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      say(error.message);
      draw();
    }
  }
  function openNew() {
    agent.cancel();
    query<HTMLSelectElement>(newContent, '#accord-new-condition').value = session.state.condition;
    newCampaign.open();
  }
  async function primaryAction() {
    const state = session.state;
    if (busy) return;
    if (state.phase === 'setup') {
      dispatch({
        type: 'start', condition: choice(query<HTMLSelectElement>(page.root, '[data-condition]').value, CONDITIONS, 'Campaign waters'),
      }, 'Draft an ordinance. The resource strip predicts its result, including the next hearing cost.');
    } else if (state.phase === 'draft') {
      const committed = await agent.turn({
        label: `Nacre council / season ${state.season + 1}, hearing ${state.hearings + 1}`,
        system: SYSTEM, observation: observation(state), tool: councilTool,
        validate(plan) { session.preview({ type: 'council', plan }); },
        getRevision: () => session.revision,
        commit(plan) { session.dispatch({ type: 'council', plan }); },
      });
      if (!page.signal.aborted && committed) say(majority(session.state) ? 'Two or more yes votes. Your next action can enact this exact policy.' : 'The proposal was rejected. Negotiate an amendment or read the emergency charter.');
    } else if (state.phase === 'ballot' && majority(state)) {
      dispatch({ type: 'enact' }, 'The local simulation resolved the adopted ordinance. Open Minutes for the conservation ledger.');
    } else if (state.phase === 'ballot') {
      const predicted = session.preview({ type: 'emergency' });
      emergencyContent.innerHTML = `<p class="accord-dialog-lede">No majority. No invented consent.</p>
        <p>The charter substitutes this fixed policy: ${FIELDS.map(field => `${SECTORS[field].short} ${EMERGENCY_POLICY[field]}`).join(', ')}.</p>
        <p><strong>Cost:</strong> 3 extra crowns and 14 cohesion (rather than +2 for adoption). Flood damage and public pacts still apply. The delegates have not approved this policy.</p>
        <p><strong>Authoritative forecast:</strong> fabric ${predicted.resources.integrity}, cohesion ${predicted.resources.cohesion}, water ${predicted.resources.water}, energy ${predicted.resources.energy}, food ${predicted.resources.food}, treasury ${predicted.resources.funds}.</p>
        ${predicted.phase === 'lost' ? `<p class="accord-warning">${escapeMarkup(predicted.ending)}</p>` : '<p>This resolves the season immediately. There is no model request.</p>'}
        <button class="accord-primary" data-action="emergency-confirm">Enact emergency</button>`;
      emergency.open();
    } else if (state.phase === 'resolved') {
      dispatch({ type: 'next' }, 'A new forecast is on the board. Adjust the last policy before calling the council.');
    } else {
      openNew();
    }
  }
  page.root.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!target || target.disabled) return;
    if (target.dataset.viewChoice) {
      boardView = choice(target.dataset.viewChoice, ['city', 'section'] as const, 'Drawing view');
      draw();
      return;
    }
    if (target.dataset.delegate) {
      inspected = choice(target.dataset.delegate, DELEGATE_IDS, 'Delegate');
      renderDelegate();
      delegateDialog.open();
      return;
    }
    if (target.dataset.takeOffer) {
      dispatch({ type: 'take-offer', delegate: choice(target.dataset.takeOffer, DELEGATE_IDS, 'Offer author') },
        'Counteroffer applied. One amendment spent; old votes cleared. Request a new hearing to collect fresh votes.');
      return;
    }
    switch (target.dataset.action) {
      case 'primary': void primaryAction(); break;
      case 'amend': dispatch({ type: 'amend' }, 'One amendment spent. The ordinance is editable; all old votes are cleared.'); break;
      case 'rules': rules.open(); break;
      case 'minutes': minuteContent.innerHTML = minutes(session.state); register.open(); break;
      case 'forecast': {
        const state = session.state;
        outlookContent.innerHTML = `<p>All six tides are public and deterministic. Campaign adjustment: ${SETUPS[state.condition].pressure}. The model cannot edit this chart.</p><table><thead><tr><th>Season</th><th>Pressure</th><th>Wall works for no flood</th><th>Rain</th><th>Cold load</th></tr></thead><tbody>${SEASONS.map((season, i) => {
          const pressure = season.tide + season.storm + SETUPS[state.condition].pressure;
          return `<tr ${i === state.season ? 'class="accord-current-row"' : ''}><td>${i + 1}. ${season.name}</td><td>${pressure}</td><td>${Math.ceil((pressure - 4) / 2)}</td><td>${season.rain}</td><td>${season.cold}</td></tr>`;
        }).join('')}</tbody></table><p>${forecast(state).note}</p><p>Store capacity is 18 each. Base water use is 6; food use is 7. Energy load is 5 + cisterns + ceil(wall / 2) + cold.</p>
        <p>Current draft: ${projectPolicy(state).generation} generation against ${projectPolicy(state).load} load. Forecasts are exact for the selected works; future votes and pacts remain choices.</p>`;
        outlook.open(); break;
      }
      case 'emergency-confirm':
        dispatch({ type: 'emergency' }, 'The explicit emergency charter was enacted. No delegate approval was fabricated.');
        emergency.close(); break;
      case 'new': openNew(); break;
      case 'new-confirm': {
        const condition = choice(query<HTMLSelectElement>(newContent, '#accord-new-condition').value, CONDITIONS, 'Campaign waters');
        agent.cancel();
        session.reset((session.seed + 1) >>> 0);
        dispatch({ type: 'start', condition }, 'A fresh campaign. No model has been called.');
        newCampaign.close(); break;
      }
      case 'restart-confirm': {
        const condition = session.state.condition;
        agent.cancel();
        session.reset();
        dispatch({ type: 'start', condition }, 'Campaign restarted. The old pending ballot cannot enter this world.');
        newCampaign.close(); break;
      }
    }
  }, { signal: page.signal });
  page.root.addEventListener('change', event => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.field) {
      dispatch({ type: 'allocate', field: choice(target.dataset.field, FIELDS, 'Works'), value: Number(target.value) },
        'Draft updated. Read the city section and resource forecast before requesting votes.');
    } else if (target instanceof HTMLSelectElement && target.matches('[data-pledge]')) {
      dispatch({ type: 'pledge', delegate: choice(target.value, ['none', ...DELEGATE_IDS] as const, 'Pledge') },
        'Public pledge updated. Only a matching yes delegate can reciprocate it.');
    } else if (target instanceof HTMLSelectElement && target.matches('[data-condition]')) {
      const condition = choice(target.value, CONDITIONS, 'Campaign waters');
      query(page.root, '[data-condition-note]').textContent = SETUPS[condition].description;
    }
  }, { signal: page.signal });
  page.onCleanup(session.subscribe(draw));
  draw();
  createGameNotebook(page, {
    gameId: 'accord', session, trigger: query(page.root, '[data-notebook]'),
    beforeRestore: () => agent.cancel(), afterRestore: draw, onNotice: say,
  });
  return {
    destroy: page.destroy,
    reset() {
      agent.cancel();
      session.reset();
      say('A fresh setup is ready. No model has been called.');
    },
  };
}
