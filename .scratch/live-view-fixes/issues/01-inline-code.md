# Inline code spans

Status: ready-for-agent

Spec: [../spec.md](../spec.md#inline-code).

## What to build

Inline code (`\verb`, `\verb*`, `\lstinline`, `\mintinline`) is never scanned for live constructs, and the live view renders its contents as code.

- A shared helper in `src/shared/` returns the inline code spans in a text: for each, the whole span and the contents span. Forms: `\verb<d>…<d>` and `\verb*<d>…<d>` with any non-letter delimiter on one line; `\lstinline[opts]<d>…<d>` or `\lstinline[opts]{…}`; `\mintinline[opts]{lang}<d>…<d>` or `\mintinline[opts]{lang}{…}`. An unterminated span (no closing delimiter before the end of the line) is not a span. Comments are blanked first, as elsewhere, but `%` inside a span is not a comment.
- `liveModel` (`src/shared/livemodel.ts`) skips spans the way it skips math regions, and emits a `code` node `{ from, to, bodyFrom, bodyTo }` for each.
- `envTokens` (`src/shared/latexedit.ts`) and `findMathRegions` (`src/shared/mathregions.ts`) skip spans. Check `pairs.ts`, `spellwords.ts` and `main/diagnose.ts`, and use the helper wherever they already skip verbatim environments.
- `live.ts` renders a `code` node: outside the cursor, hide `from…bodyFrom` and `bodyTo…to` and mark the body `cm-live-code` (`var(--f-mono)`, `color: var(--detail)`, no background) in `theme.ts`. With the cursor touching it, leave the source as is.

## Acceptance

- [ ] `\verb|\section{x}|` and `\verb|\input{a}|` render no heading or input card. They show `\section{x}` and `\input{a}` as monospace in the command colour.
- [ ] `\verb|\begin{itemize}|` opens no list, and folding and auto-close don't see it as an environment.
- [ ] `\verb|$|` starts no math.
- [ ] `\lstinline{…}`, `\lstinline!…!`, `\mintinline{python}{…}` and `\verb*|…|` all render the same way.
- [ ] An unterminated `\verb|abc` is left as plain source and doesn't swallow the rest of the line's constructs.
- [ ] `\texttt{\textbf{x}}` still renders bold inside.
- [ ] Unit tests cover the helper's forms and the model's skipping.

## Comments
