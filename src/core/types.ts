export interface ExperimentContext {
  container: HTMLElement;
  controls: HTMLElement;
  signal: AbortSignal;
  reducedMotion: boolean;
  report: (message: string) => void;
}

export interface ExperimentInstance {
  destroy: () => void;
  setPaused: (paused: boolean) => void;
  reset?: () => void;
}

export interface ExperimentModule {
  mount: (context: ExperimentContext) => ExperimentInstance | Promise<ExperimentInstance>;
}

export type Category = 'space' | 'motion' | 'play';

export interface Project {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  description: string;
  category: Category;
  medium: string;
  color: string;
  ink: string;
  instruction: string;
  load: () => Promise<ExperimentModule>;
}
