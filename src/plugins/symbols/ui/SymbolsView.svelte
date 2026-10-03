<script lang="ts">
  /** The symbol palette as a plugin view: inserting goes through the host's editor and package services. */
  import { findMathRegions, mathAtCursor } from '@shared/mathregions'
  import type { PackageSpec } from '@shared/packages'
  import type { PluginViewProps } from '../../../renderer/src/lib/plugins.svelte'
  import SymbolPanel, { type LibrarySymbol, type SymbolActions } from './SymbolPanel.svelte'

  let { ctx, visible, docKey }: PluginViewProps = $props()

  // textcomp has been part of LaTeX itself since 2020, so it's never added.
  const needs = (s: LibrarySymbol): PackageSpec[] => [
    ...(s.fontenc ? [{ name: 'fontenc', options: s.fontenc }] : []),
    ...(s.package && s.package !== 'textcomp' ? [s.package] : []),
  ]

  const actions: SymbolActions = {
    insert(s) {
      const { editor, packages } = ctx.host
      if (!editor.file()) return ctx.host.notify('Open a document to insert a symbol')
      // A math symbol in text goes in $…$; a text symbol in math, in \text{…}.
      const text = editor.text()
      const pos = editor.cursor()
      const math = !!mathAtCursor(text, findMathRegions(text), pos)
      let insert = s.mode === 'math' && !math ? `$${s.command}$` : s.mode === 'text' && math ? `\\text{${s.command}}` : s.command
      // \alpha straight before a letter would run into it.
      if (/[A-Za-z]$/.test(insert) && /^[A-Za-z]/.test(text.slice(pos, pos + 1))) insert += ' '
      editor.insert(insert)
      editor.focus()
      // And what it needs, if the document doesn't load it yet.
      if (s.package || s.fontenc) packages.ensure(needs(s))
    },
    addPackage: (s) => void ctx.host.packages.ensure(needs(s)),
    hasPackage: async (s) => ((await ctx.host.packages.missing(needs(s)))?.length ?? 1) === 0,
    loadedPackages: () => ctx.host.packages.loaded(),
    note: (message) => ctx.host.notify(message),
  }
</script>

<SymbolPanel {actions} active={visible} {docKey} />
