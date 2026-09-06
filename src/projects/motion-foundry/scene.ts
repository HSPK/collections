import { escapeMarkup, query } from '../../core/page';
import type { Lesson, LessonId } from './data';
import { sampleMotion } from './model';
import type { MotionFrame, MotionParameters, MotionPose } from './model';

type Side = 'plain' | 'expressive';
const START = 88;
const DISTANCE = 242;
const FLOOR = 205;
const RADIUS = 31;
const TAB_OFFSETS = [35, 66];

function point(pose: MotionPose): { x: number; y: number } {
  return {
    x: START + DISTANCE * pose.x,
    y: FLOOR - RADIUS * pose.scaleY - pose.lift,
  };
}

function transform(pose: MotionPose): string {
  const position = point(pose);
  return `translate(${position.x.toFixed(3)} ${position.y.toFixed(3)}) scale(${pose.scaleX.toFixed(5)} ${pose.scaleY.toFixed(5)})`;
}

export function sceneMarkup(side: Side): string {
  return `
    <figure class="mf-scene mf-scene--${side}" data-mf-scene="${side}">
      <header class="mf-scene-heading"><h3>${side === 'plain' ? 'Plain' : 'Expressive'}</h3><span aria-hidden="true">${side === 'plain' ? 'A' : 'B'}</span></header>
      <svg class="mf-scene-svg" viewBox="0 0 440 248" role="img" aria-labelledby="mf-${side}-title mf-${side}-description">
        <title id="mf-${side}-title"></title>
        <desc id="mf-${side}-description"></desc>
        <path class="mf-floor" d="M18 205H422" />
        <g class="mf-guide-layer">
          <path class="mf-end-marks" d="M88 58V210M330 58V210" />
          <circle class="mf-destination" cx="330" cy="174" r="31" />
          <path class="mf-route" data-mf-route />
          <g data-mf-ghosts></g>
        </g>
        <g data-mf-tabs visibility="hidden">
          <path class="mf-connector" data-mf-connector />
          <circle class="mf-tab" data-mf-tab="0" r="13" />
          <circle class="mf-tab" data-mf-tab="1" r="10" />
        </g>
        <g class="mf-puck" data-mf-puck>
          <circle class="mf-puck-disc" r="31" />
          <path class="mf-puck-mark" d="M-10 -7h6v13h-6zm14 0h6v13H4z" />
        </g>
        <g class="mf-axis-labels" aria-hidden="true"><text x="88" y="236" text-anchor="middle">0%</text><text x="330" y="236" text-anchor="middle">100%</text></g>
      </svg>
      <figcaption><span data-mf-caption></span><strong data-mf-metric></strong></figcaption>
    </figure>`;
}

function metric(lesson: LessonId, pose: MotionPose): string {
  switch (lesson) {
    case 'squash-stretch':
      return `Width ${pose.scaleX.toFixed(2)} × height ${pose.scaleY.toFixed(2)}`;
    case 'arcs':
      return `Rise ${Math.round(pose.lift)} guide units`;
    case 'follow-through':
      return `Lead ${Math.round(pose.x * 100)}% · tip ${Math.round(pose.followers[1].x * 100)}%`;
    default:
      return `Position ${Math.round(pose.x * 100)}%`;
  }
}

export function createScene(root: HTMLElement, side: Side) {
  const figure = query<HTMLElement>(root, `[data-mf-scene="${side}"]`);
  const puck = query<SVGGElement>(figure, '[data-mf-puck]');
  const ghosts = query<SVGGElement>(figure, '[data-mf-ghosts]');
  const route = query<SVGPathElement>(figure, '[data-mf-route]');
  const tabs = query<SVGGElement>(figure, '[data-mf-tabs]');
  const connector = query<SVGPathElement>(figure, '[data-mf-connector]');
  const tabCircles = Array.from(figure.querySelectorAll<SVGCircleElement>('[data-mf-tab]'));
  const title = query<SVGTitleElement>(figure, 'title');
  const description = query<SVGDescElement>(figure, 'desc');
  const caption = query<HTMLElement>(figure, '[data-mf-caption]');
  const readout = query<HTMLElement>(figure, '[data-mf-metric]');
  let lesson: Lesson;

  function configure(next: Lesson, parameters: MotionParameters) {
    lesson = next;
    title.textContent = `${side === 'plain' ? 'Plain' : 'Expressive'}: ${lesson.title}`;
    caption.textContent = side === 'plain' ? lesson.plainLabel : lesson.expressiveLabel;
    const samples = Array.from({ length: 81 }, (_, index) =>
      sampleMotion(lesson.id, parameters.duration * index / 80, parameters)[side]);
    route.setAttribute('d', samples.map((sample, index) => {
      const p = point(sample);
      return `${index ? 'L' : 'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
    }).join(' '));
    ghosts.innerHTML = Array.from({ length: 7 }, (_, index) => {
      const progress = (index + 1) / 8;
      const sample = sampleMotion(lesson.id, parameters.duration * progress, parameters)[side];
      const body = `<ellipse class="mf-ghost" cx="0" cy="0" rx="${RADIUS}" ry="${RADIUS}" transform="${transform(sample)}" />`;
      const tail = sample.followers.map((tab, tabIndex) =>
        `<circle class="mf-ghost mf-ghost--tab" cx="${(START + DISTANCE * tab.x - TAB_OFFSETS[tabIndex]).toFixed(3)}" cy="174" r="${tabIndex ? 10 : 13}" />`).join('');
      return body + tail;
    }).join('');
    figure.dataset.lesson = lesson.id;
  }

  function draw(frame: MotionFrame) {
    const sample = frame[side];
    puck.setAttribute('transform', transform(sample));
    const hasTabs = sample.followers.length > 0;
    tabs.setAttribute('visibility', hasTabs ? 'visible' : 'hidden');
    if (hasTabs) {
      const head = point(sample);
      const points = sample.followers.map((tab, index) => ({
        x: START + DISTANCE * tab.x - TAB_OFFSETS[index],
        y: head.y,
      }));
      connector.setAttribute('d', `M${head.x.toFixed(3)} ${head.y.toFixed(3)} ${points.map((p) => `L${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(' ')}`);
      points.forEach((p, index) => {
        tabCircles[index].setAttribute('cx', p.x.toFixed(3));
        tabCircles[index].setAttribute('cy', p.y.toFixed(3));
      });
    }
    const reading = metric(lesson.id, sample);
    if (readout.textContent !== reading) {
      readout.textContent = reading;
    }
    const guideDescription = root.classList.contains('mf-guides-hidden')
      ? 'Motion guides are hidden.'
      : 'Dashed line: the center route. Outlines: poses at equal time intervals across the whole clip.';
    const accessibleDescription = `${caption.textContent}. ${reading}. ${guideDescription}`;
    if (description.textContent !== accessibleDescription) description.textContent = accessibleDescription;
    figure.dataset.position = sample.x.toFixed(6);
  }

  return { configure, draw };
}

export function lessonButtonMarkup(lesson: Lesson, index: number): string {
  return `<button class="mf-lesson-button" type="button" data-mf-lesson="${lesson.id}" aria-pressed="${index === 0}" aria-controls="mf-comparison mf-lesson-notes"><span class="mf-lesson-number">${String(index + 1).padStart(2, '0')}</span><span>${escapeMarkup(lesson.shortTitle)}</span></button>`;
}
