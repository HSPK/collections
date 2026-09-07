import { query } from '../../core/page';
import { createWorkspaceTabs, mirrorWorkspaceStatus } from '../../core/workspace';
import type { WorkspaceLifecycle } from '../../core/workspace';

export function createDecodingWorkspace(page: WorkspaceLifecycle) {
  const { root } = page;
  root.dataset.workspace = 'true';
  const bench = query<HTMLElement>(root, '.dl-workbench');
  const content = document.createElement('div');
  content.className = 'dl-workspace-content';
  const stage = document.createElement('section');
  stage.className = 'dl-stage';
  stage.setAttribute('aria-label', 'Live decoding preview');
  const heading = document.createElement('h2');
  heading.className = 'dl-live-heading';
  heading.innerHTML = '<span data-overview-label>Next-token probabilities</span><span>Given <code data-workspace-context></code></span>';
  const legend = document.createElement('p');
  legend.className = 'dl-overview-legend';
  legend.innerHTML = '<span>Gray: base</span><span>Orange: final</span><span>0–100%</span>';
  const chart = document.createElement('div');
  chart.className = 'dl-overview';
  chart.dataset.probabilityOverview = '';
  chart.setAttribute('role', 'img');
  const dock = document.createElement('aside');
  dock.className = 'dl-dock';
  dock.setAttribute('aria-label', 'Decoding inspector');
  const tabs = document.createElement('div');
  const panels = document.createElement('div');
  panels.className = 'dl-dock-panels';
  stage.append(heading, legend, chart, query(root, '.dl-output-paper'));
  const pane = (id: string, label: string, selectors: string[]) => {
    const panel = document.createElement('div');
    panel.className = 'dl-inspector-pane';
    panel.append(...selectors.map(selector => query<HTMLElement>(root, selector)));
    panels.append(panel);
    return { id, label, panel };
  };
  const panes = [
    pane('settings', 'Settings', ['.dl-workbench-top', '.dl-settings', '.dl-preset-note']),
    pane('distribution', 'Distribution', ['.dl-distribution']),
    pane('history', 'History', ['.dl-paper', '.dl-feedback']),
    pane('model', 'Model', ['.dl-pipeline', '.dl-source-section']),
    pane('experiments', 'Experiments', ['.dl-proof', '.dl-comparison-guide']),
    pane('notes', 'Notes', ['.dl-intro', '.dl-masthead-top', '.dl-field-notes', '.dl-footer']),
  ];
  const modelDetails = document.createElement('p');
  modelDetails.className = 'dl-model-details';
  modelDetails.append(...root.querySelectorAll('.dl-model-stamp > span'));
  panes.at(-1)!.panel.prepend(modelDetails);
  dock.append(tabs, panels);
  content.append(stage, dock);
  query(root, '.dl-machine-grid').remove();
  bench.append(content);
  const inspector = createWorkspaceTabs(page, {
    id: 'dl-inspector', label: 'Decoding inspector panels', host: tabs, panes,
  });
  mirrorWorkspaceStatus(page, query(root, '[data-feedback]'));
  return inspector;
}
