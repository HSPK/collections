import { query } from '../../core/page';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import type { WorkspaceLifecycle } from '../../core/workspace';
import { PLACES } from './world';

export function createFolioWorkspace(page: WorkspaceLifecycle) {
  const { root } = page;
  root.dataset.workspace = 'true';
  const masthead = query(root, '.palinode-masthead');
  const tools = document.createElement('div');
  tools.className = 'palinode-desk-tools';
  tools.innerHTML = '<button type="button" data-open-goals>Goals</button><button type="button" data-open-archive>Folio desk</button>';
  masthead.append(tools);

  const files = document.createElement('div');
  files.className = 'palinode-file-tools';
  files.append(...root.querySelectorAll<HTMLElement>('.palinode-toolbar [data-action="export"], .palinode-toolbar [data-action="import"], .palinode-toolbar [data-action="reset"]'));
  const ledger = query<HTMLElement>(root, '.palinode-ledger-area');
  query(ledger, '.palinode-guide').prepend(query(root, '.palinode-introduction'));
  const archive = createWorkspaceDialog(page, {
    id: 'palinode-archive', title: 'Folio desk', triggers: [query(root, '[data-open-archive]')],
    content: [files, ledger, query(root, '.palinode-colophon')],
  });
  createWorkspaceDialog(page, {
    id: 'palinode-goals', title: 'Goals and hints', triggers: [query(root, '[data-open-goals]')],
    content: [query(root, '.palinode-objective')],
  });

  const cityTools = document.createElement('div');
  cityTools.className = 'palinode-city-tools';
  const place = document.createElement('select');
  place.setAttribute('aria-label', 'Place in Aven');
  place.dataset.workspacePlace = '';
  for (const item of PLACES) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.number} ${item.name}`;
    place.append(option);
  }
  const expand = document.createElement('button');
  expand.type = 'button';
  expand.textContent = 'Full map';
  cityTools.append(place, expand);
  query(root, '.palinode-map-sheet').append(cityTools);
  const mapContent = document.createElement('div');
  mapContent.dataset.fullMap = '';
  const mapDialog = createWorkspaceDialog(page, {
    id: 'palinode-city-map', title: 'Aven city map', triggers: [expand],
    content: [mapContent, query(root, '.palinode-map-caption')],
  });

  const workspace = query(root, '.palinode-workspace');
  const editor = query(root, '.palinode-editor-layout');
  const tabHost = document.createElement('nav');
  const stack = document.createElement('div');
  stack.className = 'palinode-pane-stack';
  const panels = [
    { id: 'read', label: 'Read', panel: query<HTMLElement>(root, '.palinode-folio') },
    { id: 'edit', label: 'Decide', panel: query<HTMLElement>(root, '.palinode-causes') },
    { id: 'future', label: 'Compare', panel: query<HTMLElement>(root, '.palinode-future') },
    { id: 'ending', label: 'Ending', panel: query<HTMLElement>(root, '.palinode-ending') },
  ].map(pane => {
    const wrapper = document.createElement('div');
    wrapper.className = `palinode-workbench-pane palinode-pane-${pane.id}`;
    if (pane.id === 'ending') {
      const empty = document.createElement('p');
      empty.className = 'palinode-no-ending';
      empty.textContent = 'This telling is still unfinished. Read the records, change a cause, and consult Goals for the paths to an honest ending.';
      wrapper.append(empty);
    }
    wrapper.append(pane.panel);
    stack.append(wrapper);
    return { ...pane, panel: wrapper };
  });
  editor.append(tabHost, stack);
  workspace.append(editor);
  const tabs = createWorkspaceTabs(page, {
    id: 'palinode-folio', label: 'Folio workspace', host: tabHost, panes: panels, preserveLayout: true,
  });
  return { tabs, archive, mapDialog, place };
}
