import { describe, expect, it } from 'vitest'
import { lineBreakOf, withLineBreaks } from '../src/shared/edits'

describe('line breaks', () => {
  it('takes CRLF when the text has any', () => {
    expect(lineBreakOf('a\nb\r\nc')).toBe('\r\n')
    expect(lineBreakOf('a\nb')).toBe('\n')
    expect(lineBreakOf('a\rb')).toBe('\n')
  })

  it('writes CRLF text pasted into an LF file with LF', () => {
    expect(withLineBreaks('one\r\ntwo\r\n', '\n')).toBe('one\ntwo\n')
  })

  it('writes LF text pasted into a CRLF file with CRLF', () => {
    expect(withLineBreaks('one\ntwo', '\r\n')).toBe('one\r\ntwo')
  })

  it('turns a lone CR into a break', () => {
    expect(withLineBreaks('one\rtwo\r\nthree\nfour', '\n')).toBe('one\ntwo\nthree\nfour')
  })
})
