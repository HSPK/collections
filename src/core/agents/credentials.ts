export function containsCredential(value: unknown, key: string): boolean {
  if (!key) return false;
  const encodedKey = JSON.stringify(key).slice(1, -1);
  const pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'string' && (item.includes(key) || item.includes(encodedKey))) return true;
    if (Array.isArray(item)) {
      for (const child of item) pending.push(child);
    } else if (typeof item === 'object' && item !== null) {
      for (const [name, child] of Object.entries(item)) pending.push(name, child);
    }
  }
  return false;
}
