import { query } from '../../core/page';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import type { WorkspaceLifecycle } from '../../core/workspace';

export function arrangeWorkspace(page: WorkspaceLifecycle, id: string) {
  const get = <T extends HTMLElement>(selector: string) => query<T>(page.root, selector);
  page.root.dataset.workspace = 'true';
  const director = get('.apsis-director');
  const tabs = document.createElement('div');
  const panels = document.createElement('div');
  panels.className = 'apsis-workspace-panels';
  director.append(panels);
  const pane = (name: string, selectors: string[]) => {
    const panel = document.createElement('div');
    panel.className = `apsis-workspace-panel apsis-pane-${name}`;
    panel.append(...selectors.map(selector => get(selector)));
    panels.append(panel);
    return panel;
  };
  const plan = pane('plan', ['.apsis-planner', '.apsis-targets', '.apsis-goal']);
  const burns = pane('burns', ['.apsis-timeline']);
  const inspect = pane('inspect', ['.apsis-prediction-panel', '.apsis-telemetry']);
  const manual = pane('manual', ['.apsis-burn-editor']);
  const actions = document.createElement('div');
  actions.className = 'apsis-workspace-actions';
  actions.append(get('[data-apsis-build]'), get('[data-apsis-execute]'));
  const notes = get<HTMLDetailsElement>('[data-apsis-model-notes]');
  notes.open = true;
  const library = createWorkspaceDialog(page, {
    id: `${id}-reference`, title: 'Flight notes & recorder',
    triggers: [get('[data-apsis-notes]')],
    content: [
      get('.apsis-brief'), get('.apsis-checklist'), get('.apsis-library'), notes,
      get('.apsis-log'), get('.apsis-time-note'), get('.apsis-execute-note'),
      get('.apsis-scene-caption'), get('.apsis-footer'),
    ],
  });
  director.replaceChildren(tabs, panels, actions);
  get('.apsis-analysis-grid').remove();
  const navigation = createWorkspaceTabs(page, {
    id, label: 'Flight desk panes', host: tabs, preserveLayout: true,
    panes: [
      { id: 'plan', label: 'Plan', panel: plan },
      { id: 'burns', label: 'Burns', panel: burns },
      { id: 'inspect', label: 'Inspect', panel: inspect },
      { id: 'manual', label: 'Manual', panel: manual },
    ],
  });
  return { select: navigation.select, closeNotes: library.close };
}
