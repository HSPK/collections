interface Tagged {
  readonly tags: readonly string[];
}

export interface ProjectTag {
  key: string;
  label: string;
  count: number;
}

const cleanLabel = (tag: string): string => tag.trim().replace(/\s+/g, ' ');
export const normalizeTag = (tag: string): string => cleanLabel(tag).toLowerCase();

export function collectTags(projects: readonly Tagged[]): ProjectTag[] {
  const tags = new Map<string, ProjectTag>();
  for (const project of projects) {
    const seen = new Set<string>();
    for (const raw of project.tags) {
      const label = cleanLabel(raw);
      if (!label) throw new Error('Project tags must have a readable label.');
      const key = normalizeTag(label);
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = tags.get(key);
      if (existing) existing.count++;
      else tags.set(key, { key, label, count: 1 });
    }
  }
  return [...tags.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'en'));
}

export function matchesTags(project: Tagged, selected: readonly string[]): boolean {
  if (!selected.length) return true;
  const available = new Set(project.tags.map(normalizeTag));
  return selected.every((tag) => available.has(normalizeTag(tag)));
}
