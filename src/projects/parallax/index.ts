import './style.css';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { mountParallax } from './ui';

export function mount(context: ProjectContext): ProjectInstance {
  return mountParallax(context);
}
