# The Tiny Detective

An original, nonviolent casebook at `/projects/detective/`. Each of its three
cases has four fictional people, four readable exhibits, a confirmed timeline,
editable notes, manual eliminations, and an evidence-backed conclusion.

## Files

- `data.ts`: the complete original writing, people, reliable records, exhibit
  rules, timeline, and explanatory outcomes.
- `engine.ts`: pure finite-hypothesis deduction, proof assessment, timeline-note
  movement, and authoring validation. No browser APIs or hidden random outcomes.
- `index.ts`: accessible DOM case files, hand-drawn inline SVG illustrations,
  in-memory investigations, and lifecycle-scoped event delegation.
- `style.css`: plum-and-parchment casebook styling, scoped to
  `.project-detective`, with a single-column phone layout.
- `manifest.json`: standalone discovery metadata.
- `../../../tests/projects/detective.spec.ts`: rule, uniqueness, regression,
  and focused browser coverage.

`data-project-preview` marks the current case's `.td-exhibits` section. It
captures the interactive evidence desk rather than the introductory masthead
or the full-length casebook. Switching cases preserves exactly one such region.

## What constitutes a solution

The first two cases compare visible profile facts. Each identifying exhibit
requires a fact to be one of its explicitly allowed values. A person must
satisfy every pinned requirement. The third case enumerates the 24 possible
orders of its four visitors, then applies `before` and `immediately-before`
constraints. The photographed visit is explicitly given in the briefing; the
identity of that visitor must be deduced.

The intended answer is **not** sufficient to close a case. The chosen exhibits
must leave exactly one possible person and that person must be the nominee.
Insufficient evidence produces an explanation rather than a lucky success.
Contradictions identify the conflicting exhibit when possible. A successful
conclusion explains both the positive identification and the excluded
alternatives, then tells the harmless recovery story.

Every case deliberately includes one contextual exhibit with no identity rule.
It is useful writing, not additional evidence of identity. Manual eliminations,
the notebook, and optional timeline placements are pencil notes: none silently
changes the official hypotheses or marks a theory correct.

## Extending the casebook

1. Add a `CaseFile` to `CASES`, with unique person/exhibit ids and a new file
   number. Keep all essential facts visible in both the record and the prose.
2. Use `logic: { kind: 'profiles' }` for fact comparisons. Each `fact` rule must
   reference a displayed column, and its `allowed` values must exactly match
   the record strings.
3. For an ordering case, provide one distinct slot per person and a zero-based
   `affectedSlot`. Use only ordering rules. Keep these cases small: enumeration
   is factorial and is intended for about four to six visitors.
4. Write the ground rules explicitly: which statements are reliable, whether
   visits are unique, and whether anyone else could have intervened. Mirror the
   actual engine conditions rather than introducing an unmodeled exception.
5. Supply a harmless, original recovery and an explanation that accounts for
   every alternative. Add the answer and expected ordering to the focused
   tests. `validateCase()` must return no errors and the full evidence must
   yield exactly one person (and one complete order for an ordering case).
6. Add an illustration option to `caseIllustration()` if the three existing
   object drawings are unsuitable. New drawings must be local and original.

The existing cases also prove that all three identifying exhibits are needed:
removing any one leaves more than one possible answer. Preserve that useful
authoring constraint or update its test intentionally for a different design.

## Interaction and lifecycle

All exhibits and decisions use native buttons, checkboxes, radio inputs, or
selects. Tab, Space, Enter, and the usual native radio/select keys work; no
pointer-only interaction is required. Exhibits announce their expanded state.
Changing the case or presenting a conclusion moves focus to its heading/result.
Re-rendering an interactive control preserves its focus. Inline status feedback
is a persistent polite live region.

Each case retains its own notes, pins, read state, eliminations, optional
timeline, and conclusion during the visit. Restart uses an inline confirmation
and clears only that case. A completed case remains readable; replay enables a
fresh investigation. Refreshing clears all state, as disclosed on the page.
There is no storage, network request, timer, audio, or external asset.
`createProjectPage()` owns the root and aborts every event listener on teardown.

Run the assigned tests with the existing Playwright runner:

```sh
SITE_URL=http://127.0.0.1:4173 npm test -- tests/projects/detective.spec.ts --grep engine
npm test -- tests/projects/detective.spec.ts
```

The first command is Node-only; the second includes standalone browser flows.
