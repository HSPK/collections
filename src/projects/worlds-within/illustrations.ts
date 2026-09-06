import { worlds } from './data';
import type { WorldId } from './data';
import { baseScale, WORLD } from './engine';
import type { Camera, Viewport } from './engine';

type Ink = CanvasRenderingContext2D;

function polygon(ink: Ink, points: [number, number][], color: string): void {
  ink.fillStyle = color;
  ink.beginPath();
  points.forEach(([x, y], index) => index ? ink.lineTo(x, y) : ink.moveTo(x, y));
  ink.closePath();
  ink.fill();
}

function round(ink: Ink, x: number, y: number, width: number, height: number, radius: number, color: string): void {
  ink.fillStyle = color;
  ink.beginPath();
  ink.roundRect(x, y, width, height, radius);
  ink.fill();
}

function ellipse(ink: Ink, x: number, y: number, rx: number, ry: number, color: string): void {
  ink.fillStyle = color;
  ink.beginPath();
  ink.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ink.fill();
}

function line(ink: Ink, points: [number, number][], color: string, width = 3): void {
  ink.strokeStyle = color;
  ink.lineWidth = width;
  ink.beginPath();
  points.forEach(([x, y], index) => index ? ink.lineTo(x, y) : ink.moveTo(x, y));
  ink.stroke();
}

function block(
  ink: Ink, x: number, y: number, width: number, height: number, depth: number,
  face: string, side: string, top: string,
): void {
  polygon(ink, [[x, y], [x + depth, y - depth * 0.55], [x + width + depth, y - depth * 0.55], [x + width, y]], top);
  polygon(ink, [[x + width, y], [x + width + depth, y - depth * 0.55], [x + width + depth, y + height - depth * 0.55], [x + width, y + height]], side);
  ink.fillStyle = face;
  ink.fillRect(x, y, width, height);
}

function plant(ink: Ink, x: number, y: number, size = 1): void {
  ink.save();
  ink.translate(x, y);
  ink.scale(size, size);
  polygon(ink, [[-24, 0], [24, 0], [17, 39], [-17, 39]], '#ce7056');
  line(ink, [[0, 2], [0, -74]], '#386b69', 4);
  for (let i = 0; i < 4; i += 1) {
    ellipse(ink, i % 2 ? 14 : -14, -15 - i * 17, 20, 8, i % 2 ? '#527e6f' : '#37696a');
  }
  ink.restore();
}

function desk(ink: Ink): void {
  ink.fillStyle = '#f0e3c9';
  ink.fillRect(0, 0, 1000, 700);
  round(ink, 64, 88, 879, 553, 29, '#a66653');
  round(ink, 48, 57, 880, 555, 25, '#e5b47e');
  line(ink, [[73, 589], [898, 589]], '#d19b65', 2);
  for (const x of [328, 607]) line(ink, [[x, 60], [x, 610]], '#d6a46e', 2);
  for (let i = 0; i < 8; i += 1) {
    line(ink, [[95 + i * 96, 96], [126 + i * 96, 96]], '#edc396', 2);
    line(ink, [[140 + i * 92, 544], [177 + i * 92, 544]], '#cf9d68', 2);
  }
  ink.save();
  ink.translate(152, 343);
  ink.rotate(-0.12);
  block(ink, 0, 0, 229, 161, 13, '#2f587c', '#244367', '#486d8f');
  round(ink, 14, 6, 201, 143, 3, '#f5ecd9');
  ink.fillStyle = '#ddd4c0';
  ink.fillRect(109, 7, 3, 141);
  for (let i = 0; i < 6; i += 1) {
    line(ink, [[27, 32 + i * 16], [94 - i % 2 * 11, 32 + i * 16]], '#b9c3c7', 2);
  }
  polygon(ink, [[139, 87], [162, 52], [195, 103]], '#d99e76');
  ellipse(ink, 172, 44, 10, 10, '#e0b645');
  ink.restore();
  ellipse(ink, 217, 227, 77, 23, '#c69a6e');
  round(ink, 146, 159, 100, 66, 19, '#345879');
  ellipse(ink, 239, 179, 24, 28, '#345879');
  ellipse(ink, 241, 179, 13, 17, '#e5b47e');
  ellipse(ink, 196, 161, 49, 33, '#6e9bb2');
  ellipse(ink, 196, 160, 37, 23, '#f1d098');
  ellipse(ink, 196, 160, 31, 18, '#9b6b45');
  ellipse(ink, 186, 154, 12, 5, '#bb8356');
  ink.save();
  ink.translate(396, 330);
  ink.rotate(0.21);
  round(ink, -7, -152, 14, 230, 3, '#e0714e');
  ink.fillStyle = '#f0b16f';
  ink.fillRect(-7, -147, 4, 225);
  polygon(ink, [[-7, 78], [7, 78], [0, 101]], '#f5dec0');
  polygon(ink, [[-2.5, 94], [2.5, 94], [0, 102]], '#374f5d');
  ink.restore();
  ellipse(ink, 811, 502, 65, 22, '#bb875f');
  ellipse(ink, 804, 487, 56, 20, '#c85449');
  line(ink, [[804, 483], [806, 287], [853, 204]], '#365775', 13);
  ellipse(ink, 806, 287, 13, 13, '#e47f62');
  polygon(ink, [[787, 158], [847, 145], [883, 212], [775, 230]], '#dc6b54');
  ellipse(ink, 829, 223, 55, 13, '#f5d69a');
  line(ink, [[783, 170], [793, 202]], '#ef9980', 4);
  ink.fillStyle = '#b77956';
  ink.font = '13px monospace';
  ink.fillText('A NOTE FROM SOMEWHERE SMALL', 464, 438);
  round(ink, 667, 466, 54, 69, 3, '#efdec1');
  ink.strokeStyle = '#c37458';
  ink.lineWidth = 2;
  ink.strokeRect(674, 473, 40, 40);
  polygon(ink, [[680, 504], [693, 482], [708, 504]], '#518583');
}

function city(ink: Ink): void {
  ink.fillStyle = '#bee0d8';
  ink.fillRect(0, 0, 1000, 700);
  polygon(ink, [[0, 295], [532, 42], [1000, 298], [1000, 700], [0, 700]], '#f0d9b5');
  polygon(ink, [[0, 535], [478, 300], [1000, 570], [1000, 689], [478, 421], [0, 655]], '#629eb9');
  polygon(ink, [[0, 529], [478, 294], [1000, 564], [1000, 578], [478, 309], [0, 544]], '#fff0cc');
  polygon(ink, [[0, 650], [478, 416], [1000, 684], [1000, 698], [478, 431], [0, 664]], '#d1b996');
  line(ink, [[43, 563], [445, 366]], '#90c4d0', 3);
  line(ink, [[533, 400], [925, 601]], '#87bbce', 3);
  block(ink, 116, 233, 143, 172, 49, '#e2a85b', '#c88452', '#f0c67a');
  block(ink, 312, 128, 128, 178, 49, '#63898e', '#426a7d', '#8ab3ad');
  block(ink, 796, 176, 99, 159, 37, '#e6b860', '#bd9751', '#f1d281');
  for (const [x, y] of [[140, 268], [198, 268], [140, 333], [198, 333], [336, 164], [390, 164], [337, 231], [390, 231], [818, 209], [860, 209]]) {
    ink.fillStyle = '#f7e7c4';
    ink.fillRect(x, y, 21, 35);
    ink.fillStyle = '#405e72';
    ink.fillRect(x + 4, y + 4, 13, 26);
  }
  block(ink, 552, 224, 244, 289, 57, '#d98b80', '#aa5f64', '#eab3a0');
  block(ink, 578, 186, 166, 39, 39, '#cd786e', '#aa5f64', '#f4c4a6');
  round(ink, 642, 438, 55, 75, 27, '#895d6a');
  line(ink, [[553, 429], [795, 429]], '#f1bba1', 9);
  for (const x of [563, 782]) {
    ink.fillStyle = '#eeb3a0';
    ink.fillRect(x, 242, 7, 175);
  }
  polygon(ink, [[362, 492], [465, 442], [541, 480], [436, 532]], '#f4e6c8');
  for (let i = 0; i < 6; i += 1) {
    line(ink, [[373 + i * 17, 491 - i * 8], [439 + i * 17, 524 - i * 8]], '#bb9f80', 3);
  }
  line(ink, [[363, 490], [363, 466], [466, 416], [466, 442]], '#62796f', 4);
  line(ink, [[380, 480], [380, 458]], '#62796f', 3);
  line(ink, [[418, 461], [418, 441]], '#62796f', 3);
  plant(ink, 487, 237, 0.62);
  plant(ink, 85, 415, 0.85);
  plant(ink, 852, 406, 0.9);
  ellipse(ink, 260, 500, 34, 12, '#f5e7c9');
  polygon(ink, [[233, 496], [286, 496], [274, 510], [245, 510]], '#bc6558');
  line(ink, [[258, 494], [258, 464]], '#3c5d70', 3);
  polygon(ink, [[261, 465], [261, 491], [279, 491]], '#f9efda');
  ellipse(ink, 615, 582, 14, 14, '#496676');
  ellipse(ink, 665, 582, 14, 14, '#496676');
  line(ink, [[615, 582], [638, 552], [665, 582], [633, 582], [620, 551]], '#d77859', 5);
  line(ink, [[635, 552], [649, 552]], '#496676', 4);
  ink.fillStyle = '#457b85';
  ink.font = '16px monospace';
  ink.fillText('THE FOLD CANAL', 696, 655);
}

function room(ink: Ink): void {
  ink.fillStyle = '#eadbe7';
  ink.fillRect(0, 0, 1000, 700);
  polygon(ink, [[0, 413], [631, 370], [1000, 503], [1000, 700], [0, 700]], '#dcb38e');
  line(ink, [[0, 415], [631, 372], [1000, 505]], '#a98380', 6);
  for (let i = 0; i < 7; i += 1) {
    line(ink, [[i * 142 - 160, 700], [i * 100 + 94, 409 - i * 6]], '#ca9e81', 2);
  }
  round(ink, 90, 80, 234, 255, 100, '#748aaf');
  round(ink, 105, 95, 203, 224, 91, '#b4d4dd');
  ellipse(ink, 253, 166, 34, 34, '#f5d188');
  polygon(ink, [[108, 272], [184, 223], [241, 273], [308, 247], [308, 319], [107, 319]], '#80acb1');
  line(ink, [[206, 91], [206, 325]], '#748aaf', 8);
  line(ink, [[101, 226], [311, 226]], '#748aaf', 7);
  block(ink, 768, 94, 151, 344, 27, '#b88676', '#96766f', '#d0a893');
  for (let shelf = 0; shelf < 4; shelf += 1) {
    ink.fillStyle = '#956e6a';
    ink.fillRect(780, 119 + shelf * 73, 125, 52);
    const colors = ['#527c8b', '#e5b665', '#d18e7b', '#91a38b', '#e6d6b6'];
    for (let book = 0; book < 6; book += 1) {
      const h = 30 + (book * 7 + shelf * 3) % 22;
      ink.fillStyle = colors[(book + shelf) % colors.length];
      ink.fillRect(785 + book * 19, 171 + shelf * 73 - h, 13, h);
    }
  }
  ellipse(ink, 486, 566, 261, 88, '#edddbe');
  ink.strokeStyle = '#64879c';
  ink.lineWidth = 3;
  ink.beginPath();
  ink.ellipse(486, 566, 230, 64, 0, 0, Math.PI * 2);
  ink.stroke();
  round(ink, 114, 389, 168, 134, 34, '#b96061');
  round(ink, 133, 348, 130, 147, 44, '#d47f7b');
  round(ink, 120, 475, 165, 43, 15, '#e1a093');
  round(ink, 98, 426, 34, 96, 15, '#c27470');
  round(ink, 262, 426, 33, 94, 15, '#bd6d6c');
  line(ink, [[123, 519], [117, 550]], '#5d6474', 9);
  line(ink, [[271, 519], [276, 550]], '#5d6474', 9);
  round(ink, 157, 383, 78, 70, 16, '#ecbd95');
  line(ink, [[358, 501], [348, 611]], '#5a6990', 14);
  line(ink, [[724, 497], [744, 600]], '#5a6990', 14);
  polygon(ink, [[325, 349], [696, 332], [768, 525], [386, 573]], '#6c7e9e');
  polygon(ink, [[325, 349], [696, 332], [762, 511], [386, 556]], '#a0b0ba');
  polygon(ink, [[320, 374], [414, 354], [414, 540], [328, 517]], '#f5e8c9');
  line(ink, [[334, 402], [394, 390]], '#bcb5b0', 2);
  line(ink, [[334, 420], [393, 408]], '#bcb5b0', 2);
  line(ink, [[334, 438], [395, 426]], '#bcb5b0', 2);
  polygon(ink, [[400, 542], [417, 540], [426, 588], [414, 579], [405, 591]], '#ca665d');
  plant(ink, 74, 527, 1.02);
  round(ink, 434, 101, 174, 136, 3, '#687792');
  round(ink, 444, 111, 154, 116, 1, '#f1dfbb');
  ellipse(ink, 507, 157, 25, 25, '#d08573');
  polygon(ink, [[452, 214], [523, 155], [587, 214]], '#618587');
  ellipse(ink, 703, 196, 28, 28, '#dcb174');
  line(ink, [[703, 196], [703, 180]], '#6b6580', 3);
  line(ink, [[703, 196], [716, 202]], '#6b6580', 3);
}

function sea(ink: Ink): void {
  ink.fillStyle = '#97c7dc';
  ink.fillRect(0, 0, 1000, 700);
  for (let row = 0; row < 10; row += 1) {
    const points: [number, number][] = [];
    for (let col = 0; col < 21; col += 1) points.push([col * 50, 54 + row * 67 + Math.sin(col * 0.74 + row) * 12]);
    line(ink, points, row % 2 ? '#85b5cf' : '#acd5e0', 2);
  }
  ellipse(ink, 630, 486, 267, 120, '#6897ad');
  ellipse(ink, 627, 458, 267, 120, '#f2d6a3');
  ellipse(ink, 628, 428, 240, 99, '#a7b993');
  polygon(ink, [[455, 464], [562, 392], [589, 397], [486, 479]], '#ead3b0');
  ellipse(ink, 237, 320, 106, 54, '#f0d6a7');
  ellipse(ink, 222, 309, 81, 35, '#a9b592');
  polygon(ink, [[201, 312], [247, 312], [237, 156], [212, 156]], '#f6e6c6');
  polygon(ink, [[207, 220], [240, 220], [243, 256], [204, 256]], '#cc6a5e');
  round(ink, 203, 146, 42, 31, 2, '#506f8c');
  polygon(ink, [[196, 146], [225, 112], [254, 146]], '#ce6a58');
  round(ink, 218, 150, 13, 20, 1, '#f5d887');
  block(ink, 533, 269, 259, 204, 40, '#f0ceb0', '#cb927c', '#f4dfbd');
  polygon(ink, [[505, 268], [664, 182], [811, 268]], '#cb6b58');
  polygon(ink, [[664, 182], [702, 160], [851, 246], [811, 268]], '#ab5960');
  line(ink, [[563, 451], [763, 451]], '#b07765', 7);
  plant(ink, 500, 460, 0.9);
  plant(ink, 826, 448, 0.85);
  ellipse(ink, 843, 104, 45, 45, '#f5daa0');
  round(ink, 340, 99, 96, 20, 10, '#d5e7e1');
  round(ink, 377, 81, 49, 32, 16, '#d5e7e1');
  ellipse(ink, 295, 579, 74, 17, '#76a8c2');
  polygon(ink, [[224, 560], [355, 560], [327, 584], [251, 584]], '#42667c');
  line(ink, [[284, 558], [284, 467]], '#496980', 4);
  polygon(ink, [[293, 476], [345, 547], [293, 547]], '#f2e0bc');
  polygon(ink, [[277, 491], [277, 547], [239, 547]], '#df8d6d');
  ink.fillStyle = '#457891';
  ink.font = '18px monospace';
  ink.fillText('THE MARGIN SEA', 48, 80);
  line(ink, [[48, 95], [202, 95]], '#679db6', 2);
}

const painters: Record<WorldId, (ink: Ink) => void> = { desk, city, room, sea };

function paintWorld(ink: Ink, index: number, levels: number, pixels: number): void {
  const world = worlds[index % worlds.length];
  painters[world.id](ink);
  const portal = world.portal;
  round(ink, portal.x - 11, portal.y - 11, portal.width + 22, portal.height + 22, 4, world.frame);
  round(ink, portal.x - 5, portal.y - 5, portal.width + 10, portal.height + 10, 1, '#f9ead0');
  ink.save();
  ink.beginPath();
  ink.rect(portal.x, portal.y, portal.width, portal.height);
  ink.clip();
  ink.translate(portal.x, portal.y);
  ink.scale(portal.width / WORLD.width, portal.width / WORLD.width);
  if (levels > 0 && pixels * portal.width / WORLD.width > 8) {
    paintWorld(ink, index + 1, levels - 1, pixels * portal.width / WORLD.width);
  } else {
    ink.fillStyle = worlds[(index + 1) % worlds.length].color;
    ink.fillRect(0, 0, WORLD.width, WORLD.height);
  }
  ink.restore();
}

export function drawAtlas(ink: Ink, viewport: Viewport, camera: Camera, depth: number): void {
  const world = worlds[depth % worlds.length];
  ink.save();
  ink.fillStyle = world.color;
  ink.fillRect(0, 0, viewport.width, viewport.height);
  const scale = baseScale(viewport) * camera.zoom;
  ink.translate(viewport.width / 2 - camera.x * scale, viewport.height / 2 - camera.y * scale);
  ink.scale(scale, scale);
  ink.save();
  ink.beginPath();
  ink.rect(0, 0, WORLD.width, WORLD.height);
  ink.clip();
  paintWorld(ink, depth, 6, WORLD.width * scale);
  ink.restore();
  ink.restore();
}
