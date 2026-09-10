import type Phaser from 'phaser';
import type { PhaserRuntime, PhaserView } from '../../core/phaser/stage';
import { adjacent, exitOpen, forecast } from './engine';
import type { State } from './engine';
import { COLS, ROOMS, xy } from './data';

const C = { ink: 0x213e3b, teal: 0x35756d, red: 0xb94734, paper: 0xfff1d1, cream: 0xe8d8b6, gold: 0xe3ac4e };
export const cellPoint = (cell: number) => { const p = xy(cell); return { x: 130 + p.x * 102, y: 118 + p.y * 98 }; };
const font = '"Noto Sans SC", "Microsoft YaHei", sans-serif';
export interface MuseumView extends PhaserView {
  draw(state: State, swap: boolean): void;
  feedback(cell: number, accepted: boolean): void;
}
function textures(scene: Phaser.Scene) {
  const g = scene.make.graphics({ x: 0, y: 0 });
  const save = (name: string, width: number, height: number) => { g.generateTexture(`cs-${name}`, width, height); g.clear(); };
  g.fillStyle(0xb4a183).fillRoundedRect(0, 9, 96, 87, 8);
  g.fillStyle(C.paper).fillRoundedRect(0, 0, 96, 84, 7);
  g.lineStyle(2, 0xd4be94).strokeRoundedRect(3, 3, 90, 77, 6);
  g.lineStyle(1, 0xe8d6b2).lineBetween(14, 15, 38, 15).lineBetween(67, 67, 84, 67);
  save('tile', 96, 96);
  const cat = (paper: boolean) => {
    g.fillStyle(paper ? 0xbeb298 : 0x473e30, .2).fillEllipse(52, 101, 76, 16);
    g.lineStyle(13, paper ? C.red : C.paper).beginPath().arc(80, 70, 15, -1.7, 1.7).strokePath();
    g.fillStyle(paper ? 0xe8a17b : C.paper).fillEllipse(46, 69, 76, 67);
    g.fillTriangle(14, 39, 17, 7, 38, 31).fillTriangle(57, 29, 79, 7, 82, 44);
    g.fillRoundedRect(11, 29, 75, 43, 17);
    g.fillStyle(C.red).fillTriangle(19, 30, 21, 17, 30, 30).fillTriangle(65, 28, 75, 17, 76, 34);
    g.fillStyle(C.ink).fillEllipse(33, 48, 5, 10).fillEllipse(65, 48, 5, 10).fillTriangle(45, 54, 52, 54, 49, 60);
    g.lineStyle(2, C.ink).lineBetween(25, 57, 8, 54).lineBetween(70, 57, 88, 54);
    g.fillStyle(paper ? C.teal : C.red).fillRoundedRect(20, 68, 56, 10, 4).fillTriangle(55, 74, 71, 76, 65, 95);
    g.fillStyle(paper ? 0xe8a17b : C.paper).fillEllipse(26, 97, 27, 14).fillEllipse(67, 97, 27, 14);
    if (paper) { g.lineStyle(2, C.red).strokeRect(5, 4, 85, 102); g.fillStyle(C.ink).fillRect(40, 105, 16, 6); }
  };
  cat(false); save('cat', 104, 114);
  cat(true); save('decoy', 104, 114);
  g.fillStyle(0x534834, .2).fillEllipse(51, 117, 82, 15);
  g.fillStyle(C.ink).fillRect(15, 100, 73, 17);
  g.fillStyle(C.teal).fillRect(24, 75, 54, 27).fillEllipse(51, 72, 72, 31);
  g.fillStyle(0x72a194).fillRoundedRect(27, 14, 46, 61, 18);
  g.fillStyle(C.gold).fillEllipse(72, 48, 42, 26);
  g.fillStyle(C.ink).fillCircle(57, 34, 3);
  g.lineStyle(5, C.ink).lineBetween(36, 16, 69, 16);
  g.fillStyle(C.paper).fillRect(30, 105, 40, 6);
  save('bust', 104, 128);
  g.fillStyle(C.teal).fillCircle(33, 31, 28);
  g.fillStyle(C.paper).fillCircle(44, 23, 25);
  g.fillStyle(C.teal).fillTriangle(27, 48, 52, 60, 48, 40);
  g.fillStyle(C.gold).fillCircle(15, 29, 4);
  save('fish', 66, 66);
  g.fillStyle(C.gold).fillRoundedRect(4, 4, 80, 84, 12);
  g.fillStyle(C.ink).fillRoundedRect(12, 12, 64, 78, 10);
  g.fillStyle(C.teal).fillRoundedRect(18, 17, 52, 66, 8);
  g.lineStyle(5, C.paper).lineBetween(30, 48, 59, 48).lineBetween(48, 38, 59, 48).lineBetween(48, 58, 59, 48);
  g.fillStyle(C.paper).fillRect(2, 84, 84, 10);
  save('door', 88, 96);
  g.fillStyle(0x163430).fillEllipse(40, 89, 67, 12);
  g.fillStyle(C.red).fillRoundedRect(17, 42, 49, 39, 14);
  g.fillStyle(C.paper).fillCircle(41, 32, 22);
  g.fillStyle(C.ink).fillRoundedRect(16, 4, 51, 21, 5).fillRect(11, 22, 60, 8).fillRect(19, 74, 17, 18).fillRect(49, 74, 17, 18);
  g.fillStyle(C.gold).fillCircle(42, 15, 5).fillCircle(69, 62, 12);
  g.fillStyle(C.ink).fillCircle(34, 36, 2).fillCircle(51, 36, 2);
  g.lineStyle(2, C.ink).lineBetween(35, 45, 51, 45);
  save('guard', 84, 98);
  g.fillStyle(C.gold).fillTriangle(6, 0, 12, 12, 0, 12);
  save('confetti', 12, 12);
  g.destroy();
}

export function createMuseumScene(
  scene: Phaser.Scene, runtime: PhaserRuntime, click: (cell: number) => void,
): MuseumView {
  textures(scene);
  const background = scene.add.graphics().setDepth(-10);
  const details = scene.add.graphics().setDepth(1);
  const light = scene.add.graphics().setDepth(2);
  const focus = scene.add.graphics().setDepth(20);
  const rail = scene.add.graphics().setDepth(1);
  const labels = Array.from({ length: 7 }, (_, i) => scene.add.text(130 + i * 102, 110,
    ['一', '二', '三', '四', '五', '六', '七'][i]!, { fontFamily: font, fontSize: '16px', color: '#6e5f48' }).setOrigin(.5));
  const tiles = Array.from({ length: 35 }, (_, cell) => {
    const p = cellPoint(cell);
    return scene.add.sprite(p.x, p.y + 4, 'cs-tile').setDepth(0);
  });
  const zones = Array.from({ length: 35 }, (_, cell) => {
    const p = cellPoint(cell);
    const zone = scene.add.zone(p.x, p.y, 98, 94).setDepth(30).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => { if (runtime.canInteract()) click(cell); });
    zone.on('pointerover', () => { hover = cell; paintFocus(); });
    zone.on('pointerout', () => { if (hover === cell) { hover = -1; paintFocus(); } });
    return zone;
  });
  const pickup = scene.add.sprite(0, 0, 'cs-fish').setDepth(6);
  const door = scene.add.sprite(0, 0, 'cs-door').setDepth(4).setScale(.87);
  const props = [scene.add.sprite(0, 0, 'cs-bust'), scene.add.sprite(0, 0, 'cs-decoy')];
  const cat = scene.add.sprite(0, 0, 'cs-cat').setDepth(12).setScale(.9);
  const guard = scene.add.sprite(436, 57, 'cs-guard').setDepth(9).setScale(.77);
  const emote = scene.add.text(0, 0, '', { fontFamily: font, fontSize: '23px', color: '#fff1d1',
    backgroundColor: '#b94734', padding: { x: 9, y: 5 } }).setOrigin(.5).setDepth(22).setAlpha(0);
  const headline = scene.add.text(35, 29, '闭馆以后，猫说了算。', { fontFamily: font, fontSize: '24px', color: '#fff1d1' }).setDepth(15);
  const caption = scene.add.text(480, 563, '', { fontFamily: font, fontSize: '22px', color: '#213e3b', align: 'center' }).setOrigin(.5).setDepth(10);
  const subcaption = scene.add.text(480, 601, '猫走一步，灯扫一次。没有倒计时，慢慢想。', {
    fontFamily: font, fontSize: '18px', color: '#675c49',
  }).setOrigin(.5).setDepth(10);
  const particles = Array.from({ length: 12 }, () => scene.add.sprite(0, 0, 'cs-confetti').setDepth(25).setVisible(false));
  let current: State | undefined, previous: State | undefined, swapMode = false, hover = -1;
  let lastRoom = -1, lastSeed = -1;
  function paintBackground(state: State) {
    background.clear().fillStyle(0xe6d6b4).fillRect(0, 0, 960, 640);
    background.fillStyle(C.teal).fillRect(0, 0, 960, 87);
    background.fillStyle(C.red).fillRect(0, 80, 960, 8);
    background.fillStyle(0xc2ac88).fillRoundedRect(63, 156, 788, 370, 26);
    background.fillStyle(0xd5c19d).fillRoundedRect(60, 148, 788, 369, 22);
    background.lineStyle(2, 0xc2ab86).strokeRoundedRect(68, 155, 772, 350, 18);
    background.fillStyle(C.paper).fillCircle(880, 40, 26);
    background.fillStyle(C.teal).fillCircle(892, 29, 24);
    let noise = state.seed >>> 0;
    for (let i = 0; i < 160; i++) {
      noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
      const x = noise % 960;
      noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
      const y = 95 + noise % 540;
      background.lineStyle(1, C.ink, .06).lineBetween(x, y, x + 3, y + 1);
    }
    for (let i = 0; i < 35; i++) {
      const p = cellPoint(i), active = ROOMS[state.room]!.floors.includes(i);
      tiles[i]!.setVisible(active);
      zones[i]!.input!.enabled = active;
      if (!active && i >= COLS && i < COLS * 4) {
        background.lineStyle(1, 0xb9a684, .4).strokeRoundedRect(p.x - 41, p.y - 35, 82, 68, 8);
      }
    }
    lastRoom = state.room; lastSeed = state.seed;
  }
  function paintFocus() {
    focus.clear();
    if (!current || current.phase !== 'playing') return;
    for (const cell of ROOMS[current.room]!.floors) {
      if (!adjacent(current.cat, cell)) continue;
      const p = cellPoint(cell);
      const hasProp = current.exhibits.some(item => item.cell === cell);
      focus.lineStyle(hover === cell ? 5 : 2, hasProp && swapMode ? C.teal : C.ink, hover === cell ? 1 : .32);
      focus.strokeRoundedRect(p.x - 45, p.y - 40, 90, 80, 7);
      if (hasProp && swapMode) focus.lineStyle(4, C.teal).strokeCircle(p.x, p.y, 40);
    }
  }
  function burst(x: number, y: number) {
    particles.forEach((particle, i) => {
      scene.tweens.killTweensOf(particle);
      particle.setPosition(x, y).setVisible(true).setAlpha(1).setScale(1).setTint(i % 2 ? C.red : C.gold);
      if (runtime.reducedMotion) { particle.setVisible(false); return; }
      const angle = i * Math.PI * 2 / particles.length;
      scene.tweens.add({ targets: particle, x: x + Math.cos(angle) * 75, y: y + Math.sin(angle) * 58,
        alpha: 0, angle: i * 38, duration: 500, onComplete: () => particle.setVisible(false) });
    });
  }
  function draw(state: State, swap: boolean) {
    current = state; swapMode = swap;
    const room = ROOMS[state.room]!;
    if (lastRoom !== state.room || lastSeed !== state.seed) paintBackground(state);
    const changed = previous !== state;
    const p = cellPoint(state.cat);
    if (changed) {
      scene.tweens.killTweensOf(cat);
      if (previous?.room === state.room && state.turn > previous.turn && !runtime.reducedMotion) {
        cat.setScale(1.04, .74);
        scene.tweens.add({ targets: cat, x: p.x, y: p.y - 26, scaleX: .9, scaleY: .9, duration: 165, ease: 'Back.Out' });
      } else cat.setPosition(p.x, p.y - 26).setScale(.9);
      cat.setDepth(10 + Math.floor(state.cat / COLS));
      props.forEach((sprite, i) => {
        const exhibit = state.exhibits[i];
        scene.tweens.killTweensOf(sprite);
        if (!exhibit) { sprite.setVisible(false); return; }
        const q = cellPoint(exhibit.cell);
        const old = previous?.exhibits.find(item => item.id === exhibit.id);
        sprite.setVisible(true).setTexture(`cs-${exhibit.kind}`).setDepth(8 + Math.floor(exhibit.cell / COLS));
        if (old && old.cell !== exhibit.cell && previous?.room === state.room && !runtime.reducedMotion) {
          sprite.setScale(.7, .95);
          scene.tweens.add({ targets: sprite, x: q.x, y: q.y - 29, scaleX: .83, scaleY: .83, duration: 180, ease: 'Back.Out' });
        } else sprite.setPosition(q.x, q.y - 29).setScale(.83);
      });
      if (previous?.room === state.room && (state.picked && !previous.picked || state.stars.length > previous.stars.length)) burst(p.x, p.y - 40);
      const alarmRaised = previous?.room === state.room && state.alarm > previous.alarm;
      scene.tweens.killTweensOf(emote);
      if (alarmRaised || state.phase === 'won' || previous?.cat !== state.cat && state.turn > 0 && swap) {
        emote.setText(alarmRaised ? '喵？！' : state.phase === 'won' ? '借到啦！' : '借过～')
          .setPosition(p.x, p.y - 108).setAlpha(1);
        if (!runtime.reducedMotion) scene.tweens.add({ targets: emote, alpha: 0, y: p.y - 125, delay: 480, duration: 350 });
      } else emote.setAlpha(0);
    }
    const item = cellPoint(room.pickup), exit = cellPoint(room.exit);
    pickup.setPosition(item.x, item.y - 10).setVisible(!state.picked);
    door.setPosition(exit.x, exit.y - 13).setAlpha(exitOpen(state) ? 1 : .48);
    details.clear();
    if (room.plate !== null) {
      const plate = cellPoint(room.plate);
      details.fillStyle(exitOpen(state) ? C.teal : C.gold, .55).fillCircle(plate.x, plate.y, 32);
      details.lineStyle(4, exitOpen(state) ? C.teal : C.ink).strokeCircle(plate.x, plate.y, 32);
      details.lineStyle(2, C.ink).strokeCircle(plate.x, plate.y, 22);
    }
    for (const cell of room.squeaks) {
      const q = cellPoint(cell);
      details.lineStyle(5, C.gold).beginPath().moveTo(q.x - 24, q.y - 31).lineTo(q.x - 5, q.y - 4)
        .lineTo(q.x - 15, q.y + 8).lineTo(q.x + 17, q.y + 31).strokePath();
    }
    light.clear(); rail.clear();
    const preview = forecast(state);
    const active = state.phase === 'playing';
    if (state.plan) {
      const vertical = state.plan.lane === 'columns';
      const lampX = vertical ? cellPoint(preview.line).x : 816;
      const lampY = vertical ? 113 : cellPoint(preview.line * COLS).y - 30;
      if (changed) {
        scene.tweens.killTweensOf(guard);
        if (runtime.reducedMotion) guard.setPosition(lampX, lampY - 23);
        else scene.tweens.add({ targets: guard, x: lampX, y: lampY - 23, duration: 240, ease: 'Sine.Out' });
      }
      for (let future = 0; future < 4; future++) {
        const f = forecast(state, state.turn + future);
        const x = vertical ? cellPoint(f.line).x : 803 + future * 10;
        const y = vertical ? 148 + future * 8 : cellPoint(f.line * COLS).y;
        rail.fillStyle(C.red, 1 - future * .2).fillEllipse(x - 9, y - 4, 6, 13).fillEllipse(x + 2, y + 3, 6, 13);
      }
      if (active && preview.lit.length) {
        const last = cellPoint(preview.lit.at(-1)!);
        light.fillStyle(C.gold, .17);
        if (vertical) light.fillTriangle(lampX, 125, lampX - 46, last.y + 39, lampX + 46, last.y + 39);
        else light.fillTriangle(800, lampY + 30, last.x - 48, lampY - 13, last.x - 48, lampY + 72);
        for (const cell of preview.lit) {
          const q = cellPoint(cell);
          light.fillStyle(C.red, .16).fillRoundedRect(q.x - 45, q.y - 39, 90, 79, 7);
          light.lineStyle(3, C.red, .85).strokeRoundedRect(q.x - 45, q.y - 39, 90, 79, 7);
          light.fillStyle(C.red).fillTriangle(q.x + 30, q.y + 18, q.x + 39, q.y + 32, q.x + 21, q.y + 32);
        }
      }
      headline.setText(active ? `下一步：第${preview.line + 1}${vertical ? '列 ↓' : '行 ←'}扫灯` : '脚印记得你的来路。');
    } else headline.setText('闭馆以后，猫说了算。');
    caption.setText(state.phase === 'briefing' ? '① 先请巡夜员落脚印' : state.phase === 'lost' ? '被抱回门口了……再借一次？' :
      state.phase === 'won' ? '月牙沙丁鱼，借走一夜。' : state.phase === 'cleared' ? '悄悄过关。下一室，门开了。' :
        swap ? '借位模式：点相邻雕塑 / 纸猫 ⇄' : `② ${state.picked ? '③ 走到绿色出口' : `拿${room.item}`} · 红格 = 下次扫灯`);
    subcaption.setText(state.phase === 'won' ? `五室收藏 · ${state.stars.reduce((a, b) => a + b, 0)} / 15 星 · 明晚再来？` :
      state.phase === 'playing' ? '空格 / 点猫：蹲一拍　　Shift：切换借位' : '猫走一步，灯扫一次。没有倒计时，慢慢想。');
    paintFocus();
    previous = state;
  }
  return {
    draw,
    feedback(cell, accepted) {
      if (!accepted && !runtime.reducedMotion) {
        scene.tweens.killTweensOf(cat);
        const p = cellPoint(current!.cat);
        cat.setPosition(p.x, p.y - 26).setScale(.9);
        scene.tweens.add({ targets: cat, x: p.x + 7, duration: 45, yoyo: true, repeat: 1 });
      }
      if (accepted && current?.phase === 'playing' && cell === current.cat) paintFocus();
    },
    update(elapsed) {
      if (runtime.reducedMotion) return;
      pickup.setAngle(Math.sin(elapsed / 550) * 9);
      rail.setAlpha(.76 + Math.sin(elapsed / 270) * .24);
    },
    motionChanged(reduced) {
      if (!reduced) return;
      scene.tweens.killAll();
      particles.forEach(particle => particle.setVisible(false));
      pickup.setAngle(0); rail.setAlpha(1); emote.setAlpha(0);
      previous = undefined;
      if (current) draw(current, swapMode);
    },
    destroy() {
      for (const zone of zones) zone.removeAllListeners();
      // Objects and the eight generated textures belong to the stage's scene/game.
      labels.length = 0;
    },
  };
}
