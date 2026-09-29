\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{reflection}[2026/08/13 field work and reflection sheets]

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% options
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Anything passed here goes to article, so \documentclass[12pt]{reflection}
% and friends work as expected.
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{article}}
\ProcessOptions\relax

\LoadClass{article}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% packages
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\RequirePackage[margin=1in]{geometry}
\RequirePackage{graphicx}
\graphicspath{{./}{../}} % find Images/ from the project root or from this folder
\RequirePackage{xcolor}
\RequirePackage{forloop}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% sheet identity
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% \fieldwork{5}  heads the sheet "Physics field work 5"
% \reflection{1} heads it "Reflection 1:"
\newif\ifrf@fieldwork \rf@fieldworktrue
\def\rf@number{}
\def\rf@topic{}
\def\rf@due{}
\def\rf@course{Physics}

\newcommand{\fieldwork}[1]{\rf@fieldworktrue\def\rf@number{#1}}
\newcommand{\reflection}[1]{\rf@fieldworkfalse\def\rf@number{#1}}

\newcommand{\topic}[1]{\def\rf@topic{#1}}
\newcommand{\duedate}[1]{\def\rf@due{Due #1.}}
\newcommand{\coursename}[1]{\def\rf@course{#1}}  % "Physics" by default

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% the boilerplate every sheet carries
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\def\rf@aitext{I acknowledge that the usage of generative AI on this assignment
is a cowardly avoidance of engagement with my own personal experience.}
\newcommand{\setaistatement}[1]{\def\rf@aitext{#1}}

\newcommand{\aistatement}{\textbf{AI usage statement}: \rf@aitext}

\newcommand{\signatureline}[1][2in]{%
\hspace*{\fill}Signature:\underline{\hspace{#1}}
\vspace{.1\baselineskip}\\
}

\renewcommand{\maketitle}{%
\begin{center}
    \ifrf@fieldwork
        {\huge \bfseries \rf@course\ field work \rf@number\\}\vspace{\baselineskip}
        {\Large \rf@topic}
        \ifx\rf@due\@empty\else\par\rf@due\fi
    \else
        \LARGE\bfseries
        Reflection \rf@number:\\
        \rf@topic
    \fi
\end{center}
\thispagestyle{empty}
\aistatement

\signatureline
}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% ruled writing space
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% \ruledlines{19} draws 19 full-width grey rules to write on.
\newcounter{rf@line}
\newcounter{rf@lastline}
\newcommand{\ruledlines}[1]{%
\par\vspace{3mm}%
\setcounter{rf@lastline}{#1}\addtocounter{rf@lastline}{1}%
\noindent\forloop{rf@line}{1}{\value{rf@line} < \value{rf@lastline}}{\vspace{3mm}\color{gray}\underline{\hspace*{\textwidth}}  }%
}
