import './style.css';
import { defineArtSite } from '../../core/art-site';
import { mount as artwork } from '../../experiments/ribbon';
import manifest from './manifest.json';

export const mount = defineArtSite(manifest, artwork);
