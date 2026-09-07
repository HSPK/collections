import './style.css';
import { createProjectPage } from '../../core/page';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError } from '../../core/agents/errors';
import { GameSession } from '../../core/games/session';
import { createGameNotebook } from '../../core/games/notebook';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { SYSTEM, observation, witnessTool } from './agent';
import { WITNESSES } from './data';
import { assertEncounter, definition } from './engine';
import type { Command, Encounter } from './engine';
import { createView } from './render';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'mnemosyne');
  page.root.dataset.workspace = 'true';
  const session = new GameSession(definition, 74);
  let busy = false;
  const view = createView(page, {
    getState: () => session.state,
    busy: () => busy,
    command,
    cancel: () => agent.cancel(),
    encounter: encounter => { void takeTurn(encounter); },
    restart: newSeed => {
      agent.cancel();
      session.reset(newSeed ? crypto.getRandomValues(new Uint32Array(1))[0] : session.seed);
    },
  });
  const agent = createAgentConsole(page, {
    gameId: 'mnemosyne', host: view.agentHost,
    onBusyChange: value => { busy = value; view.render(); },
  });
  function reportRule(error: AgentValidationError) {
    view.setNotice(error.message);
    page.report(error.message);
  }
  function command(move: Command) {
    if (busy) { view.setNotice('A witness is deciding. Wait or cancel before changing the inquiry.'); return; }
    try {
      if (move.type === 'next') { agent.cancel(); view.closeTransientDialogs(); }
      session.dispatch(move);
      const state = session.state;
      view.setNotice(state.phase === 'won' || state.phase === 'lost' ? state.verdict :
        move.type === 'pin' ? 'Claim pinned. Its source links are visible in Evidence graph.' :
          move.type === 'inspect' ? 'Physical record added. Inspect and pin it; revisiting this object is free.' :
            move.type === 'begin' ? 'The inquiry is open. Interview Ivo, compare credentials in Casebook, or commission a warrant in Objects.' :
              move.type === 'next' ? 'Chapter II is ready. This is a different event, with new evidence and responsibility.' :
                'The working record has been updated.');
    } catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      reportRule(error);
    }
  }
  async function takeTurn(encounter: Encounter) {
    try {
      assertEncounter(session.state, encounter);
      const accepted = await agent.turn({
        label: WITNESSES[encounter.witnessId].name,
        system: SYSTEM,
        observation: observation(session.state, encounter),
        tool: witnessTool,
        validate: plan => { session.preview({ type: 'witness', encounter, plan }); },
        getRevision: () => session.revision,
        commit: plan => { session.dispatch({ type: 'witness', encounter, plan }); },
      });
      if (page.signal.aborted) return;
      view.setNotice(accepted ? session.state.phase === 'lost' ? session.state.verdict :
        'Testimony recorded. Check Claims for sources and Objects for newly located records.' : agent.status);
    } catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      reportRule(error);
    }
  }
  page.onCleanup(session.subscribe(view.render));
  createGameNotebook(page, {
    gameId: 'mnemosyne', session, trigger: view.saveTrigger,
    beforeRestore: () => { agent.cancel(); view.closeTransientDialogs(); },
    afterRestore: view.render,
    onNotice: view.setNotice,
  });
  page.root.addEventListener('change', event => {
    if (event.target instanceof HTMLInputElement && event.target.matches('[data-game-import]')) agent.cancel();
  }, { signal: page.signal });
  return { destroy: page.destroy, reset: () => { agent.cancel(); view.closeTransientDialogs(); session.reset(); } };
}
