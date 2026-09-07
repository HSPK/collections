import { query } from '../../core/page';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import type { WorkspaceLifecycle } from '../../core/workspace';

export function createGradientWorkspace(page: WorkspaceLifecycle) {
  const { root } = page;
  root.dataset.workspace = 'true';
  const get = (selector: string) => query<HTMLElement>(root, selector);
  const inspector = get('.gl-inspector');
  const host = document.createElement('div');
  const panels = document.createElement('div');
  panels.className = 'gl-dock-panels';
  const setup = document.createElement('div');
  const start = document.createElement('div');
  const readout = document.createElement('div');
  const history = document.createElement('div');
  const notes = document.createElement('div');
  panels.append(setup, start, readout, history);
  inspector.append(host, panels);
  setup.append(get('.gl-settings'));
  start.append(get('.gl-start-form'), get('.gl-toggle'), get('.gl-speed'));
  readout.append(get('.gl-inspection'), get('.gl-function'), get('[data-surface-note]'),
    get('.gl-stop-notice'), get('.gl-run-record'));
  history.append(get('.gl-history'));
  const paths = document.createElement('section');
  paths.className = 'gl-path-readouts';
  paths.setAttribute('aria-label', 'All path coordinates and statuses');
  for (const card of root.querySelectorAll<HTMLElement>('[data-method]')) {
    const row = document.createElement('p');
    const name = document.createElement('strong');
    name.textContent = query<HTMLElement>(card, '.gl-method-name').textContent;
    row.append(name, query(card, '[data-card-position]'), query(card, '[data-card-status]'));
    paths.append(row);
  }
  readout.prepend(paths);
  notes.append(get('.gl-deck'), get('.gl-mark'), get('.gl-header .gl-eyebrow'), get('.gl-settings > .gl-eyebrow'),
    get('.gl-map-caption'), get('.gl-comparison-heading'), get('.gl-reset-note'),
    get('.gl-range-extents'), get('.gl-panel-heading .gl-eyebrow'), get('[data-motion-note]'),
    get('.gl-field-guide'), get('.gl-footer'));
  inspector.append(host, panels, get('.gl-feedback-row'));
  const tabs = createWorkspaceTabs(page, {
    id: 'gl-inspector', label: 'Optimizer inspector', host,
    panes: [
      { id: 'setup', label: 'Setup', panel: setup },
      { id: 'start', label: 'Start', panel: start },
      { id: 'readout', label: 'Readout', panel: readout },
      { id: 'history', label: 'History', panel: history },
    ],
  });
  const tools = document.createElement('nav');
  tools.className = 'gl-workspace-tools';
  tools.setAttribute('aria-label', 'Learning resources');
  const experiments = document.createElement('button');
  experiments.type = 'button';
  experiments.textContent = 'Experiments';
  const guide = document.createElement('button');
  guide.type = 'button';
  guide.textContent = 'Guide';
  tools.append(experiments, guide);
  get('.gl-header').append(tools);
  createWorkspaceDialog(page, {
    id: 'gl-guide', title: 'Gradient field guide', content: [notes], triggers: [guide],
  });
  const experimentDialog = createWorkspaceDialog(page, {
    id: 'gl-experiments', title: 'Field experiments', content: [get('.gl-challenges')], triggers: [experiments],
  });
  return { tabs, closeExperiments: experimentDialog.close };
}
