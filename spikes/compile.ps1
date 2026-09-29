<#
.SYNOPSIS
    Spike: the compile pipeline the editor will use, as a script.

.DESCRIPTION
    Compiles one .tex file in a vault so that:
      - the document class comes from a shared template library (TEXINPUTS),
        not from a copy inside the vault;
      - aux/log/synctex files land in a hidden per-document cache,
        <vault>/.texcache/<reldir>/<name>/;
      - the finished PDF lands in a mirrored tree, <vault>/pdf/<reldir>/<name>.pdf.

    pdflatex runs from the vault root so \includegraphics{Images/...} resolves
    the way it always has.

.PARAMETER Layout
    cache  : PDF and synctex are built in the cache; the PDF is then copied to pdf/.
    pdfout : -output-directory is pdf/<reldir>; only aux files go to the cache.

.EXAMPLE
    .\spikes\compile.ps1 -Vault fixtures\vaults\1200-latex -Tex Homework\HW3_vectors.tex
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$Vault,
    [Parameter(Mandatory)] [string]$Tex,
    [string]$Templates = (Join-Path $PSScriptRoot '..\fixtures\_templates'),
    [ValidateSet('cache', 'pdfout')] [string]$Layout = 'cache',
    [int]$MaxPasses = 4
)

$ErrorActionPreference = 'Stop'
$Vault     = (Resolve-Path $Vault).Path
$Templates = (Resolve-Path $Templates).Path

Push-Location $Vault
try {
    $Tex    = $Tex -replace '\\', '/'
    $relDir = Split-Path $Tex -Parent
    $name   = [System.IO.Path]::GetFileNameWithoutExtension($Tex)

    $cacheDir = Join-Path '.texcache' (Join-Path $relDir $name)
    $pdfDir   = Join-Path 'pdf' $relDir
    $outDir   = if ($Layout -eq 'cache') { $cacheDir } else { $pdfDir }
    New-Item -ItemType Directory -Force $cacheDir, $pdfDir | Out-Null

    # '//' makes kpathsea search subfolders; the trailing ';' appends the
    # default search path so standard packages are still found.
    $env:TEXINPUTS = "$Templates//;"

    $log = Join-Path $cacheDir "$name.log"
    $pass = 0
    do {
        $pass++
        & pdflatex -synctex=1 -interaction=nonstopmode -file-line-error `
            "-aux-directory=$cacheDir" "-output-directory=$outDir" $Tex | Out-Null
        $exit = $LASTEXITCODE
        $rerun = (Test-Path $log) -and
            (Select-String -Path $log -Quiet -CaseSensitive -Pattern 'Rerun to get|Label\(s\) may have changed|Rerun LaTeX')
    } while ($rerun -and $pass -lt $MaxPasses)

    if ($Layout -eq 'cache' -and (Test-Path (Join-Path $cacheDir "$name.pdf"))) {
        Copy-Item (Join-Path $cacheDir "$name.pdf") (Join-Path $pdfDir "$name.pdf") -Force
    }

    [pscustomobject]@{
        Tex    = $Tex
        Passes = $pass
        Exit   = $exit
        Pdf    = Join-Path $pdfDir "$name.pdf"
        Log    = $log
    }
}
finally {
    Pop-Location
}
