let counter = 0;

export function controlRange(
  container: HTMLElement,
  options: {
    label: string;
    min: number;
    max: number;
    step?: number;
    value: number;
    format?: (value: number) => string;
    onChange: (value: number) => void;
  },
): HTMLInputElement {
  const group = document.createElement('label');
  group.className = 'control control--range';
  const heading = document.createElement('span');
  heading.className = 'control-label';
  const name = document.createElement('span');
  name.textContent = options.label;
  const output = document.createElement('output');
  const input = document.createElement('input');
  input.id = `range-${++counter}`;
  input.type = 'range';
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step ?? 1);
  input.value = String(options.value);
  input.setAttribute('aria-label', options.label);
  output.htmlFor = input.id;
  const update = () => {
    output.textContent = options.format?.(Number(input.value)) ?? input.value;
    input.style.setProperty('--range-progress', `${((Number(input.value) - options.min) / (options.max - options.min)) * 100}%`);
  };
  input.addEventListener('input', () => {
    update();
    options.onChange(Number(input.value));
  });
  update();
  heading.append(name, output);
  group.append(heading, input);
  container.append(group);
  return input;
}

export function controlSelect(
  container: HTMLElement,
  options: {
    label: string;
    value: string;
    choices: { value: string; label: string }[];
    onChange: (value: string) => void;
  },
): HTMLSelectElement {
  const group = document.createElement('label');
  group.className = 'control control--select';
  const name = document.createElement('span');
  name.className = 'control-label';
  name.textContent = options.label;
  const select = document.createElement('select');
  select.setAttribute('aria-label', options.label);
  for (const choice of options.choices) {
    const option = document.createElement('option');
    option.value = choice.value;
    option.textContent = choice.label;
    select.append(option);
  }
  select.value = options.value;
  select.addEventListener('change', () => options.onChange(select.value));
  group.append(name, select);
  container.append(group);
  return select;
}

export function controlButton(
  container: HTMLElement,
  options: { label: string; onClick: (button: HTMLButtonElement) => void; title?: string },
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'control-button';
  button.textContent = options.label;
  if (options.title) button.title = options.title;
  button.addEventListener('click', () => options.onClick(button));
  container.append(button);
  return button;
}

export function controlToggle(
  container: HTMLElement,
  options: { label: string; value: boolean; onChange: (value: boolean) => void },
): HTMLButtonElement {
  const button = controlButton(container, {
    label: options.label,
    onClick: () => {
      const active = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(active));
      options.onChange(active);
    },
  });
  button.setAttribute('aria-pressed', String(options.value));
  return button;
}

export function stageHint(container: HTMLElement, text: string): HTMLElement {
  const hint = document.createElement('div');
  hint.className = 'stage-hint';
  hint.textContent = text;
  hint.setAttribute('aria-hidden', 'true');
  container.append(hint);
  return hint;
}
