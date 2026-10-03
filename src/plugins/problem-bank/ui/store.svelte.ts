// What the Problems view and the plugin's commands share: the bank's index,
// check results, and the problems marked for a new assignment.
import type { BankIndex, CheckResult, Fragment } from '../bank'

export const bank = $state({
  fragments: [] as Fragment[],
  checks: {} as Record<string, CheckResult>,
  folder: '',
  hasPreamble: false,
  loaded: false,
  /** Ids of the problems marked for "New assignment from problems", in marking order. */
  marked: [] as string[],
})

/** Takes in the main half's index. Marks of problems that are gone are dropped. */
export function setIndex(idx: BankIndex): void {
  bank.fragments = idx.fragments
  bank.checks = idx.checks
  bank.folder = idx.bank
  bank.hasPreamble = idx.hasPreamble
  bank.loaded = true
  const ids = new Set(idx.fragments.map((f) => f.id))
  bank.marked = bank.marked.filter((id) => ids.has(id))
}

/** Forgets everything (the plugin was switched off). */
export function resetStore(): void {
  bank.fragments = []
  bank.checks = {}
  bank.marked = []
  bank.loaded = false
}

export function toggleMark(id: string): void {
  bank.marked = bank.marked.includes(id) ? bank.marked.filter((x) => x !== id) : [...bank.marked, id]
}
