import { query } from '../../core/page';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import type { WorkspaceLifecycle } from '../../core/workspace';

export function arrangeWorkspace(page: WorkspaceLifecycle) {
  const get = <T extends HTMLElement>(selector: string) => query<T>(page.root, selector);
  page.root.dataset.workspace = 'true';
  const drawer = get('.lumen-drawer');
  const host = get('.lumen-drawer-switch');
  const benchButton = get('[data-action="bench"]');
  const panels = document.createElement('div');
  panels.className = 'lumen-workspace-panels';
  drawer.append(panels);
  const pane = (name: string, selectors: string[]) => {
    const panel = document.createElement('div');
    panel.className = `lumen-workspace-panel lumen-pane-${name}`;
    panel.append(...selectors.map(selector => get(selector)));
    panels.append(panel);
    return panel;
  };
  const inspector = pane('inspector', ['[data-inspector]']);
  const detector = pane('detector', ['.lumen-readout', '.lumen-energy']);
  const notebook = pane('notebook', ['[data-notebook]']);
  get('[data-notebook]').hidden = false;
  const filesButton = document.createElement('button');
  filesButton.type = 'button';
  filesButton.textContent = 'Files & help';
  filesButton.dataset.lumenFiles = '';
  const fileActions = get('.lumen-file-actions');
  fileActions.before(filesButton);
  const files = createWorkspaceDialog(page, {
    id: 'lumen-files', title: 'Experiments & field guide', triggers: [filesButton],
    content: [fileActions, get('[data-file-error]'), get('.lumen-presets'), get('.lumen-view-tools'),
      get('.lumen-method'), get('.lumen-key-hint'), get('.lumen-footer')],
  });
  const study = document.createElement('select');
  study.dataset.study = '';
  study.setAttribute('aria-label', 'Optical study');
  study.innerHTML = '<option value="" disabled hidden>Imported experiment</option>' +
    [...page.root.querySelectorAll<HTMLButtonElement>('[data-preset]')]
    .map(button => `<option value="${button.dataset.preset}">${button.textContent?.replace(/^(\d+)/, '$1 / ')}</option>`).join('');
  get('.lumen-instrument-heading').append(study);
  const livePower = document.createElement('output');
  livePower.dataset.livePower = '';
  livePower.setAttribute('aria-label', 'Live collected power');
  get('.lumen-bench-caption').prepend(livePower);
  get('.lumen-element-picker').prepend(benchButton);
  drawer.replaceChildren(host, panels);
  const navigation = createWorkspaceTabs(page, {
    id: 'lumen-instrument', label: 'Instrument panels', host,
    panes: [
      { id: 'inspector', label: 'Inspector', panel: inspector },
      { id: 'detector', label: 'Detector', panel: detector },
      { id: 'notebook', label: 'Notebook', panel: notebook },
    ],
  });
  host.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    button.dataset.panel = button.dataset.workspaceTab;
  });
  return { navigation, files, study };
}
