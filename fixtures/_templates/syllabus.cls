\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{syllabus}[2026/08/13 Carthage course syllabi]

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% options
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Anything passed here goes to article, so \documentclass[12pt]{syllabus}
% and friends work as expected.
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{article}}
\ProcessOptions\relax

\LoadClass[11pt]{article}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% packages
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Load order is the one main.tex used: hyperref last, enumitem before the
% \setlist calls below, titlesec before \titleformat, fancyhdr before
% \fancypagestyle, titling before the \pretitle hooks.
\RequirePackage{booktabs}
\RequirePackage[margin=1in]{geometry}
\RequirePackage{tabularx}
\RequirePackage[dvipsnames]{xcolor}
\RequirePackage{mathptmx}
\RequirePackage{graphicx} % Required for inserting images
\graphicspath{{./}{../}}  % find Assets/ from the project root or from a course folder
\RequirePackage{titlesec}
\RequirePackage{fancyhdr}
\RequirePackage{titling}
\RequirePackage{enumitem}
\RequirePackage[colorlinks = true,
        urlcolor  = RoyalBlue]{hyperref}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Carthage colours
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\definecolor{CarthageDark}{RGB}{122, 35, 47}

% Every \textbf in the document comes out in Carthage red. This is global and
% deliberate — the tables and \paragraph run-ins all rely on it.
\let\oldtextbf\textbf
\renewcommand{\textbf}[1]{\textcolor{CarthageDark}{\oldtextbf{#1}}}

\setlist[enumerate,1]{label=\textcolor{CarthageDark}{\bfseries\arabic*.}}

\newlist{coloritemize}{itemize}{1}
\setlist[coloritemize]{label=\textcolor{CarthageDark}{\textbullet}}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% headings
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% The empty label argument is what drops the section numbers, which is why
% \section and \section* look the same here.
\titleformat{\section}
  {\color{CarthageDark}\normalfont\LARGE\bfseries} % Text style
  {} % Label (empty to omit section number)
  {0pt} % Separation between label and title
  {\color{CarthageDark}} % Code before the title
  [{\color{CarthageDark}\vspace{0.5ex}\hrule\vspace{1ex}}]

\titleformat{\subsection}
  {\color{CarthageDark}\normalfont\Large\bfseries} % Text style
  {} % Label (empty to omit section number)
  {0pt} % Separation between label and title
  {\color{CarthageDark}} % Code before the title
  []
\titleformat{\paragraph}[runin]
  {\color{CarthageDark}\normalfont\bfseries} % Text style
  {} % Label (empty to omit section number)
  {0pt} % Separation between label and title
  {\color{CarthageDark}} % Code before the title
  []
\titlespacing{\paragraph}{0pt}{.7\baselineskip}{.3em}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% page furniture
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% article's default page style is `plain', and \maketitle asks for `plain' on
% the first page, so redefining `plain' puts the logo on every page.
\fancypagestyle{plain}{%
%\setlength{\headheight}{60pt}
\fancyhead[L,C]{}
\fancyhf{}
\fancyhead[C]{\raisebox{.75cm}{\Large\scshape{CARTHAGE}}\hspace{0.3cm}\includegraphics[height=.75in]{Assets/Logo.pdf}\hspace{0.15cm}\raisebox{.75cm}{\Large\scshape{COLLEGE
 }}}
\fancyfoot[C]{\thepage}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}
}

\pretitle{% add some rules
  \begin{center}
    \huge\bfseries
}%, make the fonts bigger, make the title (only) bold
\posttitle{%
  \end{center}%
}
\predate{\begin{center}}
\postdate{\end{center}}
\preauthor{}
\postauthor{}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% course identity
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Each setter redefines itself, so \meeting{...} sets the value and a later
% bare \meeting prints it. Two consequences worth knowing: setting one twice
% does not work, and reading one that was never set swallows the token after
% it. Both are inherited from main.tex and left alone.
\newcommand{\office}{DSC 082}

\newcommand{\meeting}[1]{\renewcommand{\meeting}{#1}}
\newcommand{\officehours}[1]{\renewcommand{\officehours}{#1}}
\newcommand{\textbook}[4]{\newcommand{\textbooktitle}{#1}\newcommand{\textbookauthor}{#2}\newcommand{\textbookpublisher}{#3}\newcommand{\textbookyear}{#4}}
\newcommand{\prerequisites}[1]{\renewcommand{\prerequisites}{#1}}
\newcommand{\coursecode}[1]{\renewcommand{\coursecode}{#1}}

\newcommand{\lms}{Schoology}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% instructor information tables
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% \infotable      needs \meeting, \officehours, \textbook, \prerequisites
% \infotableport  the portfolio-seminar variant: same as \infotable without
%                 the textbook row. It was defined identically in the bodies
%                 of PHY2970_S26 and PHY3970_S26; it lives here now.
%
% Five of the nine syllabi still write this table out by hand instead of
% calling either macro: PHY1200, PHY3300, PHY3960, PHY4200, PHY4960.
\newcommand{\infotable}{
\raisebox{0.9\height}{

\begin{tabular}{lll}
\textbf{Instructor:}    & \multicolumn{2}{l}{Joseph Anderson}                             \\
\textbf{}               & \multicolumn{2}{l}{\href{mailto:janderson19@carthage.edu}{janderson19@carthage.edu}}                    \\
\textbf{}               & \multicolumn{2}{l}{\office}                    \\
\textbf{}               & \multicolumn{2}{l}{(262)551-5871}                               \\ \\
\textbf{Meeting times:} & \meeting \\ \\
\textbf{Office hours:}  & \officehours\\ \\
\textbf{Textbook:}      & \multicolumn{2}{l}{\textit{\textbooktitle}} \\
% \textbookauthor is a control word, so it would swallow a following space —
% hence the {} before the parenthesis.
\textbf{}               & \multicolumn{2}{l}{\textbookauthor{} (\textbookpublisher, \textbookyear)}     \\ \\
\textbf{Prerequisites:} & \prerequisites
\end{tabular}
%
}
}

\newcommand{\infotableport}{
\raisebox{0.9\height}{

\begin{tabular}{lll}
\textbf{Instructor:}    & \multicolumn{2}{l}{Joseph Anderson}                             \\
\textbf{}               & \multicolumn{2}{l}{\href{mailto:janderson19@carthage.edu}{janderson19@carthage.edu}}                    \\
\textbf{}               & \multicolumn{2}{l}{\office}                    \\
\textbf{}               & \multicolumn{2}{l}{(262)551-5871}                               \\ \\
\textbf{Meeting times:} & \meeting \\ \\
\textbf{Office hours:}  & \officehours\\ \\
\textbf{Prerequisites:} & \prerequisites
\end{tabular}
%
}
}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% shared prose in Pieces/
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% The fragments stay on disk as editable prose — college boilerplate changes
% per catalogue year. These macros are the supported way in, so the argument
% each fragment needs and the order they come in live in one place.
%
% Pieces/*.tex are fragments, not documents. Do not try to compile one.

% \lettergrades{a) ..., b) ...}
% Pieces/LetterGrades_normal.tex ends mid-sentence, on "the following
% criteria:", and the caller supplies the clause that finishes it. The space
% below is the one TeX used to insert at the fragment's end of file.
\newcommand{\lettergrades}[1]{\input{Pieces/LetterGrades_normal} #1}

% \latework{Easy} \latework{None} \latework{Partial}
% The argument is the Pieces/LateWork_*.tex suffix, so a new policy is a new
% file and needs no edit here.
\newcommand{\latework}[1]{\input{Pieces/LateWork_#1}}

% \tipsforsuccess{upper} \tipsforsuccess{problem}
\newcommand{\tipsforsuccess}[1]{\input{Pieces/TipsForSuccess_#1}}

% \collegepolicies                              the two blocks, no heading
% \collegepolicies[Other college policies]      with a heading between them
%
% The optional heading defaults to nothing because six of the nine syllabi
% run the two blocks together with no heading at all. To give every syllabus
% the same heading, change the default in the brackets below — that is the
% whole point of routing this through one macro.
\newcommand{\collegepolicies}[1][]{%
  \input{Pieces/ImportantPolicies}%
  \if\relax\detokenize{#1}\relax\else\subsection*{#1}\fi
  \input{Pieces/Boilerplate}%
}
