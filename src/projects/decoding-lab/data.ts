import type { DecoderSettings } from './engine';

export interface Corpus {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly sentences: readonly string[];
  readonly contexts: readonly { label: string; text: string }[];
  readonly unknown: string;
}

export const CORPORA: readonly Corpus[] = [
  {
    id: 'printshop',
    title: 'The night printshop',
    description: 'Eight original miniature lines about a quiet print room. The repeated line is intentional: it adds another observation.',
    sentences: [
      'the press hums.',
      'the press hums.',
      'the press prints.',
      'the ink dries.',
      'the ink glows.',
      'the paper waits.',
      'the paper glows.',
      'the press waits.',
    ],
    contexts: [
      { label: 'the …', text: 'the' },
      { label: 'the press …', text: 'the press' },
      { label: 'the ink …', text: 'the ink' },
      { label: 'the paper …', text: 'the paper' },
      { label: 'Empty line · START', text: '' },
      { label: 'a rivet … · unseen context', text: 'a rivet' },
    ],
    unknown: 'rivet',
  },
  {
    id: 'harbor',
    title: 'The little harbor',
    description: 'Eight original miniature lines from an imaginary harbor. “bell” and “tide” follow “the” equally often, so ties are visible.',
    sentences: [
      'the tide rises.',
      'the tide returns.',
      'the tide waits.',
      'the gull circles.',
      'the gull waits.',
      'the bell rings.',
      'the bell rings.',
      'the bell waits.',
    ],
    contexts: [
      { label: 'the …', text: 'the' },
      { label: 'the tide …', text: 'the tide' },
      { label: 'the gull …', text: 'the gull' },
      { label: 'the bell …', text: 'the bell' },
      { label: 'Empty line · START', text: '' },
      { label: 'a buoy … · unseen context', text: 'a buoy' },
    ],
    unknown: 'buoy',
  },
];

export interface Preset {
  readonly id: string;
  readonly title: string;
  readonly note: string;
  readonly settings: DecoderSettings;
}

export const PRESET_SEED = 42;
export const PRESETS: readonly Preset[] = [
  {
    id: 'open',
    title: 'Open tray',
    note: 'All tokens stay in. Smoothing makes unobserved transitions possible, not meaningful.',
    settings: { mode: 'sample', temperature: 1, topK: 0, topP: 1 },
  },
  {
    id: 'narrow',
    title: 'Narrow gate',
    note: 'Keep the best five, renormalize, then take a 90% nucleus. Count the survivors.',
    settings: { mode: 'sample', temperature: 1, topK: 5, topP: 0.9 },
  },
  {
    id: 'greedy',
    title: 'No dice',
    note: 'Always choose the largest logit. The seed is unused; ties follow the printed inventory.',
    settings: { mode: 'greedy', temperature: 1, topK: 0, topP: 1 },
  },
];
