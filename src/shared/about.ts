// Help → About endleaf and Report an Issue: what the main process tells the
// renderer about the app, and the issue link built from it.

export interface AboutInfo {
  version: string
  electron: string
  chromium: string
  /** "Windows 10.0.19045 (x64)": the OS name, release and architecture only. */
  os: string
  /** The TeX distribution found, e.g. "MiKTeX 24.1"; null when none is installed. */
  tex: string | null
}

export const ISSUES = 'https://github.com/joe-p-anderson/latex-editor/issues/new'

/** Where to get a TeX distribution: the no-TeX card links here, and the main process lets these open. */
export const TEX_DOWNLOADS = { miktex: 'https://miktex.org/download', texLive: 'https://tug.org/texlive/' } as const

/** A new issue with the version and OS in its body, for the reporter to describe the problem above. No personal data. */
export function issueUrl(info: Pick<AboutInfo, 'version' | 'os'>): string {
  const body = `**What happened, and what did you expect?**\n\n\n**Steps to reproduce**\n\n\n---\nendleaf ${info.version} on ${info.os}\n`
  return `${ISSUES}?${new URLSearchParams({ body })}`
}
