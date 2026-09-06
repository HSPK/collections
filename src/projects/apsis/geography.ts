import { CanvasTexture, SRGBColorSpace } from 'three';

// Deliberately schematic coastlines: a procedural globe, not a navigation basemap.
const CONTINENTS: number[][] = [
  [-168,72,-152,70,-141,60,-130,55,-126,48,-124,40,-118,32,-110,28,-105,22,-98,18,-88,21,-84,16,-79,9,-77,9,-82,23,-80,26,-82,30,-75,35,-69,43,-60,47,-56,53,-65,59,-77,61,-84,68,-96,73,-114,76,-133,70,-155,73],
  [-81,12,-73,11,-62,8,-51,1,-35,-7,-40,-20,-47,-26,-52,-34,-60,-40,-68,-55,-73,-51,-74,-39,-71,-30,-77,-15,-81,-4,-77,5],
  [-54,60,-43,61,-22,70,-20,79,-36,84,-55,81,-65,74,-60,66],
  [-17,36,-5,36,10,37,22,33,33,31,35,24,43,12,51,11,44,1,40,-12,34,-25,28,-34,18,-35,12,-20,8,-4,-4,5,-15,10,-17,22],
  [-10,36,-9,43,-1,44,-5,49,3,51,8,56,8,63,18,71,28,70,32,62,42,66,53,69,70,71,91,77,110,74,128,71,142,66,159,61,177,65,170,55,156,51,148,46,141,43,134,35,126,39,122,31,121,21,110,19,108,11,104,2,100,4,99,16,94,20,89,22,82,8,77,9,73,20,66,25,57,25,51,15,44,12,36,30,29,41,26,40,22,37,16,41,12,45,4,43],
  [113,-22,116,-34,126,-35,132,-32,138,-36,146,-39,153,-29,151,-23,145,-14,137,-12,131,-11,126,-15,119,-19],
  [47,-13,50,-16,50,-24,46,-26,43,-19],
  [95,5,105,-5,114,-8,119,-9,115,-5,106,-1,100,4],
  [109,7,119,6,119,-4,111,-4],
  [130,-3,141,-2,151,-6,147,-10,136,-8],
  [138,34,142,39,145,44,142,45,139,39,135,35,130,32,132,30],
  [-8,50,-5,51,-4,55,-6,58,-3,59,0,54,1,51],
  [166,-35,175,-39,178,-42,171,-46,166,-47,168,-42,172,-40],
];

export function createGeography(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('APSIS could not create the procedural Earth texture.');
  const x = (longitude: number) => (longitude + 180) / 360 * canvas.width;
  const y = (latitude: number) => (90 - latitude) / 180 * canvas.height;
  let seed = 17061;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  ctx.fillStyle = '#173441';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < 12000; index++) {
    ctx.fillStyle = `rgba(90,151,164,${0.015 + random() * 0.055})`;
    ctx.fillRect(random() * canvas.width, random() * canvas.height, 1 + random() * 9, 1 + random() * 2);
  }
  const land = new Path2D();
  for (const points of CONTINENTS) {
    land.moveTo(x(points[0]), y(points[1]));
    for (let index = 2; index < points.length; index += 2) {
      const px = points[index - 2], py = points[index - 1], nx = points[index], ny = points[index + 1];
      land.lineTo(x((px + nx) / 2 + (random() - 0.5) * 1.3), y((py + ny) / 2 + (random() - 0.5)));
      land.lineTo(x(nx), y(ny));
    }
    land.closePath();
  }
  ctx.fillStyle = '#63818a';
  ctx.fill(land);
  ctx.strokeStyle = '#93a9ad';
  ctx.lineWidth = 1.2;
  ctx.stroke(land);
  ctx.save();
  ctx.clip(land);
  for (let index = 0; index < 14000; index++) {
    const px = random() * canvas.width, py = random() * canvas.height;
    ctx.fillStyle = random() > 0.5 ? 'rgba(182,195,185,.13)' : 'rgba(23,59,59,.12)';
    ctx.beginPath();
    ctx.ellipse(px, py, 1 + random() * 15, 1 + random() * 3, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Broad dry-land and polar regions keep geography readable at desk scale.
  ctx.fillStyle = 'rgba(189,174,140,.35)';
  ctx.beginPath();
  ctx.ellipse(x(18), y(24), 170, 43, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(203,221,219,.45)';
  ctx.fillRect(0, 0, canvas.width, y(65));
  ctx.restore();
  ctx.fillStyle = '#aac1c4';
  ctx.beginPath();
  ctx.moveTo(0, y(-76));
  for (let longitude = -180; longitude <= 180; longitude += 3) ctx.lineTo(x(longitude), y(-70 - random() * 8));
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(175,213,218,.13)';
  ctx.lineWidth = 0.8;
  for (let longitude = -180; longitude <= 180; longitude += 15) {
    ctx.beginPath(); ctx.moveTo(x(longitude), 0); ctx.lineTo(x(longitude), canvas.height); ctx.stroke();
  }
  for (let latitude = -75; latitude <= 75; latitude += 15) {
    ctx.beginPath(); ctx.moveTo(0, y(latitude)); ctx.lineTo(canvas.width, y(latitude)); ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
