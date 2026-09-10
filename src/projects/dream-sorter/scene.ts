import Phaser from 'phaser';
import { FixedStepClock } from '../../core/phaser/clock';
import type { PhaserRuntime } from '../../core/phaser/stage';
import { COLORS, RULES, STEP_MS, SYMBOLS, destination, type Direction, type Parcel } from './data';
import { latestOutcome, type State } from './engine';
import { activeParcel, type Simulation } from './simulation';

const INK = 0x201d3d, MILK = 0xfff0d6, ORANGE = 0xff985d, BLUE = 0x79ceec;
const FONT = '"Noto Sans SC", "Microsoft YaHei", sans-serif';
const ATLAS = 'dream-sorter-postal-atlas';

function loadAtlas(scene: Phaser.Scene) {
  if (scene.textures.exists(ATLAS)) return;
  const g = scene.make.graphics({ x: 0, y: 0 });
  const polygon = (points: number[][]) => points.map(([x, y]) => new Phaser.Math.Vector2(x, y));
  g.fillStyle(0xffffff).fillRoundedRect(4, 5, 150, 116, 12);
  g.lineStyle(3, INK, 0.8).strokeRoundedRect(4, 5, 150, 116, 12);
  g.lineStyle(2, INK, 0.24).lineBetween(5, 14, 79, 63).lineBetween(79, 63, 153, 14);
  g.lineBetween(5, 112, 55, 76).lineBetween(153, 112, 106, 77);
  g.fillStyle(MILK).fillRect(62, 6, 34, 16).fillRect(62, 104, 34, 17);
  g.fillStyle(0x615f79).fillCircle(195, 34, 28);
  g.lineStyle(4, 0xaaa6ba).strokeCircle(195, 34, 26);
  g.lineStyle(3, 0xaaa6ba).lineBetween(195, 10, 195, 58);
  g.fillStyle(INK).fillCircle(195, 34, 7);
  g.fillStyle(MILK).fillPoints(polygon([[253, 8], [295, 28], [345, 3], [308, 55], [286, 38], [269, 57]]), true);
  g.lineStyle(2, 0xbec3cc).lineBetween(253, 8, 308, 55).lineBetween(295, 28, 269, 57);
  g.fillStyle(MILK).fillPoints(polygon([[365, 30], [453, 30], [432, 59], [388, 59]]), true);
  g.fillTriangle(385, 28, 411, 4, 430, 28);
  g.lineStyle(2, 0xbec3cc).lineBetween(366, 30, 433, 59);
  g.fillStyle(MILK).fillPoints(polygon([[298, 85], [334, 113], [298, 147], [262, 113]]), true);
  g.lineStyle(2, 0xbec3cc).lineBetween(298, 85, 298, 147).lineBetween(262, 113, 334, 113);
  g.fillStyle(MILK).fillRoundedRect(171, 84, 24, 30, 3);
  g.lineStyle(2, ORANGE).strokeRect(175, 88, 16, 22);
  g.fillStyle(ORANGE).fillCircle(183, 99, 5);
  g.fillStyle(MILK).fillRect(214, 84, 12, 12);
  g.generateTexture(ATLAS, 512, 160);
  g.destroy();
  const atlas = scene.textures.get(ATLAS);
  atlas.add('parcel', 0, 0, 0, 160, 128);
  atlas.add('roller', 0, 163, 2, 64, 64);
  atlas.add('bird', 0, 250, 0, 100, 64);
  atlas.add('boat', 0, 360, 0, 100, 64);
  atlas.add('kite', 0, 250, 80, 100, 72);
  atlas.add('stamp', 0, 170, 82, 28, 34);
  atlas.add('confetti', 0, 212, 82, 16, 16);
}

interface Hooks { advance(): void; input(direction: Direction): void; pauseChanged(paused: boolean): void }
export function createPostalScene(scene: Phaser.Scene, runtime: PhaserRuntime, hooks: Hooks) {
  loadAtlas(scene);
  const clock = new FixedStepClock(STEP_MS, 2);
  let state: State | undefined, live: Simulation | null = null;
  let reduced = runtime.reducedMotion, lastOutcome = '', shownPhase = '';
  const text = (x: number, y: number, value: string, size = 20, color = '#fff0d6') =>
    scene.add.text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold' }).setOrigin(0.5);
  const hall = scene.add.graphics();
  hall.fillStyle(0x272344).fillRect(0, 0, 960, 600);
  hall.fillStyle(0x343055).fillRoundedRect(25, 22, 910, 550, 32);
  hall.lineStyle(3, 0x514b71).strokeRoundedRect(43, 36, 874, 515, 26);
  for (const x of [87, 715]) {
    hall.fillStyle(0x1c1c38).fillRoundedRect(x, 72, 158, 170, 70);
    hall.lineStyle(7, 0x68617b).strokeRoundedRect(x, 72, 158, 170, 70);
    hall.fillStyle(x < 400 ? ORANGE : BLUE, 0.12).fillRoundedRect(x + 10, 85, 138, 140, 60);
    hall.lineStyle(3, 0x68617b).lineBetween(x + 79, 74, x + 79, 241).lineBetween(x, 160, x + 158, 160);
  }
  hall.lineStyle(6, 0x766b83).lineBetween(25, 272, 25, 541).lineBetween(935, 272, 935, 541);
  hall.fillStyle(0x201d3d).fillRoundedRect(270, 35, 420, 118, 16);
  hall.lineStyle(3, ORANGE).strokeRoundedRect(278, 43, 404, 102, 12);
  hall.lineStyle(2, 0x9b8e9c).lineBetween(307, 0, 307, 35).lineBetween(653, 0, 653, 35);
  text(480, 71, '梦 境 分 拣 局', 29);
  text(480, 111, '白昼与黑夜 · 不再寄错', 16, '#bcb1ca');
  text(165, 191, '日间出口', 18, '#ffbc86');
  text(795, 191, '夜间出口', 18, '#a4e0f2');
  hall.fillStyle(0x17172d).fillRoundedRect(50, 344, 860, 110, 24);
  hall.lineStyle(5, 0x8a8096).strokeRoundedRect(50, 344, 860, 110, 24);
  hall.fillStyle(0x49425e).fillRoundedRect(57, 352, 846, 58, 16);
  hall.lineStyle(2, 0x827487).lineBetween(70, 356, 890, 356);
  const rollers = Array.from({ length: 17 }, (_, i) =>
    scene.add.sprite(80 + i * 50, 422, ATLAS, 'roller').setScale(0.63));
  hall.fillStyle(0x19182f).fillRect(103, 455, 28, 77).fillRect(830, 455, 28, 77);
  for (let i = 0; i < 29; i++) {
    hall.fillStyle(i % 2 ? INK : ORANGE).fillRect(60 + i * 29, 456, 23, 7);
  }
  const bins = scene.add.graphics();
  for (const [x, color] of [[175, ORANGE], [785, BLUE]]) {
    bins.fillStyle(INK).fillRoundedRect(x - 123, 480, 246, 98, 16);
    bins.lineStyle(3, color).strokeRoundedRect(x - 123, 480, 246, 98, 16);
    bins.fillStyle(color).fillRoundedRect(x - 107, 494, 214, 12, 6);
  }
  text(175, 541, '← 白 昼', 28, '#ffbc86');
  text(785, 541, '黑 夜 →', 28, '#a4e0f2');
  for (const [x, direction] of [[175, 'day'], [785, 'night']] as const) {
    scene.add.zone(x, 531, 246, 104).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { if (runtime.canInteract()) hooks.input(direction); });
  }
  const parcels = Array.from({ length: 3 }, () => {
    const body = scene.add.sprite(0, 0, ATLAS, 'parcel');
    const dream = scene.add.sprite(-43, -23, ATLAS, 'bird').setScale(0.39);
    const symbol = text(8, -17, '☀', 52, '#201d3d');
    const stamps = Array.from({ length: 3 }, (_, i) => scene.add.sprite(-31 + i * 28, 39, ATLAS, 'stamp').setScale(0.66));
    const number = text(54, 40, '2', 17, '#201d3d');
    const container = scene.add.container(480, 295, [body, dream, symbol, ...stamps, number]);
    return { body, dream, symbol, stamps, number, container };
  });
  const queueLabel = text(785, 234, '待分队列', 16, '#c2b8cf');
  const heading = text(480, 189, '夜班未开 · 传送带待命', 21);
  const prompt = text(480, 257, '点击「请督导开班」领取梦邮', 18, '#c2b8cf');
  const timer = scene.add.graphics();
  const timerText = text(480, 389, '', 17);
  const feedback = text(480, 490, '把梦送回它该去的地方', 20);
  const stampBurst = text(480, 292, '已签收', 34).setAlpha(0).setDepth(20).setAngle(-12);
  const particles = scene.add.group({ maxSize: 12 });
  for (let i = 0; i < 12; i++) {
    const particle = scene.add.sprite(0, 0, ATLAS, 'confetti').setActive(false).setVisible(false).setDepth(19);
    particles.add(particle);
  }
  function showParcel(slot: typeof parcels[number], p: Parcel | undefined, x: number, y: number, scale: number) {
    slot.container.setVisible(Boolean(p)).setPosition(x, y).setScale(scale);
    if (!p) return;
    slot.body.setTint(COLORS[p.color]);
    slot.dream.setFrame(p.shape);
    slot.symbol.setText(SYMBOLS[p.symbol]);
    slot.number.setText(String(p.stamps));
    slot.stamps.forEach((stamp, i) => stamp.setVisible(i < p.stamps));
  }
  function burst(correct: boolean, direction: Direction, combo: number) {
    scene.tweens.killTweensOf(stampBurst);
    stampBurst.setText(correct ? combo >= 3 ? `${combo} 连签！` : '已签收' : '退件！').setColor(correct ? '#fff0d6' : '#ff796e');
    stampBurst.setPosition(480, 290).setScale(1.15).setAlpha(1);
    if (reduced) { stampBurst.setAlpha(0); return; }
    scene.tweens.add({ targets: stampBurst, y: 218, alpha: 0, scale: 1, duration: 700 });
    let index = 0;
    for (const child of particles.getChildren()) {
      const p = child as Phaser.GameObjects.Sprite;
      scene.tweens.killTweensOf(p);
      p.setActive(true).setVisible(true).setPosition(480, 307).setAlpha(1)
        .setTint(correct ? (direction === 'day' ? ORANGE : BLUE) : 0xff796e);
      const angle = index++ * Math.PI / 6;
      scene.tweens.add({
        targets: p, x: 480 + Math.cos(angle) * 140, y: 290 + Math.sin(angle) * 70,
        angle: index * 60, alpha: 0, scale: 0.3, duration: 500,
        onComplete: () => { p.setActive(false).setVisible(false); },
      });
    }
    if (!correct) scene.cameras.main.shake(180, 0.008);
  }
  function draw(next: State, simulation: Simulation | null) {
    state = next; live = simulation;
    const phase = live?.status === 'running' ? 'running' : state.phase;
    if (phase !== shownPhase && phase !== 'running') {
      scene.tweens.killAll();
      particles.getChildren().forEach(p => (p as Phaser.GameObjects.Sprite).setActive(false).setVisible(false));
      stampBurst.setAlpha(0);
    }
    shownPhase = phase;
    const index = live?.index ?? 0, parcel = state.batch[index];
    const active = live ? activeParcel(live) : undefined;
    const ready = state.phase === 'ready' && !live;
    const running = live?.status === 'running';
    const progress = live && active ? (live.tick - live.arrival) / (live.deadline - live.arrival) : 0;
    const waiting = live && !active ? Math.min(1, Math.max(0, (live.arrival - live.tick) / 12)) : 0;
    showParcel(parcels[0], ready || running ? parcel : undefined, 480 + waiting * 160 + progress * 22, 303, 1.18);
    if (active && !reduced) {
      const bump = Math.sin(Math.min(1, (live!.tick - live!.arrival) / 7) * Math.PI) * 0.1;
      parcels[0].container.setScale(1.18 + bump, 1.18 - bump * 0.6);
    }
    showParcel(parcels[1], ready || running ? state.batch[index + 1] : undefined, 746, 309, 0.64);
    showParcel(parcels[2], ready || running ? state.batch[index + 2] : undefined, 850, 309, 0.49);
    queueLabel.setVisible(Boolean(ready || running));
    heading.setText(running ? `第 ${state.wave} 班 · ${RULES[state.plan!.rule].title}`
      : ready ? `下一班已备妥 · ${RULES[state.plan!.rule].title}`
        : state.phase === 'won' ? '全部梦邮 · 妥善归档'
          : state.phase === 'lost' ? '三次退件 · 本班停机'
            : state.phase === 'between' ? '本班交接完毕 · 等待新派件' : '夜班未开 · 传送带待命');
    prompt.setVisible(!(ready || running));
    prompt.setText(state.phase === 'won' ? '白昼明亮，黑夜安稳。辛苦了！'
      : state.phase === 'lost' ? '休息一下，再开一班吧。' : state.phase === 'between' ? '下一条规则由督导根据公开记录选择' : '点击「请督导开班」领取梦邮');
    timer.clear();
    if (running && active) {
      const fraction = 1 - progress, color = fraction < 0.25 ? 0xff796e : BLUE;
      timer.fillStyle(INK).fillRoundedRect(371, 365, 218, 9, 4);
      timer.fillStyle(color).fillRoundedRect(371, 365, Math.max(2, 218 * fraction), 9, 4);
      timerText.setText(`剩余 ${((live!.deadline - live!.tick) * STEP_MS / 1000).toFixed(1)} 秒`);
    } else timerText.setText(ready ? '准备好后才开始计时' : running ? '下一件正在入站…' : '');
    const last = latestOutcome(state, live);
    const outcomeKey = last ? `${state.wave}/${last.id}/${last.tick}` : '';
    if (last && outcomeKey !== lastOutcome) {
      burst(last.correct, last.expected, live?.combo ?? state.combo);
      feedback.setText(last.correct ? live ? live.combo >= 3 ? '节奏正好！保持连签' : '签收成功 · 继续' : '最后一件签收成功 · 本班已结算'
        : `${last.actual === 'timeout' ? '超时退件' : '误分退件'} · 应送${destination(last.expected)}${live ? '，稳住下一件' : ' · 已记入班次回放'}`);
    } else if (!last) feedback.setText(ready ? '看清规则，再按开带' : running ? '← 白昼     黑夜 →' : '把梦送回它该去的地方');
    if (scene.game.canvas.getAttribute('aria-description') !== feedback.text) {
      scene.game.canvas.setAttribute('aria-description', feedback.text);
    }
    lastOutcome = outcomeKey;
  }
  return {
    draw,
    resetClock() { clock.reset(); },
    update(_elapsed: number, delta: number) {
      if (live?.status === 'running') clock.advance(delta, hooks.advance);
      if (!reduced && live?.status === 'running') {
        for (const roller of rollers) roller.rotation -= delta * 0.002;
      }
    },
    pauseChanged(paused: boolean) { clock.reset(); hooks.pauseChanged(paused); },
    motionChanged(value: boolean) {
      reduced = value;
      if (value) {
        scene.tweens.killAll(); stampBurst.setAlpha(0);
        particles.getChildren().forEach(p => (p as Phaser.GameObjects.Sprite).setVisible(false).setActive(false));
      }
      if (state) draw(state, live);
    },
    destroy() { clock.reset(); particles.clear(false, true); },
  };
}
export type PostalView = ReturnType<typeof createPostalScene>;
