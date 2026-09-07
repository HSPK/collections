export const ACTORS = ['mica', 'pip'] as const;
export type ActorId = typeof ACTORS[number];
export const MARK_IDS = ['mica-near', 'mica-mid', 'mica-far', 'pip-near', 'pip-mid', 'pip-far'] as const;
export type MarkId = typeof MARK_IDS[number];
export const CUES = ['discover', 'offer', 'celebrate'] as const;
export type Cue = typeof CUES[number];
export const POSES = ['listen', 'point', 'present', 'bow', 'cheer'] as const;
export type Pose = typeof POSES[number];
export const ATTENTIONS = ['partner', 'prop', 'audience'] as const;
export type Attention = typeof ATTENTIONS[number];
export const RIGS = ['front', 'left', 'right', 'reverse'] as const;
export type Rig = typeof RIGS[number];
export const SHOTS = ['wide', 'portrait'] as const;
export type Shot = typeof SHOTS[number];
export type Vec3 = { x: number; y: number; z: number };
export type Marks = Record<MarkId, Vec3>;
export interface Actor { id: ActorId; mark: MarkId; pose: Pose; attention: Attention; line: string }
export interface Plan { intention: string; actors: Actor[] }
export interface Camera { rig: Rig; rail: number; distance: number; lens: number; focus: 'both' | ActorId; height: number }
export interface World { actors: Actor[]; marks: Marks; prop: Vec3; cue: Cue | null }
export interface Scenario { id: string; title: string; premise: string; beats: [string, string, string] }
export const scenarios: Scenario[] = [
  {
    id: 'applause', title: 'The Applause Department',
    premise: 'A tiny theater has misplaced its final applause. Mica, its meticulous archivist, and Pip, an enthusiastic apprentice, discover it hiding in a wheeled cabinet.',
    beats: ['Find a suspicious rustle in the applause cabinet.', 'Offer the shy applause a proper invitation.', 'Celebrate the smallest standing ovation in history.'],
  },
  {
    id: 'moon', title: 'One Moon, Lightly Toasted',
    premise: 'At a midnight bakery, Mica insists the moon is a perfectly round biscuit. Pip wants to return it to the sky before breakfast. The cabinet is their oven.',
    beats: ['Discover that the newest biscuit glows.', 'Offer the moon a ladder made of compliments.', 'Celebrate a deliciously empty baking tray.'],
  },
  {
    id: 'umbrella', title: 'The Umbrella Post',
    premise: 'Mica sorts letters to the weather. Pip is determined to deliver a thank-you note to a very small cloud. Their postal cabinet keeps humming.',
    beats: ['Discover a cloud inside the postal cabinet.', 'Offer the cloud a letter folded into a boat.', 'Celebrate the first indoor rainbow delivery.'],
  },
];
export const roles: Record<ActorId, { name: string; motivation: string; color: string }> = {
  mica: { name: 'Mica', motivation: 'Protect the ritual. Be precise, skeptical, and secretly delighted; prefer the clearest sightline.', color: '#d8a54e' },
  pip: { name: 'Pip', motivation: 'Make the impossible feel welcome. Be curious and expansive; seek proximity to the discovery.', color: '#7eaaa0' },
};
export const legalPoses: Record<Cue, readonly Pose[]> = {
  discover: ['listen', 'point'],
  offer: ['present', 'bow'],
  celebrate: ['cheer', 'bow'],
};
export const openingCamera = (): Camera => ({ rig: 'front', rail: 0, distance: 10, lens: 28, focus: 'both', height: 1.15 });
export function openingWorld(): World {
  return {
    actors: ACTORS.map(id => ({ id, mark: `${id}-mid`, pose: 'listen', attention: 'partner', line: '' })),
    marks: {
      'mica-near': { x: -0.9, y: 0, z: 1.2 }, 'mica-mid': { x: -1.8, y: 0, z: 0 }, 'mica-far': { x: -3.3, y: 0, z: -1.2 },
      'pip-near': { x: 0.9, y: 0, z: 1.2 }, 'pip-mid': { x: 1.8, y: 0, z: 0 }, 'pip-far': { x: 3.3, y: 0, z: -1.2 },
    },
    prop: { x: -4, y: 0, z: 2.5 },
    cue: null,
  };
}
export const sceneName = (scene: number) => ['The discovery', 'The invitation', 'The ovation'][scene];
export const portraitActor = (scene: number): ActorId => scene === 1 ? 'pip' : 'mica';
