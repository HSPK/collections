export interface ExperimentContext {
  container: HTMLElement;
  controls: HTMLElement;
  signal: AbortSignal;
  reducedMotion: boolean;
  report: (message: string) => void;
}

export type ProjectContext = ExperimentContext;

export interface ProjectInstance {
  destroy: () => void;
  setPaused?: (paused: boolean) => void;
  reset?: () => void;
}

export interface ExperimentInstance extends ProjectInstance {
  setPaused: (paused: boolean) => void;
}

export interface ProjectModule {
  mount: (context: ProjectContext) => ProjectInstance | Promise<ProjectInstance>;
}

export interface ExperimentModule {
  mount: (context: ExperimentContext) => ExperimentInstance | Promise<ExperimentInstance>;
}

export type Category = 'create' | 'play' | 'read' | 'learn' | 'explore' | 'art';

export interface ProjectManifest {
  id: string;
  order: number;
  title: string;
  subtitle: string;
  description: string;
  category: Category;
  format: 'page' | 'immersive';
  medium: string;
  tags: string[];
  color: string;
  ink: string;
  instruction: string;
  preview?: string;
}

export interface Project extends ProjectManifest {
  number: string;
  sourcePath: string;
  load: () => Promise<ProjectModule>;
}
