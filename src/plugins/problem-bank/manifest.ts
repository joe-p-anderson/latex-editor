import type { PluginManifest } from '../../shared/plugin'

export default {
  id: 'problem-bank',
  name: 'Problem bank',
  description:
    'Keep homework problems for reuse, one .tex file per problem. Search them, see where each is used, insert one into the open document, add the question you are editing to the bank, and check that a problem builds.',
  icon: 'book',
  defaultEnabled: false,
  settings: {
    vault: [
      { key: 'bank', label: 'Bank folder', type: 'vaultDir', default: 'Problems', help: 'The folder of problem files in this vault.' },
      {
        key: 'insertMode',
        label: 'Insert as',
        type: 'enum',
        options: ['input', 'copy'],
        default: 'input',
        help: 'input: put \\input{Problems/…} in the document. copy: put the problem text in, without its header.',
      },
      { key: 'previewClass', label: 'Check with class', type: 'string', default: 'exam', help: 'The document class used to check a problem when the bank has no _preamble.tex.' },
    ],
    global: [
      { key: 'library', label: 'Shared library folder', type: 'path', default: '', help: 'A folder of problems shared by every vault, searched too. Its problems are always copied in. Leave empty for none.' },
    ],
  },
} satisfies PluginManifest
