// The first-time hints (.scratch/onboarding/spec.md, "First-time hints"):
// one strip at a time, a queue behind it, and dismissals that stick.
import { describe, expect, it } from 'vitest'
import { HINTS, HintQueue } from '../src/shared/hints'

describe('the hints', () => {
  it('are the three the spec lists, in its wording', () => {
    expect(HINTS.map((h) => h.id)).toEqual(['live-source', 'first-build', 'first-error'])
    expect(HINTS.find((h) => h.id === 'first-build')?.text).toBe('Saving built your PDF. Ctrl+S builds, and Ctrl+Shift+B rebuilds without saving.')
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
