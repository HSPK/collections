import type Phaser from 'phaser';
import { FixedStepClock } from '../../core/phaser/clock';
import type { PhaserRuntime } from '../../core/phaser/stage';
import { FORMATION_NAMES, HEIGHT, LAUNCH, makeBoard, PACT_NAMES, ROUNDS, WIDTH } from './data';
import type { Board, Shot } from './data';
import type { State } from './engine';
import type { Result } from './physics';
import { STEP_MS } from './physics';

const C = { navy: 0x091f2e, paper: 0xf5e6bc, copper: 0xd7976b, lime: 0xe0f780, dark: 0x061622, blue: 0x39627a, muted: 0x90a9ad };
interface Controls {
  canShoot(): boolean;
  aim(shot: Shot): void;
  fire(): void;
  complete(): void;
  paused(paused: boolean): void;
}
export interface CabinetView {
  draw(state: State): void;
  aim(shot: Shot): void;
  play(state: State, result: Result): void;
  cancel(): void;
  update(elapsed: number, delta: number): void;
  pauseChanged(paused: boolean): void;
  motionChanged(reduced: boolean): void;
  destroy(): void;
}

function createAtlas(scene: Phaser.Scene) {
  const g = scene.add.graphics();
  g.fillStyle(C.paper).fillCircle(16, 16, 8).fillStyle(0xffffff).fillCircle(13, 12, 3);
  g.fillStyle(C.dark).fillCircle(84, 52, 42);
  g.lineStyle(4, C.copper).strokeCircle(84, 52, 36);
  g.lineStyle(2, C.paper, 0.65).strokeCircle(84, 52, 29);
  g.fillStyle(C.blue).fillCircle(84, 52, 23);
  g.lineStyle(3, C.lime).strokeCircle(84, 52, 15);
  g.fillStyle(C.copper).fillCircle(84, 52, 7);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    g.fillStyle(C.paper).fillCircle(84 + Math.cos(a) * 34, 52 + Math.sin(a) * 34, 2);
  }
  g.fillStyle(C.lime, 0.12).fillCircle(182, 52, 43);
  g.lineStyle(3, C.lime).strokeCircle(182, 52, 31);
  g.lineStyle(1, C.lime, 0.5).strokeCircle(182, 52, 39);
  g.fillStyle(C.lime).fillTriangle(182, 32, 173, 49, 191, 49);
  g.fillRect(177, 51, 10, 14);
  g.fillStyle(C.lime).fillRect(240, 4, 5, 12).fillRect(236, 8, 13, 4);
  g.generateTexture('mp-original-atlas', 256, 104); g.destroy();
  const atlas = scene.textures.get('mp-original-atlas');
  atlas.add('ball', 0, 0, 0, 32, 32);
  atlas.add('bumper', 0, 40, 8, 88, 88);
  atlas.add('pact', 0, 138, 8, 88, 88);
  atlas.add('spark', 0, 234, 0, 20, 20);
}

export function createCabinet(scene: Phaser.Scene, runtime: PhaserRuntime, controls: Controls): CabinetView {
  createAtlas(scene);
  let reduced = runtime.reducedMotion;
  let state: State, board: Board, current: Shot = { angle: 0, power: 85, special: false };
  let playing: Result | null = null, frameIndex = 0, contactIndex = 0, drag = false;
  let boardKey = '', lastHits = '', destroyed = false;
  const clock = new FixedStepClock(STEP_MS, 12);
  const backdrop = scene.add.graphics(), railGlow = scene.add.graphics(), guide = scene.add.graphics();
  const portrait = scene.add.container(60, 210);
  const face = scene.add.graphics(); portrait.add(face);
  const txt = (x: number, y: number, text: string, size = 18, color = '#f5e6bc') =>
    scene.add.text(x, y, text, { fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif', fontSize: `${Math.max(18, size)}px`, color,
      lineSpacing: 8 });
  txt(48, 46, 'LUNAR / 88', 17, '#d7976b');
  txt(48, 80, '不必争吵。\n让弹珠说话。', 29);
  const hostName = txt(50, 405, '', 23);
  const hostRole = txt(50, 445, '', 15, '#90a9ad').setWordWrapWidth(235);
  const planName = txt(50, 515, '', 16, '#e0f780');
  const intent = txt(50, 552, '', 15, '#f5e6bc').setWordWrapWidth(230);
  const chapter = txt(367, 22, '', 18);
  const boardNote = txt(660, 644, '', 16, '#90a9ad').setOrigin(0.5, 0);
  const bumpers = Array.from({ length: 3 }, () => scene.add.sprite(0, 0, 'mp-original-atlas', 'bumper'));
  const targets = Array.from({ length: 3 }, () => ({
    ring: scene.add.sprite(0, 0, 'mp-original-atlas', 'pact'),
    label: txt(0, 0, '', 16).setOrigin(0.5, 0),
    stamp: txt(0, 0, '已签署', 18, '#e0f780').setOrigin(0.5).setRotation(-0.16).setVisible(false),
  }));
  const shieldLabel = txt(0, 0, '铜盾', 14, '#d7976b').setOrigin(0.5, 0);
  const trail = Array.from({ length: 18 }, (_, i) =>
    scene.add.image(LAUNCH.x, LAUNCH.y, 'mp-original-atlas', 'ball').setScale(0.25 + i / 35).setAlpha(0).setDepth(6));
  const sparks = Array.from({ length: 20 }, () => ({
    image: scene.add.sprite(0, 0, 'mp-original-atlas', 'spark').setVisible(false).setDepth(9), life: 0, vx: 0, vy: 0,
  }));
  let trailCursor = 0, sparkCursor = 0;
  const ball = scene.add.sprite(LAUNCH.x, LAUNCH.y, 'mp-original-atlas', 'ball').setDepth(10);
  const liveScore = txt(1024, 90, '0', 20, '#e0f780').setAngle(90);
  const shotLabel = txt(LAUNCH.x, 601, '拉回 · 松手', 15, '#d7976b').setOrigin(0.5, 0);
  const tableZone = scene.add.zone(670, 346, 710, 560).setInteractive();
  const coin = scene.add.graphics().fillStyle(C.copper).fillCircle(0, 0, 8);
  const badge = scene.add.container(279, 58, [coin]);
  const idleTween = scene.tweens.add({ targets: badge, y: 64, duration: 1400, yoyo: true, repeat: -1, paused: reduced });
  function geometry() {
    backdrop.clear();
    backdrop.fillStyle(C.dark).fillRect(0, 0, WIDTH, HEIGHT);
    backdrop.fillStyle(C.navy).fillRoundedRect(18, 16, 1064, 646, 24);
    backdrop.lineStyle(2, C.copper, 0.65).strokeRoundedRect(18, 16, 1064, 646, 24);
    backdrop.lineStyle(1, C.copper, 0.35).lineBetween(309, 40, 309, 632);
    backdrop.fillStyle(0x0c2939).fillRoundedRect(322, 57, 697, 573, 24);
    for (let i = 0; i < 44; i++) {
      const x = 350 + ((i * 167 + state.seed * 23) % 630), y = 97 + ((i * 89) % 460);
      backdrop.fillStyle(C.paper, 0.17).fillCircle(x, y, i % 7 === 0 ? 2 : 1);
    }
    // Each chapter's mechanical motif has its own silhouette, not a palette swap.
    backdrop.lineStyle(1, C.copper, 0.15);
    if (state.round === 0) {
      for (let i = 0; i < 4; i++) backdrop.strokeEllipse(670, 290, 390 + i * 54, 240 + i * 40);
    } else if (state.round === 1) {
      for (let i = 0; i < 5; i++) {
        backdrop.beginPath().moveTo(395 + i * 28, 300).lineTo(670, 97 + i * 26).lineTo(945 - i * 28, 300).lineTo(670, 510 - i * 20).closePath().strokePath();
      }
    } else if (state.round === 2) {
      for (let i = 0; i < 4; i++) { backdrop.strokeCircle(492, 258, 70 + i * 22); backdrop.strokeCircle(848, 258, 70 + i * 22); }
    } else if (state.round === 3) {
      for (let i = 0; i < 5; i++) backdrop.strokeCircle(670, 338, 65 + i * 38);
    } else {
      for (let i = 0; i < 5; i++) {
        const y = i * 20;
        backdrop.beginPath().moveTo(390, 190 + y).lineTo(500, 280 + y).lineTo(670, 100 + y).lineTo(840, 280 + y).lineTo(950, 190 + y).strokePath();
      }
    }
    for (const rail of board.rails) {
      backdrop.lineStyle(12, C.dark).lineBetween(rail.a.x, rail.a.y, rail.b.x, rail.b.y);
      backdrop.lineStyle(6, C.copper).lineBetween(rail.a.x, rail.a.y, rail.b.x, rail.b.y);
      backdrop.lineStyle(1, C.paper, 0.65).lineBetween(rail.a.x - 1, rail.a.y - 2, rail.b.x - 1, rail.b.y - 2);
      backdrop.fillStyle(C.paper).fillCircle(rail.a.x, rail.a.y, 3).fillCircle(rail.b.x, rail.b.y, 3);
    }
    const shield = board.shield;
    backdrop.lineStyle(13, C.dark).lineBetween(shield.a.x, shield.a.y, shield.b.x, shield.b.y);
    backdrop.lineStyle(6, C.copper).lineBetween(shield.a.x, shield.a.y, shield.b.x, shield.b.y);
    for (let i = 0; i < 8; i++) backdrop.lineStyle(1, C.dark).lineBetween(shield.a.x + i * 10, shield.a.y - 3, shield.a.x + i * 10 + 5, shield.a.y + 3);
    shieldLabel.setPosition((shield.a.x + shield.b.x) / 2, shield.a.y + 8);
    backdrop.lineStyle(2, C.copper, 0.5).strokeRoundedRect(639, 541, 62, 77, 20);
    for (let y = 580; y <= 604; y += 6) backdrop.lineStyle(1, C.copper).lineBetween(655, y, 685, y);
    backdrop.lineStyle(2, C.lime, 0.3).lineBetween(357, 624, 606, 624).lineBetween(734, 624, 985, 624);
    for (let i = 0; i < 5; i++) {
      backdrop.fillStyle(i <= state.round ? C.lime : C.blue).fillCircle(67 + i * 46, 637, 5);
    }
    bumpers.forEach((sprite, i) => {
      const item = board.bumpers[i]; sprite.setVisible(Boolean(item));
      if (item) sprite.setPosition(item.x, item.y).setDisplaySize(item.r * 2 + 20, item.r * 2 + 20);
    });
    targets.forEach((item, i) => {
      const target = board.targets[i];
      item.ring.setPosition(target.x, target.y).setScale(0.82);
      item.label.setPosition(target.x, target.y - 59).setText(PACT_NAMES[target.id]);
      item.stamp.setPosition(target.x, target.y);
    });
    drawPortrait();
  }
  function drawPortrait() {
    face.clear();
    face.fillStyle(C.dark).fillRoundedRect(-8, -8, 218, 182, 84);
    face.lineStyle(2, C.copper).strokeRoundedRect(-8, -8, 218, 182, 84);
    face.fillStyle(C.blue).fillEllipse(99, 154, 155, 37);
    const tint = [0xbcd995, 0xe3a079, 0x99c6c4, 0xd7c689, 0xc9df83][state.round];
    face.fillStyle(tint);
    if (state.round === 1) face.fillTriangle(99, 3, 17, 131, 179, 131);
    else if (state.round === 2) { face.fillEllipse(61, 83, 76, 121); face.fillEllipse(139, 83, 76, 121); }
    else face.fillRoundedRect(34, 28, 133, 116, state.round === 4 ? 22 : 56);
    face.lineStyle(4, tint).lineBetween(68, 35, 50, 6).lineBetween(135, 35, 153, 6);
    face.fillStyle(C.copper).fillCircle(50, 6, 7).fillCircle(153, 6, 7);
    if (state.round === 4) {
      face.fillStyle(C.copper).fillTriangle(45, 37, 57, -6, 85, 35).fillTriangle(83, 32, 103, -16, 122, 32).fillTriangle(119, 35, 151, -6, 160, 37);
    }
    face.fillStyle(C.paper).fillEllipse(73, 76, 33, 42).fillEllipse(128, 76, 33, 42);
    face.fillStyle(C.dark).fillCircle(78, 79, 9).fillCircle(132, 79, 9);
    face.fillStyle(C.paper).fillCircle(81, 76, 3).fillCircle(135, 76, 3);
    face.lineStyle(3, C.dark).beginPath().arc(102, 97, 19, 0.1, Math.PI - 0.1, false).strokePath();
    face.fillStyle(C.copper, 0.7).fillEllipse(54, 100, 19, 9).fillEllipse(149, 100, 19, 9);
    if (state.round === 3) face.lineStyle(4, C.copper).strokeEllipse(100, 90, 190, 42);
  }
  function setHits(hits: readonly string[]) {
    const key = hits.join(',');
    if (key === lastHits) return;
    lastHits = key;
    targets.forEach((item, i) => {
      const hit = hits.includes(board.targets[i].id);
      item.stamp.setVisible(hit); item.ring.setAlpha(hit ? 0.2 : 1);
      item.label.setColor(hit ? '#e0f780' : '#f5e6bc');
    });
  }
  function aim(shot: Shot) {
    current = { ...shot }; guide.clear();
    if (!state || playing || !controls.canShoot()) { shotLabel.setVisible(false); return; }
    shotLabel.setVisible(true).setText(drag ? '松手发射' : '拉回 · 松手');
    const angle = shot.angle * Math.PI / 180, length = 75 + shot.power * 0.8;
    const x = LAUNCH.x + Math.sin(angle) * length, y = LAUNCH.y - Math.cos(angle) * length;
    guide.lineStyle(2, shot.special ? C.lime : C.paper, 0.7).lineBetween(LAUNCH.x, LAUNCH.y, x, y);
    guide.lineStyle(1, C.copper, 0.5).strokeCircle(LAUNCH.x, LAUNCH.y, 43);
    guide.fillStyle(C.lime).fillCircle(x, y, 4);
    ball.setPosition(LAUNCH.x, LAUNCH.y).setVisible(true);
  }
  function draw(next: State) {
    state = next;
    board = next.board ?? makeBoard(next.round, { formation: 'fan', defend: 'night', intent: '展柜' }, next.seed);
    const key = `${next.seed}-${next.round}-${next.plan?.formation}-${next.plan?.defend}`;
    if (key !== boardKey) { boardKey = key; lastHits = '!'; geometry(); }
    chapter.setText(ROUNDS[next.round].name);
    hostName.setText(ROUNDS[next.round].host); hostRole.setText(ROUNDS[next.round].role);
    planName.setText(next.plan ? `${FORMATION_NAMES[next.plan.formation]} / 已锁定` : '请真实模型前来布阵');
    intent.setText(next.plan ? next.plan.intent.length > 32 ? `${next.plan.intent.slice(0, 31)}…` : next.plan.intent :
      '小使馆只有一张球台。\n五轮契约，决定月亮的归属。');
    boardNote.setText(next.phase === 'parley' ? '示意展柜 · 布阵确认前不能发射' : next.round === 4 ? '终章：三份契约全亮。铜盾只挡正面，侧面仍然开放。' : '本轮签两份契约即可 · 先撞铜轨，再碰契约，连签电荷才会生效');
    if (!playing) { setHits(next.captured); liveScore.setText(String(next.score)); }
    aim(current);
  }
  function clearEffects() {
    trail.forEach(item => item.setAlpha(0));
    sparks.forEach(item => { item.life = 0; item.image.setVisible(false); });
    railGlow.clear(); scene.tweens.killTweensOf(bumpers);
  }
  function cancel() {
    playing = null; frameIndex = 0; contactIndex = 0; drag = false; clock.reset(); guide.clear(); clearEffects();
  }
  function play(before: State, result: Result) {
    cancel(); draw(before); playing = result; frameIndex = 0; contactIndex = 0; guide.clear(); shotLabel.setVisible(false);
    ball.setPosition(LAUNCH.x, LAUNCH.y).setVisible(true);
  }
  function burst(x: number, y: number, kind: string) {
    if (reduced) return;
    for (let i = 0; i < 5; i++) {
      const item = sparks[sparkCursor++ % sparks.length], a = i * Math.PI * 0.4 + frameIndex;
      item.image.setPosition(x, y).setVisible(true).setAlpha(1).setTint(kind === 'rail' ? C.copper : C.lime);
      item.vx = Math.cos(a) * 80; item.vy = Math.sin(a) * 80; item.life = 0.32;
    }
  }
  function update(elapsed: number, delta: number) {
    if (destroyed) return;
    if (!reduced) {
      railGlow.clear().lineStyle(2, C.lime, 0.55);
      const y = 96 + ((elapsed * 0.05) % 478);
      railGlow.lineBetween(330, y, 330, y + 18).lineBetween(1010, 656 - y, 1010, 638 - y);
      for (const item of sparks) {
        if (item.life <= 0) continue;
        item.life -= delta / 1000;
        item.image.x += item.vx * delta / 1000; item.image.y += item.vy * delta / 1000;
        item.image.setAlpha(Math.max(0, item.life / 0.32)).setVisible(item.life > 0);
      }
    }
    if (!playing) return;
    clock.advance(delta, () => {
      if (!playing) return;
      frameIndex++;
      const frame = playing.frames[Math.min(frameIndex, playing.frames.length - 1)];
      ball.setPosition(frame.x, frame.y);
      if (!reduced && frameIndex % 3 === 0) {
        trail.forEach(item => item.setAlpha(item.alpha * 0.82));
        trail[trailCursor++ % trail.length].setPosition(frame.x, frame.y).setAlpha(0.6);
      }
      setHits([...new Set([...state.captured, ...frame.hits])]);
      liveScore.setText(String(state.score + frame.score));
      while (contactIndex < playing.contacts.length && playing.contacts[contactIndex].step <= frame.step) {
        const contact = playing.contacts[contactIndex++];
        burst(contact.x, contact.y, contact.kind);
        const index = board.bumpers.findIndex(item => item.id === contact.id);
        if (index >= 0 && !reduced) {
          const sprite = bumpers[index], base = (board.bumpers[index].r * 2 + 20) / 88;
          scene.tweens.killTweensOf(sprite); sprite.setScale(base);
          scene.tweens.add({ targets: sprite, scale: base * 1.13, duration: 70, yoyo: true });
        }
      }
      if (frameIndex >= playing.frames.length - 1) {
        playing = null; clock.reset(); clearEffects(); controls.complete();
      }
    });
  }
  const pointerDown = (pointer: Phaser.Input.Pointer) => {
    if (!runtime.canInteract() || !controls.canShoot() || Math.hypot(pointer.x - LAUNCH.x, pointer.y - LAUNCH.y) > 70) return;
    drag = true; aim(current);
  };
  const pointerMove = (pointer: Phaser.Input.Pointer) => {
    if (!drag || !runtime.canInteract() || !controls.canShoot()) return;
    const dx = LAUNCH.x - pointer.x, dy = pointer.y - LAUNCH.y;
    if (Math.hypot(dx, dy) < 8) return;
    controls.aim({ ...current, angle: Math.max(-70, Math.min(70, Math.round(Math.atan2(dx, Math.max(5, dy)) * 180 / Math.PI))),
      power: Math.max(60, Math.min(100, Math.round(60 + Math.hypot(dx, dy) * 0.25))) });
  };
  const pointerUp = () => {
    if (!drag) return;
    drag = false;
    if (runtime.canInteract() && controls.canShoot()) controls.fire();
  };
  const cancelDrag = () => { drag = false; aim(current); };
  tableZone.on('pointerdown', pointerDown);
  scene.input.on('pointermove', pointerMove); scene.input.on('pointerup', pointerUp);
  scene.input.on('pointerupoutside', cancelDrag); scene.input.on('gameout', cancelDrag);
  const canvas = scene.game.canvas;
  canvas.addEventListener('pointercancel', cancelDrag);
  canvas.addEventListener('lostpointercapture', cancelDrag);
  window.addEventListener('blur', cancelDrag);
  return {
    draw, aim, play, cancel, update,
    pauseChanged(value) { clock.reset(); cancelDrag(); controls.paused(value); },
    motionChanged(value) { reduced = value; clearEffects(); if (value) idleTween.pause(); else idleTween.resume(); },
    destroy() {
      destroyed = true; cancel();
      canvas.removeEventListener('pointercancel', cancelDrag); canvas.removeEventListener('lostpointercapture', cancelDrag);
      window.removeEventListener('blur', cancelDrag);
      scene.input.off('pointermove', pointerMove); scene.input.off('pointerup', pointerUp);
      scene.input.off('pointerupoutside', cancelDrag); scene.input.off('gameout', cancelDrag);
    },
  };
}
