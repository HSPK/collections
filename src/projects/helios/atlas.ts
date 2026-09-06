import { siteToMap } from './math';
// Original, deliberately simplified continent silhouettes. These are shared by
// the picker and the illustrative globe; they are not geographic survey data.
export const LAND: readonly (readonly [number, number][])[] = [
  [[-168,71],[-145,70],[-131,59],[-124,50],[-125,41],[-117,31],[-108,23],[-97,16],[-88,16],[-82,9],[-77,8],[-83,22],[-81,26],[-80,33],[-67,45],[-53,51],[-60,58],[-80,63],[-97,74],[-124,73],[-146,60],[-168,64]],
  [[-73,59],[-48,61],[-23,75],[-39,83],[-62,80]],
  [[-81,12],[-68,10],[-59,6],[-51,1],[-35,-6],[-39,-19],[-48,-28],[-54,-38],[-68,-55],[-75,-46],[-71,-30],[-80,-9]],
  [[-10,36],[-10,44],[-2,49],[8,55],[5,62],[20,71],[34,70],[29,60],[42,57],[54,68],[88,76],[118,73],[150,70],[178,66],[160,57],[142,50],[133,40],[122,30],[120,21],[108,18],[106,10],[100,2],[96,17],[86,22],[79,8],[73,20],[60,25],[50,30],[40,40],[28,41],[24,36],[14,41],[2,41]],
  [[-17,15],[-17,28],[-6,36],[10,37],[24,32],[33,30],[43,12],[51,11],[43,-8],[35,-22],[19,-35],[12,-28],[10,-8],[0,4],[-9,4]],
  [[47,-13],[50,-16],[48,-26],[44,-25],[43,-19]],
  [[112,-22],[116,-34],[131,-33],[143,-39],[153,-28],[146,-17],[136,-12],[130,-12],[123,-17]],
  [[130,31],[141,42],[145,45],[141,35],[135,33]],
  [[96,5],[105,-6],[115,-8],[119,-4],[108,1]],
  [[120,1],[126,5],[135,-2],[151,-5],[145,-10],[133,-8]],
  [[166,-34],[178,-39],[171,-46],[166,-45],[174,-39]],
  [[-180,-76],[-135,-73],[-90,-72],[-60,-63],[-45,-76],[0,-70],[55,-67],[95,-66],[145,-70],[180,-76],[180,-90],[-180,-90]],
  [[-8,50],[-6,59],[0,58],[2,52]],
  [[-24,64],[-13,64],[-13,67],[-22,67]],
];
export function landPath(width: number, height: number): string {
  return LAND.map(polygon => polygon.map(([lon, lat], i) => {
    const p = siteToMap(lat, lon);
    return `${i ? 'L' : 'M'}${(p.x * width).toFixed(2)},${(p.y * height).toFixed(2)}`;
  }).join(' ') + 'Z').join(' ');
}
export function earthAtlas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas is required for the original Earth artwork.');
  ctx.fillStyle = '#163b51'; ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = '#699c89'; ctx.strokeStyle = '#9dbba0'; ctx.lineWidth = 1;
  const path = new Path2D(landPath(1024, 512));
  ctx.fill(path); ctx.stroke(path);
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#d9ded3';
  for (let y = 0; y < 512; y += 3) {
    for (let x = 0; x < 1024; x += 3) {
      const n = Math.sin(x * 0.051 + Math.sin(y * 0.027) * 4) * Math.cos(y * 0.057 + Math.cos(x * 0.015) * 7);
      if (n > 0.44) ctx.fillRect(x, y, 3, 3);
    }
  }
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#c5d9d8';
  ctx.fillRect(0, 0, 1024, 11);
  return canvas;
}
