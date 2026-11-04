# New built-in shapes

Status: ready-for-agent
Blocked by: 01

Spec: [../spec.md](../spec.md#built-in-shapes).

## What to build

Add the folder starters the spec lists under `resources/starters/`: Long lab report (revtex), Problem set, Presentation (beamer). Match the Lab report's style: `{{Title}}`/`{{Author}}` fields, short `%` comments that teach (naming shortcuts only where the command registry has them), a framed box in place of each figure, and the term "starter", never "template", in any text a student reads.

## Acceptance

- [ ] Each new starter appears in the New file and New vault dialogs with a one-line description.
- [ ] Each builds cleanly with stock MiKTeX from a new vault (an e2e test that makes a vault from every built-in folder starter and builds it, skipped when no TeX is found).
- [ ] The Long lab report's sections are separate files in `sections/`, brought in by `input`.
