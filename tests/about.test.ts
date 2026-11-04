import { describe, expect, it } from 'vitest'
import { ISSUES, issueUrl } from '../src/shared/about'

describe('Report an Issue', () => {
  const url = new URL(issueUrl({ version: '0.1.0', os: 'Windows 10.0.19045 (x64)' }))

  it("opens a new issue on endleaf's GitHub", () => {
    expect(ISSUES).toBe('https://github.com/joe-p-anderson/latex-editor/issues/new')
    expect(`${url.origin}${url.pathname}`).toBe(ISSUES)
  })

  it('prefills the body with the version and OS, and nothing else about the machine', () => {
    const body = url.searchParams.get('body')!
    expect(body).toContain('endleaf 0.1.0')
    expect(body).toContain('Windows 10.0.19045 (x64)')
    expect([...url.searchParams.keys()]).toEqual(['body'])
  })
})
