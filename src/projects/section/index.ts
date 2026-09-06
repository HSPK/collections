import './style.css';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { mountSection } from './ui';

export function mount(context: ProjectContext): Promise<ProjectInstance> {
  return mountSection(context);
}
