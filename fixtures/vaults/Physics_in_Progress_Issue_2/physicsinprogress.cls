%%
%% physicsinprogress.cls -- document class for the journal *Physics in Progress*
%% Carthage College, Department of Physics and Astronomy
%%
%% Wraps revtex4-2 and supplies the journal furniture that used to be
%% copy-pasted into every manuscript preamble:
%%
%%   * the first-page banner (Carthage College logo + article type,
%%     plus the "Editor's Suggestion" flag and red border when applicable)
%%   * the running heads on pages 2 and following
%%   * the standard package set and bibliography style
%%
%% Two class options drive the variable parts:
%%
%%   ec | noec                    Editor's Suggestion flag + red border
%%   rc | oa                      Rapid Communication / Original Article
%%
%% A third option, `issue', turns the class into a full-issue driver: one
%% document in the project root that \pipaddarticle's every manuscript and
%% numbers the pages straight through.  See the "Full-issue mode" section
%% near the bottom of this file.
%%
%% See README-physicsinprogress.md for usage.
%%
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{physicsinprogress}[2026/07/30 v1.1 Physics in Progress journal class]

%% ---------------------------------------------------------------------------
%% Class options
%% ---------------------------------------------------------------------------

\newif\ifpip@ec        \pip@ecfalse   % Editor's Suggestion?
\newif\ifpip@rc        \pip@rcfalse   % Rapid Communication? (false = Original Article)
\newif\ifpip@footinbib \pip@footinbibtrue
\newif\ifpip@issue     \pip@issuefalse % full-issue driver document?

% The two editorial switches are declared once, as named actions, so that the
% same code can be driven either from \documentclass options (below) or, in
% full-issue mode, from the \documentclass line of each manuscript that the
% issue swallows.
\@namedef{pip@option@ec}{\pip@ectrue}
\@namedef{pip@option@editorschoice}{\pip@ectrue}
\@namedef{pip@option@noec}{\pip@ecfalse}
\@namedef{pip@option@rc}{\pip@rctrue}
\@namedef{pip@option@rapidcommunication}{\pip@rctrue}
\@namedef{pip@option@oa}{\pip@rcfalse}
\@namedef{pip@option@originalarticle}{\pip@rcfalse}

\DeclareOption{ec}{\pip@ectrue}
\DeclareOption{editorschoice}{\pip@ectrue}
\DeclareOption{noec}{\pip@ecfalse}

\DeclareOption{rc}{\pip@rctrue}
\DeclareOption{rapidcommunication}{\pip@rctrue}
\DeclareOption{oa}{\pip@rcfalse}
\DeclareOption{originalarticle}{\pip@rcfalse}

\DeclareOption{issue}{\pip@issuetrue}
\DeclareOption{fullissue}{\pip@issuetrue}

% footinbib is on by default; intercept both spellings so that only one of
% them is ever handed to revtex (revtex processes options in its own order,
% not the order they are given, so passing both is unreliable).
\DeclareOption{footinbib}{\pip@footinbibtrue}
\DeclareOption{nofootinbib}{\pip@footinbibfalse}

% The journal is always two-column reprint style, and \LoadClass hardcodes
% "reprint" below.  Passing preprint/onecolumn as well would reach revtex as a
% contradictory pair and fail somewhere deep inside it, so catch them here with
% a message that says what actually went wrong.
\newcommand{\pip@layoutclash}[1]{%
  \ClassError{physicsinprogress}
    {The `#1' option conflicts with this class}
    {Physics in Progress articles are always two-column reprint style, so the
     class loads revtex4-2 with `reprint' itself.  Remove `#1' from
     \protect\documentclass.  If you need a preprint-style draft, use revtex4-2
     directly rather than this class.}%
}

\DeclareOption{preprint}{\pip@layoutclash{preprint}}
\DeclareOption{onecolumn}{\pip@layoutclash{onecolumn}}
\DeclareOption{twocolumn}{\OptionNotUsed}   % already implied by reprint

% Anything else is a revtex option (e.g. prl, longbibliography).
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{revtex4-2}}

\ExecuteOptions{oa,noec}
\ProcessOptions\relax

\ifpip@footinbib
  \PassOptionsToClass{footinbib}{revtex4-2}
\else
  \PassOptionsToClass{nofootinbib}{revtex4-2}
\fi

\LoadClass[reprint,amsmath,amssymb,aps,prb,floatfix]{revtex4-2}

%% ---------------------------------------------------------------------------
%% Packages
%%
%% Loaded in the same order as the old hand-written preamble so that the
%% output is unchanged.  siunitx is deliberately *not* loaded here: it is not
%% needed by every article and recent versions require a newer expl3 than some
%% of our TeX installations ship.  Add \usepackage{siunitx} yourself if you
%% want it.
%% ---------------------------------------------------------------------------

\RequirePackage[rgb]{xcolor}
\RequirePackage{tikz}
\usetikzlibrary{calc}
\RequirePackage{graphicx}
\RequirePackage{mathtools}
\RequirePackage{cleveref}
\RequirePackage[caption=false]{subfig}
\RequirePackage{booktabs}
\RequirePackage[twoside]{fancyhdr}
\RequirePackage{appendix}
\RequirePackage{placeins}

\bibliographystyle{apsrev4-2}

%% ---------------------------------------------------------------------------
%% Journal identity -- colours, names, logo
%% ---------------------------------------------------------------------------

% Carthage College red, #D02E20.  (The old preambles defined a colour called
% "Cred" as 208,32,46 -- the last two components were transposed -- but it was
% never actually used for the border, which came from the pre-rendered banner
% PDFs in Carthage red.  Both names are provided here; both are the real red.)
\definecolor{CarthageRed}{RGB}{208, 46, 32}
\colorlet{Cred}{CarthageRed}

\newcommand{\pip@logofile}{Logo.pdf}
\newcommand{\pip@journalname}{Physics in Progress}
\newcommand{\pip@journalabbrev}{Phys. in Prog.}

% Article type shown top-right on page 1 and in the running head.  Derived from
% the rc/oa switch rather than fixed at load time, because in full-issue mode
% each article resets the switch and asks for the name to be recomputed.
\newcommand{\pip@typename}{}
\newcommand{\pip@settypename}{%
  \ifpip@rc
    \renewcommand{\pip@typename}{Rapid Communication}%
  \else
    \renewcommand{\pip@typename}{Original Article}%
  \fi
}
\pip@settypename

% Escape hatch for an article type the options do not cover
% (e.g. \articletypename{Comment}).
\newcommand{\articletypename}[1]{\renewcommand{\pip@typename}{#1}}

% Point the class at a differently-named logo file if you ever need to.
\newcommand{\journallogo}[1]{\renewcommand{\pip@logofile}{#1}}

%% ---------------------------------------------------------------------------
%% Issue information (running head, right-hand side on odd pages)
%%
%%   \pipvolume{2}
%%   \pipissuedate{Feb. 2026}
%% produce   *Phys. in Prog.* **2** (Feb. 2026)
%%
%% \pipissuenumber{1} inserts an issue number, as in Volume 1:
%%   *Phys. in Prog.* **1** 1 (Jan. 2024)
%%
%% \pipcitation{...} replaces the whole line if you need something else.
%% ---------------------------------------------------------------------------

\newcommand{\pip@volume}{}
\newcommand{\pip@issuenumber}{}
\newcommand{\pip@issuedate}{}

\newcommand{\pipvolume}[1]{\renewcommand{\pip@volume}{#1}}
\newcommand{\pipissuenumber}[1]{\renewcommand{\pip@issuenumber}{#1}}
\newcommand{\pipissuedate}[1]{\renewcommand{\pip@issuedate}{#1}}

% Emptiness test.  Do NOT compare against \@empty here: \newcommand defines a
% \long macro, \@empty is not \long, and \ifx compares prefixes as well as
% bodies -- so \ifx\pip@issuenumber\@empty is *always* false and the \else
% branch fires, putting a stray extra space into the running head.  Comparing
% against another \newcommand-defined empty macro gets the prefixes to agree.
\newcommand{\pip@empty}{}

% Spacing note: the spaces below are ordinary spaces, not \ (control space), so
% that the sentence-ending space after "Prog." keeps its extra width, exactly as
% in the hand-written preambles.  Using \ instead loses 1.11pt.  The trailing
% space before % on the second line is significant.
\newcommand{\pip@citation}{%
  \textit{\pip@journalabbrev} \textbf{\pip@volume} %
  \ifx\pip@issuenumber\pip@empty\else\pip@issuenumber\ \fi%
  (\pip@issuedate)%
}
\newcommand{\pipcitation}[1]{\renewcommand{\pip@citation}{#1}}

%% ---------------------------------------------------------------------------
%% Received / published dates
%%
%% revtex has no field for these, so the journal has always smuggled them in
%% through \collaboration, which typesets a line under the affiliation.  Use
%%   \pipdates{January 29, 2026}{February 5, 2026}
%% in the same place you would put \collaboration (after \affiliation).
%% ---------------------------------------------------------------------------

\newcommand{\pipdates}[2]{\collaboration{Received #1, Published online #2}}

%% ---------------------------------------------------------------------------
%% First-page banner
%%
%% Drawn as a page background rather than as a running head, because revtex
%% puts the title page in its own "titlepage" page style and never consults
%% fancyhdr's "plain" style.  (That is why the \fancypagestyle{plain} block in
%% the old preambles had no effect -- the banner you saw was entirely the
%% EC_RC.pdf / OA_def.pdf image.)
%%
%% The lengths below reproduce those pre-rendered banner PDFs exactly.
%% \pipbannerdrop is the distance from the top of the paper down to the
%% baseline of the banner box (which is the bottom edge of the logo).
%% ---------------------------------------------------------------------------

\newlength{\pipbannerdrop}      \setlength{\pipbannerdrop}{77.2pt}
\newlength{\piplogoheight}      \setlength{\piplogoheight}{1.5cm}
\newlength{\pipbannerhshift}    \setlength{\pipbannerhshift}{0pt}
% Nudges the CARTHAGE/logo/COLLEGE group only, leaving the two flags put.
% The legacy banner artwork (RC_def.pdf and friends) has this group sitting
% about 9.2pt left of centre -- roughly 4.5pt of that is a stray trailing space
% in the old \fancyhead[C] code, the rest is unexplained and appears to be
% hand-placed.  The class centres it properly instead.  Set this to -9.2pt if
% you need to match the Volume 1 artwork exactly.
\newlength{\piplogohshift}      \setlength{\piplogohshift}{0pt}
\newlength{\pipborderxsep}      \setlength{\pipborderxsep}{25.25pt}
\newlength{\pipborderysep}      \setlength{\pipborderysep}{25.1pt}
\newlength{\pipbordergap}       \setlength{\pipbordergap}{1.75pt}
\newlength{\pipborderrule}      \setlength{\pipborderrule}{1pt}

% Left-hand flag: the Editor's Suggestion mark, or the journal name.
\newcommand{\pip@bannerleft}{%
  \ifpip@ec\scshape Editor's Suggestion\else\scshape\pip@journalname\fi
}

\newcommand{\pip@bannercentre}{%
  \raisebox{0.6cm}{\large\scshape CARTHAGE}%
  \hspace{0.2cm}%
  \includegraphics[height=\piplogoheight]{\pip@logofile}%
  \hspace{0.1cm}%
  \raisebox{0.6cm}{\large\scshape COLLEGE}%
}

% Zero-width L and R boxes keep the two \hfill's equal, so the centre group
% lands on the middle of the text block (which revtex centres on the page).
\newcommand{\pip@banner}{%
  \makebox[\textwidth]{%
    \makebox[0pt][l]{\raisebox{\dimexpr 0.6cm+1pt\relax}{\pip@bannerleft}}%
    \hfill
    % The +s/-s pair leaves the natural width unchanged (so both \hfill's stay
    % equal and the group stays centred) while displacing it by \piplogohshift.
    \hspace*{\piplogohshift}\makebox[0pt][c]{\pip@bannercentre}\hspace*{-\piplogohshift}%
    \hfill
    \makebox[0pt][r]{\raisebox{\dimexpr 0.6cm+1pt\relax}{\bfseries\pip@typename}}%
  }%
}

% Scratch lengths for the inner rule; computed at use time so that changing
% \pipborderxsep etc. in a document preamble still works.
\newlength{\pip@innerx}
\newlength{\pip@innery}

\newcommand{\pip@border}{%
  \setlength{\pip@innerx}{\pipborderxsep}\addtolength{\pip@innerx}{\pipbordergap}%
  \setlength{\pip@innery}{\pipborderysep}\addtolength{\pip@innery}{\pipbordergap}%
  \draw[line width=\pipborderrule, color=CarthageRed]
    ([xshift=\pipborderxsep,yshift=-\pipborderysep]current page.north west)
    rectangle
    ([xshift=-\pipborderxsep,yshift=\pipborderysep]current page.south east);
  \draw[line width=\pipborderrule, color=CarthageRed]
    ([xshift=\pip@innerx,yshift=-\pip@innery]current page.north west)
    rectangle
    ([xshift=-\pip@innerx,yshift=\pip@innery]current page.south east);
}

% The banner box is \textwidth wide, so it must be centred on the *text block*,
% not on the paper.  revtex's text block is not page-centred (\oddsidemargin is
% -18.07pt against a 1in reference), which puts the two apart by 2.06pt; centring
% on the page leaves the whole banner visibly left of the running-head rule
% below it.  \pipbannerhshift is a further manual nudge, normally 0pt.
\newcommand{\pip@textblockshift}{%
  \dimexpr 1in+\oddsidemargin+0.5\textwidth-0.5\paperwidth+\pipbannerhshift\relax
}

\newcommand{\pip@bannerpicture}{%
  \begin{tikzpicture}[remember picture, overlay]
    \ifpip@ec\pip@border\fi
    \node[anchor=base, inner sep=0pt, outer sep=0pt,
          xshift=\pip@textblockshift,
          yshift=-\pipbannerdrop] at (current page.north) {\pip@banner};
  \end{tikzpicture}%
}

%% The banner goes into the page background of the article's title page.
%%
%% This used to be done with \RequirePackage[firstpage=true]{background}, but
%% that route is not reliable on a current LaTeX kernel: background v2.1 (2014)
%% schedules the material with everypage's \AddThispageHook, which is now a shim
%% over \AddToHookNext{shipout/background}, and whether it survives to the first
%% shipout depends on what else the document happens to load.  A manuscript with
%% no extra \usepackage lines silently came out with NO banner at all, while the
%% same file plus an unrelated package rendered correctly.
%%
%% The kernel's own shipout hook has no such ambiguity.  The trigger is a flag
%% raised by \maketitle rather than a page-number test: revtex may renumber
%% pages, and in full-issue mode the banner has to reappear on the title page of
%% every article, not just on the first page of the file.  Nothing is shipped
%% out between \maketitle and the page carrying the title, so the flag always
%% lands on the right sheet.
\@ifundefined{AddToHook}{%
  \ClassError{physicsinprogress}
    {This class needs LaTeX 2020/10/01 or newer}
    {The banner is placed with the kernel hook \protect\AddToHook,
     which your LaTeX is too old to provide.  Please update your TeX
     distribution.}%
}{%
  \newif\ifpip@bannerpending
  \AddToHook{shipout/background}{%
    \ifpip@bannerpending
      \global\pip@bannerpendingfalse
      \pip@bannerpicture
    \fi
  }%
}

% The banner sits where revtex would otherwise start the title, so the title
% page needs to begin a little lower.  The old preambles did this by hand with
% a \vspace*{25pt} typed after \begin{document}; the class now does it for you.
\newlength{\piptitledrop}       \setlength{\piptitledrop}{25pt}

% \maketitle is wrapped rather than patched: the wrapper raises the banner flag
% and, in full-issue mode, keeps revtex's \label{FirstPage} from colliding with
% the next article's.  revtex does \let\maketitle\relax on its way out, so the
% wrapper is stashed under a private name for full-issue mode to restore.
\AtBeginDocument{%
  \let\pip@ltx@maketitle\maketitle
  \def\maketitle{%
    \global\pip@bannerpendingtrue
    \ifpip@issue
      \let\pip@saved@label\label
      \let\label\pip@titlelabel
    \fi
    \pip@ltx@maketitle
    \ifpip@issue\let\label\pip@saved@label\fi
  }%
  \ifpip@issue\else\vspace*{\piptitledrop}\fi
}

%% ---------------------------------------------------------------------------
%% Running heads (page 2 onwards)
%% ---------------------------------------------------------------------------

\pagestyle{fancy}
\fancyhf{}
\@ifundefined{fancyheadinit}
  {\setlength{\headheight}{20pt}}
  {\fancyheadinit{\setlength{\headheight}{20pt}}}
% The journal name is set in FULL capitals here but in small capitals on the
% first-page banner.  That asymmetry is inherited, not intentional: the old
% preambles wrote \scshape{PHYSICS IN PROGRESS} (already uppercase, so \scshape
% had nothing to shrink) while the banner artwork used true small capitals.
% Reproduced as-is so the class matches the published issues; drop the
% \MakeUppercase if you would rather the two agree.
\fancyhead[RO,LE]{\textbf{\pip@typename}}
\fancyhead[LO,RE]{\pip@citation}
\fancyhead[C]{\large\scshape\MakeUppercase{\pip@journalname}}
\fancyfoot[C]{\thepage}
\renewcommand{\headrulewidth}{0.4pt}
\renewcommand{\footrulewidth}{0pt}

%% ---------------------------------------------------------------------------
%% Full-issue mode (class option `issue')
%%
%% One document in the project root swallows every manuscript and numbers the
%% pages straight through:
%%
%%   \documentclass[issue]{physicsinprogress}
%%   \pipvolume{2}
%%   \pipissuedate{Feb. 2026}
%%   \usepackage{siunitx}
%%   \begin{document}
%%   \pipaddarticle{Manuscripts/BV_CoupledPendulum}
%%   \pipaddarticle[Manuscript]{Manuscripts/Semaje_PhotoElect}
%%   \end{document}
%%
%% The manuscripts are *not* modified for this: each one stays a standalone
%% document that still compiles on its own.  \pipaddarticle \include's the file
%% and the class throws away everything from \documentclass to \begin{document}
%% -- but reads the option list off that \documentclass line first, so `rc' and
%% `ec' stay with the manuscript that they describe instead of being restated
%% in the issue file.
%%
%% Consequences worth knowing about:
%%
%%   * A manuscript's own preamble is skipped, so packages it loads (siunitx,
%%     say) must be loaded by the issue document instead.  So must anything
%%     else it sets there -- \articletypename, custom macros, \setlength.
%%   * \label keys must be unique across the whole issue.  LaTeX says
%%     "Label `x' multiply defined" if they are not; the class handles revtex's
%%     own internal FirstPage / LastBibItem labels itself.
%%   * Each article keeps its own reference list, numbered from 1, via
%%     chapterbib.  This needs one BibTeX run per article; latexmk (and hence
%%     Overleaf) does that automatically, given the `latexmkrc' that ships in
%%     the project root -- see the \bibliography section below for why.
%% ---------------------------------------------------------------------------

\def\pip@artdir{}
\def\pip@artbase{manuscript}
\let\pip@bibfiles\@empty
\def\pip@firstpagelabel{FirstPage}
\def\pip@lastbibitemlabel{LastBibItem}

% revtex writes \label{FirstPage} from inside \maketitle and \label{LastBibItem}
% from inside the bibliography, once per article.  These rewriters give each
% article its own copy of those two names; every other label passes through
% untouched.  \pip@saved@label / \pip@saved@ref hold the real commands, and are
% installed by whoever swaps these in.
\newcommand{\pip@titlelabel}[1]{%
  \def\pip@tempa{#1}\def\pip@tempb{FirstPage}%
  \ifx\pip@tempa\pip@tempb
    \expandafter\pip@saved@label\expandafter{\pip@firstpagelabel}%
  \else
    \pip@saved@label{#1}%
  \fi
}
\newcommand{\pip@biblabel}[1]{%
  \def\pip@tempa{#1}\def\pip@tempb{LastBibItem}%
  \ifx\pip@tempa\pip@tempb
    \expandafter\pip@saved@label\expandafter{\pip@lastbibitemlabel}%
  \else
    \pip@saved@label{#1}%
  \fi
}
\newcommand{\pip@bibref}[1]{%
  \def\pip@tempa{#1}\def\pip@tempb{LastBibItem}%
  \ifx\pip@tempa\pip@tempb
    \expandafter\pip@saved@ref\expandafter{\pip@lastbibitemlabel}%
  \else
    \pip@saved@ref{#1}%
  \fi
}

\ifpip@issue

\newcounter{pip@article}
\newcount\pip@nesting

% The state the issue's own \documentclass options asked for.  Every article
% starts from here and then applies its own options on top.
\edef\pip@defaultstate{%
  \ifpip@ec\noexpand\pip@ectrue\else\noexpand\pip@ecfalse\fi
  \ifpip@rc\noexpand\pip@rctrue\else\noexpand\pip@rcfalse\fi
}

%% --- per-article reset ------------------------------------------------------
%%
%% revtex's \maketitle disables the frontmatter commands on its way out
%% (\let\author\@gobble, \let\maketitle\relax, \let\abstract\@undefined, ...),
%% which is why a second \title/\author/\maketitle in the same document
%% normally does nothing.  Snapshot them while they still work and put them
%% back before each article; \frontmatter@init is revtex's own routine for
%% clearing the collected author/affiliation lists.

\newcommand{\pip@fmsave}{%
  \@for\pip@tempc:=maketitle,title,author,affiliation,altaffiliation,%
collaboration,noaffiliation,email,homepage,thanks,and,keywords,pacs,date,%
abstract,endabstract\do{%
    \ifcsname\pip@tempc\endcsname
      \expandafter\let\csname pip@fm@\pip@tempc\expandafter\endcsname
                      \csname\pip@tempc\endcsname
    \fi
  }%
  \let\pip@fm@AFjoin\@AF@join
}
\newcommand{\pip@fmrestore}{%
  \@for\pip@tempc:=maketitle,title,author,affiliation,altaffiliation,%
collaboration,noaffiliation,email,homepage,thanks,and,keywords,pacs,date,%
abstract,endabstract\do{%
    \ifcsname pip@fm@\pip@tempc\endcsname
      \expandafter\let\csname\pip@tempc\expandafter\endcsname
                      \csname pip@fm@\pip@tempc\endcsname
    \fi
  }%
  \let\@AF@join\pip@fm@AFjoin
}

\newcommand{\pip@resetarticle}{%
  \pip@fmrestore
  \frontmatter@init
  \pip@defaultstate    % \pip@settypename follows once the article's own options
                       % have been applied on top of this
  \setcounter{section}{0}%
  \setcounter{subsection}{0}\setcounter{subsubsection}{0}%
  \setcounter{paragraph}{0}\setcounter{subparagraph}{0}%
  \setcounter{figure}{0}\setcounter{table}{0}\setcounter{equation}{0}%
  \ifcsname c@parentequation\endcsname\setcounter{parentequation}{0}\fi
  \ifcsname c@video\endcsname\setcounter{video}{0}\fi
  \ifcsname c@NAT@ctr\endcsname\setcounter{NAT@ctr}{0}\fi
  % The footnote counter deliberately keeps running under `footinbib': revtex
  % turns each footnote into a bibliography entry keyed Note<n>, and those keys
  % have to stay distinct across the whole issue.  Nothing shows -- the mark the
  % reader sees is the citation number, which does restart per article.
  \ifpip@footinbib\else\setcounter{footnote}{0}\fi
}

%% --- reading the manuscript's own \documentclass ---------------------------

\@namedef{pip@option@issue}{}      % harmless if a manuscript ever carries it
\@namedef{pip@option@fullissue}{}

\newcommand{\pip@setartoptions}[1]{%
  \@for\pip@tempc:=#1\do{%
    % \romannumeral-`0 expands its way through, and past, any leading spaces,
    % so `[rc, ec]' works as well as `[rc,ec]'.
    \edef\pip@tempc{\romannumeral-`0\pip@tempc}%
    \ifcsname pip@option@\pip@tempc\endcsname
      \csname pip@option@\pip@tempc\endcsname
    \else
      \ClassWarning{physicsinprogress}%
        {Ignoring option `\pip@tempc' from \pip@artdir\space -- full-issue mode
         only reads the journal options (ec/noec, rc/oa) off a manuscript's
         \protect\documentclass\space line}%
    \fi
  }%
}

\def\pip@documentenvname{document}

% Swallow everything between \documentclass and \begin{document}.  The loop
% skips any other environment it meets on the way, so a preamble that opens a
% \begin{tikzpicture} inside a macro argument does not stop it early.
\long\def\pip@gobblepreamble#1\begin#2{%
  \def\pip@tempa{#2}%
  \ifx\pip@tempa\pip@documentenvname
    \begin{document}%
  \else
    \expandafter\pip@gobblepreamble
  \fi
}

\newcommand{\pip@documentclass}{%
  \@ifnextchar[\pip@documentclass@{\pip@documentclass@[]}%
}
\def\pip@documentclass@[#1]#2{%
  \stepcounter{pip@article}%
  \edef\pip@firstpagelabel{pip@firstpage@\thepip@article}%
  \edef\pip@lastbibitemlabel{pip@lastbibitem@\thepip@article}%
  \pip@resetarticle
  \pip@setartoptions{#1}%
  \pip@settypename
  \edef\pip@tempa{\noexpand\graphicspath{{\pip@artdir/}{./}}}\pip@tempa
  \pip@gobblepreamble
}

% Neutralise \begin{document} / \end{document} inside an included manuscript.
% Same shape as the docmute package: the real \document runs once, for the issue
% file, and installs a replacement environment for the articles.  The
% \piptitledrop that a standalone article gets at \begin{document} is applied
% here instead, once per article.
\let\pip@ltx@document\document
\let\pip@ltx@enddocument\enddocument
\def\document{%
  \pip@ltx@document
  \pip@nesting\z@
  \let\documentclass\pip@documentclass
  \renewenvironment{document}{%
    \endgroup
    \advance\pip@nesting\@ne
    \vspace*{\piptitledrop}%
    \ignorespaces
  }{%
    \ifnum\pip@nesting=\z@
      \expandafter\pip@ltx@enddocument
    \else
      \advance\pip@nesting\m@ne
      \begingroup
      \@ignoretrue
      \def\@currenvir{document}%
      \endinput
    \fi
  }%
  \ignorespaces
}

%% --- one reference list per article ----------------------------------------
%%
%% chapterbib gives each \include'd file its own bibliography, numbered from 1,
%% with its own BibTeX run over its own databases.  It also keeps the numbering
%% straight when two articles cite the same key: each gets its own number for it
%% rather than both picking up whichever one was defined last.
\RequirePackage{chapterbib}

% Without this, revtex emits \bibliography{} at the very end of the run for the
% "document with no bibliography" case.  In issue mode every article has called
% \bibliography already, and the extra one writes \bibdata{} into the master
% .aux, which makes BibTeX throw away every database it was given.
\let\auto@bib\@empty

% chapterbib replaces \bibliography wholesale, which loses two things revtex
% needs: the endnote database that `footinbib' writes (where the \footnote text
% lives, so that it can come out as a numbered reference), and a \bibstyle line
% -- revtex defers that to the end of the document, so it lands in the master
% .aux and never in the per-article one BibTeX is actually run on.  Put both
% back.
%
% Database names are also rewritten to sit under the article's own directory,
% so that a manuscript's \bibliography{bib} keeps resolving when the issue is
% built from the project root.  This is what `latexmkrc' in the project root is
% for: it turns off latexmk's habit of chdir'ing into the folder that holds the
% .aux file before calling BibTeX, which would otherwise leave these paths
% pointing at nothing.  Several manuscripts name their database `bib.bib', so
% resolving them by search path instead of by full path is not an option --
% BibTeX would silently hand an article the wrong references.
\newcommand{\pip@bibstyle}{apsrev4-2}
\let\pip@cb@bibliography\bibliography

\newcommand{\pip@prefixbibs}[1]{%
  \let\pip@bibfiles\@empty
  \@for\pip@tempc:=#1\do{%
    \edef\pip@tempc{\romannumeral-`0\pip@tempc}%
    \ifx\pip@bibfiles\@empty
      \edef\pip@bibfiles{\pip@artdir/\pip@tempc}%
    \else
      \edef\pip@bibfiles{\pip@bibfiles,\pip@artdir/\pip@tempc}%
    \fi
  }%
}

\renewcommand{\bibliography}[1]{%
  \if@filesw
    \immediate\write\@auxout{\string\bibstyle{\pip@bibstyle}}%
  \fi
  \pip@prefixbibs{#1}%
  % \pre@bibdata is revtex's endnote database (jobnameNotes.bib, holding the
  % \footnote text that `footinbib' turns into numbered references).  It lives
  % in the project root, next to the issue file, so it is not prefixed.
  \edef\pip@bibfiles{\pre@bibdata,\pip@bibfiles}%
  \let\pip@saved@label\label \let\label\pip@biblabel
  \let\pip@saved@ref\ref     \let\ref\pip@bibref
  \expandafter\pip@cb@bibliography\expandafter{\pip@bibfiles}%
  \let\label\pip@saved@label \let\ref\pip@saved@ref
}

%% --- the user-facing command ------------------------------------------------

% Everything per-article hangs off the manuscript's own \documentclass line, so
% say something useful rather than misbehaving silently if there isn't one.
\newcommand{\pipaddarticle}[2][manuscript]{%
  \def\pip@artdir{#2}%
  \def\pip@artbase{#1}%
  \edef\pip@artcheck{\thepip@article}%
  \include{#2/#1}%
  \edef\pip@tempa{\thepip@article}%
  \ifx\pip@tempa\pip@artcheck
    \ClassWarning{physicsinprogress}%
      {No \protect\documentclass\space line in #2/#1.tex.
       \protect\pipaddarticle\space expects a standalone manuscript; without
       that line the article's options, counters and banner are never reset}%
  \fi
}

\else   % ------------------------------------------------- not full-issue mode

\newcommand{\pipaddarticle}[2][manuscript]{%
  \ClassError{physicsinprogress}
    {\protect\pipaddarticle\space needs the `issue' class option}
    {\protect\pipaddarticle\space assembles a whole issue out of standalone
     manuscripts, which only works in a document declared as
     \protect\documentclass[issue]{physicsinprogress}.}%
}

\fi

\AtBeginDocument{\ifpip@issue\pip@fmsave\fi}

\endinput
