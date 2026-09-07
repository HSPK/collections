import { query } from '../../core/page';
import { createWorkspaceTabs, mirrorWorkspaceStatus } from '../../core/workspace';
import type { WorkspaceLifecycle } from '../../core/workspace';

export function createStudioWorkspace(page: WorkspaceLifecycle) {
  const { root } = page;
  root.dataset.workspace = 'true';
  const shell = query<HTMLElement>(root, '.as-shell');
  const bench = query<HTMLElement>(root, '.as-workbench');
  const content = document.createElement('div');
  content.className = 'as-workspace-content';
  const dock = document.createElement('aside');
  dock.className = 'as-dock';
  dock.setAttribute('aria-label', 'Attention inspector');
  const tabs = document.createElement('div');
  const panels = document.createElement('div');
  panels.className = 'as-dock-panels';
  const pane = (id: string, label: string, selectors: string[]) => {
    const panel = document.createElement('div');
    panel.className = 'as-inspector-pane';
    panel.append(...selectors.map(selector => query<HTMLElement>(root, selector)));
    panels.append(panel);
    return { id, label, panel };
  };
  const panes = [
    pane('embeddings', 'Embeddings', ['.as-route-goal', '.as-input-panel']),
    pane('calculation', 'Calculation', ['.as-pipeline', '.as-trace-grid', '.as-pair-grid', '.as-rounding-note']),
    pane('matrices', 'Matrices', ['.as-projections']),
    pane('challenge', 'Challenge', ['.as-challenge']),
    pane('notes', 'Notes', ['.as-model-stamp', '.as-intro', '.as-wordmark .as-eyebrow', '.as-map-help', '.as-notes']),
  ];
  const map = query<HTMLElement>(root, '.as-map-panel');
  map.append(query(root, '.as-selection-bar'));
  dock.append(tabs, panels);
  content.append(map, dock);
  query(root, '.as-bench-grid').remove();
  bench.append(content);
  shell.append(bench);
  const inspector = createWorkspaceTabs(page, {
    id: 'as-inspector', label: 'Attention inspector panels', host: tabs, panes,
  });
  mirrorWorkspaceStatus(page, query(root, '[data-challenge-status]'));
  return inspector;
}
