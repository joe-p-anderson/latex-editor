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
%% See README-physicsinprogress.md for usage.
%%
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{physicsinprogress}[2026/07/30 v1.0 Physics in Progress journal class]

%% ---------------------------------------------------------------------------
%% Class options
%% ---------------------------------------------------------------------------

\newif\ifpip@ec        \pip@ecfalse   % Editor's Suggestion?
\newif\ifpip@rc        \pip@rcfalse   % Rapid Communication? (false = Original Article)
\newif\ifpip@footinbib \pip@footinbibtrue

\DeclareOption{ec}{\pip@ectrue}
\DeclareOption{editorschoice}{\pip@ectrue}
\DeclareOption{noec}{\pip@ecfalse}

\DeclareOption{rc}{\pip@rctrue}
\DeclareOption{rapidcommunication}{\pip@rctrue}
\DeclareOption{oa}{\pip@rcfalse}
\DeclareOption{originalarticle}{\pip@rcfalse}

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

% Article type shown top-right on page 1 and in the running head.
\ifpip@rc
  \newcommand{\pip@typename}{Rapid Communication}
\else
  \newcommand{\pip@typename}{Original Article}
\fi

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

%% The banner goes into the page background of the first page only.
%%
%% This used to be done with \RequirePackage[firstpage=true]{background}, but
%% that route is not reliable on a current LaTeX kernel: background v2.1 (2014)
%% schedules the material with everypage's \AddThispageHook, which is now a shim
%% over \AddToHookNext{shipout/background}, and whether it survives to the first
%% shipout depends on what else the document happens to load.  A manuscript with
%% no extra \usepackage lines silently came out with NO banner at all, while the
%% same file plus an unrelated package rendered correctly.
%%
%% The kernel's own shipout hook has no such ambiguity.  A one-shot boolean is
%% used rather than a page-number test because revtex may renumber pages.
\@ifundefined{AddToHook}{%
  \ClassError{physicsinprogress}
    {This class needs LaTeX 2020/10/01 or newer}
    {The first-page banner is placed with the kernel hook \protect\AddToHook,
     which your LaTeX is too old to provide.  Please update your TeX
     distribution.}%
}{%
  \newif\ifpip@bannerdone
  \AddToHook{shipout/background}{%
    \ifpip@bannerdone\else
      \global\pip@bannerdonetrue
      \pip@bannerpicture
    \fi
  }%
}

% The banner sits where revtex would otherwise start the title, so the first
% page needs to begin a little lower.  The old preambles did this by hand with
% a \vspace*{25pt} typed after \begin{document}; the class now does it for you.
\newlength{\piptitledrop}       \setlength{\piptitledrop}{25pt}
\AtBeginDocument{\vspace*{\piptitledrop}}

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

\endinput
