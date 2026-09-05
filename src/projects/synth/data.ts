import { TRACK_IDS } from './types';
import type { PatternResult, StarterPattern, SynthPattern, TrackId } from './types';

export const STEP_COUNT = 16;
export const MIN_TEMPO = 50;
export const MAX_TEMPO = 180;
export const MAX_JSON_LENGTH = 32_768;
export const STORAGE_KEY = 'odd-index:pocket-synth:pattern:v1';

export const TRACKS: {
  id: TrackId;
  label: string;
  material: string;
  description: string;
}[] = [
  {
    id: 'kick', label: 'Kick', material: 'Sine / pitch fall',
    description: 'A sine wave drops from 145 to 48 Hz. A fast attack and a short fade make the low-end thump.',
  },
  {
    id: 'snare', label: 'Snare', material: 'Noise + sine',
    description: 'Filtered white noise supplies the snap; a falling sine wave underneath gives it a little body.',
  },
  {
    id: 'hat', label: 'Hat', material: 'High-pass noise',
    description: 'White noise above 6,200 Hz, cut to a 65-millisecond envelope. A small, dry tick between the drums.',
  },
  {
    id: 'bass', label: 'Bass', material: 'Filtered triangle',
    description: 'A triangle wave passes through a 750 Hz low-pass filter. Every bass pad plays your selected root note.',
  },
  {
    id: 'chime', label: 'Chime', material: 'Two sine partials',
    description: 'Two quiet sine waves ring at slightly inharmonic frequencies. The lower partial is a fifth, two octaves above the bass root.',
  },
];

function makeStarter(
  name: string,
  tempo: number,
  bassNote: number,
  rows: [string, string, string, string, string],
): SynthPattern {
  return {
    format: 'pocket-synth', version: 1, name, tempo, bassNote, volume: 52,
    tracks: TRACK_IDS.map((id, index) => ({
      id,
      muted: false,
      steps: rows[index].replaceAll(' ', '').split('').map((step) => step === '1'),
    })),
  };
}

export const STARTERS: StarterPattern[] = [
  {
    id: 'red-relay', character: 'Steady / bright',
    description: 'A grounded backbeat with a bass line that slips between the kicks.',
    suggestion: 'Try removing hat step 12. One missing tick can make the next beat feel bigger.',
    pattern: makeStarter('Red relay', 112, 38, [
      '1000 0010 1000 0000',
      '0000 1000 0000 1000',
      '1010 1010 1011 1010',
      '1000 0001 0010 0100',
      '0000 0010 0000 0001',
    ]),
  },
  {
    id: 'sidewalk-signal', character: 'Loose / off-center',
    description: 'Sparse kicks, offbeat hats, and one last snare tap before the loop turns.',
    suggestion: 'Mute the kick for a bar, then bring it back. The other tracks keep their place.',
    pattern: makeStarter('Sidewalk signal', 94, 41, [
      '1000 0000 1010 0000',
      '0000 1000 0000 1001',
      '0010 1010 0010 1010',
      '1001 0000 1000 0010',
      '0000 0000 0100 0000',
    ]),
  },
  {
    id: 'soft-circuitry', character: 'Slow / spacious',
    description: 'A half-time sketch with room for the chime to decay into the gaps.',
    suggestion: 'Move the bass root up a few semitones. The chime follows at a fixed interval.',
    pattern: makeStarter('Soft circuitry', 76, 36, [
      '1000 0000 0010 0000',
      '0000 0000 1000 0000',
      '1000 0010 1000 0010',
      '1000 0010 0000 0100',
      '0001 0000 0010 0000',
    ]),
  },
  {
    id: 'night-bus', character: 'Quick / restless',
    description: 'Extra hats and a short bass pickup keep this little machine moving.',
    suggestion: 'Add a kick on step 16 for a pickup, or slow the whole pattern down to 90 BPM.',
    pattern: makeStarter('Night bus', 132, 43, [
      '1000 1010 1000 0010',
      '0000 1000 0000 1000',
      '1011 1010 1010 1011',
      '1000 0100 0010 0101',
      '0000 0001 0000 0010',
    ]),
  },
];

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function noteName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function clonePattern(pattern: SynthPattern): SynthPattern {
  return { ...pattern, tracks: pattern.tracks.map((track) => ({ ...track, steps: [...track.steps] })) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function integerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
}

export function validatePattern(value: unknown): PatternResult {
  const invalid = (error: string): PatternResult => ({ ok: false, error });
  if (!isRecord(value)) return invalid('A pattern must be a JSON object, not a list or a single value.');
  if (value.format !== 'pocket-synth' || value.version !== 1) {
    return invalid('This is not a Pocket Synth version 1 pattern. Check its format and version fields.');
  }
  if (!exactKeys(value, ['format', 'version', 'name', 'tempo', 'bassNote', 'volume', 'tracks'])) {
    return invalid('The pattern has missing or unknown fields. Start with a Pocket Synth JSON export.');
  }
  if (typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 48
    || value.name !== value.name.trim()
    || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value.name)) {
    return invalid('Give the pattern a name of 1–48 characters, without control characters or surrounding spaces.');
  }
  if (!integerBetween(value.tempo, MIN_TEMPO, MAX_TEMPO)) {
    return invalid(`Tempo must be a whole number from ${MIN_TEMPO} to ${MAX_TEMPO} BPM.`);
  }
  if (!integerBetween(value.bassNote, 36, 59)) {
    return invalid('Bass root must be a whole MIDI note number from 36 (C2) to 59 (B3).');
  }
  if (!integerBetween(value.volume, 0, 100)) {
    return invalid('Volume must be a whole percentage from 0 to 100.');
  }
  if (!Array.isArray(value.tracks) || value.tracks.length !== TRACK_IDS.length) {
    return invalid('Include exactly five tracks: kick, snare, hat, bass, and chime.');
  }
  const tracks = new Map<TrackId, SynthPattern['tracks'][number]>();
  for (const track of value.tracks as unknown[]) {
    if (!isRecord(track) || !exactKeys(track, ['id', 'muted', 'steps'])) {
      return invalid('Each track needs only id, muted, and steps fields.');
    }
    if (typeof track.id !== 'string' || !TRACK_IDS.some((id) => id === track.id)) {
      return invalid('Unknown track. Use kick, snare, hat, bass, and chime.');
    }
    const id = track.id as TrackId;
    if (tracks.has(id)) return invalid(`The ${id} track appears more than once.`);
    if (typeof track.muted !== 'boolean') return invalid(`The ${id} mute value must be true or false.`);
    if (!Array.isArray(track.steps) || track.steps.length !== STEP_COUNT) {
      return invalid(`The ${id} track needs exactly 16 steps.`);
    }
    for (let step = 0; step < STEP_COUNT; step++) {
      if (typeof track.steps[step] !== 'boolean') {
        return invalid(`${id}, step ${step + 1}: use true or false, not numbers or text.`);
      }
    }
    tracks.set(id, { id, muted: track.muted, steps: [...track.steps] as boolean[] });
  }
  return {
    ok: true,
    pattern: {
      format: 'pocket-synth', version: 1, name: value.name,
      tempo: value.tempo, bassNote: value.bassNote, volume: value.volume,
      tracks: TRACK_IDS.map((id) => tracks.get(id)!),
    },
  };
}

export function isPattern(value: unknown): value is SynthPattern {
  return validatePattern(value).ok;
}

export function parsePatternJSON(text: string): PatternResult {
  if (text.length > MAX_JSON_LENGTH) return { ok: false, error: 'That JSON is too large. The limit is 32 KB.' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { ok: false, error: 'The JSON could not be read. Check commas, quotes, and brackets, then try again.' };
  }
  return validatePattern(value);
}

export function patternJSON(pattern: SynthPattern): string {
  return `${JSON.stringify(pattern, null, 2)}\n`;
}

export function patternFilename(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'pattern'}.pocket-synth.json`;
}
