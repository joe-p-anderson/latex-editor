# Vault on a Windows short path gives vague "LaTeX stopped" errors

Status: needs-triage

Found during the [UI/UX review](../../../docs/design/UX-REVIEW.md) (Error handling & recovery).

## What happened

The review ran on a scratch vault under the test environment's short path name (`C:\Users\JANDER~1\…`). A deliberate undefined command produced three vague "LaTeX stopped" errors, all pointing at `main.tex`. With the same vault on the long path (`C:\Users\janderson19\…`), the same mistake was reported correctly: a plain-English explanation and the right `file:line`.

A real student could hit this when a vault sits under any 8.3 short-named folder, or when a path reaches endleaf in short form (for example from a temp folder or a shortcut).

## Likely area

Matching TeX's log paths back to vault files in `src/main/diagnose.ts` / `src/main/compile.ts`. The log probably reports the long or the short form while the vault root is held in the other, so no error maps to a file. Note that `~` is also TeX's active "tie" character, which could matter if the path reaches TeX unquoted.

## To do

- Reproduce with a vault opened through a short path. Check `git show docs/ux-review:docs/design/UX-REVIEW.md` for the review's setup.
- Fix it, probably by normalising the vault root with `realpath`/long-path expansion when the vault opens.
- Add a regression test in `tests/diagnose.test.ts` or `tests/compile.test.ts` that builds through a short path.

## Comments
