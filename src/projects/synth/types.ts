export const TRACK_IDS = ['kick', 'snare', 'hat', 'bass', 'chime'] as const;

export type TrackId = (typeof TRACK_IDS)[number];

export interface PatternTrack {
  id: TrackId;
  muted: boolean;
  steps: boolean[];
}

export interface SynthPattern {
  format: 'pocket-synth';
  version: 1;
  name: string;
  tempo: number;
  bassNote: number;
  volume: number;
  tracks: PatternTrack[];
}

export interface StarterPattern {
  id: string;
  character: string;
  description: string;
  suggestion: string;
  pattern: SynthPattern;
}

export type PatternResult =
  | { ok: true; pattern: SynthPattern }
  | { ok: false; error: string };

export type TransportState = 'stopped' | 'starting' | 'playing' | 'error';
