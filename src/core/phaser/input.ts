export function gameKey(event: KeyboardEvent, root: HTMLElement, canInteract: boolean): boolean {
  if (!canInteract || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
      document.querySelector('dialog:modal')) return false;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return false;
  if (target.closest('.collection-menu')) return false;
  return target === document.body || target === document.documentElement || root.contains(target);
}
