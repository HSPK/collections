export interface PaperPlant {
  name: string;
  x: number;
  y: number;
  height: number;
  size: number;
  kind: 'fan' | 'cup' | 'wheel';
  color: string;
  fold: string;
  opened: number;
}

export const GARDEN = { width: 1000, height: 590 };
export const plants: PaperPlant[] = [
  { name: 'Sea fan', x: 90, y: 473, height: 190, size: 35, kind: 'fan', color: '#97bdc4', fold: '#648f9f', opened: 0.62 },
  { name: 'Coral cup', x: 205, y: 487, height: 269, size: 45, kind: 'cup', color: '#ef9a89', fold: '#cc746a', opened: 0.69 },
  { name: 'Paper star', x: 312, y: 470, height: 170, size: 39, kind: 'wheel', color: '#f0b896', fold: '#d9917c', opened: 0.6 },
  { name: 'Blue palm', x: 410, y: 498, height: 343, size: 48, kind: 'fan', color: '#92b6c6', fold: '#5d8da4', opened: 0.77 },
  { name: 'Apricot bowl', x: 530, y: 467, height: 238, size: 43, kind: 'cup', color: '#efb49c', fold: '#d98b78', opened: 0.53 },
  { name: 'Wind wheel', x: 651, y: 501, height: 315, size: 47, kind: 'wheel', color: '#e99186', fold: '#c96c67', opened: 0.71 },
  { name: 'Tide fan', x: 761, y: 479, height: 222, size: 42, kind: 'fan', color: '#a6c7c9', fold: '#769da9', opened: 0.73 },
  { name: 'Rose fold', x: 863, y: 484, height: 284, size: 40, kind: 'cup', color: '#eaa095', fold: '#c67877', opened: 0.79 },
  { name: 'Small sail', x: 946, y: 472, height: 142, size: 30, kind: 'fan', color: '#afccd3', fold: '#81a6b4', opened: 0.56 },
];

export const CALIBRATION_SECONDS = 1.1;
export const DEFAULT_STRENGTH = 0.7;
