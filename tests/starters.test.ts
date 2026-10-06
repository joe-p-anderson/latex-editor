import { describe, expect, it } from 'vitest'
import { fields, fill, splitHeader } from '../src/shared/starters'

const auto = { date: '2026-10-06', filename: 'intro.tex', basename: 'intro' }

describe('starter fields', () => {
  const text = '\\section{{{Title|Untitled}}}\n\\label{sec:{{basename}}}\n{{Author}} {{Title}} {{date}}'
  it('lists distinct fields in order, skipping the automatic ones', () => {
    expect(fields(text)).toEqual([
      { name: 'Title', default: 'Untitled' },
      { name: 'Author', default: '' },
    ])
  })
  it('fills values, defaults and automatic fields', () => {
    expect(fill(text, { Author: 'Ada' }, auto)).toBe('\\section{Untitled}\n\\label{sec:intro}\nAda Untitled 2026-10-06')
    expect(fill(text, { Title: 'Hello', Author: '' }, auto)).toContain('\\section{Hello}')
  })
  it('writes \\{{ as a literal', () => {
    expect(fill('\\{{Name}} {{Name}}', { Name: 'x' }, auto)).toBe('{{Name}} x')
    expect(fields('\\{{Name}}')).toEqual([])
  })
  it('drops the description line', () => {
    const t = '%% starter: A thing\nbody {{X}}'
    expect(splitHeader(t)).toEqual({ description: 'A thing', body: 'body {{X}}' })
    expect(fill(t, { X: '1' }, auto)).toBe('body 1')
    expect(fields(t)).toEqual([{ name: 'X', default: '' }])
  })
})
