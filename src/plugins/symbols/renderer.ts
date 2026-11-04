import type { PluginRenderer } from '../../renderer/src/lib/plugins.svelte'
import SymbolsView from './ui/SymbolsView.svelte'

// The Symbols view: everything it does goes through the editor and package
// services, so the plugin is just the view, and Insert → Symbols to open it.
const symbols: PluginRenderer = (ctx) => {
  ctx.views.add({ id: 'palette', tip: 'Symbols', component: SymbolsView })
  ctx.commands.add({ id: 'open', title: 'Symbols…', category: 'Insert', run: () => ctx.views.show('palette') })
}

export default symbols
