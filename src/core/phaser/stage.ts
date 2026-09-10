import Phaser from 'phaser';
import './stage.css';
import type { WorkspaceLifecycle } from '../workspace';

interface PhaserPage extends WorkspaceLifecycle {
  report(message: string): void;
}

export interface PhaserView {
  update?(elapsedMs: number, deltaMs: number): void;
  pauseChanged?(paused: boolean): void;
  motionChanged?(reduced: boolean): void;
  destroy?(): void;
}

export interface PhaserRuntime {
  readonly width: number;
  readonly height: number;
  readonly reducedMotion: boolean;
  canInteract(): boolean;
}

interface StageOptions<V extends PhaserView> {
  host: HTMLElement;
  label: string;
  width?: number;
  height?: number;
  background?: string;
  renderer?: 'auto' | 'canvas' | 'webgl';
  create(scene: Phaser.Scene, runtime: PhaserRuntime): V;
  report?(message: string): void;
}

export interface PhaserStage<V extends PhaserView> {
  readonly game: Phaser.Game;
  readonly scene: Phaser.Scene;
  readonly view: V;
  readonly canvas: HTMLCanvasElement;
  readonly paused: boolean;
  canInteract(): boolean;
  setPaused(value: boolean): void;
  metrics(): { updates: number; elapsedMs: number; objects: number; textures: number; tweens: number; renderer: string };
  destroy(): void;
}

function displayObjectCount(objects: readonly Phaser.GameObjects.GameObject[]): number {
  let count = 0;
  for (const object of objects) {
    count++;
    if (object instanceof Phaser.GameObjects.Container) count += displayObjectCount(object.list);
  }
  return count;
}

export function createPhaserStage<V extends PhaserView>(
  page: PhaserPage, options: StageOptions<V>,
): Promise<PhaserStage<V>> {
  page.signal.throwIfAborted();
  const width = options.width ?? 960, height = options.height ?? 640;
  if (![width, height].every(value => Number.isInteger(value) && value >= 160 && value <= 1920)) {
    throw new Error('Phaser scene dimensions must be integers from 160 to 1920.');
  }
  const host = options.host;
  host.classList.add('phaser-stage');
  host.dataset.phaserReady = 'false';
  host.dataset.phaserVersion = Phaser.VERSION;
  const scope = new AbortController();
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let game: Phaser.Game | undefined, view: V | undefined;
  let disposed = false, destroyed = false, destroying = false, explicitPause = false, paused = false;
  let initialized = false, settled = false, elapsedMs = 0, updates = 0;
  let resolveReady!: (stage: PhaserStage<V>) => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<PhaserStage<V>>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const runtime: PhaserRuntime = {
    width, height,
    get reducedMotion() { return motion.matches; },
    canInteract: () => !disposed && !explicitPause && !document.hidden && !document.querySelector('dialog:modal'),
  };
  function syncPause() {
    if (!initialized || disposed) return;
    const next = explicitPause || document.hidden || Boolean(document.querySelector('dialog:modal'));
    if (next === paused) return;
    paused = next;
    if (paused) {
      scene.scene.pause();
      scene.game.pause();
    } else {
      scene.game.resume();
      scene.scene.resume();
    }
    view?.pauseChanged?.(paused);
    host.dataset.phaserPaused = String(paused);
  }
  function finishDestroy() {
    if (!game || destroyed || destroying) return;
    if (!game.isRunning) {
      game.events.once(Phaser.Core.Events.READY, () => queueMicrotask(finishDestroy));
      return;
    }
    destroying = true;
    game.events.once(Phaser.Core.Events.DESTROY, () => {
      destroyed = true;
      host.dataset.phaserDestroyed = 'true';
    });
    game.destroy(true, false);
    // Phaser normally destroys on its next frame; hidden documents may never receive one.
    queueMicrotask(() => { if (!destroyed && game) game.step(performance.now(), 0); });
  }
  function destroy() {
    if (disposed) return;
    disposed = true;
    clearTimeout(bootTimer);
    observer.disconnect();
    resize.disconnect();
    scope.abort();
    try { view?.destroy?.(); }
    finally { finishDestroy(); }
    if (!settled) {
      settled = true;
      rejectReady(new DOMException('Phaser page disposed before becoming ready.', 'AbortError'));
    }
  }
  class MainScene extends Phaser.Scene {
    constructor() { super('main'); }
    create() {
      if (disposed) { finishDestroy(); return; }
      try {
        view = options.create(this, runtime);
        initialized = true;
        this.game.canvas.tabIndex = 0;
        this.game.canvas.setAttribute('role', 'img');
        this.game.canvas.setAttribute('aria-label', options.label);
        this.game.canvas.addEventListener('pointerdown', () => {
          if (runtime.canInteract()) this.game.canvas.focus({ preventScroll: true });
        }, { signal: scope.signal });
        this.game.canvas.addEventListener('webglcontextlost', event => {
          event.preventDefault();
          explicitPause = true; syncPause();
          (options.report ?? page.report)('画面连接已中断，游戏已暂停。请保存已完成的局程后刷新页面。');
        }, { signal: scope.signal });
        clearTimeout(bootTimer);
        host.dataset.phaserReady = 'true';
        host.dataset.phaserPaused = 'false';
        syncPause();
        settled = true;
        resolveReady({
          game: this.game, scene: this, view, canvas: this.game.canvas,
          get paused() { return paused; },
          canInteract: runtime.canInteract,
          setPaused(value) { explicitPause = value; syncPause(); },
          metrics: () => ({
            updates, elapsedMs, objects: displayObjectCount(this.children.getAll()),
            textures: this.game.textures.getTextureKeys().length,
            tweens: this.tweens.getTweens().length,
            renderer: this.game.renderer.type === Phaser.CANVAS ? 'canvas' : 'webgl',
          }),
          destroy,
        });
      } catch (error) {
        if (!settled) { settled = true; rejectReady(error); }
        destroy();
      }
    }
    update(_time: number, delta: number) {
      syncPause();
      if (disposed || paused) return;
      const step = Math.max(0, Math.min(delta, 100));
      elapsedMs += step; updates++;
      view?.update?.(elapsedMs, step);
    }
  }
  const scene = new MainScene();
  const observer = new MutationObserver(syncPause);
  observer.observe(document.body, { attributes: true, attributeFilter: ['open'], childList: true, subtree: true });
  const resize = new ResizeObserver(() => {
    if (game?.isRunning && !disposed) game.scale.refresh();
  });
  resize.observe(host);
  const bootTimer = setTimeout(() => {
    if (settled || disposed) return;
    settled = true;
    rejectReady(new Error('Phaser 画面未能在规定时间内启动，请刷新或更换支持 WebGL/Canvas 的浏览器。'));
    destroy();
  }, 15_000);
  document.addEventListener('visibilitychange', syncPause, { signal: scope.signal });
  document.addEventListener('close', syncPause, { capture: true, signal: scope.signal });
  motion.addEventListener('change', () => view?.motionChanged?.(motion.matches), { signal: scope.signal });
  page.onCleanup(destroy);
  try {
    game = new Phaser.Game({
      type: options.renderer === 'canvas' ? Phaser.CANVAS : options.renderer === 'webgl' ? Phaser.WEBGL : Phaser.AUTO,
      parent: host, width, height, scene, banner: false, autoFocus: false,
      backgroundColor: options.background ?? '#18222b',
      audio: { noAudio: true },
      input: { keyboard: false, gamepad: false, activePointers: 2 },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, expandParent: false, width, height },
      fps: { target: 60, smoothStep: false },
      render: { antialias: true, roundPixels: false, maxTextures: 8, powerPreference: 'default' },
    });
    if (disposed) finishDestroy();
  } catch (error) {
    if (!settled) { settled = true; rejectReady(error); }
    destroy();
  }
  return ready;
}
