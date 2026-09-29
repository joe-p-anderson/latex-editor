\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{handout}[2026/08/13 PHY handouts: labs, homework, demos]

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% base class
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% exam.cls, for one reason above all: its question counter is document-global.
% You can close a `questions' environment, write a section of prose, open
% another, and the numbering continues. No \begin{enumerate}[resume], no series
% names, no bookkeeping. The points, grade-table and solution machinery it also
% offers is left switched off — nothing here uses it, and switching it on later
% needs no edits to existing documents.
%
% [noname] drops the "Name ____" blank from the first-page header, for a
% handout nobody turns in — a demo sheet, a reference page, a lab that is only
% read. Everything else given to \documentclass reaches exam, so [12pt] and
% friends work.
\newif\ifhd@noname
\DeclareOption{noname}{\hd@nonametrue}
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{exam}}
\ProcessOptions\relax
\LoadClass[12pt]{exam}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% fonts
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Bookman (TeX Gyre Bonum) for text. No math font was ever designed for
% Bookman; newpx is Palatino-based, and Palatino's large x-height and open
% round forms are the closest match available to pdfLaTeX.
%
% Load order matters: newpxmath first, text font second, so that Bonum wins
% \rmdefault. The residue is that math operators (\sin, \log) and \mathrm stay
% Palatino. If that reads badly, add after \RequirePackage{tgbonum}:
%   \DeclareSymbolFont{operators}{T1}{qbk}{m}{n}
\RequirePackage[T1]{fontenc}
\RequirePackage{newpxmath}
\RequirePackage{tgbonum}          % sets \rmdefault to qbk

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% page layout
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Full width. Worksheets need the room for ranking tables and answer space,
% and the old margin-note column existed to serve two \mgpar calls in the
% whole course.
\RequirePackage[margin=0.75in,includehead]{geometry}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% packages
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\RequirePackage{graphicx}
\graphicspath{{./}{../}} % find Images/ from the project root or from a subfolder
\RequirePackage{amsmath}
% newpxmath already defines \Bbbk, and amssymb refuses to redefine it. Letting
% it go first keeps the rest of amssymb available; the newpx glyph is the one
% that ends up used, which is what we want anyway.
\let\Bbbk\relax
\RequirePackage{amssymb}
\RequirePackage{enumitem}
\RequirePackage{tabularx}
\RequirePackage{booktabs}
\RequirePackage{wrapfig}
\RequirePackage[separate-uncertainty=true]{siunitx}
\RequirePackage{microtype}
\RequirePackage{parskip}
\RequirePackage{hyperref}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% identity
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% \coursename  the course, once per course rather than once per document
% \assignment  short label for the first-page header, e.g. "Lab 2"
% \title       the topic; also the running header
% \duedate     prints under the title; omit it and the line disappears
\def\hd@course{Physics 1200}
\def\hd@assignment{}
\def\hd@due{}

\newcommand{\coursename}[1]{\def\hd@course{#1}}
\newcommand{\assignment}[1]{\def\hd@assignment{#1}}
\newcommand{\duedate}[1]{\def\hd@due{#1}}

% A copied course can set \coursename once here instead of in every document.
\InputIfFileExists{course.cfg}{}{}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% headers
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% First page carries the name blank; later pages carry the running head.
% exam.cls distinguishes the two natively, so this needs no conditionals.
% \numpages is exam.cls's own total-page count and settles on the second pass.
\pagestyle{headandfoot}
\ifhd@noname
  \firstpageheader{}{}{\footnotesize \hd@course\ \hd@assignment}
\else
  \firstpageheader{\footnotesize Name \blank[3in]}{}%
                  {\footnotesize \hd@course\ \hd@assignment}
\fi
\runningheader{\footnotesize \@title}{}%
              {\footnotesize Page \thepage\ of \numpages}
\runningheadrule
\firstpagefooter{}{}{}
\runningfooter{}{}{}
\extraheadheight{0.25in}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% title block
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Reads "Lab 1: Basics of motion". With no \assignment, just the title.
\renewcommand{\maketitle}{%
  \noindent{\LARGE\bfseries
    \ifx\hd@assignment\@empty\else\hd@assignment: \fi
    \@title\par}%
  \ifx\hd@due\@empty\else
    \vspace{0.25\baselineskip}%
    \noindent{\large Due \hd@due\par}%
  \fi
  \vspace{0.5\baselineskip}%
  \par
}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% boilerplate
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% The turn-in blurb that opened all nine homework sets word for word. Defined
% here so the wording is in one place; \renewcommand it to change it.
\newcommand{\hwinstructions}{%
Write your answers to the following problems on paper and turn it in in class
on the due date above.\par
Answers must be 1) legible and 2) of sufficient detail to assess your reasoning
process to receive full credit.\par
}
\newcommand{\practiceinstructions}{%
This assignment is designed primarily for practice. Complete it on a separate sheet of paper. Clearly label the problem you are working on (e.g. 1, a, b, c, etc.) and \textbf{box your answers}.\par
You are welcome to turn it in, but it is not graded. If you turn it in, write a note at the top of the assignment of the specific problems you would like feedback on. \par
There is a brief quiz on this material, with a reflection due the previous class period.
}
\newcommand{\lectureactivity}{%
This activity functions as notes+. Fill it out (or don't). Due to time constraints, we won't hit every question on this handout in class, so don't be surprised if the instructor asks you to skip a question (or more!). These are still worth exploring, though, so think about them at your leisure.
}


%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% question numbering across environments
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% exam.cls's `questions' environment builds on \list with \usecounter{question},
% and \usecounter zeroes its counter. So out of the box, closing `questions'
% and opening it again restarts at 1 — exam.cls expects one environment to span
% the whole exam, with prose between the \question commands inside it.
%
% That does not suit a lab, where question groups are separated by \section
% headings and \clearpage, and sectioning inside a list indents badly. So the
% counter is carried across instead: restored on the way in, remembered on the
% way out. Documents just write \begin{questions} and the numbering continues.
\newcounter{hd@qsaved}
\setcounter{hd@qsaved}{0}

% \questionshook is exam.cls's own hook inside the list setup, and it runs
% after \usecounter has zeroed the counter — and, conveniently, after exam.cls
% has sized \leftmargin, so the label width is set here too. exam.cls measures
% "10." and the bracketed bold label is wider than that; measuring "[10]" keeps
% the question text aligned instead of letting the label overhang into it.
\renewcommand{\questionshook}{%
  \setcounter{question}{\value{hd@qsaved}}%
  \settowidth{\leftmargin}{\hd@questionstyle{[10]}\hskip\labelsep}%
  \labelwidth\leftmargin \advance\labelwidth-\labelsep
}

\let\hd@endquestions\endquestions
\def\endquestions{\setcounter{hd@qsaved}{\value{question}}\hd@endquestions}

% To start a document's numbering over — a second problem set in one file, say.
\newcommand{\resetquestions}{\setcounter{hd@qsaved}{0}}

% Questions read [1], [2], … in bold rather than exam.cls's plain "1.", so the
% number stays visible next to a student's own working. \questionlabel is
% exam.cls's own hook for this and is what the list uses whenever no \qformat
% is in force. The style is factored out because \questionshook above has to
% measure a label with it applied.
\newcommand{\hd@questionstyle}[1]{\textbf{#1}}
\renewcommand{\questionlabel}{\hd@questionstyle{[\thequestion]}}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% answer space
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Named for what they are for, so a document says how much room a student
% gets rather than how much vertical glue to insert.
\newcommand{\answerspace}[1]{\vspace{#1}}          % blank space
\newcommand{\ruledspace}[1]{\fillwithlines{#1}}    % space, ruled
\newcommand{\answerbox}[1]{\makeemptybox{#1}}      % space, framed

% Inline blank to write on: "Force is \blank[1.3in] proportional to mass."
\newcommand{\blank}[1][1in]{\underline{\hspace{#1}}}

% n ruled lines, matching \ruledlines in reflection.cls so the two classes
% share a vocabulary. Counted in exam.cls's own \linefillheight (0.25in), not
% in \baselineskip, so that "5" really does give five lines.
\newcommand{\ruledlines}[1]{\fillwithlines{\dimexpr#1\linefillheight\relax}}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% ranking table
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% \ranking[4]{Farthest}{Shortest} — a row of blank cells to rank items into,
% labelled at both ends. The optional first argument is how many things are
% being ranked, i.e. how many blanks to draw; it defaults to 4.
%
% Built from framed boxes rather than a tabular: a variable number of cells
% needs a loop, and a macro-generated `&' is not something to rely on inside
% an alignment. Adjacent borders are pulled together by \fboxrule so they
% read as one grid rather than doubling up.
\newlength{\hd@rankheight}
\setlength{\hd@rankheight}{2.5\baselineskip}
\newcommand{\hd@rankstrut}{%
  \rule[-0.4\hd@rankheight]{0pt}{\hd@rankheight}}
\newcommand{\hd@rankblank}[1]{%
  \framebox[#1][c]{\hd@rankstrut}\kern-\fboxrule}

\newcommand{\ranking}[3][4]{%
  \par\vspace{0.5\baselineskip}%
  \noindent\hfill
  \framebox{\hd@rankstrut #2}\kern-\fboxrule
  \@tempcnta=#1\relax
  \loop\ifnum\@tempcnta>\z@
    \hd@rankblank{0.75in}%
    \advance\@tempcnta\m@ne
  \repeat
  \framebox{\hd@rankstrut #3}%
  \hfill\hbox{}\par  % \hbox{} gives \parfillskip something to sit after,
                     % so the trailing \hfill is not swallowed at the \par
  \vspace{0.5\baselineskip}%
}
