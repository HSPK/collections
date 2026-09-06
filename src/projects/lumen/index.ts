import './style.css';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { mountLumen } from './ui';

export function mount(context: ProjectContext): ProjectInstance {
  return mountLumen(context);
}
