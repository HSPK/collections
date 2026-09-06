import './style.css';
import { clamp } from '../../core/math';
import { createProjectPage, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { INITIAL_DIRECTION, INITIAL_SOURCE, INITIAL_VECTOR, INPUT_LIMIT, MATRIX_PRESETS, PROJECTION_PRESETS } from './data';
import { createDiagram } from './diagram';
import type { DiagramState, HandleId, LabMode } from './diagram';
import { analyzeMatrix, eigenDirections, formatNumber, formatVector, project, projectionMatrix, transform } from './engine';
import type { EigenAnalysis, Mat2, Vec2 } from './engine';
import { playgroundMarkup } from './view';

const initialState = (): DiagramState => ({
  mode: 'transform',
  matrix: { ...MATRIX_PRESETS[0].matrix },
  vector: { ...INITIAL_VECTOR },
  source: { ...INITIAL_SOURCE },
  direction: { ...INITIAL_DIRECTION },
  showEigen: true,
});

function eigenExplanation(eigen: EigenAnalysis): { title: string; description: string } {
  if (eigen.kind === 'complex') {
    return {
      title: 'No real eigen-directions',
      description: `Eigenvalues ${formatNumber(eigen.real)} ± ${formatNumber(eigen.imaginary)}i are complex. `
        + 'No nonzero real vector stays on its original line, so no eigenlines are drawn.',
    };
  }
  if (eigen.kind === 'all') {
    return {
      title: `Every direction · λ = ${formatNumber(eigen.value)}`,
      description: eigen.value === 0
        ? 'Every nonzero vector satisfies Av = 0·v. All inputs go to the origin; the whole plane is the zero-eigenvalue eigenspace.'
        : 'A is a scalar multiple of the identity. Every line through the origin stays on itself; no single pair of lines is special.',
    };
  }
  if (eigen.kind === 'defective') {
    return {
      title: `One eigen-direction · repeated λ = ${formatNumber(eigen.value)}`,
      description: `The line along ${formatVector(eigen.directions[0].direction)} is the only eigenline. `
        + 'The eigenvalue occurs twice but has only one independent eigenvector: this matrix is defective.',
    };
  }
  return {
    title: 'Two real eigen-directions',
    description: eigen.directions.map((item) =>
      `λ = ${formatNumber(item.value)} along ${formatVector(item.direction)}`).join('; ')
      + '. Positive λ keeps direction, negative λ reverses it, and λ = 0 collapses it to the origin.',
  };
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'vector-playground');
  page.root.setAttribute('aria-labelledby', 'vp-title');
  page.root.innerHTML = playgroundMarkup();
  let state = initialState();
  let matrixPreset = MATRIX_PRESETS[0].id;
  let dotPreset = 'acute';
  let customNote = '';
  let challengeActive = false;

  const selectPreset = query<HTMLSelectElement>(page.root, '[data-vp-preset]');
  const selectDotPreset = query<HTMLSelectElement>(page.root, '[data-vp-dot-preset]');
  const eigenToggle = query<HTMLInputElement>(page.root, '[data-vp-eigen]');
  const useProjection = query<HTMLButtonElement>(page.root, '[data-vp-use-projection]');
  const validation = query<HTMLElement>(page.root, '[data-vp-validation]');
  const challengeStatus = query<HTMLElement>(page.root, '[data-vp-challenge-status]');
  const numberInputs = Array.from(page.root.querySelectorAll<HTMLInputElement>('[data-vp-number]'));
  const modeButtons = Array.from(page.root.querySelectorAll<HTMLButtonElement>('[data-vp-mode]'));
  const readings = [0, 1, 2].map((index) => ({
    label: query<HTMLElement>(page.root, `[data-vp-reading-label="${index}"]`),
    value: query<HTMLOutputElement>(page.root, `[data-vp-reading="${index}"]`),
    note: query<HTMLElement>(page.root, `[data-vp-reading-note="${index}"]`),
  }));
  const text = (selector: string, value: string) => { query<HTMLElement>(page.root, selector).textContent = value; };
  const show = (selector: string, visible: boolean) => { query<HTMLElement>(page.root, selector).hidden = !visible; };
  const inputFor = (key: string) => query<HTMLInputElement>(page.root, `[data-vp-number="${key}"]`);

  function getNumber(key: string): number {
    if (key === 'a' || key === 'b' || key === 'c' || key === 'd') return state.matrix[key];
    const [vector, axis] = key.split('-');
    if ((vector === 'vector' || vector === 'source' || vector === 'direction') && (axis === 'x' || axis === 'y')) {
      return state[vector][axis];
    }
    throw new Error(`Unknown vector coordinate: ${key}`);
  }

  function setNumber(key: string, value: number) {
    if (key === 'a' || key === 'b' || key === 'c' || key === 'd') {
      state = { ...state, matrix: { ...state.matrix, [key]: value } };
      matrixPreset = 'custom';
      customNote = '';
      return;
    }
    const [vector, axis] = key.split('-');
    if ((vector === 'vector' || vector === 'source' || vector === 'direction') && (axis === 'x' || axis === 'y')) {
      state = { ...state, [vector]: { ...state[vector], [axis]: value } };
      if (vector !== 'vector') dotPreset = 'custom';
    }
  }

  function moveHandle(id: HandleId, point: Vec2) {
    if (id === 'basis-x' || id === 'basis-y') {
      const column: Partial<Mat2> = id === 'basis-x' ? { a: point.x, c: point.y } : { b: point.x, d: point.y };
      state = { ...state, matrix: { ...state.matrix, ...column } };
      matrixPreset = 'custom';
      customNote = '';
    } else {
      state = { ...state, [id]: point };
      if (id !== 'vector') dotPreset = 'custom';
    }
    render();
  }

  const diagram = createDiagram(
    query<HTMLElement>(page.root, '[data-vp-drawing]'),
    page.signal,
    moveHandle,
    page.report,
    (id) => inputFor(id === 'basis-x' ? 'a' : id === 'basis-y' ? 'b' : `${id}-x`).focus(),
  );
  page.onCleanup(diagram.destroy);

  function updateReadings(values: readonly { label: string; value: string; note: string }[]) {
    values.forEach((value, index) => {
      readings[index].label.textContent = value.label;
      readings[index].value.textContent = value.value;
      readings[index].note.textContent = value.note;
    });
  }

  function render(forceNumbers = false) {
    if (page.signal.aborted) return;
    const matrixInfo = analyzeMatrix(state.matrix);
    const eigen = eigenDirections(state.matrix);
    page.root.dataset.mode = state.mode;
    page.root.dataset.determinant = matrixInfo.determinant.toString();
    page.root.dataset.rank = matrixInfo.rank.toString();
    page.root.dataset.eigenKind = eigen.kind;
    const isMatrix = state.mode === 'transform';
    for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.vpMode === state.mode));
    show('[data-vp-matrix-controls]', isMatrix);
    show('[data-vp-dot-controls]', !isMatrix);
    show('[data-vp-transform-legend]', isMatrix);
    show('[data-vp-projection-legend]', !isMatrix);
    show('[data-vp-eigen-panel]', isMatrix);
    show('[data-vp-projection-panel]', !isMatrix);
    selectPreset.value = matrixPreset;
    selectDotPreset.value = dotPreset;
    eigenToggle.checked = state.showEigen;
    for (const input of numberInputs) {
      if (forceNumbers || input !== document.activeElement) {
        input.value = formatNumber(getNumber(input.dataset.vpNumber!), 8);
        input.removeAttribute('aria-invalid');
      }
    }
    validation.hidden = !numberInputs.some((input) => input.getAttribute('aria-invalid') === 'true');
    const explanation = eigenExplanation(eigen);
    text('[data-vp-eigen-title]', explanation.title);
    text('[data-vp-eigen-description]', explanation.description);
    if (isMatrix) {
      const output = transform(state.matrix, state.vector);
      updateReadings([
        {
          label: 'Signed area · det A',
          value: `${matrixInfo.determinant > 0 ? '+' : ''}${formatNumber(matrixInfo.determinant)}`,
          note: `Unit square → area ${formatNumber(matrixInfo.area)}`,
        },
        {
          label: 'Orientation',
          value: matrixInfo.nearSingular ? 'Near collapse' : matrixInfo.rank < 2 ? 'Collapsed'
            : matrixInfo.orientation === 'preserved' ? 'Preserved' : 'Reflected',
          note: matrixInfo.nearSingular ? 'Numerical rank 1 · nearly a line'
            : `Rank ${matrixInfo.rank} · ${matrixInfo.rank === 0 ? 'a point' : matrixInfo.rank === 1 ? 'a line' : 'a plane'}`,
        },
        { label: 'Output vector · Av', value: formatVector(output), note: `From v = ${formatVector(state.vector)}` },
      ]);
      text('[data-vp-plot-kicker]', 'The plane, re-drawn');
      text('[data-vp-plot-caption]', matrixInfo.rank === 0 ? 'Every point meets at the origin.'
        : matrixInfo.rank === 1 ? (matrixInfo.nearSingular ? 'Almost a line. Almost no area.' : 'A whole plane, now on a line.')
          : 'Same points. New places.');
      text('[data-vp-combination]',
        `${formatNumber(state.vector.x)}·${formatVector({ x: state.matrix.a, y: state.matrix.c })} + `
        + `${formatNumber(state.vector.y)}·${formatVector({ x: state.matrix.b, y: state.matrix.d })} = ${formatVector(output)}`);
      text('[data-vp-preset-note]', MATRIX_PRESETS.find((preset) => preset.id === matrixPreset)?.note
        ?? (customNote || 'Your own transformation. Every grid point, pavilion vertex, and input vector follows these same two columns.'));
    } else {
      const projection = project(state.source, state.direction);
      page.root.dataset.dot = projection.dot.toString();
      updateReadings([
        { label: 'Dot product · u·d', value: formatNumber(projection.dot), note: 'uₓdₓ + uᵧdᵧ' },
        {
          label: 'Projection · p', value: projection.projected ? formatVector(projection.projected) : 'Undefined',
          note: projection.signedLength === null ? 'Zero d defines no line' : `Signed length ${formatNumber(projection.signedLength)}`,
        },
        {
          label: 'Alignment · cos θ', value: projection.cosine === null ? 'Undefined' : formatNumber(projection.cosine),
          note: projection.angleDegrees === null ? 'A zero vector has no angle' : `Angle ${formatNumber(projection.angleDegrees, 1)}°`,
        },
      ]);
      text('[data-vp-plot-kicker]', 'Projection as a shadow');
      text('[data-vp-plot-caption]', 'What part of u lies along d?');
      text('[data-vp-projection-formula]', projection.projected
        ? `${formatNumber(projection.coefficient!)}·${formatVector(state.direction)} = ${formatVector(projection.projected)}`
        : 'Undefined: cannot divide by d·d = 0.');
      text('[data-vp-projection-explanation]', projection.directionLength === 0
        ? 'Direction d is zero. The dot product u·d is still 0, but projection, cosine, and angle are undefined: zero does not define a line.'
        : projection.sourceLength === 0
          ? 'The zero source projects to (0, 0), but has no direction: its angle and cosine are undefined. A projection matrix still exists because d is nonzero.'
          : `The dashed remainder u − p = ${formatVector(projection.residual!)} is perpendicular to d. `
            + 'Changing the length or sign of a nonzero d changes the dot product, but not this projection onto its line.');
      useProjection.disabled = projection.directionLength === 0;
    }
    challengeStatus.hidden = !challengeActive;
    if (challengeActive) {
      challengeStatus.textContent = matrixInfo.rank === 0
        ? 'That is rank 0: everything vanished. Keep at least one column nonzero to get a line.'
        : matrixInfo.nearSingular
          ? 'Very close! Make the columns exactly collinear for zero area, not just a near collapse.'
          : matrixInfo.rank === 1
            ? 'Solved: rank 1, zero area, one surviving line. Two independent input directions no longer stay independent.'
            : 'Make the columns collinear. Hint: with c = 0, try setting d to 0 while leaving a nonzero.';
    }
    diagram.render(state);
  }

  function reset() {
    if (page.signal.aborted) return;
    state = initialState();
    matrixPreset = MATRIX_PRESETS[0].id;
    dotPreset = 'acute';
    customNote = '';
    challengeActive = false;
    render(true);
    page.report('Both labs reset. The shear has signed unit-square area +1.');
  }

  for (const button of modeButtons) {
    button.addEventListener('click', () => {
      state = { ...state, mode: button.dataset.vpMode as LabMode };
      render();
    }, { signal: page.signal });
  }
  selectPreset.addEventListener('change', () => {
    const preset = MATRIX_PRESETS.find((item) => item.id === selectPreset.value);
    if (!preset) return;
    state = { ...state, matrix: { ...preset.matrix } };
    matrixPreset = preset.id;
    customNote = '';
    render(true);
    page.report(`${preset.label}. ${preset.note}`);
  }, { signal: page.signal });
  selectDotPreset.addEventListener('change', () => {
    const preset = PROJECTION_PRESETS.find((item) => item.id === selectDotPreset.value);
    if (!preset) return;
    state = { ...state, source: { ...preset.source }, direction: { ...preset.direction } };
    dotPreset = preset.id;
    render(true);
    page.report(`${preset.label}. Dot product ${formatNumber(project(state.source, state.direction).dot)}.`);
  }, { signal: page.signal });
  eigenToggle.addEventListener('change', () => {
    state = { ...state, showEigen: eigenToggle.checked };
    render();
  }, { signal: page.signal });
  useProjection.addEventListener('click', () => {
    const matrix = projectionMatrix(state.direction);
    if (!matrix) return;
    state = { ...state, matrix, vector: { ...state.source }, mode: 'transform' };
    matrixPreset = 'custom';
    customNote = `This A projects onto the line through d = ${formatVector(state.direction)}. `
      + 'The source u is now the input v, so Av matches the projection from the dot lab.';
    render(true);
    selectPreset.focus({ preventScroll: true });
    page.report('Projection transferred to matrix A. The source is now the input vector.');
  }, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-vp-reset]').addEventListener('click', reset, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-vp-challenge]').addEventListener('click', () => {
    state = { ...state, mode: 'transform', matrix: { a: 1, b: 0.5, c: 0, d: 1 }, vector: { ...INITIAL_VECTOR } };
    matrixPreset = 'custom';
    challengeActive = true;
    customNote = 'Challenge: make both columns land on the same line, with at least one column nonzero. Watch for determinant 0 and rank 1.';
    render(true);
    query<HTMLElement>(page.root, '[data-project-preview]').scrollIntoView({ behavior: 'auto', block: 'start' });
    inputFor('d').focus({ preventScroll: true });
    page.report(customNote);
  }, { signal: page.signal });

  page.root.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.vpNumber) return;
    const value = input.valueAsNumber;
    if (!Number.isFinite(value) || Math.abs(value) > INPUT_LIMIT) {
      input.setAttribute('aria-invalid', 'true');
      validation.hidden = false;
      validation.textContent = 'Use a finite number from −4 to 4. The drawing keeps the last valid value.';
      return;
    }
    input.removeAttribute('aria-invalid');
    setNumber(input.dataset.vpNumber, value);
    render();
  }, { signal: page.signal });
  page.root.addEventListener('focusout', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.vpNumber || !input.hasAttribute('aria-invalid')) return;
    input.value = formatNumber(getNumber(input.dataset.vpNumber), 8);
    input.removeAttribute('aria-invalid');
    validation.hidden = true;
    page.report('Kept the last valid coordinate. Enter a finite number from −4 to 4.');
  }, { signal: page.signal });
  page.root.addEventListener('keydown', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.vpNumber || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.5 : 0.1;
    const value = clamp(Number((getNumber(input.dataset.vpNumber) + (event.key === 'ArrowUp' ? step : -step)).toFixed(8)), -INPUT_LIMIT, INPUT_LIMIT);
    input.value = value.toString();
    input.removeAttribute('aria-invalid');
    setNumber(input.dataset.vpNumber, value);
    render();
  }, { signal: page.signal });

  render(true);
  return { destroy: page.destroy, reset };
}
