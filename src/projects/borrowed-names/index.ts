import './style.css';
import type { ProjectContext } from '../../core/types';
import { createProjectPage } from '../../core/page';
import { GameSession } from '../../core/games/session';
import { createGameNotebook } from '../../core/games/notebook';
import { createAgentConsole } from '../../core/agents/console';
import { AgentValidationError } from '../../core/agents/errors';
import { GAME_ID, NPCS, TOPIC_NAMES } from './data';
import { definition } from './engine';
import { requestFor } from './agent';
import { createRenderer } from './render';

export function mount(context: ProjectContext) {
  const page = createProjectPage(context, GAME_ID);
  const session = new GameSession(definition, 83);
  const renderer = createRenderer(page, session, {
    async encounter(npc, topic, method) {
      try {
        const request = requestFor(session.state, npc, topic, method);
        const accepted = await agent.turn({
          ...request, label: `${NPCS[npc].name} · ${TOPIC_NAMES[topic]}`,
          validate: plan => { session.preview({ type: 'agent', npc, topic, method, plan }); },
          getRevision: () => session.revision,
          commit: plan => { session.dispatch({ type: 'agent', npc, topic, method, plan }); },
        });
        if (accepted) renderer.notice(session.state.log.at(-1) ?? '角色行动已记录。');
      } catch (error) {
        if (!(error instanceof AgentValidationError)) throw error;
        renderer.notice(error.message);
      }
    },
    reset(fresh) {
      agent.cancel();
      const seed = fresh ? crypto.getRandomValues(new Uint32Array(1))[0] : session.seed;
      session.reset(seed);
      renderer.notice('调查重新开始。没有请求模型；请重新选择职业。');
    },
  });
  const agent = createAgentConsole(page, {
    gameId: GAME_ID, host: renderer.consoleHost, locale: 'zh-CN', onBusyChange: renderer.setBusy,
    preflight: () => session.assertCanDispatch(32768),
  });
  page.onCleanup(session.subscribe(renderer.render));
  createGameNotebook(page, {
    gameId: GAME_ID, session, trigger: renderer.notebookTrigger, locale: 'zh-CN',
    beforeRestore: agent.cancel, afterRestore: renderer.render, onNotice: renderer.notice,
  });
  renderer.render();
  return { destroy: page.destroy };
}
