import { getSection, getStory } from './data';
import type { NewspaperSection, Story } from './data';

export type NewspaperRoute =
  | { kind: 'front' }
  | { kind: 'article'; story: Story }
  | { kind: 'section'; section: NewspaperSection }
  | { kind: 'saved' }
  | { kind: 'about' }
  | { kind: 'missing'; path: string };

export function readRoute(hash: string): NewspaperRoute {
  let path: string;
  try {
    path = decodeURIComponent(hash.replace(/^#\/?/, '')).replace(/\/$/, '');
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    return { kind: 'missing', path: hash };
  }

  if (['', 'front-page', 'main-content', 'nw-content'].includes(path)) return { kind: 'front' };
  if (path === 'reading-list') return { kind: 'saved' };
  if (path === 'about') return { kind: 'about' };

  const [kind, id, extra] = path.split('/');
  if (extra === undefined && kind === 'article' && id) {
    const story = getStory(id);
    if (story) return { kind: 'article', story };
  }
  if (extra === undefined && kind === 'section' && id) {
    const section = getSection(id);
    if (section) return { kind: 'section', section };
  }
  return { kind: 'missing', path };
}

export function routeTitle(route: NewspaperRoute): string {
  switch (route.kind) {
    case 'article': return route.story.title;
    case 'section': return route.section.name;
    case 'saved': return 'Your reading list';
    case 'about': return 'About the edition';
    case 'missing': return 'Page not found';
    case 'front': return 'The front page';
  }
}
