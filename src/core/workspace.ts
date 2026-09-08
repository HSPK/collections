import '../styles/workspace.css';

export interface WorkspaceLifecycle {
  root: HTMLElement;
  signal: AbortSignal;
  onCleanup(cleanup: () => void): void;
}

export interface WorkspacePane {
  id: string;
  label: string;
  panel: HTMLElement;
}

export function mirrorWorkspaceStatus(page: WorkspaceLifecycle, source: HTMLElement) {
  page.signal.throwIfAborted();
  const live = document.createElement('p');
  live.className = 'workspace-status';
  live.dataset.workspaceAnnouncement = '';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  // Keep the visual message in place, but announce it once outside hidden panes.
  source.removeAttribute('role');
  source.removeAttribute('aria-live');
  function sync() {
    if (page.signal.aborted) return;
    const active = document.activeElement;
    const dialog = active instanceof Element ? active.closest('dialog[open]') : null;
    const host = dialog && page.root.contains(dialog) ? dialog : page.root;
    if (live.parentElement !== host) host.append(live);
    const message = source.hidden ? '' : source.textContent ?? '';
    if (live.textContent !== message) live.textContent = message;
  }
  const observer = new MutationObserver(sync);
  observer.observe(source, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  page.root.addEventListener('close', sync, { capture: true, signal: page.signal });
  page.onCleanup(() => { observer.disconnect(); live.remove(); });
  sync();
  return live;
}

interface WorkspaceTabsOptions {
  id: string;
  label: string;
  host: HTMLElement;
  panes: readonly WorkspacePane[];
  initial?: string;
  preserveLayout?: boolean;
  onSelect?: (id: string) => void;
}

function identifier(value: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) throw new Error(`Invalid workspace identifier: ${value}`);
  return value;
}

export function createWorkspaceTabs(page: WorkspaceLifecycle, options: WorkspaceTabsOptions) {
  page.signal.throwIfAborted();
  const id = identifier(options.id);
  if (!options.panes.length) throw new Error('A workspace needs at least one pane.');
  const ids = options.panes.map(pane => identifier(pane.id));
  if (new Set(ids).size !== ids.length) throw new Error('Workspace pane identifiers must be unique.');
  const { host, panes } = options;
  const buttons = new Map<string, HTMLButtonElement>();
  let selected = options.initial ?? panes[0].id;
  if (!ids.includes(selected)) throw new Error(`Unknown initial workspace pane: ${selected}`);
  host.classList.add('workspace-tabs');
  host.setAttribute('role', 'tablist');
  host.setAttribute('aria-label', options.label);
  host.replaceChildren();
  for (const pane of panes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `${id}-tab-${pane.id}`;
    button.textContent = pane.label;
    button.dataset.workspaceTab = pane.id;
    button.setAttribute('role', 'tab');
    pane.panel.id ||= `${id}-panel-${pane.id}`;
    pane.panel.classList.add('workspace-pane');
    pane.panel.setAttribute('role', 'tabpanel');
    pane.panel.setAttribute('aria-labelledby', button.id);
    button.setAttribute('aria-controls', pane.panel.id);
    button.addEventListener('click', () => select(pane.id), { signal: page.signal });
    buttons.set(pane.id, button);
    host.append(button);
  }
  function update() {
    for (const pane of panes) {
      const active = pane.id === selected;
      const button = buttons.get(pane.id)!;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      pane.panel.inert = !active;
      pane.panel.setAttribute('aria-hidden', String(!active));
      if (options.preserveLayout) {
        pane.panel.hidden = false;
        pane.panel.toggleAttribute('data-workspace-inactive', !active);
      } else {
        pane.panel.hidden = !active;
      }
    }
  }
  function select(next: string, focus = false) {
    page.signal.throwIfAborted();
    const button = buttons.get(next);
    if (!button) throw new Error(`Unknown workspace pane: ${next}`);
    const previous = panes.find(pane => pane.id === selected)!;
    const moveFocus = focus || (next !== selected && previous.panel.contains(document.activeElement));
    const changed = selected !== next;
    selected = next;
    update();
    if (moveFocus) button.focus({ preventScroll: true });
    if (changed) options.onSelect?.(selected);
  }
  host.addEventListener('keydown', event => {
    const index = panes.findIndex(pane => buttons.get(pane.id) === document.activeElement);
    if (index < 0) return;
    const next = event.key === 'ArrowRight' ? (index + 1) % panes.length :
      event.key === 'ArrowLeft' ? (index + panes.length - 1) % panes.length :
        event.key === 'Home' ? 0 : event.key === 'End' ? panes.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    select(panes[next].id, true);
  }, { signal: page.signal });
  update();
  return { select, get selected() { return selected; } };
}

interface WorkspaceDialogOptions {
  id: string;
  title: string;
  content: readonly HTMLElement[];
  triggers?: readonly HTMLElement[];
  className?: string;
  closeLabel?: string;
}

export function createWorkspaceDialog(page: WorkspaceLifecycle, options: WorkspaceDialogOptions) {
  page.signal.throwIfAborted();
  const id = identifier(options.id);
  if (!options.content.length) throw new Error('A workspace dialog needs content.');
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = `workspace-dialog ${options.className ?? ''}`.trim();
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  const heading = document.createElement('header');
  heading.className = 'workspace-dialog-heading';
  const title = document.createElement('h2');
  title.id = `${id}-title`;
  title.textContent = options.title;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = options.closeLabel ?? 'Close';
  close.setAttribute('aria-label', `${options.closeLabel ?? 'Close'} ${options.title}`);
  close.addEventListener('click', () => dialog.close(), { signal: page.signal });
  heading.append(title, close);
  const body = document.createElement('div');
  body.className = 'workspace-dialog-content';
  body.append(...options.content);
  dialog.append(heading, body);
  page.root.append(dialog);
  dialog.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.key !== 'Tab' || !dialog.open ||
        !(event.target instanceof Element) || event.target.closest('dialog') !== dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, summary, [tabindex], [contenteditable="true"]',
    )].filter(element => element.tabIndex >= 0 && !element.matches(':disabled') &&
      !element.closest('[inert]') && element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden');
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first && last) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last && first) {
      event.preventDefault();
      first.focus();
    }
  }, { signal: page.signal });
  function open() {
    page.signal.throwIfAborted();
    if (!dialog.open) dialog.showModal();
  }
  for (const trigger of options.triggers ?? []) {
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', id);
    trigger.addEventListener('click', event => { event.preventDefault(); open(); }, { signal: page.signal });
  }
  page.onCleanup(() => { if (dialog.open) dialog.close(); dialog.remove(); });
  return { dialog, open, close: () => dialog.close() };
}
