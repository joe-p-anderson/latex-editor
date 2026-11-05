# Exam-class lists by default

Status: ready-for-agent

Spec: [../spec.md](../spec.md#exam-class-lists-by-default).

## What to build

The exam-class list environments are built-in defaults, so every vault numbers questions and parts without a `.vault.json` entry.

- Add to `DEFAULT_LISTS` in `src/shared/latexedit.ts`: `questions: 'question'`, `parts: 'part'`, `subparts: 'subpart'`, `subsubparts: 'subsubpart'`, and `choice` for `choices`, `oneparchoices`, `checkboxes` and `oneparcheckboxes`.
- Check where vault lists are merged with the defaults (`vault.lists`, `.vault.json` loading in main), and make sure the vault's entries win over the defaults and the defaults always apply.
- Check that the outline, folding and Enter-in-a-list behave correctly with the new defaults in a non-exam document. None of these commands should appear there.

## Acceptance

- [ ] In a vault with no `lists` in `.vault.json`, `\begin{questions}` shows fence tags and `\question` items are numbered `1.`, `2.`, …, with `\part` as `(a)`, `(b)`.
- [ ] `\CorrectChoice` inside `choices` is marked correct, as it is with a configured vault.
- [ ] A vault that configures its own lists keeps them.
- [ ] Unit tests cover the defaults and the merge.

## Comments
