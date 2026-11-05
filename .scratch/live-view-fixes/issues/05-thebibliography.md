# thebibliography as a list

Status: ready-for-agent

Blocked by: 03

Spec: [../spec.md](../spec.md#bibliography).

## What to build

A hand-written `thebibliography` renders as a numbered list, and citations to its keys show their number.

- `\begin{thebibliography}{99}` gets a `thebibliography` fence tag, with `{99}` hidden (the generic fence from ticket 03 covers this).
- Each `\bibitem[label]{key}` becomes a hanging marker `[n]` (counting in order through the environment) or `[label]` when given, followed by a chip for the key. The entry text after it stays prose. Indent the entry body the way list item bodies are indented.
- `liveModel` returns the bibitem keys and their labels, so the cite chips (`citeWidget` in `live.ts`) can show `[n]` for those keys even before a compile. When the compiled `.aux` gives a label (`cites.info.labels`), that wins. Find where that comes from and keep its behaviour.
- Keys defined in a `thebibliography` in another file of the project (an `\input` bibliography) also count, through the same include hook that labels use.

## Acceptance

- [ ] A `thebibliography` with three `\bibitem`s shows `[1]`, `[2]`, `[3]` markers with key chips.
- [ ] `\bibitem[Smith99]{smith}` shows `[Smith99]`.
- [ ] `\cite{smith}` shows the bibitem's number or label without compiling.
- [ ] After a compile, the `.aux` label is shown if it differs.
- [ ] Unit tests cover the markers and the cite labels.

## Comments
