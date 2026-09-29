import type { Api } from '../shared/api'

declare global {
  interface Window {
    api: Api & { onMenuOpenVault(cb: () => void): () => void }
  }
}
