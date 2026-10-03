import type { PluginRenderer } from '../../renderer/src/lib/plugins.svelte'
import SymbolsView from './ui/SymbolsView.svelte'

// The Symbols view: everything it does goes through the editor and package
// services, so the plugin is just the view.
const symbols: PluginRenderer = (ctx) => {
  ctx.views.add({ id: 'palette', tip: 'Symbols', component: SymbolsView })
}

export default symbols
