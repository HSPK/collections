import { query } from '../../core/page';
import { createWorkspaceTabs, mirrorWorkspaceStatus } from '../../core/workspace';
import type { WorkspaceLifecycle } from '../../core/workspace';

export function createVectorWorkspace(page: WorkspaceLifecycle) {
  const { root } = page;
  root.dataset.workspace = 'true';
  const get = (selector: string) => query<HTMLElement>(root, selector);
  const controls = get('.vp-controls');
  const dock = document.createElement('div');
  dock.className = 'vp-dock';
  const host = document.createElement('div');
  const panels = document.createElement('div');
  panels.className = 'vp-dock-panels';
  const parameters = document.createElement('div');
  const readout = document.createElement('div');
  const guide = document.createElement('div');
  panels.append(parameters, readout, guide);
  dock.append(host, panels);
  get('.vp-board-body').append(dock);
  parameters.append(controls);
  readout.append(get('[data-vp-eigen-panel]'), get('[data-vp-projection-panel]'));
  guide.append(get('.vp-deck'), get('.vp-header-stamp'), get('.vp-masthead .vp-eyebrow'),
    get('.vp-plot-heading'), get('.vp-figure figcaption'), get('.vp-field-notes'), get('.vp-footer'));
  for (const section of controls.querySelectorAll<HTMLElement>('[data-vp-matrix-controls], [data-vp-dot-controls]')) {
    const detail = document.createElement('section');
    detail.dataset.vpModeDetail = section.hasAttribute('data-vp-matrix-controls') ? 'transform' : 'projection';
    detail.append(...section.querySelectorAll('.vp-control-caption, .vp-combination, .vp-preset-note'));
    readout.append(detail);
    for (const heading of section.querySelectorAll('.vp-control-heading')) guide.prepend(heading);
  }
  guide.append(get('.vp-number-hint'));
  const tabs = createWorkspaceTabs(page, {
    id: 'vp-inspector', label: 'Vector inspector', host,
    panes: [
      { id: 'parameters', label: 'Parameters', panel: parameters },
      { id: 'readout', label: 'Readout', panel: readout },
      { id: 'guide', label: 'Guide', panel: guide },
    ],
  });
  mirrorWorkspaceStatus(page, get('[data-vp-challenge-status]'));
  return tabs;
}
