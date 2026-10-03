import type { PluginManifest } from '../../shared/plugin'

export default {
  id: 'symbols',
  name: 'Symbols',
  description: 'A searchable symbol palette. Draw a symbol to find it (Detexify, offline), click to copy, double-click to insert, right-click to add its package.',
  icon: 'symbols',
  defaultEnabled: true,
} satisfies PluginManifest
