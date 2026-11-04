# Getting-started vault

Status: ready-for-human
Blocked by: 01

Spec: [../spec.md](../spec.md#getting-started-vault).

Marked ready-for-human because the teaching prose is the product here, and the maintainer, who teaches these students, should write or closely review it. An agent can draft it and build the mechanism.

## What to build

1. **The sample vault** in `resources/getting-started/`, packaged with the app:
   - `main.tex`: plain revtex4-2, siunitx `\qty`, and the simple-pendulum lab report whose prose teaches the topics the spec lists, in that order;
   - `methods.tex`, brought in with `\input`;
   - `references.bib` with 2–3 real entries (for example a pendulum paper and the NIST value of *g*);
   - one figure, a plot of *T* against √*L*;
   - `.vault.json` with Bookbinder's Blue, the Black page and `defaultStarter: "Lab report (revtex)"`.

   It includes the two deliberate slips: an undefined command, and units typed as maths next to the `\qty` form. Each sits in prose telling the student what to do. Model the content on what students actually write: see `fixtures/vaults/Physics_in_Progress_Issue_2/Manuscripts/BV_SimplePendulum/manuscript.tex` and its siblings.
2. **The opener**, a registered command `help.gettingStarted`:
   - If `Documents/endleaf/Getting started` doesn't exist, copy the bundled vault there.
   - If it exists and differs from the bundled copy, open it, and offer "Start over" in a non-blocking notice. That notice replaces the copy after confirming, sending the old one to the trash.
   - Open `main.tex` in Live view with the PDF beside it.
3. **A welcome-screen button**, "Try the Getting-started vault", next to Open a folder… and New vault….

## Acceptance

- [ ] On a fresh profile, the welcome button opens the copied vault with `main.tex` in Live view and the PDF pane open.
- [ ] The first build shows exactly one error (the deliberate undefined command), with a plain-English explanation. Fixing it as the prose says gives a clean build.
- [ ] After the student edits it, Help → Getting Started reopens their copy. Start over restores the original and puts the edited copy in the trash.
- [ ] The vault builds without `physicsinprogress.cls` or anything from a template folder.

## Comments

## Comments

Mechanism built and merged on branch `onboarding` (2026-11-04). The teaching prose in `resources/getting-started/` is an agent draft awaiting maintainer review; check the Beléndez DOI in `references.bib`. Open questions: the vault cannot force the Black page (a global setting), and the first-build hint cannot show until the deliberate `mhp` slip is fixed (conflicts with ticket 06 acceptance).
