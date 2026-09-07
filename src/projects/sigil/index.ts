import './style.css';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError, requireRule } from '../../core/agents/errors';
import { createGameNotebook } from '../../core/games/notebook';
import { createProjectPage } from '../../core/page';
import type { ProjectContext } from '../../core/types';
import { architectTool, observation, SYSTEM } from './agent';
import { createSession } from './engine';
import type { Command, Plan } from './engine';
import { createRenderer } from './render';

export function mount(context: ProjectContext) {
  const page = createProjectPage(context, 'sigil');
  const session = createSession();
  let busy = false;
  let agent: ReturnType<typeof createAgentConsole>;
  const renderer = createRenderer(page, {
    state: () => session.state,
    busy: () => busy,
    reducedMotion: context.reducedMotion,
    command(command: Command) {
      try { session.dispatch(command); return true; }
      catch (error) {
        if (!(error instanceof AgentValidationError)) throw error;
        renderer.announce(error.message);
        return false;
      }
    },
    architect(action) { void turn(action); },
    restart(newEdition) {
      agent.cancel();
      session.reset(newEdition ? (session.seed + 1) >>> 0 : session.seed);
    },
  });
  agent = createAgentConsole(page, {
    gameId: 'sigil', host: renderer.agentHost,
    onBusyChange(value) { busy = value; renderer.paint(); },
  });
  page.onCleanup(session.subscribe(renderer.paint));
  createGameNotebook(page, {
    gameId: 'sigil', session, trigger: renderer.notebookTrigger,
    beforeRestore: () => { agent.cancel(); },
    afterRestore: renderer.paint,
    onNotice: renderer.announce,
  });
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  motion.addEventListener('change', () => renderer.setReducedMotion(motion.matches), { signal: page.signal });
  async function turn(action: Plan['action']) {
    const data = observation(session.state, action);
    requireRule(data.legalChoices.length > 0, 'No legal architect choices remain for this turn.');
    await agent.turn({
      label: action === 'commission' ? 'The architect / commission' : 'The architect / hint',
      system: SYSTEM, observation: data, tool: architectTool,
      validate(plan) {
        requireRule(plan.action === action, `This turn requires action ${action}.`);
        session.preview({ type: 'architect', plan });
      },
      getRevision: () => session.revision,
      commit(plan) { session.dispatch({ type: 'architect', plan }); },
    });
  }
  renderer.paint();
  return { destroy: page.destroy, setPaused: renderer.setPaused };
}
