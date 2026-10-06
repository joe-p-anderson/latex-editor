\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{latexinprogress}[2024/02/02 LateX in Progress class]

\RequirePackage{amsmath}
\RequirePackage{amsfont}
\RequirePackage{graphicx}

\definecolor{CarthageRed}{RGB}{208, 46, 32}

\newcommand{\headlinecolor}{\normalcolor}

\RequirePackage{xcolor}
\definecolor{slcolor}{HTML}{882B21}

\DeclareOption{onecolumn}{\OptionNotUsed}
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{article}}
\ProcessOptions\relax
\LoadClass[twocolumn]{article}