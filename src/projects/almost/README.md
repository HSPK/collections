# A Dictionary of Almost

A standalone, locally rendered reading website at `projects/almost/`. It contains
28 original fictional coinages, six categories, 28 English syllable guides,
28 concrete example sentences, 28 observations, and 84 related-entry links.
It is creative writing, not language scholarship, historical etymology, or a
translation dictionary. Nothing is generated through live inference or an API.
There are no remote assets, fonts, accounts, or dependencies specific to this site.

## Files and lifecycle

- `data.ts`: entries, category definitions, pure filtering, favorite validation,
  copy/export formatting, and the non-repeating surprise selection.
- `index.ts`: the `mount(ProjectContext): ProjectInstance` entrypoint.
- `style.css`: typography, publication layout, mobile browsing, and print styles.
  Every selector is scoped to `.project-almost`.
- `manifest.json`: standalone page discovery metadata. Register it only after
  the other site files exist.

Mounting uses `createProjectPage(context, 'almost')`. Controls and DOM queries
stay inside its root. Listeners use the page's abort signal; destruction removes
the page and its listeners. Clipboard completions ignore a destroyed page.
There are no animation loops, observers, audio, or running timers owned by this
site. Downloads use the shared helper, which revokes its own object URL.

## Add or edit a word

Add a `DictionaryEntry` to `entries` in alphabetical headword order. The fixed
array order is the printed order, entry numbering, and export order. Include:

- `id`: a unique lowercase ASCII slug, matching `/^[a-z][a-z0-9-]*$/`.
  IDs are permanent addresses and favorite identifiers; avoid renaming them.
- `word`: the invented headword in lowercase. Write original fictional material;
  do not present an attested language's words or etymologies as inventions.
- `pronunciation`: an informal, pronounceable English syllable guide, with the
  stressed syllable in capitals. No IPA or historical claims are implied.
- `partOfSpeech`: `noun`, `verb`, or `adjective`.
- `category`: one ID from `wordCategories`.
- `definition`: a particular, recognizable experience rather than a broad
  feeling. A sound, a room, or an object is often a useful place to start.
- `example`: a complete sentence using the headword (or its natural inflection).
- `observation`: a short additional thought, not a restatement of the definition.
- `related`: three different existing entry IDs, never the entry itself.
  Relations need not be reciprocal, but every ID must resolve to a real word.

Alphabet buttons and category counts derive from the entries. Only initials
actually represented are rendered; there are no empty or disabled letter slots.
The featured margin currently points to `awayettle`. If removing that entry,
update its heading, excerpt, guide, number, and link in `index.ts` as well.
The visible total updates automatically; update this README, the manifest's
content count, and the focused tests' count/category/initial assertions when
adding entries.

## Add a category

Append an `{ id, label, description }` object to `wordCategories`, then assign
at least one entry to it. `WordCategory` is inferred from those IDs. The select,
counts, entry labels, and explanatory hint update automatically. Categories
are local editorial groupings, separate from the collection's `read` category.

## Search, browsing, and addresses

Search is immediate and case-insensitive. Leading/trailing whitespace is ignored;
whitespace-separated terms must **all** occur as literal substrings somewhere
across an entry's headword, definition, or example sentence. For instance,
`KETTLE unfamiliar` finds `awayettle`. Terms may match different fields.
Quotation marks, punctuation, and hyphens are literal; there is no phrase parser,
stemming, fuzzy matching, or search of observations, pronunciation, or category
labels. A form submission applies the same search without reloading the page.

Search, initial letter, category, and the all/kept view combine with **AND**.
Changing views preserves the three browsing filters. `Clear search` removes only
the search text and returns focus to the input. `All` removes only the letter.
`Reset filters` clears search, letter, and category but **keeps the current view**.
The empty-state `Show the full lexicon` also leaves the kept-only view.
Filtering replaces only the results, never the search field or browse controls.

The browse disclosure starts open on desktop and closed at widths up to 760px.
It remains a normal keyboard-operable disclosure at either size. Its alphabet
wraps within the available width rather than becoming a horizontal scroller.

Related links, the margin feature, and `Surprise me` clear browsing filters and
open the full lexicon so that their destination is never hidden. They focus the
correct headword, scroll to it without animation, and use `#word-ID` addresses,
for example `./projects/almost/#word-awayettle`. A surprise is drawn from the
whole dictionary, excluding the current entry (or first visible result) whenever
another entry exists. It never merely changes a label or repeats its last open
entry. Browser back/forward follows entry fragments. A new search/filter clears
the selected entry's fragment; filters themselves are not URL-persisted.

Unknown or malformed fragments safely show the full lexicon with an explanation.
They are never interpreted as markup or used directly as selectors. The local
`#almost-top`, `#almost-lexicon`, and `#almost-about` anchors are also supported.

## Kept words and local storage

The storage key is `odd-index:almost:favorites:v1`, containing:

```json
{ "version": 1, "ids": ["awayettle", "mapmolt"] }
```

`readLocalData` validates the complete object before use. The version must be
exactly `1`; `ids` must be an array no longer than the dictionary, containing
only distinct strings that resolve to current entries. Nulls, primitive values,
unknown IDs, duplicates, invalid JSON, and unknown versions are rejected.
Malformed data starts a fresh in-memory collection and reports why, rather
than silently merging or trusting the old contents.

Every toggle writes a versioned payload with `writeLocalData`. Storage failures
are reported visibly and through the page's accessible feedback. The in-memory
collection still works; the UI explicitly says changes are for this visit only.
A subsequent successful write saves the complete in-memory selection.
Toggling a favorite in the full view does not rebuild the entry. Removing a word
in the kept view focuses the next/previous available favorite control, preserving
its viewport position where possible; an empty view focuses its heading.

Favorites persist on the same browser and origin, including a GitHub Pages
repository base path. They are not synchronized across tabs, devices, or
accounts. No personal details or search history are saved. To reset favorites,
remove only this storage key through the browser's site-data tools, or unkeep the
entries. If deliberately changing the data schema or IDs, add a migration or
version the storage key and validator; do not silently reinterpret old IDs.

## Copy, export, and extension

`Copy entry` copies the actual headword, syllable guide, part of speech, category,
definition, sentence, observation, related headwords, and explicit fiction note.
The button says `Copied` only after the shared clipboard helper succeeds.
Blocked/unavailable clipboard access gives a truthful message and a manual-copy
alternative. A failed retry restores `Copy entry`; it never claims success.

`Download all kept words` writes a UTF-8 `.txt` reading list in dictionary order.
It includes **all** kept words, even when the kept view has active filters.
The download button is unavailable when nothing is kept.

New interactions should use the existing page signal and scoped queries.
Register any future timers, observers, subscriptions, or other resources with
`page.onCleanup`. Keep all new styles under `.project-almost`; use local assets
and shared URL helpers if assets are ever added. Do not add live generators,
external APIs, or purported language scholarship.

## Focused validation

Optional interaction coverage lives in `tests/projects/almost.spec.ts` and uses
`page.goto('./projects/almost/')`, so it also respects a configured base URL.
It covers filter intersections and reset behavior, empty results, real related
destinations and surprise choices, fragments, favorite persistence/validation,
clipboard feedback, text exports, and narrow-screen layout. Run it through the
repository's existing Playwright configuration alongside other focused tests.
