import type { CanvasSize } from '../../core/canvas';
import { random } from '../../core/math';
import { BEDS, PLANT_OFFSETS } from './data';
import type { BedId, GardenState, Plant } from './data';
import type { Point } from './engine';

type Ink = CanvasRenderingContext2D;
export interface InkStroke {
  points: readonly Point[];
  kind: 'drawing' | 'matched' | 'rejected';
  opacity: number;
}

const LEAF = new Path2D('M0 0C5-17 29-28 43-25C39-8 19 5 0 0Z');
const PETAL = new Path2D('M0 1C-13-5-11-20 0-24C12-18 13-5 0 1Z');
const GLASSHOUSE = new Path2D('M-92 0V-120C-92-255 92-255 92-120V0Z');
const DOOR = new Path2D('M-29 0V-62C-29-104 29-104 29-62V0Z');
const WILLOW_TRUNK = new Path2D('M-8 0C3-73-17-142 8-228C4-155 14-118 23-87C16-47 16-20 25 0Z');
const POND = new Path2D('M-1 .04C-1.05-.58-.49-.9-.08-.82C.26-1.02.67-.72.88-.35C1.2.1.75.72.28.82C-.3 1.01-.87.7-1 .04Z');

function path(g: Ink, d: string | Path2D, fill?: string, stroke?: string, width = 1.5) {
  const p = typeof d === 'string' ? new Path2D(d) : d;
  if (fill) { g.fillStyle = fill; g.fill(p); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(p); }
}

function oval(g: Ink, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, angle = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.2; g.stroke(); }
}

function line(g: Ink, points: readonly Point[], color: string, width = 1.5) {
  if (!points.length) return;
  g.beginPath();
  g.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) g.lineTo(point.x, point.y);
  g.strokeStyle = color;
  g.lineWidth = width;
  g.stroke();
}

function leaf(g: Ink, x: number, y: number, scale: number, angle: number, color: string) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.scale(scale, scale);
  path(g, LEAF, color, '#476e51', 0.8);
  path(g, 'M3-1Q22-13 36-21', undefined, '#ecedba', 0.8);
  g.restore();
}

function willow(g: Ink, x: number, y: number, scale: number, time: number, mirror = false) {
  g.save();
  g.translate(x, y);
  g.scale(mirror ? -scale : scale, scale);
  oval(g, 2, 4, 100, 14, '#34574230');
  path(g, WILLOW_TRUNK, '#62795b', '#3f6049', 2);
  path(g, 'M5-5Q-1-133 10-216M11-121Q-31-151-67-174M14-149Q50-181 79-194',
    undefined, '#a8ac79', 3);
  const clusters = [
    [-63, -178, 61, 43], [-39, -235, 62, 48], [21, -268, 63, 42],
    [71, -231, 70, 45], [92, -187, 52, 47], [10, -213, 78, 52],
  ];
  clusters.forEach(([cx, cy, rx, ry], i) => {
    oval(g, cx, cy, rx, ry, ['#98b781', '#aebf8d', '#bdc798', '#8cac77', '#7ca372', '#a2b987'][i], '#709466');
  });
  for (let branch = 0; branch < 12; branch += 1) {
    const bx = -99 + branch * 18;
    const by = -226 + Math.sin(branch * 0.8) * 23;
    const drop = 53 + (branch % 4) * 15;
    const sway = Math.sin(time * 0.65 + branch) * 6;
    path(g, `M${bx} ${by}Q${bx - 7 + sway} ${by + drop * 0.7} ${bx + sway} ${by + drop}`,
      undefined, '#507d53', 1.3);
    for (let bud = 1; bud < 5; bud += 1) {
      leaf(g, bx + sway * bud / 4, by + drop * bud / 5, 0.30, bud % 2 ? 0.5 : 2.0,
        branch % 2 ? '#729b65' : '#86a773');
    }
  }
  g.restore();
}

function greenhouse(g: Ink, x: number, y: number, scale: number, time: number) {
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  oval(g, 0, 7, 113, 17, '#3f624133');
  path(g, GLASSHOUSE, '#dbe0b0', '#777a51', 4);
  path(g, 'M-81-28V-125C-81-242 81-242 81-125V-28Z', '#edf0cf80', '#a99b6b', 1.5);
  path(g, 'M0-221V-86M-47-199V-5M47-199V-5M-90-119H90M-82-163H82M-92-56H92',
    undefined, '#9a9468', 2);
  path(g, 'M-42-177L-9-195M-40-159L-3-180M52-101L76-123', undefined, '#fff8d7', 4);
  path(g, DOOR, '#739679', '#637558', 3);
  path(g, 'M-20-4V-61Q-20-93 20-61V-4M0-81V-3M-20-47H20', undefined, '#b8bd86', 2);
  oval(g, 13, -29, 2.8, 2.8, '#f1dca3');
  path(g, 'M-103 0H103V10H-103Z', '#a9ab82', '#787f5b', 2);
  path(g, 'M-103 4H103M-70 0V9M-15 0V9M40 0V9M88 0V9', undefined, '#858e65', 1);
  path(g, 'M-101 0Q-115-58-90-104Q-57-134-92-167Q-111-183-80-203',
    undefined, '#4c7950', 3);
  for (let i = 0; i < 11; i += 1) {
    leaf(g, -94 + Math.sin(i * 1.1) * 10, -14 - i * 17, 0.49,
      i % 2 ? -0.3 : 2.4, i % 3 ? '#769c68' : '#9fb778');
  }
  g.save();
  g.translate(63, -128);
  g.rotate(Math.sin(time * 0.8) * 0.045);
  path(g, 'M0 0V25M-8 25H8L12 45L0 50L-12 45Z', '#f7d17f', '#867b4f', 2);
  path(g, 'M-8 26L0 30L8 26M0 30V48', undefined, '#c18e45', 1.2);
  oval(g, 0, 37, 4, 7, '#fff0b0');
  g.restore();
  path(g, 'M-38-231Q0-249 38-231', undefined, '#78815c', 2);
  leaf(g, 0, -239, 0.43, -0.8, '#698d5d');
  leaf(g, 0, -239, 0.43, 3.8, '#8aab71');
  g.restore();
}

function pond(g: Ink, x: number, y: number, rx: number, ry: number, time: number) {
  g.save();
  g.translate(x, y);
  g.scale(rx, ry);
  path(g, POND, '#467c75');
  g.scale(0.91, 0.85);
  path(g, POND, '#8db6a0');
  g.restore();
  for (let i = 0; i < 4; i += 1) {
    const offset = Math.sin(time * 0.55 + i) * 2;
    path(g, `M${x - rx * 0.5 + i * rx * 0.2} ${y - ry * 0.4 + i * ry * 0.27}
      q${rx * 0.3} ${ry * 0.18 + offset} ${rx * 0.55} -1`, undefined, '#d4dfb9', 1.3);
  }
  for (const [dx, dy, scale] of [[-0.42, -0.17, 1], [0.34, 0.25, 0.85], [0.06, -0.44, 0.70]]) {
    const px = x + dx * rx;
    const py = y + dy * ry;
    oval(g, px, py, rx * 0.16 * scale, ry * 0.24 * scale, '#4e8768', '#356f5d');
    path(g, `M${px} ${py}l${rx * 0.12} ${-ry * 0.15}`, undefined, '#a9c08a', 1);
    if (dx < 0) {
      for (let i = 0; i < 5; i += 1) {
        oval(g, px + Math.cos(i * 1.25) * 5, py - 5 + Math.sin(i * 1.25) * 2, 3, 7, '#faf1ca', undefined, (i - 2) * 0.4);
      }
      oval(g, px, py - 3, 3, 2, '#e7b05d');
    }
  }
}

function mushroom(g: Ink, x: number, y: number, scale: number) {
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  path(g, 'M-4 0Q0-14-3-32H6Q3-15 8 0Z', '#efe1b4', '#6e8055');
  path(g, 'M-23-28C-22-56 17-60 27-30Q8-20-23-28Z', '#bd795d', '#886748');
  path(g, 'M-19-28Q3-22 23-29', undefined, '#f3c695', 2);
  for (const [dx, dy] of [[-8, -38], [7, -44], [16, -34], [-1, -31]]) {
    oval(g, dx, dy, 2.5, 2, '#f5dbb0');
  }
  g.restore();
}

function starbell(g: Ink, plant: Plant, scale: number, time: number, breeze: number) {
  const tall = 49 + plant.variant % 4 * 9;
  const lean = Math.sin(time * 1.25 + plant.id * 1.3) * (0.025 + breeze * 0.017);
  const flowers = ['#f2b39c', '#f3d887', '#c6b6ce', '#e9a78b'];
  g.save();
  g.scale(scale, scale);
  g.rotate(lean);
  path(g, `M0 0Q-8 ${-tall * 0.65} 3 ${-tall}`, undefined, '#375f44', 2.5);
  leaf(g, -2, -tall * 0.27, 0.49, -0.35, '#93b474');
  leaf(g, -2, -tall * 0.55, 0.39, 3.6, '#6e9c65');
  g.translate(3, -tall);
  g.rotate(plant.variant * 0.2 + lean);
  const flowerSize = 0.57 + plant.variant % 3 * 0.07;
  g.scale(flowerSize, flowerSize);
  for (let petal = 0; petal < 5; petal += 1) {
    g.save();
    g.rotate(petal * Math.PI * 2 / 5);
    path(g, PETAL, flowers[plant.variant % flowers.length], '#aa866d', 1);
    path(g, 'M0-6V-16', undefined, '#fff1c2', 1);
    g.restore();
  }
  oval(g, 0, 0, 6, 6, '#f5de8d', '#9f8751');
  for (let dot = 0; dot < 5; dot += 1) {
    oval(g, Math.cos(dot * 1.25) * 2.9, Math.sin(dot * 1.25) * 2.9, 0.9, 0.9, '#8f763e');
  }
  g.restore();
}

function ribbonwood(g: Ink, plant: Plant, scale: number, time: number, breeze: number) {
  const height = 98 + plant.variant % 3 * 12;
  g.save();
  g.scale(scale, scale);
  g.rotate(Math.sin(time * 0.85 + plant.id) * (0.014 + breeze * 0.01));
  path(g, `M-3 0Q-9 ${-height * 0.5} 1 ${-height}`, undefined, '#526547', 4.5);
  for (let tier = 0; tier < 5; tier += 1) {
    const y = -18 - tier * (height - 24) / 5;
    const leafScale = (0.92 - tier * 0.08) * (plant.variant % 2 ? 0.9 : 1);
    leaf(g, -2, y, leafScale, -0.19 - tier * 0.05, ['#83a16c', '#93ad75', '#a3b57b'][tier % 3]);
    leaf(g, -3, y - 9, leafScale, 3.43 + tier * 0.08, ['#678d62', '#739767', '#8eab73'][tier % 3]);
  }
  leaf(g, 0, -height + 5, 0.50, -0.97, '#d2cf90');
  oval(g, -3, -3, 12, 4, '#466b4525');
  g.restore();
}

export function createGardenPainter(g: Ink) {
  const seeded = random(32032);
  const flecks = Array.from({ length: 110 }, () => ({ x: seeded(), y: seeded(), r: seeded() }));
  const motes = Array.from({ length: 17 }, () => ({ x: seeded(), y: seeded(), phase: seeded() * 6.28 }));

  return (size: CanvasSize, state: GardenState, selected: BedId, time: number, stroke: InkStroke | null) => {
    const { width: w, height: h, dpr } = size;
    const unit = Math.min(w / 860, h / 510, 1.18);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#f4ecd1');
    sky.addColorStop(0.58, '#e5e6bd');
    sky.addColorStop(1, '#bcc598');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    oval(g, w * 0.74, h * 0.19, 30 * unit, 30 * unit, '#f5dc9a', '#d7c487');
    oval(g, w * 0.74, h * 0.19, 38 * unit, 38 * unit, '#ffffff00', '#ded2a3');
    path(g, `M${w * 0.36} ${h * 0.13}q${w * 0.06} ${-h * 0.035} ${w * 0.12} 0
      M${w * 0.59} ${h * 0.30}q${w * 0.1} ${-h * 0.025} ${w * 0.21} 0`,
    undefined, '#c9cf9f', 1.1);

    path(g, `M0 ${h * 0.51}Q${w * 0.21} ${h * 0.24} ${w * 0.44} ${h * 0.51}
      Q${w * 0.70} ${h * 0.30} ${w} ${h * 0.45}V${h}H0Z`, '#c5d0a3');
    path(g, `M0 ${h * 0.58}Q${w * 0.26} ${h * 0.39} ${w * 0.52} ${h * 0.57}
      Q${w * 0.81} ${h * 0.39} ${w} ${h * 0.58}V${h}H0Z`, '#a3bb8c');
    path(g, `M0 ${h * 0.68}Q${w * 0.22} ${h * 0.53} ${w * 0.55} ${h * 0.65}
      Q${w * 0.78} ${h * 0.54} ${w} ${h * 0.68}V${h}H0Z`, '#83a278');
    path(g, `M0 ${h * 0.87}Q${w * 0.2} ${h * 0.73} ${w * 0.5} ${h * 0.89}
      Q${w * 0.8} ${h * 0.77} ${w} ${h * 0.82}V${h}H0Z`, '#72946b');

    flecks.forEach((fleck, i) => {
      const x = fleck.x * w;
      const y = h * (0.61 + fleck.y * 0.4);
      if (i % 3) {
        path(g, `M${x - 2} ${y}l-2-4m2 4 2-6m-2 6 5-3`, undefined,
          i % 2 ? '#bac28b' : '#557c58', 1);
      } else {
        oval(g, x, y, 1.1 + fleck.r, 0.9, '#d3cea0');
      }
    });

    for (let i = 0; i < 7; i += 1) {
      const py = h * (0.61 + i * 0.057);
      const px = w * (0.46 + Math.sin(i * 0.8) * 0.035);
      oval(g, px, py, (15 + i * 2.5) * unit, (4 + i * 0.9) * unit, '#bec2a0', '#8a9c79', i % 2 ? -0.16 : 0.1);
      path(g, `M${px - 9 * unit} ${py - 2 * unit}l${10 * unit} ${-unit}`, undefined, '#d9d4ab', 1);
    }
    willow(g, w * 0.13, h * 0.70, unit * 1.04, time);
    willow(g, w * 0.96, h * 0.64, unit * 0.79, time + 3, true);
    greenhouse(g, w * 0.47, h * 0.64, unit * 0.90, time);
    pond(g, w * 0.72, h * 0.73, w * 0.16, h * 0.080, time * state.breeze * 0.7);

    g.save();
    g.translate(w * 0.315, h * 0.72);
    g.scale(unit * 0.75, unit * 0.75);
    path(g, 'M-15-24H13L18 0H-12Z', '#d5ad6d', '#967b50', 2);
    path(g, 'M-9-23Q-7-48 9-26M13-17L34-30L37-22L16-7', undefined, '#b0935d', 5);
    path(g, 'M-8-15H8', undefined, '#f5d68c', 1.5);
    g.restore();

    for (const bed of BEDS) {
      const x = bed.x * w;
      const y = bed.y * h;
      oval(g, x, y - h * 0.015, w * 0.111, h * 0.052, '#638559');
      if (bed.id === selected) {
        g.save();
        g.setLineDash([4, 5]);
        g.strokeStyle = '#f8dc91';
        g.lineWidth = 1.8;
        g.beginPath();
        g.ellipse(x, y - h * 0.015, w * 0.114, h * 0.057, 0, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
    }

    const plants = state.plants.map((plant) => {
      const bed = BEDS.find((item) => item.id === plant.bed)!;
      const offset = PLANT_OFFSETS[plant.slot];
      return { plant, x: (bed.x + offset.x) * w, y: (bed.y + offset.y) * h };
    }).sort((a, b) => a.y - b.y);
    for (const { plant, x, y } of plants) {
      g.save();
      g.translate(x, y);
      if (plant.kind === 'flower') starbell(g, plant, unit, time, state.breeze);
      else ribbonwood(g, plant, unit * 0.85, time, state.breeze);
      g.restore();
    }
    mushroom(g, w * 0.055, h * 0.90, unit * 0.87);
    mushroom(g, w * 0.096, h * 0.91, unit * 0.53);
    mushroom(g, w * 0.028, h * 0.93, unit * 0.39);

    g.save();
    g.translate(w * 0.615 + Math.sin(time * 0.15) * 4 * unit, h * 0.91);
    g.scale(unit * 0.70, unit * 0.70);
    path(g, 'M-18 2Q-3 10 23 3Q30 0 28-7L21-11L14-2Z', '#d3c085', '#7e8d58', 1.5);
    oval(g, 0, -8, 12, 12, '#b7986b', '#797a53');
    path(g, 'M5-9C4-19-9-17-8-7C-7 1 3-1 2-7Q1-11-3-9M23-8L26-17M20-9L19-18',
      undefined, '#776c4c', 1.5);
    g.restore();

    if (state.breeze > 0) {
      for (let i = 0; i < state.breeze + 1; i += 1) {
        const x = w * (0.49 + i * 0.12);
        const y = h * (0.36 + i * 0.075);
        const drift = Math.sin(time * 0.5 + i) * 8 * unit;
        path(g, `M${x + drift} ${y}q${w * 0.1} ${-15 * unit} ${w * 0.19} -3
          q${15 * unit} ${8 * unit} ${8 * unit} ${-5 * unit}`, undefined, '#f6efca99', 1.5);
      }
      for (const mote of motes) {
        const x = (mote.x * w + time * (8 + state.breeze * 8)) % (w + 16) - 8;
        const y = (0.28 + mote.y * 0.50) * h + Math.sin(time + mote.phase) * 7;
        oval(g, x, y, 1.6, 1.6, '#f8e4a9');
      }
    }

    const mothX = w * 0.65 + Math.sin(time * 0.35) * 15 * unit;
    const mothY = h * 0.35 + Math.cos(time * 0.5) * 8 * unit;
    for (const side of [-1, 1]) {
      oval(g, mothX + side * 4 * unit, mothY, 5 * unit, (3 + Math.sin(time * 3) * 0.6) * unit,
        '#f8efd2', '#b2af7d', side * -0.6);
    }
    line(g, [{ x: mothX, y: mothY - 2 * unit }, { x: mothX, y: mothY + 4 * unit }], '#988b5b', 1);

    BEDS.forEach((bed, index) => {
      const x = bed.x * w;
      const y = Math.min(h - 17, bed.y * h + h * 0.055);
      oval(g, x, y, 12, 12, bed.id === selected ? '#f6de9a' : '#dae0b5', '#5b7b50');
      g.fillStyle = '#355640';
      g.font = '600 14px "Trebuchet MS", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(index + 1), x, y + 0.5);
    });

    if (stroke && stroke.points.length) {
      g.save();
      g.globalAlpha = stroke.opacity;
      g.shadowColor = '#f8edb4';
      g.shadowBlur = 8;
      line(g, stroke.points, stroke.kind === 'rejected' ? '#944d65' : '#fff6ce', 3);
      const end = stroke.points[stroke.points.length - 1];
      oval(g, end.x, end.y, 4, 4, stroke.kind === 'rejected' ? '#944d65' : '#f6d889');
      g.restore();
    }
  };
}
