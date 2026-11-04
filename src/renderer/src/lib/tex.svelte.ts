// Which TeX distribution builds use, for anything in the renderer that
// depends on it: the no-TeX card, the Build commands' `build` condition,
// the first-build hint. (About endleaf asks the main process.) App.svelte
// checks at launch; the card's Check again checks again. Reactive: read it
// in a component or $derived and it updates.
import type { TexInfo } from '@shared/api'

export const tex = $state<{
  /** Whether detection has finished at least once. */
  checked: boolean
  /** What was found; null before the first check and when none is installed. */
  info: TexInfo | null
}>({ checked: false, info: null })

/**
 * Whether documents can build, for what menus and keys say: TeX is
 * installed, or the first check hasn't finished yet. A build itself waits
 * for the check instead (`texReady`).
 */
export const canBuild = (): boolean => !tex.checked || !!tex.info

/** Whether TeX was looked for and isn't installed: the card shows, and nothing builds. */
export const texMissing = (): boolean => tex.checked && !tex.info

let pending: Promise<TexInfo | null> | null = null

/** Looks for TeX (again); concurrent calls share one look. */
export function checkTeX(): Promise<TexInfo | null> {
  pending ??= window.api
    .detectTeX()
    .catch(() => null)
    .then((info) => {
      tex.info = info
      tex.checked = true
      pending = null
      return info
    })
  return pending
}

/**
 * Whether documents can build, once TeX has been looked for: a build awaits
 * this, so none starts before detection reports TeX missing. Saving doesn't.
 */
export async function texReady(): Promise<boolean> {
  if (!tex.checked) await checkTeX()
  return !!tex.info
}
