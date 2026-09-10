import Phaser from 'phaser';
import type { PhaserRuntime } from '../../core/phaser/stage';
import { ISLANDS } from './data';
import type { State } from './engine';

export const BOARD = { x: 340, y: 103, cell: 88 };
const font = '"Noto Sans SC","Microsoft YaHei",sans-serif';
const vector = (point: { x: number; y: number }) => new Phaser.Math.Vector2(point.x, point.y);
export function createCloudScene(scene: Phaser.Scene, runtime: PhaserRuntime, onCell: (cell: number) => void) {
  scene.cameras.main.setBackgroundColor('#f5edce');
  const paper = scene.add.graphics();
  paper.fillStyle(0xe8dbac, 0.32);
  for (let i = 0; i < 75; i++) paper.fillCircle((i * 137 + 13) % 960, (i * 79 + 17) % 640, i % 3 + 1);
  paper.fillStyle(0xfff8e3).fillCircle(109, 95, 70);
  paper.lineStyle(2, 0xd6c99a, 0.55).strokeCircle(109, 95, 81);
  const label = (x: number, y: number, value: string, size = 18, color = '#345c61') =>
    scene.add.text(x, y, value, { fontFamily: font, fontSize: `${size}px`, color, lineSpacing: 7 });
  label(57, 59, '卷卷 & 你', 22, '#5b6b53');
  label(60, 95, '小天气公司', 18, '#797b59');
  const cloudColors = [0xffffff, 0xdbf0ef, 0xb9dcf2, 0x8487b5];
  const maker = scene.make.graphics({ x: 0, y: 0 });
  for (const [index, water] of [1, 2, 4, 8].entries()) {
    const key = `cr-cloud-${water}`;
    if (scene.textures.exists(key)) continue;
    maker.clear();
    maker.fillStyle(0x5c899c, 0.15).fillRoundedRect(9, 32, 77, 47, 23);
    maker.fillStyle(cloudColors[index], 0.96).fillRoundedRect(8, 28, 77, 44, 22);
    maker.fillCircle(31, 30, 21).fillCircle(56, 26, 24).fillCircle(73, 39, 16);
    maker.fillStyle(0xffffff, 0.44).fillEllipse(38, 17, 24, 8);
    maker.lineStyle(1.4, 0x6a91a0, 0.45).strokeRoundedRect(9, 37, 74, 32, 16);
    maker.fillStyle(water === 8 ? 0xffeee1 : 0x375d73).fillCircle(33, 41, 2).fillCircle(60, 41, 2);
    maker.lineStyle(2, water === 8 ? 0xffeee1 : 0x375d73);
    if (water === 8) maker.lineBetween(43, 49, 51, 49);
    else maker.beginPath().arc(47, 43, 6, 0.15, Math.PI - 0.15).strokePath();
    maker.generateTexture(key, 96, 84);
  }
  maker.clear();
  maker.fillStyle(0x426e85, 0.12).fillEllipse(82, 127, 120, 27);
  maker.fillStyle(0x78bfcf).fillPoints([{ x: 12, y: 83 }, { x: 32, y: 21 }, { x: 74, y: 8 }, { x: 105, y: 36 }, { x: 151, y: 22 }, { x: 134, y: 58 }, { x: 160, y: 74 }, { x: 111, y: 106 }, { x: 49, y: 124 }].map(vector), true);
  maker.fillStyle(0xd6eff0).fillEllipse(76, 67, 99, 95);
  maker.fillStyle(0x376b7b).fillCircle(58, 59, 4).fillCircle(89, 56, 4);
  maker.lineStyle(3, 0x376b7b).beginPath().arc(76, 63, 14, 0.1, Math.PI - 0.1).strokePath();
  maker.fillStyle(0xeaa496, 0.8).fillEllipse(47, 72, 14, 7).fillEllipse(103, 68, 14, 7);
  maker.lineStyle(3, 0xf6dc87).lineBetween(110, 27, 141, 8).lineBetween(123, 24, 137, 34);
  maker.generateTexture('cr-wind', 170, 146);
  maker.destroy();
  const spirit = scene.add.sprite(145, 238, 'cr-wind').setScale(1.18);
  label(65, 329, '风灵 · 卷卷', 22);
  const mood = label(52, 366, '细心 / 保苗优先', 18, '#6b7769');
  const saying = label(52, 416, '“好天气，\n也要认真合伙。”', 21, '#6b7769');
  label(757, 134, '云的水量', 18, '#687967');
  [1, 2, 4, 8].forEach((water, i) => {
    scene.add.sprite(782, 197 + i * 75, `cr-cloud-${water}`).setScale(0.63);
    label(830, 180 + i * 75, `${water} 水`, 18);
    label(830, 205 + i * 75, water === 1 ? '先合并' : water === 8 ? '需修剪' : `${water / 2} 剂雨`, 18, '#74826e');
  });
  const island = scene.add.graphics();
  const terrain = scene.add.graphics();
  const gardenArt = scene.add.graphics();
  const selected = scene.add.graphics();
  const islandTitle = label(340, 37, '', 26);
  const seedLabel = label(341, 78, '顶排苗床 · 点空格后播种', 18, '#7b876c');
  const clouds: Phaser.GameObjects.Sprite[] = [];
  const numbers: Phaser.GameObjects.Text[] = [];
  const gardenLabels = Array.from({ length: 4 }, (_, col) => label(BOARD.x + col * BOARD.cell + 44, 576, '', 20).setOrigin(0.5, 0));
  const position = (cell: number) => ({
    x: BOARD.x + (cell % 4) * BOARD.cell + 44,
    y: BOARD.y + Math.floor(cell / 4) * BOARD.cell + 44,
  });
  for (let cell = 0; cell < 16; cell++) {
    const { x, y } = position(cell);
    clouds.push(scene.add.sprite(x, y - 3, 'cr-cloud-1').setVisible(false));
    numbers.push(label(x, y + 12, '', 20, '#345c61').setOrigin(0.5));
    scene.add.zone(x, y, 84, 84).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (runtime.canInteract()) onCell(cell);
    });
  }
  const drops = Array.from({ length: 20 }, () => scene.add.ellipse(0, 0, 5, 13, 0x4c9cc6).setVisible(false));
  const bolts = Array.from({ length: 4 }, () => {
    const bolt = scene.add.graphics().fillStyle(0xffdc73);
    bolt.fillPoints([{ x: 5, y: -42 }, { x: -14, y: -2 }, { x: 1, y: -5 }, { x: -7, y: 31 }, { x: 25, y: -13 }, { x: 9, y: -10 }].map(vector), true);
    return bolt.setVisible(false);
  });
  const status = label(340, 615, '先订风，再开工。每三步商量一次。', 18, '#607b74');
  let current: State | undefined;
  function select(cell: number) {
    selected.clear();
    const { x, y } = position(cell);
    selected.lineStyle(3, 0xb77649).strokeRoundedRect(x - 41, y - 41, 82, 82, 17);
  }
  function calm() {
    scene.tweens.killAll();
    spirit.setScale(1.18).setAngle(0);
    clouds.forEach((cloud, cell) => {
      const { x, y } = position(cell);
      cloud.setPosition(x, y - 3).setScale(1).setAlpha(1);
    });
    drops.forEach(drop => drop.setVisible(false));
    bolts.forEach(bolt => bolt.setVisible(false));
  }
  function draw(s: State) {
    if (current === s) return;
    calm();
    const previous = current; current = s;
    const level = ISLANDS[s.island];
    islandTitle.setText(`${String(s.island + 1).padStart(2, '0')} / ${level.name}`);
    mood.setText(`${s.mood} / ${s.phase === 'wind' ? '该商量啦' : '今天也照顾每朵云'}`);
    saying.setText(s.phase === 'festival' ? '“百花给我们\n开了张好评！”' : s.phase === 'lost' ? '“没关系，\n再折一阵风吧。”' : '“好天气，\n也要认真合伙。”');
    status.setText(s.phase === 'play' ? `三步小班次 ${s.held} / 3  ·  余 ${s.moves} 步` : s.phase === 'opening' ? '等待真实模型订开工风 · 不扣步' : s.phase === 'wind' ? '三步到站 · 选择目标后请风灵行动' : s.reason);
    seedLabel.setText(s.phase === 'play' ? `顶排苗床 · 播种金 ${s.coins}` : '顶排苗床 · 固定水量，不随机补云');
    island.clear();
    const offsets = [0, 12, -7, 17, -12], offset = offsets[s.island];
    island.fillStyle(0x9b7355).fillPoints([{ x: 303, y: 435 }, { x: 733, y: 435 }, { x: 685 + offset, y: 524 }, { x: 588, y: 555 + offset }, { x: 451, y: 543 }, { x: 354, y: 516 }].map(vector), true);
    island.fillStyle(0xc29169).fillPoints([{ x: 321, y: 453 }, { x: 722, y: 453 }, { x: 682, y: 494 }, { x: 418, y: 521 }].map(vector), true);
    island.fillStyle(level.color).fillRoundedRect(314, 438, 407, 35, 17);
    terrain.clear();
    terrain.fillStyle(0xe5dfbf).fillRoundedRect(330, 96, 372, 366, 22);
    for (let cell = 0; cell < 16; cell++) {
      const { x, y } = position(cell), rock = level.rocks.includes(cell), storm = level.storms.includes(cell);
      terrain.fillStyle(rock ? 0xb9b39c : storm ? 0xe0ced7 : cell < 4 ? 0xe5edcf : 0xfaf6e5);
      terrain.fillRoundedRect(x - 40, y - 40, 80, 80, 15);
      terrain.lineStyle(1, 0xd0c8a6).strokeRoundedRect(x - 40, y - 40, 80, 80, 15);
      if (rock) {
        terrain.fillStyle(0x898d87).fillPoints([{ x: x - 26, y: y + 19 }, { x: x - 32, y }, { x: x - 14, y: y - 23 }, { x: x + 16, y: y - 28 }, { x: x + 29, y: y + 4 }, { x: x + 23, y: y + 24 }].map(vector), true);
        terrain.lineStyle(2, 0xd5d5c2).lineBetween(x - 13, y - 18, x + 4, y - 8).lineBetween(x + 4, y - 8, x, y + 14);
      }
      if (storm) {
        terrain.fillStyle(0xb685a5, 0.8).fillPoints([{ x: x + 15, y: y - 30 }, { x: x + 1, y: y - 10 }, { x: x + 12, y: y - 10 }, { x: x + 3, y: y + 10 }, { x: x + 29, y: y - 15 }, { x: x + 18, y: y - 15 }].map(vector), true);
      }
      clouds[cell].setVisible(s.board[cell] > 0).setTexture(`cr-cloud-${s.board[cell] || 1}`);
      numbers[cell].setText(s.board[cell] ? String(s.board[cell]) : '').setColor(s.board[cell] === 8 ? '#fff7e6' : '#345c61');
      if (!runtime.reducedMotion && previous && previous.board[cell] !== s.board[cell] && s.board[cell]) {
        clouds[cell].setScale(1.1, 0.78);
        scene.tweens.add({ targets: clouds[cell], scaleX: 1, scaleY: 1, duration: 260, ease: 'Back.Out' });
      }
    }
    gardenArt.clear();
    gardenLabels.forEach(text => text.setText(''));
    level.gardens.forEach((garden, index) => {
      const x = BOARD.x + garden.column * BOARD.cell + 44, delivered = s.delivered[index];
      gardenArt.fillStyle(0x85b6a0).fillRoundedRect(x - 26, 447, 52, 10, 5);
      gardenArt.fillStyle(0xf7f0d8).fillRoundedRect(x - 35, 542, 70, 15, 6);
      gardenArt.fillStyle(0xc68864).fillPoints([{ x: x - 27, y: 552 }, { x: x + 27, y: 552 }, { x: x + 20, y: 571 }, { x: x - 20, y: 571 }].map(vector), true);
      for (let stem = -1; stem <= 1; stem++) {
        const sx = x + stem * 17, top = 538 - delivered * 11 - Math.abs(stem) * 3;
        gardenArt.lineStyle(3, 0x568762).lineBetween(sx, 546, sx, top);
        gardenArt.fillStyle(delivered ? 0x78a267 : 0xa3b881).fillEllipse(sx - 7, top + 12, 19, 8).fillEllipse(sx + 7, top + 6, 18, 8);
        if (delivered === garden.need) {
          gardenArt.fillStyle(s.island % 2 ? 0xe3a291 : 0xf1d47e).fillCircle(sx, top, 9);
          gardenArt.fillStyle(0xfff3bf).fillCircle(sx, top, 4);
        }
      }
      gardenLabels[garden.column].setText(`${garden.name} ${delivered}/${garden.need}`);
    });
    if (!runtime.reducedMotion && previous) {
      s.effects.filter(effect => effect.kind === 'storm').slice(0, 4).forEach((effect, i) => {
        const { x, y } = position(effect.cell), bolt = bolts[i];
        bolt.setPosition(x, y).setVisible(true).setAlpha(1);
        scene.tweens.add({ targets: bolt, alpha: 0, duration: 350, onComplete: () => { bolt.setVisible(false); } });
      });
      const gust = s.effects.find(effect => effect.kind === 'gust');
      if (gust && gust.from !== undefined && s.board[gust.cell]) {
        const from = position(gust.from), to = position(gust.cell);
        clouds[gust.cell].setPosition(from.x, from.y - 3);
        scene.tweens.add({ targets: clouds[gust.cell], x: to.x, y: to.y - 3, duration: 280, ease: 'Sine.Out' });
      }
      const rains = s.effects.filter(effect => effect.kind === 'rain');
      rains.forEach((rain, i) => {
        const { x } = position(rain.cell);
        for (let j = 0; j < 5; j++) {
          const drop = drops[i * 5 + j];
          drop.setPosition(x - 20 + j * 10, 455 - j * 9).setVisible(true).setAlpha(0.8);
          scene.tweens.add({ targets: drop, y: 540, alpha: 0, duration: 430 + j * 35, onComplete: () => { drop.setVisible(false); } });
        }
      });
      if (s.turn !== previous.turn) scene.tweens.add({ targets: spirit, angle: 7, duration: 150, yoyo: true });
    }
  }
  return { draw, select, motionChanged: calm, destroy: calm };
}
export type CloudView = ReturnType<typeof createCloudScene>;
