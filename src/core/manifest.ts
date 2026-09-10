import type { Category, ProjectManifest } from './types';

export const categories: { id: Category; label: string; description: string }[] = [
  { id: 'create', label: 'Tools & makers', description: 'Make something to keep.' },
  { id: 'play', label: 'Games & puzzles', description: 'A little challenge, a little play.' },
  { id: 'read', label: 'Stories & archives', description: 'Places to read and get lost.' },
  { id: 'learn', label: 'Learning', description: 'Ideas you can take apart.' },
  { id: 'explore', label: 'Worlds & explorations', description: 'Follow an unfamiliar thread.' },
  { id: 'art', label: 'Art & motion', description: 'Experiments in form and feeling.' },
];

export const categoryNames: Record<Category, string> = {
  create: 'Tools & makers',
  play: 'Games & puzzles',
  read: 'Stories & archives',
  learn: 'Learning',
  explore: 'Worlds & explorations',
  art: 'Art & motion',
};

export function isCategory(value: unknown): value is Category {
  return categories.some((category) => category.id === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseManifest(value: unknown, source = 'Project manifest'): ProjectManifest {
  if (!isRecord(value)) throw new Error(`${source} must be a JSON object.`);
  const text = (key: string, allowEmpty = false) => {
    const item = value[key];
    if (typeof item !== 'string' || (!allowEmpty && !item.trim())) {
      throw new Error(`${source}: "${key}" must be a${allowEmpty ? '' : ' non-empty'} string.`);
    }
    return item;
  };
  const id = text('id');
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`${source}: use a lowercase URL-safe id.`);
  const order = value.order;
  if (typeof order !== 'number' || !Number.isInteger(order) || order < 1) {
    throw new Error(`${source}: "order" must be a positive integer.`);
  }
  if (!isCategory(value.category)) throw new Error(`${source}: unknown project category.`);
  if (value.format !== 'page') {
    throw new Error(`${source}: "format" must be "page"; projects own their website layout.`);
  }
  const tags = value.tags;
  if (!Array.isArray(tags) || !tags.length || !tags.every((tag: unknown) => typeof tag === 'string' && tag.trim())) {
    throw new Error(`${source}: provide at least one readable tag.`);
  }
  const color = text('color');
  const ink = text('ink');
  if (![color, ink].every((item) => /^#[0-9a-f]{6}$/i.test(item))) {
    throw new Error(`${source}: use six-digit hexadecimal colors.`);
  }
  const preview = value.preview;
  if (preview !== undefined && (typeof preview !== 'string' || !/^previews\/[a-z0-9-]+\.(jpg|png|webp|svg)$/.test(preview))) {
    throw new Error(`${source}: preview must be a local file in previews/.`);
  }
  const runtime = value.runtime;
  if (runtime !== undefined && runtime !== 'local' && runtime !== 'openai-compatible') {
    throw new Error(`${source}: runtime must be "local" or "openai-compatible".`);
  }
  const language = value.language;
  if (language !== undefined && language !== 'en' && language !== 'zh-CN') {
    throw new Error(`${source}: language must be "en" or "zh-CN".`);
  }
  const platform = value.platform;
  if (platform !== undefined && platform !== 'universal' && platform !== 'desktop') {
    throw new Error(`${source}: platform must be "universal" or "desktop".`);
  }
  return {
    id, order, color, ink,
    title: text('title'),
    subtitle: text('subtitle'),
    description: text('description'),
    category: value.category,
    format: value.format,
    medium: text('medium'),
    tags,
    instruction: text('instruction', true),
    ...(preview ? { preview } : {}),
    ...(runtime ? { runtime } : {}),
    ...(language ? { language } : {}),
    ...(platform ? { platform } : {}),
  };
}

export function validateCollection(manifests: ProjectManifest[]): void {
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const manifest of manifests) {
    if (ids.has(manifest.id)) throw new Error(`Duplicate project id: ${manifest.id}`);
    if (orders.has(manifest.order)) throw new Error(`Duplicate project order: ${manifest.order}`);
    ids.add(manifest.id);
    orders.add(manifest.order);
  }
}
