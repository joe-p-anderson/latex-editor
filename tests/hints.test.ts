// The first-time hints (.scratch/onboarding/spec.md, "First-time hints"):
// one strip at a time, a queue behind it, and dismissals that stick.
import { describe, expect, it } from 'vitest'
import { HINTS, HintQueue, hintText } from '../src/shared/hints'

const DEFAULT_KEYS: Record<string, string> = { 'file.save': 'Ctrl+S', 'build.recompile': 'Ctrl+Shift+B', 'view.toggleLive': 'Ctrl+Shift+L' }
const hint = (id: string) => HINTS.find((h) => h.id === id)!

describe('the hints', () => {
  it('are the three the spec lists, in its wording', () => {
    expect(HINTS.map((h) => h.id)).toEqual(['live-source', 'first-build', 'first-error'])
    expect(hintText(hint('first-build'), (id) => DEFAULT_KEYS[id] ?? null)).toBe('Saving built your PDF. Ctrl+S builds, and Ctrl+Shift+B rebuilds without saving.')
    expect(hintText(hint('live-source'), (id) => DEFAULT_KEYS[id] ?? null)).toMatch(/Switch to Source view for plain LaTeX \(Ctrl\+Shift\+L\)\.$/)
  })

  it("name each command's key as the registry has it", () => {
    const keys: Record<string, string> = { ...DEFAULT_KEYS, 'file.save': 'Ctrl+E' }
    expect(hintText(hint('first-build'), (id) => keys[id] ?? null)).toBe('Saving built your PDF. Ctrl+E builds, and Ctrl+Shift+B rebuilds without saving.')
  })
})

describe('HintQueue', () => {
  it('shows a hint when it is triggered', () => {
    const q = new HintQueue([])
    expect(q.current).toBeNull()
    q.trigger('live-source')
    expect(q.current?.id).toBe('live-source')
  })

  it('queues a second hint behind the one showing, and shows it on dismissal', () => {
    const q = new HintQueue([])
    q.trigger('live-source')
    q.trigger('first-build')
    expect(q.current?.id).toBe('live-source')
    expect(q.dismiss()).toBe('live-source')
    expect(q.current?.id).toBe('first-build')
    q.dismiss()
    expect(q.current).toBeNull()
  })

  it('shows a hint once, however often it is triggered', () => {
    const q = new HintQueue([])
    q.trigger('live-source')
    q.trigger('live-source')
    q.dismiss()
    q.trigger('live-source')
    expect(q.current).toBeNull()
  })

  it('never shows a dismissed hint', () => {
    const q = new HintQueue(['first-error'])
    q.trigger('first-error')
    expect(q.current).toBeNull()
  })

  it('drops hints already triggered when the stored dismissals arrive', () => {
    const q = new HintQueue([])
    q.trigger('live-source')
    q.trigger('first-build')
    q.setDismissed(['live-source'])
    expect(q.current?.id).toBe('first-build')
  })

  it('shows every hint again after a reset', () => {
    const q = new HintQueue(['live-source', 'first-build', 'first-error'])
    q.reset()
    q.trigger('first-error')
    expect(q.current?.id).toBe('first-error')
  })

  it('tells its listener when the strip changes', () => {
    const q = new HintQueue([])
    const seen: (string | null)[] = []
    q.subscribe(() => seen.push(q.current?.id ?? null))
    q.trigger('live-source')
    q.trigger('first-build')
    q.dismiss()
    expect(seen).toEqual(['live-source', 'first-build'])
  })
})
