import { cloneDocument, type Theme, type ThemeId, type ZineDocument } from './engine';

const displayFont = 'Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif';

export const THEMES: Record<ThemeId, Theme> = {
  'red-letter': {
    id: 'red-letter',
    name: 'Red letter',
    description: 'Vermilion bursts. A little noise.',
    ink: '#202019',
    accent: '#ce3825',
    artwork: 'burst',
    titleFont: displayFont,
    bodyFont: 'Georgia, "Times New Roman", serif',
  },
  'field-notes': {
    id: 'field-notes',
    name: 'Field notes',
    description: 'Leaf studies. Room to notice.',
    ink: '#232820',
    accent: '#526741',
    artwork: 'leaf',
    titleFont: 'Georgia, "Times New Roman", serif',
    bodyFont: 'Georgia, "Times New Roman", serif',
  },
  'carbon-copy': {
    id: 'carbon-copy',
    name: 'Carbon copy',
    description: 'Black ink. Quiet circles.',
    ink: '#202019',
    accent: '#55554e',
    artwork: 'orbit',
    titleFont: '"Arial Black", Arial, Helvetica, sans-serif',
    bodyFont: 'Arial, Helvetica, sans-serif',
  },
};

export interface Starter {
  id: string;
  name: string;
  note: string;
  theme: ThemeId;
  document: ZineDocument;
}

export const STARTERS: Starter[] = [
  {
    id: 'unfinished',
    name: 'Begin before ready',
    note: 'A pocket pep talk for making things.',
    theme: 'red-letter',
    document: {
      version: 1,
      title: 'Begin before you are ready',
      theme: 'red-letter',
      paper: 'a4',
      pages: [
        { heading: 'A small manifesto for making', body: 'For the idea living in your notebook.\nFor the first draft, not the final word.\nFor you, right now.' },
        { heading: 'Make a bad first thing', body: 'A first attempt is not a verdict. It is a place to stand.\n\nDraw the lopsided cup. Write the clumsy sentence. Now you have something real to work with.' },
        { heading: 'Give it a small room', body: 'An hour can become a continent of delay. Try ten minutes and one sheet of paper.\n\nA useful limit does not make the idea smaller. It gives the idea an edge to push against.' },
        { heading: 'Keep the wrong turn', body: 'The line that wandered off may know something you do not.\n\nBefore you erase it, make a second version that follows it. An accident can be a collaborator, if you let it stay.' },
        { heading: 'Borrow a little courage', body: 'Tell one kind person what you are making. Not the grand plan: the small thing on the table.\n\nAsk what they notice. You need a witness, not a panel of judges.' },
        { heading: 'Stop one step early', body: 'Leave a sentence unfinished. Set out the next colour. Write a note to tomorrow: start here.\n\nReturning is easier when the work has left the door ajar.' },
        { heading: 'Let it leave the desk', body: 'Fold the paper. Send the photograph. Read the paragraph aloud.\n\nFinished does not mean beyond improvement. Sometimes it means ready to meet another person.' },
        { heading: 'Small is a real size', body: 'This is a small thing you finished.\nThat counts.\n\nMake another. Pass this one on.' },
      ],
    },
  },
  {
    id: 'ordinary',
    name: 'The nearby expedition',
    note: 'Six invitations to look a little closer.',
    theme: 'field-notes',
    document: {
      version: 1,
      title: 'The nearby expedition',
      theme: 'field-notes',
      paper: 'a4',
      pages: [
        { heading: 'A field guide to the ordinary', body: 'No ticket. No special equipment.\nJust a familiar place and a less familiar way of looking.' },
        { heading: 'Take the slow route', body: 'Walk one familiar stretch at half your usual speed.\n\nNotice what arrives when you are not hurrying to the next thing: a bent gate, a smell of toast, a wall warmed by the sun.' },
        { heading: 'Collect one colour', body: 'Choose a colour before you step outside. Look for it in five different places.\n\nA red thread on a sleeve. A rusty hinge. The soft inside of a leaf. Your collection needs no pockets.' },
        { heading: 'Read the repairs', body: 'Find something that has been mended: a patched fence, a taped book, a darned sock.\n\nA repair is a small record of someone deciding that a thing was worth keeping.' },
        { heading: 'Listen in layers', body: 'Stand still for one minute. First notice the nearest sound, then the farthest.\n\nBetween them, listen for a sound that comes and goes. The place has a rhythm, even without you moving.' },
        { heading: 'Meet a shadow', body: 'Look for the shadow of something ordinary. Follow its edge with your eyes.\n\nA railing becomes a ladder. A chair grows long legs. The sun is drawing a second version of the world.' },
        { heading: 'Leave a field note', body: 'Write down one thing you would have missed yesterday. Be specific: not “a bird,” but “a bird balancing on a wire that would not stay still.”\n\nA good note brings you back.' },
        { heading: 'You were here', body: 'The ordinary was never empty.\nYou gave it a little attention.\n\nTomorrow, take the same route.\nIt will not be quite the same place.' },
      ],
    },
  },
  {
    id: 'less',
    name: 'A little less',
    note: 'A gentle counterweight to a busy day.',
    theme: 'carbon-copy',
    document: {
      version: 1,
      title: 'A little less, for a little while',
      theme: 'carbon-copy',
      paper: 'a4',
      pages: [
        { heading: 'Notes from the pause between things', body: 'Not a new routine to perfect.\nNot another box to tick.\nJust a few small invitations to stop adding.' },
        { heading: 'Leave one space empty', body: 'A clear corner of the table. A free line in the calendar. The walk without headphones.\n\nYou do not have to fill a space simply because something could fit there.' },
        { heading: 'Do one ordinary thing', body: 'Wash a cup without also planning tomorrow. Fold a shirt without turning it into a race.\n\nThe task is allowed to be only the task. Your attention is allowed to stay with it.' },
        { heading: 'Let enough be enough', body: 'The meal need not be a project. The message need not be elegant. The room need not look like a photograph.\n\nSome things only need to do their kind, ordinary job.' },
        { heading: 'Put down a borrowed hurry', body: 'Not every urgent voice belongs to you.\n\nBefore you speed up, ask: what actually needs doing now? There may be a real deadline. There may also be room to take a breath.' },
        { heading: 'Keep a small pleasure', body: 'The first sip while it is still warm. A song you know by heart. Clean sheets.\n\nA pleasure does not need to be impressive, useful, or shared to earn its place in a day.' },
        { heading: 'End without a flourish', body: 'Close the notebook. Put the tools away. Let a finished day look unfinished from the outside.\n\nYou are allowed to stop before every loose end has learned to tie itself.' },
        { heading: 'No homework', body: 'You do not need to remember all of this.\n\nKeep the line that helped.\nLeave the rest here.' },
      ],
    },
  },
];

export function makeStarter(id = STARTERS[0]!.id): ZineDocument {
  const starter = STARTERS.find((item) => item.id === id);
  if (!starter) throw new Error('That starter is not available.');
  return cloneDocument(starter.document);
}

export function makeBlank(): ZineDocument {
  return {
    version: 1,
    title: 'Something worth sharing',
    theme: 'red-letter',
    paper: 'a4',
    pages: Array.from({ length: 8 }, () => ({ heading: '', body: '' })),
  };
}
