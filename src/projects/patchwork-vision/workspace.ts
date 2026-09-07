import { query } from '../../core/page';
import { createWorkspaceTabs } from '../../core/workspace';
import type { WorkspaceLifecycle } from '../../core/workspace';

export function createVisionWorkspace(page: WorkspaceLifecycle) {
  const { root } = page;
  root.dataset.workspace = 'true';
  const bench = query<HTMLElement>(root, '.pw-workbench');
  const image = query<HTMLElement>(root, '.pw-image-panel');
  const frame = document.createElement('div');
  frame.className = 'pw-image-frame';
  frame.append(query(root, '.pw-image'));
  const content = document.createElement('div');
  content.className = 'pw-workspace-content';
  const dock = document.createElement('aside');
  dock.className = 'pw-dock';
  dock.setAttribute('aria-label', 'Vision inspector');
  const tabs = document.createElement('div');
  const panels = document.createElement('div');
  panels.className = 'pw-dock-panels';
  const pane = (id: string, label: string, elements: HTMLElement[]) => {
    const panel = document.createElement('div');
    panel.className = 'pw-inspector-pane';
    panel.append(...elements);
    panels.append(panel);
    return { id, label, panel };
  };
  const find = (selector: string) => query<HTMLElement>(root, selector);
  const imageHints = [...image.querySelectorAll<HTMLElement>('.pw-hint')];
  const panes = [
    pane('match', 'Match', [find('.pw-match-panel')]),
    pane('image', 'Image', [find('.pw-scene-state'), find('.pw-image-actions'), find('.pw-checkbox'), ...imageHints, find('[data-export]')]),
    pane('token', 'Token', [find('.pw-token-panel'), find('.pw-ledger')]),
    pane('scenes', 'Scenes', [find('.pw-comparison')]),
    pane('notes', 'Notes', [find('.pw-heading .pw-eyebrow'), find('.pw-deck'), find('.pw-model-stamp > span'), find('.pw-image-panel .pw-panel-heading > span'), find('.pw-bench-footer'), find('.pw-under-the-hood')]),
  ];
  const score = document.createElement('p');
  score.className = 'pw-live-score';
  score.innerHTML = 'Image cosine <output data-live-score></output> <span>not confidence</span>';
  image.append(frame, find('.pw-image-panel .pw-paint-controls'));
  image.querySelector('.pw-panel-heading')!.append(score);
  dock.append(tabs, panels);
  content.append(image, dock);
  find('.pw-panels').remove();
  bench.append(content);
  return createWorkspaceTabs(page, {
    id: 'pw-inspector', label: 'Vision inspector panels', host: tabs, panes,
  });
}
