# Fence tags on every environment

Status: resolved

Spec: [../spec.md](../spec.md#fence-tags-on-every-environment).

## What to build

Every environment's `\begin` and `\end` gets a fence tag in the live view, except environments that have their own widget.

- In `livemodel.ts`, `beginEnv` and `endEnv` emit `fence` nodes for any environment that isn't display math, a figure (`FIGURES`), a table (`TABLES`) or a tabular (`TABULARS`). This replaces the `TAGGED` list. `abstract` and `subequations` keep their extra handling, and lists keep theirs (markers and indentation).
- The `\begin` fence node covers the environment's arguments too (any `[…]` and `{…}` groups right after `\begin{name}` on the same line), so they're hidden with it while the tag shows. Today's `FenceWidget` text (`name`, `end name`) stays.
- An `\end` with no open `\begin` of that name gets no tag. An unclosed `\begin` still gets its tag.
- Bodies are not indented.

## Acceptance

- [ ] `acknowledgments`, `center`, `minipage`, `theorem`, `proof`, and an environment from a `\newenvironment` all show begin and end tags.
- [ ] `\begin{minipage}{0.5\textwidth}` and `\begin{theorem}[Pythagoras]` show `minipage` and `theorem`, with the arguments hidden until the cursor is on the line.
- [ ] `equation`, `align`, `figure`, `table` and `tabular` show their usual widgets and no tags.
- [ ] Lists render as before.
- [ ] A stray `\end{foo}` shows no tag.
- [ ] Unit tests cover fences for unknown environments, argument ranges and the exclusions.

## Comments

Built and merged on branch `live-view-fixes` (2026-11-04). Only arguments directly adjacent to `\begin{name}` on the same line are hidden; list arguments are hidden too. Tokens inside code blocks never pair with a stray `\end`. Not yet checked in the running app.
