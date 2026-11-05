# Code block styling

Status: ready-for-agent

Blocked by: 01, 03

Spec: [../spec.md](../spec.md#code-blocks).

## What to build

The bodies of `verbatim`, `Verbatim`, `lstlisting`, `minted` and `comment` (with or without `*`) look like inline code, and the blocks get fence tags.

- The `verbatim` node in `livemodel.ts` gains the body range (between the `\begin…` line's end, after any `[opts]` or `{lang}`, and the `\end`).
- `live.ts` marks the body lines `cm-live-code` (the class from ticket 01): `var(--f-mono)`, `color: var(--detail)`, no background. Nothing inside is rendered.
- `\begin` and `\end` get fence tags, showing the environment name only, via the generic fences from ticket 03. `minted`'s `{lang}` and `lstlisting`'s `[opts]` are hidden with the `\begin` while the tag shows.

## Acceptance

- [ ] A `verbatim` block holding `\section{x}` shows it as monospace in the command colour, with no heading.
- [ ] `\begin{minted}{python}` shows a `minted` tag, with `{python}` hidden until the cursor is on the line.
- [ ] `lstlisting` with `[language=C]` shows a `lstlisting` tag.
- [ ] The cursor inside a code block shows plain source on that line; other lines stay styled.

## Comments
