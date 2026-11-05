import { describe, expect, it } from 'vitest'
import { codeSpans } from '../src/shared/codespans'

/** Each span as [whole source, contents]. */
const spans = (text: string) => codeSpans(text).map((s) => [text.slice(s.from, s.to), text.slice(s.bodyFrom, s.bodyTo)])

describe('codeSpans', () => {
  it('finds \\verb with any non-letter delimiter', () => {
    expect(spans('a \\verb|\\section{x}| b \\verb!$! c \\verb+x+')).toEqual([
      ['\\verb|\\section{x}|', '\\section{x}'],
      ['\\verb!$!', '$'],
      ['\\verb+x+', 'x'],
    ])
  })

  it('finds \\verb*, \\lstinline and \\mintinline in each form', () => {
    expect(spans('\\verb*|a b| \\lstinline!x=1! \\lstinline[language=C]{f(){}} \\lstinline[style=s]|y|')).toEqual([
      ['\\verb*|a b|', 'a b'],
      ['\\lstinline!x=1!', 'x=1'],
      ['\\lstinline[language=C]{f(){}}', 'f(){}'],
      ['\\lstinline[style=s]|y|', 'y'],
    ])
    expect(spans('\\mintinline{python}{print(1)} \\mintinline[bgcolor=x]{c}|int i;|')).toEqual([
      ['\\mintinline{python}{print(1)}', 'print(1)'],
      ['\\mintinline[bgcolor=x]{c}|int i;|', 'int i;'],
    ])
  })

  it('leaves an unterminated span alone, so the rest of the line is still source', () => {
    expect(spans('\\verb|abc \\section{x}\nnext| line')).toEqual([])
    expect(spans('\\lstinline{abc\n}')).toEqual([])
    expect(spans('\\verb|abc\n\\verb!ok!')).toEqual([['\\verb!ok!', 'ok']])
  })

  it('ignores commands that only start like one, and a \\verb with a letter or space after it', () => {
    expect(spans('\\verbatiminput{f} \\verb x \\lstinputlisting{f}')).toEqual([])
  })

  it('skips comments, but a % inside a span is not one', () => {
    expect(spans('% \\verb|x|\n\\verb|50%| and \\verb!y!')).toEqual([
      ['\\verb|50%|', '50%'],
      ['\\verb!y!', 'y'],
    ])
    expect(spans('\\% \\verb|z|')).toEqual([['\\verb|z|', 'z']])
  })
})
