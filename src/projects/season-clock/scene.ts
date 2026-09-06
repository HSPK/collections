import type { Crown, Landscape, Tree } from './data';
import { branchAngle, makeLeaves, mixColor, sampleLeaf, sampleYear, smooth } from './timeline';
import type { Leaf, YearFrame } from './timeline';

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
const n = (value: number) => Number(value.toFixed(3)).toString();

function svgNode<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
  parent?: SVGElement,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  parent?.append(element);
  return element;
}

function attr(element: SVGElement, name: string, value: string | number) {
  const next = typeof value === 'number' ? n(value) : value;
  if (element.getAttribute(name) !== next) element.setAttribute(name, next);
}

function cloudCrown({ x, y, rx, ry }: Crown): string {
  return `M${n(x - rx)} ${n(y + ry * 0.17)}
    C${n(x - rx * 1.13)} ${n(y - ry * 0.38)} ${n(x - rx * 0.62)} ${n(y - ry * 0.9)} ${n(x - rx * 0.29)} ${n(y - ry * 0.77)}
    C${n(x - rx * 0.02)} ${n(y - ry * 1.21)} ${n(x + rx * 0.63)} ${n(y - ry * 1.03)} ${n(x + rx * 0.7)} ${n(y - ry * 0.51)}
    C${n(x + rx * 1.21)} ${n(y - ry * 0.36)} ${n(x + rx * 1.09)} ${n(y + ry * 0.34)} ${n(x + rx * 0.66)} ${n(y + ry * 0.62)}
    C${n(x + rx * 0.31)} ${n(y + ry * 1.13)} ${n(x - rx * 0.21)} ${n(y + ry * 0.84)} ${n(x - rx * 0.35)} ${n(y + ry * 0.68)}
    C${n(x - rx * 0.86)} ${n(y + ry * 0.96)} ${n(x - rx * 1.1)} ${n(y + ry * 0.54)} ${n(x - rx)} ${n(y + ry * 0.17)}Z`;
}

const leafPaths = {
  lance: 'M-1 0 Q-.2-.52 1 0 Q-.1 .52-1 0Z',
  oval: 'M-1 0 C-.65-.75 .5-.85 1 0 C.4 .78-.65 .8-1 0Z',
  spade: 'M-.9 0 Q-1-.55-.25-.65 L.35-.9 L1 0 Q.15 .8-.9 0Z',
};
const flowerPath = Array.from({ length: 5 }, (_, index) => {
  const x = Math.sin(index * TAU / 5) * 0.6;
  const y = Math.cos(index * TAU / 5) * 0.6;
  return `M${n(x - 0.48)} ${n(y)}a.48 .48 0 1 0 .96 0a.48 .48 0 1 0-.96 0`;
}).join(' ');

interface DrawnLeaf {
  seed: Leaf;
  leaf: SVGPathElement;
  blossom?: SVGPathElement;
  fruit?: SVGPathElement;
}

interface DrawnTree {
  spec: Tree;
  index: number;
  branches: SVGGElement;
  crowns: SVGPathElement[];
  veils: SVGPathElement[];
  crownBack: SVGGElement;
  crownFront: SVGGElement;
  snow: SVGGElement;
  shadow: SVGEllipseElement;
  leaves: DrawnLeaf[];
}

export function createSeasonScene(host: HTMLElement, landscape: Landscape) {
  const svg = svgNode('svg', {
    xmlns: NS,
    width: 1100,
    height: 620,
    viewBox: '0 0 1100 620',
    role: 'img',
    'aria-labelledby': 'season-clock-scene-title season-clock-scene-description',
    'data-season-scene': landscape.id,
  });
  const title = svgNode('title', { id: 'season-clock-scene-title' }, svg);
  const description = svgNode('desc', { id: 'season-clock-scene-description' }, svg);
  const defs = svgNode('defs', {}, svg);
  const skyGradient = svgNode('linearGradient', { id: 'season-clock-sky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  const skyTop = svgNode('stop', { offset: 0 }, skyGradient);
  const skyBottom = svgNode('stop', { offset: 1 }, skyGradient);
  const halo = svgNode('radialGradient', { id: 'season-clock-halo' }, defs);
  svgNode('stop', { offset: 0, 'stop-color': '#fff4d4', 'stop-opacity': 0.72 }, halo);
  svgNode('stop', { offset: 1, 'stop-color': '#fff4d4', 'stop-opacity': 0 }, halo);
  const texture = svgNode('pattern', { id: 'season-clock-paper', width: 38, height: 38, patternUnits: 'userSpaceOnUse' }, defs);
  svgNode('circle', { cx: 5, cy: 8, r: 0.7, fill: '#34543c', opacity: 0.09 }, texture);
  svgNode('circle', { cx: 25, cy: 27, r: 0.6, fill: '#fffdf0', opacity: 0.26 }, texture);
  const clip = svgNode('clipPath', { id: 'season-clock-bounds' }, defs);
  svgNode('rect', { width: 1100, height: 620 }, clip);
  const drawing = svgNode('g', { 'clip-path': 'url(#season-clock-bounds)' }, svg);
  svgNode('rect', { width: 1100, height: 620, fill: 'url(#season-clock-sky)' }, drawing);
  const sun = svgNode('g', {}, drawing);
  svgNode('circle', { r: 100, fill: 'url(#season-clock-halo)' }, sun);
  const sunDisc = svgNode('circle', { r: 42, fill: '#fff5cc' }, sun);
  svgNode('circle', { r: 53, fill: 'none', stroke: '#f9f3d8', 'stroke-width': 1, opacity: 0.75 }, sun);

  const clouds = [
    'M90 228 H153 Q171 207 199 219 Q215 194 244 220 H287',
    'M715 89 H752 Q771 70 791 84 H832',
    'M903 252 H943 Q957 233 978 245 Q997 224 1022 245 H1062',
    'M34 279 H83 M303 125 H368',
  ].map((path) => svgNode('path', {
    d: path, fill: 'none', stroke: '#f9faeb', 'stroke-width': 8, 'stroke-linecap': 'round', opacity: 0.63,
  }, drawing));

  const hills = landscape.hills.map((path) => svgNode('path', { d: path }, drawing));
  // Place the far ridge and its snow before the nearer hills.
  const ridgeSnow = svgNode('g', { fill: '#edf0e2' });
  if (landscape.terrain === 'mountain') {
    svgNode('path', { d: 'M294 223 L387 137 L484 224 L432 199 L409 214 L386 181 L358 207 L341 196Z' }, ridgeSnow);
    svgNode('path', { d: 'M906 246 L964 194 L1021 241 L985 229 L967 218 L947 238Z' }, ridgeSnow);
    svgNode('path', { d: 'M631 256 L678 208 L726 254 L689 239 L676 230 L659 250Z' }, ridgeSnow);
  }
  drawing.insertBefore(ridgeSnow, hills[1]);

  const fieldDetails = svgNode('g', { fill: 'none', 'stroke-width': 2 }, drawing);
  let river: SVGPathElement | undefined;
  const ripples: SVGPathElement[] = [];
  if (landscape.terrain === 'river') {
    const riverPath = 'M322 377 C427 408 550 422 475 454 C393 486 243 500 289 537 C354 574 462 581 427 620 H194 C220 581 263 578 192 557 C83 529 192 483 338 457 C440 433 369 409 287 391Z';
    river = svgNode('path', { d: riverPath }, drawing);
    const riverClip = svgNode('clipPath', { id: 'season-clock-river' }, defs);
    svgNode('path', { d: riverPath }, riverClip);
    const waterLines = svgNode('g', {
      'clip-path': 'url(#season-clock-river)', fill: 'none', stroke: '#eff4df', 'stroke-width': 2, opacity: 0.64,
    }, drawing);
    for (let i = 0; i < 19; i += 1) {
      const y = 408 + i * 12;
      ripples.push(svgNode('path', { d: `M${150 + (i % 4) * 47} ${y}h${74 + (i % 3) * 31}` }, waterLines));
    }
    svgNode('path', { d: 'M80 477 Q143 455 220 463 M493 480 Q540 466 591 471 M880 466 Q967 464 1037 486' }, fieldDetails);
  } else if (landscape.terrain === 'orchard') {
    for (let i = 0; i < 6; i += 1) {
      svgNode('path', { d: `M-20 ${521 + i * 24} C251 ${570 + i * 18} 468 ${442 + i * 24} 708 ${492 + i * 22} S993 ${510 + i * 24} 1130 ${453 + i * 24}` }, fieldDetails);
    }
    const cottage = svgNode('g', { transform: 'translate(107 382)' }, drawing);
    svgNode('path', { d: 'M0 0 V-23 H35 V0Z', fill: '#e8dfb9' }, cottage);
    svgNode('path', { d: 'M-6-23 18-42 42-23Z', fill: '#a77b62' }, cottage);
    svgNode('path', { d: 'M14 0 V-15 H23 V0Z', fill: '#65765b' }, cottage);
    svgNode('path', { d: 'M-75 6 Q-22-1 64 4', fill: 'none', stroke: '#849c76', 'stroke-width': 3 }, cottage);
  } else {
    svgNode('path', { d: 'M28 537 Q142 478 266 508 M908 503 Q1006 454 1100 488 M129 600 Q305 565 418 589' }, fieldDetails);
    const stones = svgNode('g', {}, drawing);
    svgNode('ellipse', { cx: 185, cy: 555, rx: 69, ry: 10, fill: '#5f7b66', opacity: 0.14 }, stones);
    svgNode('path', { d: 'M130 548 145 517 183 510 215 537 208 554Z', fill: '#a2b09e' }, stones);
    svgNode('path', { d: 'M145 517 183 510 172 542 130 548Z', fill: '#c8cdb4' }, stones);
    svgNode('path', { d: 'M220 552 231 531 259 536 270 553Z', fill: '#879e91' }, stones);
    svgNode('path', { d: 'M986 499 1002 471 1031 478 1049 500Z', fill: '#8ba293' }, stones);
  }

  const groundSnow = svgNode('g', { fill: '#f4f5e9' }, drawing);
  svgNode('path', { d: 'M0 539 Q85 512 174 531 Q217 541 207 550 Q125 552 86 568 Q40 585 0 574Z' }, groundSnow);
  svgNode('path', { d: 'M493 536 Q583 508 656 534 Q711 553 811 527 Q946 503 1100 539 V620 H492 Q523 587 493 536Z' }, groundSnow);

  const birds = Array.from({ length: 3 }, (_, i) => svgNode('path', {
    fill: 'none', stroke: '#628171', 'stroke-width': 2, 'stroke-linecap': 'round', 'data-bird': i,
  }, drawing));
  const shadows = svgNode('g', {}, drawing);
  const treeLayer = svgNode('g', {}, drawing);
  const trees: DrawnTree[] = landscape.trees.map((tree, treeIndex) => {
    const shadow = svgNode('ellipse', {
      cx: tree.x + 26, cy: tree.y + 8, rx: 161 * tree.scale, ry: 17 * tree.scale,
      fill: '#3e624a',
    }, shadows);
    const group = svgNode('g', {
      transform: `translate(${tree.x} ${tree.y}) scale(${tree.scale})`,
      'data-tree': treeIndex,
    }, treeLayer);
    const crownBack = svgNode('g', {}, group);
    const crowns = tree.crowns.map((crown) => svgNode('path', { d: cloudCrown(crown) }, crownBack));
    const branches = svgNode('g', {}, group);
    svgNode('path', { d: tree.trunk, fill: landscape.colors.bark }, branches);
    tree.branches.forEach((branch) => svgNode('path', {
      d: branch.path, fill: 'none', stroke: landscape.colors.bark,
      'stroke-width': branch.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }, branches));
    if (landscape.terrain === 'mountain') {
      for (let i = 0; i < 14; i += 1) {
        const y = -21 - i * 24;
        svgNode('path', {
          d: `M${i % 2 ? -7 : -2} ${y}l${i % 3 ? 8 : 5} -1`,
          stroke: '#79847a', 'stroke-width': i % 3 ? 2 : 3, 'stroke-linecap': 'round', opacity: 0.8,
        }, branches);
      }
    } else {
      svgNode('path', {
        d: landscape.terrain === 'river' ? 'M-7-7 Q-4-62-8-113 M1-36 Q5-64 1-91' : 'M-3-8 Q-8-55-3-102',
        fill: 'none', stroke: '#b4a47c', 'stroke-width': 2, opacity: 0.57,
      }, branches);
    }
    const snow = svgNode('g', { transform: 'translate(0 -3)' }, branches);
    tree.branches.filter((branch) => branch.width >= 4).forEach((branch) => svgNode('path', {
      d: branch.path, fill: 'none', stroke: '#f5f6ec', 'stroke-width': branch.width * 0.65,
      'stroke-linecap': 'round',
    }, snow));
    const crownFront = svgNode('g', {}, group);
    const veils = tree.crowns.map((crown) => svgNode('path', { d: cloudCrown({ ...crown, rx: crown.rx * 0.87, ry: crown.ry * 0.83 }) }, crownFront));
    const leafGroup = svgNode('g', {}, group);
    const flowerGroup = svgNode('g', {}, group);
    const fruitGroup = svgNode('g', {}, group);
    const leaves = makeLeaves(landscape, tree, treeIndex).map((seed, index) => ({
      seed,
      leaf: svgNode('path', { d: leafPaths[landscape.leafShape], 'data-leaf': seed.id }, leafGroup),
      ...(index % 2 === 0 ? {
        blossom: svgNode('path', {
          d: landscape.leafShape === 'oval' ? flowerPath : 'M0-1.2 C.65-1.2 .65 1.2 0 1.2 C-.65 1.2-.65-1.2 0-1.2Z',
          fill: landscape.colors.blossom,
          stroke: landscape.leafShape === 'oval' ? '#f7e1cf' : '#d6bc6d',
          'stroke-width': 0.1,
          'data-blossom': seed.id,
        }, flowerGroup),
      } : {}),
      ...(landscape.terrain === 'orchard' && index % 9 === 0 ? {
        fruit: svgNode('path', { d: 'M0-.7 C1-1.1 1.2.4 0 1 C-1.2.4-1-1.1 0-.7Z', fill: '#c87e60' }, fruitGroup),
      } : {}),
    }));
    return { spec: tree, index: treeIndex, branches, crowns, veils, crownBack, crownFront, snow, shadow, leaves };
  });

  const plants = Array.from({ length: 15 }, (_, index) => {
    const x = index * 81 + 12;
    const y = 575 + Math.sin(index * 2.3) * 27;
    const group = svgNode('g', { transform: `translate(${n(x)} ${n(y)})` }, drawing);
    const blades = svgNode('g', { fill: 'none', 'stroke-linecap': 'round' }, group);
    const flower = svgNode('g', { fill: '#edc0b3' }, group);
    const tall = landscape.terrain === 'river' && (index < 3 || index > 11);
    for (let j = 0; j < 5; j += 1) {
      const height = (tall ? 43 : 18) + (j * 13 + index * 7) % 24;
      const endX = (j - 2) * 9;
      svgNode('path', {
        d: `M0 0 Q${endX - 9} ${-height * 0.6} ${endX} ${-height}`,
        'stroke-width': tall ? 2 : 1.8,
      }, blades);
      if (tall) {
        svgNode('path', { d: `M${endX} ${-height}l3-11`, stroke: '#947e50', 'stroke-width': 4 }, blades);
      } else if (j % 2) {
        svgNode('path', { d: flowerPath, transform: `translate(${endX} ${-height}) scale(3.3)` }, flower);
      }
    }
    return { blades, flower, x, y };
  });

  const breeze = Array.from({ length: 5 }, (_, index) => svgNode('path', {
    d: `M${80 + index * 222} ${324 + (index % 3) * 73}q31-9 62 0t49 0`,
    fill: 'none', stroke: '#f6f6dd', 'stroke-width': 1.6, 'stroke-linecap': 'round',
  }, drawing));
  const snowfall = svgNode('g', { fill: '#fffef3' }, drawing);
  const flakes = Array.from({ length: 48 }, (_, index) => svgNode('circle', {
    r: 1.3 + (index % 4) * 0.55,
  }, snowfall));
  svgNode('rect', { width: 1100, height: 620, fill: 'url(#season-clock-paper)', 'pointer-events': 'none' }, drawing);
  host.append(svg);

  function drawTree(tree: DrawnTree, frame: YearFrame) {
    const transform = `rotate(${n(branchAngle(frame.time, landscape, tree.index))})`;
    attr(tree.branches, 'transform', transform);
    attr(tree.crownBack, 'transform', transform);
    attr(tree.crownFront, 'transform', transform);
    attr(tree.snow, 'opacity', frame.snow);
    attr(tree.shadow, 'opacity', frame.shadow * (0.6 + frame.canopy * 0.4));
    attr(tree.shadow, 'rx', tree.spec.scale * (140 + frame.warmth * 45));
    attr(tree.shadow, 'cx', tree.spec.x + 35 - frame.warmth * 18);
    tree.crowns.forEach((crown, index) => {
      const color = mixColor(frame.leaf, index % 3 ? '#e4e9b2' : '#2d614c', index % 3 ? 0.17 : 0.22);
      attr(crown, 'fill', color);
      attr(crown, 'opacity', frame.canopy * 0.84);
      attr(tree.veils[index], 'fill', mixColor(frame.leaf, '#e9edc2', 0.34));
      attr(tree.veils[index], 'opacity', frame.canopy * 0.23);
    });
    const leafColor = mixColor(landscape.colors.young, landscape.colors.leaf, smooth(0.28, 0.46, frame.time));
    for (const item of tree.leaves) {
      const leaf = sampleLeaf(item.seed, frame.time, landscape);
      const color = mixColor(leafColor, landscape.colors.gold, leaf.gold);
      attr(item.leaf, 'fill', mixColor(color, item.seed.shade > 0.5 ? '#f0e9ac' : '#2d5f46', Math.abs(item.seed.shade - 0.5) * 0.58));
      attr(item.leaf, 'transform', `translate(${n(leaf.x)} ${n(leaf.y)}) rotate(${n(leaf.angle)}) scale(${n(item.seed.size * leaf.scale)})`);
      attr(item.leaf, 'opacity', leaf.opacity);
      attr(item.leaf, 'data-leaf-state', leaf.attached ? 'attached' : leaf.falling ? 'falling' : 'grounded');
      if (item.blossom) {
        attr(item.blossom, 'transform', `translate(${n(leaf.x + 3)} ${n(leaf.y - 3)}) rotate(${n(leaf.angle)}) scale(${n(4.8 + item.seed.size * 0.12)})`);
        attr(item.blossom, 'opacity', frame.blossom * (0.75 + item.seed.shade * 0.25));
      }
      if (item.fruit) {
        attr(item.fruit, 'transform', `translate(${n(leaf.x)} ${n(leaf.y + 6)}) scale(${n(item.seed.size * 0.63)})`);
        attr(item.fruit, 'opacity', frame.fruit);
      }
    }
  }

  function draw(time: number) {
    const frame = sampleYear(time, landscape);
    attr(svg, 'data-time', frame.time.toFixed(9));
    const nextTitle = `${landscape.name} — ${frame.phase.season}, ${frame.phase.name.toLowerCase()}`;
    const nextDescription = `An original, imagined seasonal landscape, not a botanical model. ${landscape.note} ${frame.phase.note}`;
    if (title.textContent !== nextTitle) title.textContent = nextTitle;
    if (description.textContent !== nextDescription) description.textContent = nextDescription;
    attr(skyTop, 'stop-color', frame.sky);
    attr(skyBottom, 'stop-color', frame.horizon);
    attr(sun, 'transform', `translate(${n(frame.sunX)} ${n(frame.sunY)})`);
    attr(sunDisc, 'r', frame.sunRadius);
    hills.forEach((hill, index) => attr(hill, 'fill', [frame.distant, frame.middle, frame.ground][index]));
    attr(ridgeSnow, 'opacity', 0.42 + frame.snow * 0.58);
    attr(fieldDetails, 'stroke', mixColor(frame.grass, '#e9ecc4', 0.35));
    attr(fieldDetails, 'opacity', 0.52 * (1 - frame.snow * 0.75));
    attr(groundSnow, 'opacity', frame.snow * 0.82);
    if (river) attr(river, 'fill', frame.water);
    clouds.forEach((cloud, index) => attr(cloud, 'transform', `translate(${n(Math.sin(TAU * (frame.time * 2 + index * 0.23)) * 15)} 0)`));
    ripples.forEach((ripple, index) => {
      attr(ripple, 'transform', `translate(${n(Math.sin(TAU * (frame.time * 17 + index * 0.17)) * 13)} 0)`);
    });
    const birdVisibility = smooth(0.18, 0.26, frame.time) * (1 - smooth(0.77, 0.86, frame.time));
    birds.forEach((bird, index) => {
      const x = ((frame.time * 2 + index * 0.038) % 1) * 1260 - 80;
      const y = 234 + index * 14 + Math.sin(TAU * (frame.time * 3 + index * 0.2)) * 20;
      const wing = Math.sin(TAU * (frame.time * 37 + index * 0.21)) * 5;
      attr(bird, 'd', `M-9 ${n(wing)}Q-4-3 0 1Q4-3 9 ${n(wing)}`);
      attr(bird, 'transform', `translate(${n(x)} ${n(y)})`);
      attr(bird, 'opacity', birdVisibility * 0.74);
    });
    trees.forEach((tree) => drawTree(tree, frame));
    plants.forEach((plant, index) => {
      attr(plant.blades, 'stroke', frame.grass);
      const sway = frame.wind * (3 + index % 3);
      attr(plant.blades, 'transform', `rotate(${n(sway)})`);
      attr(plant.flower, 'transform', `rotate(${n(sway)})`);
      attr(plant.flower, 'opacity', frame.blossom * (1 - frame.snow));
    });
    breeze.forEach((line, index) => {
      const gust = Math.sin(TAU * (frame.time * 11 + index * 0.16));
      attr(line, 'transform', `translate(${n(gust * 23)} 0)`);
      attr(line, 'opacity', (0.12 + (gust + 1) * 0.17) * (0.7 + landscape.wind * 0.3));
    });
    attr(snowfall, 'opacity', frame.snow * 0.82);
    flakes.forEach((flake, index) => {
      const phase = index * 0.61803398875 % 1;
      const y = ((frame.time * 4 + phase) % 1) * 748 - 64;
      attr(flake, 'cx', (index * 173 + 37) % 1100 + Math.sin(TAU * (frame.time * 7 + phase)) * 18);
      attr(flake, 'cy', y);
      attr(flake, 'opacity', smooth(-60, 0, y) * (1 - smooth(620, 680, y)));
    });
    return frame;
  }

  return {
    svg,
    draw,
    snapshot: () => `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`,
    destroy: () => svg.remove(),
  };
}
