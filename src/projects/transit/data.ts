import type { Network } from './engine';

export const ROUTE_COLORS = [
  '#df5935', '#326ad3', '#23866f', '#9960b4', '#bd8523', '#c64379',
  '#456b72', '#89633a', '#647a35', '#7854c5', '#bc5144', '#287f9b',
] as const;

export const DEFAULT_STATION_ID = 'lantern-exchange';

const BRINDLEPORT: Network = {
  version: 1,
  city: 'Brindleport',
  stations: [
    { id: 'rookery-end', name: 'Rookery End', x: 100, y: 340, label: 'above' },
    { id: 'copperfold', name: 'Copperfold', x: 220, y: 340, label: 'above' },
    { id: 'mossgate', name: 'Mossgate', x: 320, y: 440, label: 'below' },
    { id: 'lantern-exchange', name: 'Lantern Exchange', x: 460, y: 440, label: 'above-left' },
    { id: 'saffron-steps', name: 'Saffron Steps', x: 580, y: 320, label: 'above' },
    { id: 'spindle-yard', name: 'Spindle Yard', x: 780, y: 320, label: 'above-right' },
    { id: 'glint-quay', name: 'Glint Quay', x: 900, y: 320, label: 'below' },
    { id: 'cloudglass', name: 'Cloudglass', x: 460, y: 140, label: 'above' },
    { id: 'pollen-hall', name: 'Pollen Hall', x: 460, y: 260, label: 'left' },
    { id: 'fernworks', name: 'Fernworks', x: 580, y: 560, label: 'below' },
    { id: 'lastlight-pier', name: 'Lastlight Pier', x: 740, y: 560, label: 'below' },
    { id: 'thistle-bank', name: 'Thistle Bank', x: 100, y: 180, label: 'above' },
    { id: 'pip-orchard', name: 'Pip Orchard', x: 260, y: 180, label: 'above' },
    { id: 'lilt-gardens', name: 'Lilt Gardens', x: 620, y: 180, label: 'above' },
    { id: 'bellweather', name: 'Bellweather', x: 780, y: 180, label: 'above' },
    { id: 'mothglass', name: 'Mothglass', x: 900, y: 180, label: 'above' },
    { id: 'cinder-court', name: 'Cinder Court', x: 160, y: 560, label: 'below' },
    { id: 'pocket-square', name: 'Pocket Square', x: 320, y: 560, label: 'below' },
    { id: 'glimmer-lane', name: 'Glimmer Lane', x: 620, y: 440, label: 'above' },
    { id: 'quill-bridge', name: 'Quill Bridge', x: 780, y: 440, label: 'below' },
  ],
  routes: [
    {
      id: 'emberway',
      name: 'Emberway',
      color: ROUTE_COLORS[0],
      stops: ['rookery-end', 'copperfold', 'mossgate', 'lantern-exchange', 'saffron-steps', 'spindle-yard', 'glint-quay'],
    },
    {
      id: 'tidemark',
      name: 'Tidemark',
      color: ROUTE_COLORS[1],
      stops: ['cloudglass', 'pollen-hall', 'lantern-exchange', 'fernworks', 'lastlight-pier'],
    },
    {
      id: 'orchard',
      name: 'Orchard',
      color: ROUTE_COLORS[2],
      stops: ['thistle-bank', 'pip-orchard', 'pollen-hall', 'lilt-gardens', 'bellweather', 'mothglass'],
    },
    {
      id: 'moonthread',
      name: 'Moonthread',
      color: ROUTE_COLORS[3],
      stops: ['cinder-court', 'pocket-square', 'lantern-exchange', 'glimmer-lane', 'quill-bridge', 'spindle-yard', 'mothglass'],
    },
  ],
};

export function createDefaultNetwork(): Network {
  return {
    ...BRINDLEPORT,
    stations: BRINDLEPORT.stations.map((station) => ({ ...station })),
    routes: BRINDLEPORT.routes.map((route) => ({ ...route, stops: [...route.stops] })),
  };
}
