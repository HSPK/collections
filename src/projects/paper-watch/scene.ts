import type Phaser from 'phaser';
import type { PhaserRuntime } from '../../core/phaser/stage';
import { FixedStepClock } from '../../core/phaser/clock';
import { CHAPTERS, LANE_NAMES, STEP_MS, WAVE_TICKS } from './data';
import type { Lane } from './data';
import type { State } from './engine';
import { createRound, step, vulnerable } from './simulation';
import type { Input, Round } from './simulation';

const X = [330, 720, 1110];
const GOLD = 0xf6ce75, IVORY = 0xf2e4c5, INK = 0x111a2b;
const FONT = '"Noto Sans SC","Microsoft YaHei",sans-serif';
interface Hooks {
  changed(round: Round | null): void;
  finished(trace: Input[], round: Round): void;
  paused(value: boolean): void;
}
export interface WatchView {
  draw(state: State): void;
  start(state: State): void;
  select(lane: Lane): void;
  hold(value: boolean): void;
  clear(): void;
  cancel(): void;
  update(elapsed: number, delta: number): void;
  pauseChanged(paused: boolean): void;
  motionChanged(reduced: boolean): void;
  destroy(): void;
}
function textures(scene: Phaser.Scene) {
  const g = scene.add.graphics();
  for (const kind of ['moth', 'kite', 'mask', 'crown'] as const) {
    g.clear();
    g.fillStyle(IVORY);
    if (kind === 'moth') {
      g.fillTriangle(43, 42, 3, 13, 10, 66); g.fillTriangle(47, 42, 87, 9, 81, 69);
      g.fillEllipse(45, 44, 30, 51);
    } else if (kind === 'kite') {
      g.fillTriangle(45, 3, 7, 38, 83, 38); g.fillTriangle(7, 38, 45, 76, 83, 38);
      g.lineStyle(3, IVORY); g.lineBetween(45, 76, 60, 86); g.lineBetween(60, 86, 44, 92);
    } else if (kind === 'mask') {
      g.fillRoundedRect(12, 14, 66, 60, 20); g.fillTriangle(12, 24, 14, 0, 37, 20);
      g.fillTriangle(57, 20, 76, 0, 78, 24); g.fillTriangle(20, 68, 30, 87, 46, 68);
    } else {
      g.fillEllipse(45, 53, 73, 69);
      g.fillTriangle(10, 32, 6, 1, 35, 29); g.fillTriangle(26, 27, 45, 0, 65, 27);
      g.fillTriangle(56, 27, 83, 2, 80, 35);
      g.lineStyle(3, INK); g.strokeEllipse(45, 55, 56, 48);
    }
    g.fillStyle(INK); g.fillEllipse(32, 41, 8, 12); g.fillEllipse(59, 39, 8, 12);
    g.lineStyle(2, INK); g.lineBetween(32, 60, 47, 65); g.lineBetween(47, 65, 60, 56);
    g.generateTexture(`pw-${kind}`, 90, 96);
  }
  g.clear().fillStyle(0xc94736);
  g.fillTriangle(46, 0, 9, 26, 83, 26); g.fillTriangle(9, 26, 46, 72, 83, 26);
  g.fillStyle(0xe56c47); g.fillTriangle(46, 0, 46, 72, 83, 26);
  g.lineStyle(2, GOLD); g.lineBetween(9, 26, 83, 26); g.lineBetween(46, 3, 46, 68);
  g.fillStyle(GOLD); g.fillRect(43, 69, 6, 23);
  g.generateTexture('pw-lamp', 92, 96);
  g.clear().fillStyle(IVORY);
  g.fillTriangle(10, 0, 5, 20, 18, 8); g.fillTriangle(0, 7, 20, 7, 11, 18);
  g.generateTexture('pw-star', 20, 20);
  g.destroy();
}
export function createWatchScene(scene: Phaser.Scene, runtime: PhaserRuntime, hooks: Hooks): WatchView {
  textures(scene);
  const clock = new FixedStepClock(STEP_MS, 4);
  let round: Round | null = null, trace: Input[] = [], lane: Lane = 1, held = false, clicked = false;
  let selectionPending = false, time = 0, chapter = -1, reduced = runtime.reducedMotion;
  const sky = scene.add.rectangle(720, 320, 1440, 640, CHAPTERS[0].sky);
  const moonHalo = scene.add.circle(1236, 135, 92, GOLD, .045);
  scene.add.circle(1236, 135, 57, IVORY, .9);
  scene.add.circle(1255, 119, 55, CHAPTERS[0].sky).setName('moon-cut');
  const stars = scene.add.graphics().fillStyle(IVORY, .6);
  for (let i = 0; i < 42; i++) {
    const x = (i * 137 + 31) % 1420, y = (i * 53 + 19) % 290;
    stars.fillRect(x, y, i % 4 === 0 ? 3 : 1, i % 4 === 0 ? 3 : 1);
  }
  const city = scene.add.graphics();
  const stageLines = scene.add.graphics().lineStyle(1, IVORY, .14);
  for (const x of X) {
    stageLines.lineBetween(x - 180, 130, x - 180, 516);
    stageLines.lineBetween(x + 180, 130, x + 180, 516);
    stageLines.lineStyle(1, GOLD, .25).lineBetween(x - 140, 432, x + 140, 432);
  }
  const folds: Phaser.GameObjects.Container[] = [];
  for (let i = 0; i < 15; i++) {
    const width = 50 + i % 3 * 18, height = 48 + i % 5 * 16;
    const body = scene.add.rectangle(0, -height / 2, width, height, IVORY);
    const roof = scene.add.triangle(0, -height - 8, 0, 25, width / 2, 0, width, 25, IVORY).setOrigin(.5);
    const crease = scene.add.rectangle(6, -height / 2, 2, height, 0x77808a, .5);
    const windows = scene.add.graphics().fillStyle(INK, .75);
    for (let j = 0; j < 3; j++) windows.fillRect(-width / 2 + 8 + j * 9, -height + 15, 4, 9);
    const fold = scene.add.container(35 + i * 98, 589 + (i % 2) * 12, [body, roof, crease, windows]);
    folds.push(fold);
  }
  const cones = X.map(x => scene.add.triangle(x, 326, 5, 0, 350, 0, 178, 365, GOLD, .045));
  const glows = X.map(x => scene.add.circle(x, 541, 51, GOLD, .08));
  const lamps = X.map(x => scene.add.sprite(x, 537, 'pw-lamp').setScale(.82));
  const labels = X.map((x, i) => scene.add.text(x, 611, `${i + 1}  ${LANE_NAMES[i]}`, { fontFamily: FONT, fontSize: '25px', color: '#f2e4c5' }).setOrigin(.5));
  const readyLabels = X.map(x => scene.add.text(x, 478, '灯芯充盈', { fontFamily: FONT, fontSize: '22px', color: '#f6ce75' }).setOrigin(.5));
  const title = scene.add.text(34, 27, CHAPTERS[0].place, { fontFamily: FONT, fontSize: '28px', color: '#f2e4c5' });
  scene.add.text(1404, 32, '纸 城 夜 巡 / 五 更', { fontFamily: FONT, fontSize: '21px', color: '#c0b69e' }).setOrigin(1, 0);
  const progress = scene.add.rectangle(0, 0, 1440, 3, GOLD).setOrigin(0);
  const creatures = scene.add.group();
  const shadows = Array.from({ length: 12 }, () => {
    const sprite = scene.add.sprite(0, 0, 'pw-moth').setVisible(false);
    creatures.add(sprite);
    return sprite;
  });
  const arrows = Array.from({ length: 12 }, () => scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '22px', color: '#f6ce75', backgroundColor: '#111a2b' }).setOrigin(.5).setVisible(false));
  const sparks = Array.from({ length: 36 }, () => ({ sprite: scene.add.sprite(0, 0, 'pw-star').setVisible(false), born: -1000, x: 0, y: 0, vx: 0, vy: 0 }));
  let sparkCursor = 0;
  const burstAt = Array<number>(12).fill(-1);
  const flashWord = scene.add.text(720, 410, '', { fontFamily: FONT, fontSize: '30px', color: '#f6ce75' }).setOrigin(.5).setAlpha(0);
  let feedbackAt = -1000;
  const zones = X.map((x, i) => scene.add.zone(x, 345, 380, 510).setInteractive().on('pointerdown', () => {
    if (!runtime.canInteract() || !round || round.terminal) return;
    lane = i as Lane; clicked = true; selectionPending = true;
  }));
  function animateCity() {
    scene.tweens.killTweensOf(folds);
    scene.tweens.killTweensOf(moonHalo);
    for (const fold of folds) fold.setScale(1);
    if (reduced) return;
    folds.forEach((fold, i) => scene.tweens.add({ targets: fold, scaleY: .94, duration: 1800 + i * 75, delay: i * 80, yoyo: true, repeat: -1, ease: 'Sine.InOut' }));
    scene.tweens.add({ targets: moonHalo, alpha: .5, duration: 2400, yoyo: true, repeat: -1 });
  }
  function scenery(wave: number) {
    if (chapter === wave) return;
    chapter = wave;
    const c = CHAPTERS[wave];
    title.setText(c.place); sky.setFillStyle(c.sky);
    (scene.children.getByName('moon-cut') as Phaser.GameObjects.Arc).setFillStyle(c.sky);
    city.clear();
    for (let row = 0; row < 2; row++) {
      city.fillStyle(c.paper, row ? .22 : .12);
      for (let i = 0; i < 22; i++) {
        const x = i * 69 - 12, h = 45 + ((i * 31 + wave * 27 + row * 17) % 100);
        city.fillRect(x, 535 - h - row * 50, 62, h + row * 50);
        if ((wave + i) % 3 === 0) city.fillTriangle(x - 6, 535 - h - row * 50, x + 31, 510 - h - row * 50, x + 68, 535 - h - row * 50);
      }
    }
    if (wave === 1) {
      city.lineStyle(2, GOLD, .25);
      for (let i = 0; i < 5; i++) city.lineBetween(30 + i * 13, 576 + i * 8, 1410 - i * 13, 576 + i * 8);
    }
    if (wave >= 3) {
      city.fillStyle(c.paper, .26);
      for (let i = 0; i < 5; i++) {
        city.fillRect(678 - i * 8, 210 + i * 56, 84 + i * 16, 55);
        city.fillTriangle(648 - i * 10, 224 + i * 56, 720, 185 + i * 56, 792 + i * 10, 224 + i * 56);
      }
    }
    folds.forEach((fold, i) => fold.setY(589 + (i + wave) % 2 * 12));
  }
  function clear() { held = false; clicked = false; selectionPending = false; clock.reset(); }
  function paint() {
    for (let i = 0; i < 3; i++) {
      const lamp = round?.lamps[i];
      const flashing = lamp && round && round.tick - lamp.flash < 4;
      lamps[i].setScale(i === lane ? .94 : .8).setTint(lamp && lamp.heat > 68 ? 0xd97d65 : 0xffffff);
      cones[i].setAlpha(flashing ? .68 : i === lane ? .12 : .035);
      glows[i].setAlpha(flashing ? .9 : i === lane ? .25 : .08);
      labels[i].setColor(i === lane ? '#f6ce75' : '#c9c0aa');
      readyLabels[i].setText(!lamp ? '灯芯充盈' : lamp.heat > 68 ? '过热 · 换一盏' : lamp.energy < 28 ? '蓄光中 · 换一盏' : '可以闪光');
    }
    progress.width = round ? 1440 * (1 - round.tick / WAVE_TICKS) : 1440;
    for (let i = 0; i < shadows.length; i++) {
      const shadow = round?.shadows[i], sprite = shadows[i], arrow = arrows[i];
      if (!shadow || !round || shadow.status !== 'live') { sprite.setVisible(false); arrow.setVisible(false); }
      else {
        const age = round.tick - shadow.spawn.tick;
        const shownLane = age < 24 ? shadow.spawn.decoy : shadow.spawn.lane;
        const y = 119 + age * 5.12;
        sprite.setTexture(`pw-${shadow.spawn.kind}`).setPosition(X[shownLane], y).setVisible(true);
        sprite.setScale(shadow.spawn.kind === 'crown' ? 1.15 : .9);
        sprite.setTint(vulnerable(shadow, round.tick) ? GOLD : 0x8e9dae);
        sprite.setAngle(reduced ? 0 : Math.sin(time / 210 + i) * 7);
        arrow.setText(shadow.spawn.decoy !== shadow.spawn.lane && age < 24 ? `↪ ${LANE_NAMES[shadow.spawn.lane]}` : shadow.spawn.kind === 'crown' ? `${shadow.hp === 2 ? '双折 · 照两次' : '余一折'}` : vulnerable(shadow, round.tick) ? '现在照！' : '等金边');
        arrow.setPosition(X[shownLane], y - 61).setVisible(true);
      }
      if (shadow && round && shadow.resolved > burstAt[i] && shadow.resolved >= 0) {
        burstAt[i] = shadow.resolved; feedbackAt = time;
        flashWord.setText(shadow.status === 'star' ? `化墨为星  ×${round.combo}` : '城折 −1').setColor(shadow.status === 'star' ? '#f6ce75' : '#ff9a80').setAlpha(1);
        if (shadow.status === 'star') for (let j = 0; j < 6; j++) {
          const spark = sparks[sparkCursor++ % sparks.length];
          spark.born = time; spark.x = X[shadow.spawn.lane]; spark.y = 119 + (shadow.resolved - shadow.spawn.tick) * 5.12;
          spark.vx = Math.cos(j * Math.PI / 3) * .11; spark.vy = Math.sin(j * Math.PI / 3) * .1 - .06;
          spark.sprite.setTint(j % 2 ? GOLD : 0xe98269).setScale(j % 2 ? .55 : .3).setVisible(true);
        }
      }
    }
    for (const spark of sparks) {
      const age = time - spark.born;
      spark.sprite.setVisible(age < 650);
      if (age < 650) spark.sprite.setPosition(spark.x + (reduced ? 0 : spark.vx * age), spark.y + (reduced ? 0 : spark.vy * age + age * age * .00012)).setAlpha(1 - age / 650);
    }
    flashWord.setAlpha(Math.max(0, 1 - (time - feedbackAt) / 1000));
  }
  animateCity();
  return {
    draw(state) { scenery(state.wave); paint(); },
    start(state) {
      if (!state.plan || state.phase !== 'prepared' || !runtime.canInteract()) return;
      clear(); trace = []; lane = 1; burstAt.fill(-1);
      round = createRound(state.plan, state.wave, state.lives, state.upgrades);
      hooks.changed(round); paint();
    },
    select(value) { if (round && !round.terminal && runtime.canInteract()) { lane = value; selectionPending = true; } },
    hold(value) {
      if (!value || runtime.canInteract()) {
        if (value && !held) clicked = true;
        held = value;
      }
    },
    clear,
    cancel() { clear(); round = null; trace = []; burstAt.fill(-1); for (const spark of sparks) spark.born = -1000; hooks.changed(null); paint(); },
    update(elapsed, delta) {
      time = elapsed;
      if (round && !round.terminal) clock.advance(delta, () => {
        if (!round || round.terminal || !runtime.canInteract()) return;
        const pulse = held || clicked;
        const input: Input | undefined = pulse || selectionPending ? { tick: round.tick + 1, lane, pulse } : undefined;
        if (input) trace.push(input);
        clicked = false; selectionPending = false;
        step(round, input); hooks.changed(round);
        if (round.terminal) { clear(); hooks.finished(trace, round); }
      });
      paint();
    },
    pauseChanged(value) { clear(); hooks.paused(value); },
    motionChanged(value) { reduced = value; animateCity(); },
    destroy() { clear(); round = null; trace = []; zones.forEach(zone => zone.removeAllListeners()); creatures.destroy(false); },
  };
}
