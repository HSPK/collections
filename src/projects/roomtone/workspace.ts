import { query } from '../../core/page';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import type { WorkspaceLifecycle } from '../../core/workspace';

export function createStudioWorkspace(page: WorkspaceLifecycle): void {
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  const space = query<HTMLElement>(root, '.roomtone-space');
  const inspector = query<HTMLElement>(root, '.roomtone-inspector');
  const analysis = query<HTMLElement>(root, '.roomtone-analysis');
  const comparison = query<HTMLElement>(root, '.roomtone-comparison');
  const audition = query<HTMLElement>(root, '.roomtone-audition');
  const bench = query<HTMLElement>(root, '.roomtone-bench-grid');
  const stack = document.createElement('div');
  stack.className = 'roomtone-detail-stack';
  const panels = [
    { id: 'space', label: 'Space', content: space },
    { id: 'edit', label: 'Edit room', content: inspector },
    { id: 'listen', label: 'Response', content: analysis },
    { id: 'compare', label: 'Compare', content: comparison },
  ].map(pane => {
    const panel = document.createElement('div');
    panel.id = `roomtone-pane-${pane.id}`;
    panel.className = `roomtone-workspace-panel roomtone-panel-${pane.id}`;
    panel.append(pane.content);
    return { ...pane, panel };
  });
  stack.append(...panels.slice(1).map(pane => pane.panel));
  bench.replaceChildren(panels[0].panel, stack);

  const nav = query<HTMLElement>(root, '.roomtone-mobile-panes');
  nav.replaceChildren();
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Workbench panes');
  const narrow = matchMedia('(max-width: 760px)');
  let selected = narrow.matches ? 'space' : 'edit';
  let lastDetail = 'edit';
  const buttons = panels.map(pane => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = pane.label;
    button.id = `roomtone-tab-${pane.id}`;
    button.dataset.pane = pane.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', pane.panel.id);
    pane.panel.setAttribute('aria-labelledby', button.id);
    button.addEventListener('click', () => select(pane.id), { signal });
    nav.append(button);
    return button;
  });
  function update(): void {
    root.dataset.mobilePane = selected;
    panels.forEach((pane, index) => {
      const visible = pane.id === selected || (!narrow.matches && pane.id === 'space');
      pane.panel.hidden = !visible;
      pane.panel.inert = !visible;
      pane.panel.setAttribute('role', !narrow.matches && pane.id === 'space' ? 'presentation' : 'tabpanel');
      if (!narrow.matches && pane.id === 'space') pane.panel.removeAttribute('aria-labelledby');
      else pane.panel.setAttribute('aria-labelledby', buttons[index].id);
      buttons[index].hidden = pane.id === 'space' && !narrow.matches;
      buttons[index].setAttribute('aria-selected', String(pane.id === selected));
      buttons[index].tabIndex = pane.id === selected ? 0 : -1;
    });
    stack.hidden = narrow.matches && selected === 'space';
  }
  function select(id: string): void {
    selected = id;
    if (id !== 'space') lastDetail = id;
    update();
  }
  nav.addEventListener('keydown', event => {
    if (event.target !== document.activeElement) return;
    const available = buttons.filter(button => !button.hidden);
    const index = available.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    const next = event.key === 'ArrowRight' ? (index + 1) % available.length :
      event.key === 'ArrowLeft' ? (index + available.length - 1) % available.length :
        event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    select(available[next].dataset.pane!);
    available[next].focus({ preventScroll: true });
  }, { signal });
  narrow.addEventListener('change', () => {
    const focused = document.activeElement;
    if (!narrow.matches && selected === 'space') selected = lastDetail;
    update();
    if (focused instanceof HTMLElement && focused.closest('[hidden], [inert]')) {
      buttons.find(button => button.dataset.pane === selected)!.focus({ preventScroll: true });
    }
  }, { signal });
  update();

  const geometry = document.createElement('div');
  const surfaces = document.createElement('div');
  geometry.className = surfaces.className = 'roomtone-specification-pane';
  const heading = query<HTMLElement>(inspector, '.roomtone-section-top');
  let palette = false;
  for (const child of [...inspector.children]) {
    if (child === heading) continue;
    if (child.classList.contains('roomtone-material-heading')) palette = true;
    (palette ? surfaces : geometry).append(child);
  }
  const specTabs = document.createElement('nav');
  specTabs.className = 'roomtone-specification-tabs';
  inspector.append(specTabs, geometry, surfaces);
  createWorkspaceTabs(page, {
    id: 'roomtone-specification', label: 'Room specification', host: specTabs,
    panes: [{ id: 'geometry', label: 'Geometry', panel: geometry }, { id: 'surfaces', label: 'Surfaces', panel: surfaces }],
  });

  const actions = query<HTMLElement>(audition, '.roomtone-audio-actions');
  const light = query<HTMLElement>(audition, '[data-audio-light]');
  const error = query<HTMLElement>(audition, '[data-audio-error]');
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.textContent = 'Sound';
  settings.dataset.soundSettings = '';
  const settingsContent = document.createElement('section');
  settingsContent.className = 'roomtone-sound-settings';
  light.remove();
  actions.remove();
  error.remove();
  settingsContent.append(...audition.children);
  const audioNote = query<HTMLElement>(actions, ':scope > span');
  settingsContent.append(audioNote);
  actions.append(settings, light);
  audition.removeAttribute('aria-labelledby');
  audition.setAttribute('aria-label', 'Audio transport');
  audition.replaceChildren(actions, error);
  query(root, '.roomtone-workbench').insertBefore(audition, query(root, '[data-status]'));
  createWorkspaceDialog(page, {
    id: 'roomtone-sound-dialog', title: 'Sound settings', content: [settingsContent], triggers: [settings],
  });
  createWorkspaceDialog(page, {
    id: 'roomtone-model-dialog', title: 'Model notes',
    content: [query(root, '.roomtone-notes'), query(root, '.roomtone-footer')],
    triggers: [query(root, '.roomtone-masthead-right a')],
  });
}
