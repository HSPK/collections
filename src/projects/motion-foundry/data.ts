export type LessonId = 'timing' | 'anticipation' | 'squash-stretch' | 'arcs' | 'overshoot' | 'follow-through';

export interface Lesson {
  id: LessonId;
  title: string;
  shortTitle: string;
  headline: string;
  explanation: string;
  notice: string;
  tryThis: string;
  modelNote: string;
  plainLabel: string;
  expressiveLabel: string;
  amplitudeHint: string;
  featuredProgress: number;
}

export const LESSONS: readonly Lesson[] = [
  {
    id: 'timing',
    title: 'Timing & easing',
    shortTitle: 'Timing',
    headline: 'Same distance. Different beat.',
    explanation: 'A move is more than its first and last frame. Plain covers equal distances in equal slices of time. Expressive redistributes those slices: with Smooth in–out it gathers speed, crosses the middle quickly, then takes its time arriving. Nothing about the destination changes, but the arrival feels more considered.',
    notice: 'Read the outlines like a contact sheet. Close neighbors mean slow movement; large gaps mean fast movement. Both clips finish together.',
    tryThis: 'Pause near 30%, then switch between Slow in and Quick out. Keep the playhead still. You are changing where that same moment belongs along the route.',
    modelNote: 'Expressive progress is (1 − a)t + aE(t), where a is amplitude and E is the selected easing curve. These are designed timing curves, not a force simulation.',
    plainLabel: 'Constant pace',
    expressiveLabel: 'Time, redistributed',
    amplitudeHint: 'Blend the selected ease into linear motion. At 0%, both sides are linear.',
    featuredProgress: 0.32,
  },
  {
    id: 'anticipation',
    title: 'Anticipation',
    shortTitle: 'Anticipation',
    headline: 'First, go the wrong way.',
    explanation: 'A small move away from a destination makes the next move easier to read. Expressive pulls back before its forward journey begins; Plain leaves immediately. The wind-up is part of the clip, not a bounce tacked onto its end. Both still reach the same mark on the last frame, so preparing costs some of the available travel time.',
    notice: 'In the opening frames, Expressive crosses behind the 0% marker. Its forward action cannot begin until the wind-up has finished.',
    tryThis: 'Scrub through the first fifth of the clip. Increase amplitude to make the backward move deeper and give the preparation more time.',
    modelNote: 'Preparation lasts 0.22a of the clip and reaches −0.16a of the route. A smoothstep winds back; the selected ease then takes it from that position to the finish.',
    plainLabel: 'Leave immediately',
    expressiveLabel: 'Prepare, then commit',
    amplitudeHint: 'Increase both the backward distance and the time spent preparing.',
    featuredProgress: 0.12,
  },
  {
    id: 'squash-stretch',
    title: 'Squash & stretch',
    shortTitle: 'Squash + stretch',
    headline: 'Change the shape. Keep the substance.',
    explanation: 'These two pucks share a hop, a landing time, and a destination. Only one changes its silhouette. Expressive compresses before takeoff, lengthens during the flight, then spreads on landing. Plain remains rigid. Trading height for width suggests a yielding object without changing how much of the flat drawing it occupies.',
    notice: 'The bottom of the puck stays on the floor during a squash. Width grows as height shrinks: width scale × height scale always equals 1.',
    tryThis: 'Pause around 83%, at the landing squash. Move amplitude from 0% to 100% and watch the width compensate for the lost height.',
    modelNote: 'Scale X = 1 / Scale Y preserves the area of this 2D ellipse. Sine-shaped deformation pulses are keyed to the hop; this is a constant-area drawing analogy, not a 3D volume or material simulation.',
    plainLabel: 'A rigid silhouette',
    expressiveLabel: 'Constant-area deformation',
    amplitudeHint: 'Strength of the loading, airborne stretch, and landing squash.',
    featuredProgress: 0.83,
  },
  {
    id: 'arcs',
    title: 'Arcs',
    shortTitle: 'Arcs',
    headline: 'Give the journey a shape.',
    explanation: 'Plain takes a straight route. Expressive lifts away from that line and returns along a curved path. Their horizontal progress is identical at every moment: the difference is the route itself, not a spinning shape or a different destination. An arc can make a transfer feel like a toss rather than a slide.',
    notice: 'The dashed path is genuinely curved. At the midpoint, Expressive is above Plain even though both have the same horizontal position.',
    tryThis: 'Set amplitude to 0% to flatten the arc, then raise it. Change easing separately: the path stays curved while the time spent along it changes.',
    modelNote: 'For horizontal progress q, lift = 4hq(1 − q), with h = 105a guide units. This drawn parabola is not a gravity solver, and eased travel is not necessarily constant-speed travel.',
    plainLabel: 'A straight transfer',
    expressiveLabel: 'A curved transfer',
    amplitudeHint: 'Height of the curved route. At 0%, the two routes coincide.',
    featuredProgress: 0.5,
  },
  {
    id: 'overshoot',
    title: 'Overshoot',
    shortTitle: 'Overshoot',
    headline: 'An arrival can have an afterword.',
    explanation: 'Plain reaches its mark and stops. Expressive goes beyond the mark, reverses, and makes smaller corrections before resting. That brief excess gives an arrival a different character: less mechanical, more elastic. The lesson is the recovery, not endless wobbling. The last frame is exactly on the destination.',
    notice: 'Watch Expressive cross the 100% line. The later corrections shrink; Plain has already stopped while they happen.',
    tryThis: 'Replay at 0.5× speed, then scrub the last two fifths backward. Raise amplitude to enlarge the excursion without moving the final resting place.',
    modelNote: 'The first leg reaches 1 + 0.20a at 60% of the clip. A cosine multiplied by a smooth envelope brings the excess to exactly zero at the end. This is a finite, stylized settling curve.',
    plainLabel: 'Stop on the mark',
    expressiveLabel: 'Pass, reverse, settle',
    amplitudeHint: 'Distance beyond the destination and size of the settling corrections.',
    featuredProgress: 0.62,
  },
  {
    id: 'follow-through',
    title: 'Follow-through',
    shortTitle: 'Follow-through',
    headline: 'The leader stops. The rest catches up.',
    explanation: 'A courier disc carries two small tabs. On the Plain side, the whole assembly moves as one rigid unit. On the Expressive side, the tabs start later, trail behind, then continue moving after the disc has stopped. The farther tab has the longer delay. Their small final corrections let the action finish in stages.',
    notice: 'After 46% of the clip the large disc is stationary. The expressive tabs are still catching up; their connector changes length until they settle.',
    tryThis: 'Pause just after the halfway mark. Compare the two assemblies, then scrub toward the end. At 0% amplitude, all of the parts move together again.',
    modelNote: 'The carrier finishes at 46%. Tab starts are delayed by 0.16a and 0.32a of the clip, followed by bounded settling envelopes. The connector visualizes lag; it is not a rope or spring simulation.',
    plainLabel: 'Everything stops together',
    expressiveLabel: 'Delayed parts, shared rest',
    amplitudeHint: 'Time lag and settling excursion of the two trailing tabs.',
    featuredProgress: 0.51,
  },
];

export const PHASE_LABELS = {
  ready: 'Start frame',
  prepare: 'Preparation',
  travel: 'Travel phase',
  settle: 'Settling phase',
  hold: 'Rest frame',
  complete: 'Last frame',
} as const;
