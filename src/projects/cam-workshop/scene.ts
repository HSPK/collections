import { canvas2D } from '../../core/canvas';
import { query } from '../../core/page';
import { DEFAULT_SETTINGS, LAWS } from './data';
import type { CamSettings, LawId } from './data';
import { boundaryValues, derivativePeaks, motionSegments, profilePoint, sampleCurves, sampleMotion, sampleProfile, wrapDegrees } from './engine';
import type { MotionPoint, ProfilePoint } from './engine';

type Metric = 's' | 'velocity' | 'acceleration';
const METRICS: Metric[] = ['s', 'velocity', 'acceleration'];
const LABELS = {
  s: 'Displacement in normalized length units against cam angle in degrees',
  velocity: 'Displacement derivative ds/dθ, length units per radian, against cam angle in degrees',
  acceleration: 'Second displacement derivative d²s/dθ², length units per radian squared, against cam angle in degrees; discontinuities are not joined',
};

export function sceneMarkup(id: string): string {
  return `
    <svg class="cw-machine-svg" viewBox="0 0 520 480" role="img" aria-labelledby="${id}-drawing-title ${id}-drawing-desc">
      <title id="${id}-drawing-title">A radial cam with a translating knife-edge follower</title>
      <desc id="${id}-drawing-desc" data-cw-description>The coral cam rotates counterclockwise. A pointed blade in a fixed guide follows its upper surface exactly.</desc>
      <defs>
        <linearGradient id="${id}-cam" x1="0" y1="0" x2=".8" y2="1">
          <stop stop-color="#f6bd9c"/><stop offset=".55" stop-color="#e7977b"/><stop offset="1" stop-color="#d57b66"/>
        </linearGradient>
        <linearGradient id="${id}-steel">
          <stop stop-color="#786674"/><stop offset=".35" stop-color="#f6eee5"/><stop offset=".6" stop-color="#c8b9bd"/><stop offset="1" stop-color="#776171"/>
        </linearGradient>
      </defs>
      <path d="M28 36h16m-8-8v16M476 444h16m-8-8v16M28 444h16m-8-8v16" fill="none" stroke="#b3a298" stroke-width="1"/>
      <g data-cw-coordinate-frame transform="translate(260 286) scale(60)">
        <path d="M0 -4.7V2.9M-3.6 0H3.6" stroke="#b3a59e" stroke-width=".018" stroke-dasharray=".055 .09"/>
        <path data-cw-dial fill="none" stroke="#b7a49b" stroke-width=".018"/>
        <path d="M-3.2 -.1A3.2 3.2 0 0 0 -2.06 2.45m0 0-.28-.04m.28.04-.09-.27"
          fill="none" stroke="#765269" stroke-width=".028" stroke-linecap="round"/>
        <g data-cw-rotor>
          <path data-cw-profile fill="url(#${id}-cam)" stroke="#6c3f51" stroke-width=".035" stroke-linejoin="round"/>
          <circle r=".66" fill="none" stroke="#9c5b59" stroke-width=".012"/>
          <circle r=".60" fill="none" stroke="#f8c9ae" stroke-width=".022"/>
          <path data-cw-zero-mark fill="none" stroke="#925965" stroke-width=".024" stroke-dasharray=".07 .06"/>
          <g data-cw-bolts fill="#8b5360" stroke="#f1b596" stroke-width=".028">
            <circle r=".085"/><circle r=".085"/><circle r=".085"/>
          </g>
        </g>
        <circle data-cw-base-circle fill="none" stroke="#744a65" stroke-width=".020" stroke-dasharray=".085 .07"/>
        <path data-cw-base-line fill="none" stroke="#744a65" stroke-width=".020"/>
        <path data-cw-datum fill="none" stroke="#8d786e" stroke-width=".016" stroke-dasharray=".07 .07"/>
        <path data-cw-contact-guide fill="none" stroke="#b65c49" stroke-width=".019" stroke-dasharray=".075 .065"/>
        <path data-cw-lift-line fill="none" stroke="#b65c49" stroke-width=".025"/>
        <g data-cw-follower>
          <path data-cw-blade d="M-.075 -4.5H.075V-.36L.15-.30L0 0L-.15-.30L-.075-.36Z"
            fill="url(#${id}-steel)" stroke="#4c3145" stroke-width=".030" stroke-linejoin="miter"/>
          <path d="M-.02 -4.5V-.44" fill="none" stroke="#fff8eb" stroke-width=".023"/>
        </g>
        <g data-cw-fixed-guide fill="#5c4054" stroke="#392c3a" stroke-width=".024">
          <rect x="-.51" y="-3.85" width=".34" height=".64" rx=".05"/>
          <rect x=".17" y="-3.85" width=".34" height=".64" rx=".05"/>
          <path d="M-.50 -3.77H-.20M.20 -3.77H.50" stroke="#a68d9e"/>
          <circle cx="-.34" cy="-3.48" r=".065" fill="#ccbbb7"/>
          <circle cx=".34" cy="-3.48" r=".065" fill="#ccbbb7"/>
          <path d="M-.38 -3.48h.08m.60 0h.08" stroke-width=".016"/>
        </g>
        <path d="M.55 -3.49H1.4l.20-.2M-.22 -2.95H-1.23l-.18-.18"
          fill="none" stroke="#8d786e" stroke-width=".018"/>
        <circle r=".32" fill="#d4b2a0" stroke="#664452" stroke-width=".028"/>
        <circle r=".23" fill="#513247" stroke="#f0c5ad" stroke-width=".025"/>
        <circle r=".085" fill="#c09a9b"/>
        <path d="M-.12 .12.12-.12" stroke="#edc3b0" stroke-width=".025"/>
      </g>
    </svg>`;
}

function plotNumber(value: number): string {
  if (Math.abs(value) < 1e-10) return '0';
  return Math.abs(value) >= 100 ? value.toExponential(0) : value.toFixed(Math.abs(value) < 1 ? 2 : 1);
}

export function createScene(root: HTMLElement, signal: AbortSignal) {
  const rotor = query<SVGGElement>(root, '[data-cw-rotor]');
  const profile = query<SVGPathElement>(root, '[data-cw-profile]');
  const follower = query<SVGGElement>(root, '[data-cw-follower]');
  const description = query<SVGDescElement>(root, '[data-cw-description]');
  const baseCircle = query<SVGCircleElement>(root, '[data-cw-base-circle]');
  const baseLine = query<SVGPathElement>(root, '[data-cw-base-line]');
  const datum = query<SVGPathElement>(root, '[data-cw-datum]');
  const contactGuide = query<SVGPathElement>(root, '[data-cw-contact-guide]');
  const liftLine = query<SVGPathElement>(root, '[data-cw-lift-line]');
  const dial = query<SVGPathElement>(root, '[data-cw-dial]');
  const zeroMark = query<SVGPathElement>(root, '[data-cw-zero-mark]');
  const bolts = root.querySelectorAll<SVGCircleElement>('[data-cw-bolts] circle');
  const plots: (ReturnType<typeof canvas2D> & { metric: Metric })[] = [];
  try {
    for (const metric of METRICS) {
      const plot = canvas2D(query<HTMLElement>(root, `[data-cw-plot="${metric}"]`), LABELS[metric]);
      plot.canvas.dataset.cwChart = metric;
      plots.push({ ...plot, metric });
    }
  } catch (error) {
    for (const plot of plots) plot.dispose();
    throw error;
  }
  let settings: CamSettings = { ...DEFAULT_SETTINGS };
  let angle = 0;
  let comparison = true;
  let disposed = false;
  let vertices: ProfilePoint[] = [];
  let commands: string[] = [];
  let staticPath = '';
  let curves = new Map<LawId, MotionPoint[][]>();

  function contactPath(theta: number): string {
    const phase = wrapDegrees(theta);
    const index = vertices.findIndex((point) => point.angle >= phase);
    if (vertices[index]?.angle === phase) return staticPath;
    const point = profilePoint(settings, phase);
    // Insert the analytic contact vertex, rather than letting a polygon chord
    // approximate the follower's intersection with the actually displayed path.
    return `M${commands.slice(0, index).join('L')}L${point.x} ${point.y}L${commands.slice(index).join('L')}Z`;
  }

  function drawPlot(plot: typeof plots[number]) {
    if (disposed) return;
    const { context: ctx, size, metric } = plot;
    const { width, height } = size;
    if (width < 2 || height < 2) return;
    const left = 49;
    const right = width - 12;
    const top = 10;
    const bottom = height - 25;
    const peak = derivativePeaks(settings, 'cycloidal');
    const extent = metric === 's' ? settings.lift : peak[metric];
    const minimum = metric === 's' ? 0 : -extent;
    const x = (theta: number) => left + theta / 360 * (right - left);
    const y = (value: number) => bottom - (value - minimum) / (extent - minimum) * (bottom - top);
    const state = sampleMotion(settings, angle);
    ctx.fillStyle = '#fffbf6';
    ctx.fillRect(0, 0, width, height);

    for (const segment of motionSegments(settings)) {
      if (!segment.duration) continue;
      ctx.fillStyle = segment.id === state.segment ? '#ece2e7' : '#f5eee9';
      ctx.globalAlpha = segment.id === state.segment ? 0.85 : segment.id === 'high' || segment.id === 'low' ? 0.5 : 0;
      ctx.fillRect(x(segment.start), top, x(segment.start + segment.duration) - x(segment.start), bottom - top);
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeStyle = '#e9ddd8';
    ctx.font = '12px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.fillStyle = '#796571';
    ctx.textBaseline = 'middle';
    for (const tick of metric === 's' ? [0, extent] : [-extent, 0, extent]) {
      ctx.beginPath();
      ctx.moveTo(left, y(tick));
      ctx.lineTo(right, y(tick));
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(plotNumber(tick), left - 7, y(tick));
    }
    ctx.textBaseline = 'alphabetic';
    for (const tick of [0, 90, 180, 270, 360]) {
      ctx.beginPath();
      ctx.moveTo(x(tick), top);
      ctx.lineTo(x(tick), bottom + 3);
      ctx.stroke();
      ctx.textAlign = tick === 0 ? 'left' : tick === 360 ? 'right' : 'center';
      ctx.fillText(`${tick}°`, x(tick), height - 5);
    }

    const laws = [...LAWS].sort((a, b) => Number(a.id === settings.law) - Number(b.id === settings.law));
    for (const law of laws) {
      const selected = law.id === settings.law;
      if (!selected && !comparison) continue;
      ctx.strokeStyle = law.color;
      ctx.globalAlpha = selected ? 1 : 0.65;
      ctx.lineWidth = selected ? 2.5 : 1.45;
      ctx.setLineDash(selected ? [] : law.id === 'harmonic' ? [5, 4] : [2, 4]);
      // Separate paths preserve each one-sided acceleration limit. No spline
      // or connector bridges a dwell edge.
      for (const segment of curves.get(law.id)!) {
        ctx.beginPath();
        segment.forEach((point, index) => {
          if (index === 0) ctx.moveTo(x(point.angle), y(point[metric]));
          else ctx.lineTo(x(point.angle), y(point[metric]));
        });
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    const selected = LAWS.find((law) => law.id === settings.law)!;
    if (metric === 'acceleration') {
      for (const edge of [...motionSegments(settings).map((part) => part.start), 360]) {
        const boundary = boundaryValues(settings, edge);
        if (!boundary?.accelerationJump) continue;
        for (const [value, filled] of [[boundary.left.acceleration, false], [boundary.right.acceleration, true]] as const) {
          ctx.beginPath();
          ctx.arc(x(edge), y(value), 3, 0, Math.PI * 2);
          ctx.fillStyle = filled ? selected.color : '#fffbf6';
          ctx.fill();
          ctx.strokeStyle = selected.color;
          ctx.lineWidth = 1.3;
          ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = '#50394c';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x(angle), top - 5);
    ctx.lineTo(x(angle), bottom + 3);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x(angle), y(state[metric]), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = selected.color;
    ctx.fill();
    ctx.strokeStyle = '#fffbf6';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    plot.canvas.dataset.law = settings.law;
    plot.canvas.dataset.comparison = String(comparison);
  }

  function draw(nextAngle: number) {
    if (disposed) return;
    angle = nextAngle;
    const motion = sampleMotion(settings, angle);
    const contactY = -(settings.base + motion.s);
    profile.setAttribute('d', contactPath(angle));
    rotor.setAttribute('transform', `rotate(${-angle})`);
    follower.setAttribute('transform', `translate(0 ${contactY})`);
    contactGuide.setAttribute('d', `M.2 ${contactY}H3.22`);
    liftLine.setAttribute('d', `M3.02 ${-settings.base}V${contactY}M2.93 ${-settings.base}H3.11M2.93 ${contactY}H3.11`);
    description.textContent = `Counterclockwise cam angle ${angle.toFixed(1)} degrees. ${settings.law} law; ${motion.segment} segment. The knife edge touches the profile at x = 0, y = −${(settings.base + motion.s).toFixed(4)} length units relative to the shaft.`;
    for (const plot of plots) drawPlot(plot);
  }

  function configure(nextSettings: CamSettings, showComparison: boolean) {
    if (disposed) return;
    settings = { ...nextSettings };
    comparison = showComparison;
    vertices = sampleProfile(settings);
    commands = vertices.map((point) => `${point.x} ${point.y}`);
    staticPath = `M${commands.join('L')}Z`;
    curves = new Map(LAWS.map((law) => [law.id, sampleCurves({ ...settings, law: law.id })]));
    baseCircle.setAttribute('r', String(settings.base));
    baseLine.setAttribute('d', `M0 0H${-settings.base}M${-settings.base} -.07V.07`);
    datum.setAttribute('d', `M-2.2 ${-settings.base}H3.28`);
    zeroMark.setAttribute('d', `M0 -.34V${-settings.base + 0.10}`);
    bolts.forEach((bolt, i) => {
      const phi = (i * 120 + 90) * Math.PI / 180;
      bolt.setAttribute('cx', String(Math.cos(phi) * settings.base * 0.62));
      bolt.setAttribute('cy', String(Math.sin(phi) * settings.base * 0.62));
    });
    const radius = settings.base + settings.lift + 0.17;
    dial.setAttribute('d', Array.from({ length: 72 }, (_, i) => {
      const phi = i / 72 * Math.PI * 2;
      const inner = radius - (i % 6 === 0 ? 0.10 : 0.045);
      return `M${Math.sin(phi) * inner} ${Math.cos(phi) * inner}L${Math.sin(phi) * radius} ${Math.cos(phi) * radius}`;
    }).join(''));
    draw(angle);
  }

  plots.forEach((plot) => plot.canvas.addEventListener('canvasresize', () => drawPlot(plot), { signal }));

  return {
    configure,
    draw,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const plot of plots) plot.dispose();
      curves.clear();
      vertices = [];
      commands = [];
    },
  };
}
