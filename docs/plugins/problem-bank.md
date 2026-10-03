# Problem bank

Keep homework problems for reuse. A **bank** is a folder of problem files, one `.tex` file per problem. Switch the plugin on in the Plugins view (it is off by default).

## A problem file

A problem is a bare `\question` with its `parts`. Don't wrap it in `\begin{questions}` and don't give it a preamble: it is `\input` into an assignment's own `questions` environment. Describe it in a comment header; every line is optional.

```tex
% problem: Projectile off a cliff
% tags: kinematics, projectile motion
% difficulty: 2
% source: adapted from Giancoli 3.24
% needs: siunitx, [T1]fontenc
% preamble: \DeclareSIUnit{\solarmass}{\text{M}_{\odot}}
\question A ball is thrown horizontally from a \SI{20}{m} cliff...
\begin{parts}
  \part How long is it in the air?
\end{parts}
```

- `needs:` lists packages. Write `[options]name` for a package with options.
- `preamble:` is one definition per line, and may repeat. It holds the custom commands the problem uses.
- Where a problem is used is never written in the file. It is worked out from the assignments that `\input` it.
- Files whose names start with `_` are not problems. `_preamble.tex` is special (see Checking).

## Settings

| Setting | Where | Meaning |
|---|---|---|
| Bank folder | this vault | Where the problems are. Default `Problems`. |
| Insert as | this vault | `input` (default) puts `\input{Problems/name}` in the document. `copy` puts the problem text in, without its header. |
| Check with class | this vault | The document class used to check a problem when the bank has no `_preamble.tex`. Default `exam`. |
| Shared library folder | all vaults | A folder of problems shared by every vault, searched too. Its problems are always copied in, since an `\input` of a path outside the vault would not travel with the vault. Empty means none. |

## The Problems view

Open it from the book icon in the activity bar.

- **Search** looks at titles, tags, sources and the words of the problem.
- Filter by **tag** (click a tag on a card too) and by **difficulty**.
- Each card shows the problem as it will read, with its math drawn, what it needs, and "used in HW3, HW7". Click an assignment to open it.
- **Insert**, or double-click the card, puts the problem at the cursor. It then adds what the problem needs: the packages the document lacks, and each `preamble:` definition that the document's preamble does not define yet. A message says what was added. A `\documentclass` is never added.
- The checkbox marks a problem for a new assignment.
- **Open** opens the problem's file for editing.

## Commands (Tools, Problem bank)

- **Add question to bank**: with the cursor inside a `\question` (up to the next `\question` or `\end{questions}`), asks for a title and tags, writes the problem to the bank, and replaces the question in your document with an `\input`. It is one undo step. `needs:` and `preamble:` are filled in for you: packages for the commands the question uses (for example `\SI` gives `siunitx`), and the custom definitions from the document's preamble that it uses. A new file never overwrites an existing one.
- **New assignment from problems**: asks for a file name and writes a new `.tex` with a `questions` environment and one `\input` per marked problem, then opens it. If the bank has a `_preamble.tex` it is used for the preamble. Otherwise a minimal `\documentclass{exam}` document is written. The packages and definitions the problems need are added.
- **Check all problems**: builds every problem (see below).

## Checking a problem

**Check** on a card builds that one problem on its own, in a wrapper document, and shows whether it builds or what failed. The wrapper's preamble is the bank's `_preamble.tex` if there is one (a full preamble: `\documentclass...` up to, but not including, `\begin{document}`), otherwise `\documentclass{<Check with class>}`. The problem's own `needs` and `preamble` lines are added. The result is kept until the problem's file changes. Nothing is written to your vault: checks build in `.texcache`.

## Live view

In the live view, an `\input` of a bank problem shows a small card after it with the problem's title, difficulty and tags.

## Not included

There is no solutions or answer-key toggle. The card preview leaves out `solution` environments.
