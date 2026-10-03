import type { PluginManifest } from '../../shared/plugin'

export default {
  id: 'zotero',
  name: 'Zotero',
  description:
    'Cite references from your Zotero library. Picked items are copied into a real .bib file in the vault, so the document builds with Zotero closed and on other machines. Works best with Better BibTeX.',
  icon: 'cite',
  defaultEnabled: false,
  links: ['https://www.zotero.org/download/', 'https://github.com/retorquere/zotero-better-bibtex/releases/latest'],
  settings: {
    vault: [
      {
        key: 'bib',
        label: 'Bibliography file',
        type: 'vaultFile',
        default: 'references.bib',
        help: 'Where Zotero items are added when the document names no .bib of its own. A .bib the document already uses is preferred.',
      },
      {
        key: 'syncCollection',
        label: 'Sync a Zotero collection',
        type: 'bool',
        default: false,
        help: 'After a full build, fill a Zotero collection with the references the document cites (needs Better BibTeX). The collection is cleared and refilled each time.',
      },
      {
        key: 'collection',
        label: 'Collection',
        type: 'string',
        default: 'endleaf/{vault}/{document}',
        help: '{vault} is this vault\'s name and {document} the document being built. Slashes make sub-collections.',
      },
    ],
    global: [{ key: 'port', label: 'Zotero port', type: 'number', default: 23119, min: 1, max: 65535, help: 'Zotero listens here for other programs. Change it only if you changed it in Zotero.' }],
  },
} satisfies PluginManifest
