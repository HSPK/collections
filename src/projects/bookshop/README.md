# The Last Bookshop

A standalone, original English work of interactive fiction at
`/projects/bookshop/`. Everything about the shop, its people, and its six
invented books is fictional. No external assets, network services, audio,
animation, or additional dependencies are used.

## The room

There are 22 substantial scenes, three endings, and six browsable shelf books
with jackets and original excerpts. The initial page places a real opening
chapter beside a wooden bookcase. At narrow widths the bookcase becomes an
explicitly horizontally scrollable shelf; the document itself scrolls normally.
The coat pocket is initially collapsed on small screens.

A shelf spine opens an accessible native dialog. Browsing a jacket does **not**
grant an item or change the bookmark. When the matching chapter is available
from the present scene, the dialog also offers an actual story choice.

There is no timer. Every advance is deliberate. Inaccessible paths are either
hidden (books already read) or disabled with the specific missing requirement.
Returning to the shelves never silently repeats a reward. Focus moves to the
chapter heading after choosing, rewinding, or restarting.

## Files

- `data.ts`: all prose, shelf books, scene IDs, facts, conditions, and effects.
- `engine.ts`: pure deterministic transitions, path replay, bookmark validation,
  history rewinding, text receipts, and graph auditing.
- `index.ts`: page-scoped DOM, dialogs, reading controls, and local persistence.
- `style.css`: styles scoped entirely to `.project-bookshop`.
- `manifest.json`: collection discovery metadata.
- `../../../tests/projects/bookshop.spec.ts`: focused engine and browser tests.

## Content schema

A `Scene` contains `id`, `title`, `place`, `paragraphs`, and `choices`.
An ending additionally has `ending: { number, name, consequence }` and **no**
choices. A normal scene must have an available exit in every reachable state.

Paragraphs are plain text, never interpreted as HTML. A paragraph can instead be
`{ text, when }` to vary the story with the reader's actual state. All text is
escaped when rendered.

A `Choice` contains a scene-local unique `id`, its visible `label`, and a
`target` scene ID. Optional fields are:

- `note`: a visible explanation of the choice and its consequences.
- `when`: an AND condition over `all` facts, `none` facts, `visited` scenes,
  and `unvisited` scenes.
- `effects`: `add` and/or `remove` fact IDs.
- `unavailable`: a helpful explanation, supplemented with missing fact names.
- `hideWhenUnavailable`: omit a choice rather than display it disabled.
- `group`: a reading-room choice-group heading.

Scenes can have entry `effects` too. Choice effects happen first, then the
target scene's entry effects. Facts are a set, not counters. `FACTS` declares
each fact as an `item` (in the coat pocket) or `discovery` (under Things you
know). Requirements work identically for both kinds.

For example, the existing street choice requires all three resources:

```ts
{
  id: 'choose-street',
  label: 'Give the door back to the street',
  target: 'street-preparation',
  when: { all: ['key', 'thread', 'names'] },
  unavailable: 'Read the atlas, repair manual, and borrowers register first.',
}
```

The preparation scene spends `key` and `thread`, adds `roof-mended`, and keeps
the copied names. Going back to the decision restores the original resources;
it does not undo the transition by guessing which items to add back.

## Inventory and the endings

| Item or discovery | How to obtain it | What it changes |
| --- | --- | --- |
| Dry-river chart | Remove the atlas fold | Opens the back staircase |
| Brass street key | Follow the chart to the cellar | Required for the street ending |
| Red thread | Repair the manual's binding | Required and consumed for the street ending |
| Borrowers' names | Copy the register, including its last entry | Required for the street ending; opens the window encounter |
| Mina's witness | Call through the window with the names | Changes preparation and all three ending texts |
| Orchard book | Accept responsibility for the parcel | Opens the travelling ending |
| Return address | Keep the address in the field-guide chapter | Opens the homeward first delivery; changes the keeper ending |
| Burned letter | Give the whole letter to the stove | Changes road preparation and the keeper ending |

The three outcomes:

1. **A place returned:** chart -> cellar key; mended book -> thread; copied
   register -> names; choose the street in the ledger. Spend the key and thread,
   attach the roof, and give the shop to its readers. Calling Mina is optional
   and changes who helps with the work.
2. **A place carried:** accept the orchard parcel, then choose the road.
   Optionally keep the return address to choose a homeward first delivery;
   otherwise take the eastern footpath. The books survive, but the room does not.
3. **A place kept:** always available from the closing ledger. Release Nell from
   the job and take responsibility for the room and its ordinary daily work.

Leaving a book or parcel behind is a real decision. To change it, rewind to the
relevant chapter; do not expect the shelf to grant a second attempt in the same
history. There is no preferred ending and no score.

## Bookmark and history validation

The sole stored record, under `last-bookshop:bookmark`, is:

```ts
{
  version: 1,
  steps: [
    { scene: 'threshold', choice: 'enter' },
    { scene: 'counter', choice: 'browse' },
  ],
}
```

Inventory, discoveries, visited scenes, HTML, and cached chapter text are
**never accepted from storage**. `restoreBookmark()` validates exact object
keys, the version, array length, known scene IDs, and string choice IDs. It
then replays every step from the empty initial state, checking the correct
source scene, choice existence, and every requirement. A path cannot cross a
locked gate, append a step after an ending, or inject an item.

The safety bound is 256 choices per bookmark. At that bound the UI explains how
to download, rewind, or start again rather than discard the journey. Normal
paths are much shorter. Bump `BOOKMARK_VERSION` when making a story change that
would make old choices mean something different, even if they remain legal.

The core `readLocalData` helper reports malformed, illegal, or old bookmarks;
the page immediately writes a fresh validated initial bookmark through
`writeLocalData`. Every subsequent choice, rewind, and confirmed restart is
saved. Denied or full storage is explicitly reported and the page continues
in memory. Storage is browser-local, not an account or a cross-device service;
when using multiple tabs, the last successful write wins.

History is a list of immutable derived snapshots. Restoring page N replays only
the first N-1 choices and discards everything later. Previous chapter uses the
same operation. Restart first asks for confirmation and then replaces the
entire journey. A downloadable text copy contains the actual visited prose
(including conditional passages), chosen actions, ending, pocket, and
discoveries. It is a receipt, not an importable save file.
Download feedback is also announced inside the active bookmark dialog, so
readers do not have to close it to find a success or browser-permission message.

## Extending the shop

1. Add a scene ID to `SCENE_IDS` and a `Scene` to `SCENES`.
2. Write substantial original paragraphs and at least one real exit, unless
   it is an intentional ending.
3. Add any new facts to `FACTS`; put conditions and consequences in the data,
   not special-case UI handlers.
4. Connect the new scene with a choice. For a new shelf volume, add its author,
   jacket, excerpt, binding, and scene mapping to `BOOKS`.
5. If adding an ending, update the UI's edition count and its "of III" labels.
   The current design intentionally has three endings.
6. Run `auditStory()` and the focused tests. Verify the new path is legal and
   that formerly reachable endings remain reachable. Bump the bookmark version
   if the meaning of an old route changed.

`auditStory()` verifies scene/choice uniqueness, all choice and book targets,
known facts in conditions/effects, contradictory requirements, and intentional
endings. Its breadth-first traversal keys on scene + facts + visited scenes,
so hub loops are explored once per equivalent state. It checks for reachable
dead ends and returns a replayable witness path to each ending. It is used by
tests, not run on every page mount.

## Focused validation

Use the existing tools; no dependency changes are required:

```sh
./node_modules/.bin/tsc --noEmit --strict --noUnusedLocals \
  --noUnusedParameters --target ES2022 --lib ES2022,DOM,DOM.Iterable \
  --module ESNext --moduleResolution Bundler --types vite/client,node \
  --skipLibCheck src/projects/bookshop/index.ts \
  src/projects/bookshop/data.ts src/projects/bookshop/engine.ts \
  tests/projects/bookshop.spec.ts

SITE_URL=http://127.0.0.1:4173/ ./node_modules/.bin/playwright test \
  tests/projects/bookshop.spec.ts
```

The second command expects an already running project server. The browser
tests navigate to `./projects/bookshop/` and cover conditional gates, pocket
restoration, restart, reload, rejected saves, shelf dialogs, downloads, focus,
and a 375px viewport. Pure tests cover the complete graph, all three ending
witnesses, choice-time resource consumption, and semantic bookmark rejection.

Initial own-file validation: strict TypeScript passed; all 22 scenes and all
three endings were reached in 18,900 equivalent states, with no audit issues.
Standalone browser integration and visual review belong to the collection's
normal Playwright batch.
