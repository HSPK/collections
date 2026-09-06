export const DEFAULT_SETTINGS = {
  count: 160,
  coupling: 2.8,
  breeze: 0.12,
  seed: 43017,
} as const;

export const GARDEN_NOTES = [
  {
    number: '01',
    title: 'A rhythm of their own',
    text: 'Each light carries a slightly different internal clock. With no coupling, the flashes gradually fall out of step.',
  },
  {
    number: '02',
    title: 'Only the nearest voices',
    text: 'Nearby lights nudge one another’s phase. Small groups find a rhythm, then mingle into a larger, luminous gathering.',
  },
  {
    number: '03',
    title: 'A little intervention',
    text: 'Your torch gently attracts nearby lights and offers them a common clock. Scatter the phases to hear the silence begin again.',
  },
] as const;
