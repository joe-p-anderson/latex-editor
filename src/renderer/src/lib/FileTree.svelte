<script lang="ts">
  import { tick, untrack } from 'svelte'
  import type { TreeNode } from '@shared/api'
  import { badName, basename, dirname, isInside, joinRel, splitExt, type Move } from '@shared/paths'

  let {
    nodes,
    root,
    active,
    dirty,
    onopen,
    onmove,
    oncopyin,
    ondelete,
    onrename,
    onnewfile,
    oncreatefolder,
  }: {
    nodes: TreeNode[]
    /** Absolute path of the vault, for Copy path. */
    root: string
    active: string | null
    dirty: Set<string>
    onopen: (rel: string) => void
    onmove: (moves: Move[]) => void
    oncopyin: (paths: string[], dir: string) => void
    ondelete: (rels: string[]) => void
    onrename: (rel: string, name: string) => void
    onnewfile: (dir: string) => void
    oncreatefolder: (dir: string, name: string) => void
  } = $props()

  const DRAG_TYPE = 'application/x-endleaf-rels'

  // Folders start collapsed; the active file's ancestors are opened for it.
  // Only `active` is tracked: reading `expanded` here too would make the
  // effect re-trigger itself when it writes it.
  let expanded = $state(new Set<string>())
  $effect(() => {
    if (!active) return
    const parts = active.split('/')
    const next = new Set(untrack(() => expanded))
    for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join('/'))
    expanded = next
  })

  function toggle(rel: string) {
    if (expanded.has(rel)) expanded.delete(rel)
    else expanded.add(rel)
    expanded = new Set(expanded)
  }
  function expand(rel: string) {
    if (rel && !expanded.has(rel)) expanded = new Set(expanded).add(rel)
  }

  // --- Rows ------------------------------------------------------------------

  type Row = { node: TreeNode; depth: number; parent: string } | { creating: true; depth: number; parent: string }

  let creating = $state<string | null>(null) // the folder a new folder is being named in

  const rows = $derived.by(() => {
    const out: Row[] = []
    const walk = (list: TreeNode[], depth: number, parent: string) => {
      if (creating === parent) out.push({ creating: true, depth, parent })
      for (const node of list) {
        out.push({ node, depth, parent })
        if (node.kind === 'dir' && expanded.has(node.rel)) walk(node.children ?? [], depth + 1, node.rel)
      }
    }
    walk(nodes, 0, '')
    return out
  })
  const realRows = $derived(rows.filter((r): r is Extract<Row, { node: TreeNode }> => 'node' in r))

  const find = (rel: string) => realRows.find((r) => r.node.rel === rel)

  // --- Selection and focus -----------------------------------------------------

  let selected = $state(new Set<string>())
  let anchor = $state<string | null>(null)
  let focus = $state<string | null>(null)
  let navEl: HTMLElement

  const index = (rel: string | null) => (rel ? realRows.findIndex((r) => r.node.rel === rel) : -1)

  function selectRange(from: string, to: string) {
    const a = index(from)
    const b = index(to)
    if (a < 0 || b < 0) return
    selected = new Set(realRows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.node.rel))
  }

  async function focusRow(rel: string) {
    focus = rel
    await tick()
    navEl?.querySelector<HTMLElement>(`[data-rel="${CSS.escape(rel)}"]`)?.focus()
  }

  function onrowclick(e: MouseEvent, node: TreeNode) {
    focus = node.rel
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected)
      if (!next.delete(node.rel)) next.add(node.rel)
      selected = next
      anchor = node.rel
      return
    }
    if (e.shiftKey && anchor) {
      selectRange(anchor, node.rel)
      return
    }
    selected = new Set([node.rel])
    anchor = node.rel
    if (node.kind === 'dir') toggle(node.rel)
    else onopen(node.rel)
  }

  /** The folder new things go in: the focused folder, the focused file's folder, or the root. */
  export function targetDir(): string {
    const row = focus ? find(focus) : undefined
    if (!row) return ''
    return row.node.kind === 'dir' ? row.node.rel : row.parent
  }

  export function collapseAll() {
    expanded = new Set()
  }

  /** Starts naming a new folder in `dir` (default: where the selection is). */
  export function newFolder(dir = targetDir()) {
    expand(dir)
    renaming = null
    creating = dir
    draft = 'New folder'
    error = null
  }

  /** The selected items, without those inside another selected folder. */
  function topLevel(rels: string[]): string[] {
    return rels.filter((r) => !rels.some((o) => o !== r && isInside(r, o)))
  }

  // --- Keyboard ------------------------------------------------------------------

  function onkeydown(e: KeyboardEvent) {
    if (renaming || creating !== null) return
    const i = index(focus)
    const cur = i >= 0 ? realRows[i] : undefined
    const go = (to: number, extend: boolean) => {
      const target = realRows[Math.max(0, Math.min(realRows.length - 1, to))]
      if (!target) return
      if (extend) {
        anchor ??= focus
        if (anchor) selectRange(anchor, target.node.rel)
      } else {
        selected = new Set([target.node.rel])
        anchor = target.node.rel
      }
      focusRow(target.node.rel)
    }
    switch (e.key) {
      case 'ArrowDown':
        go(i < 0 ? 0 : i + 1, e.shiftKey)
        break
      case 'ArrowUp':
        go(i < 0 ? 0 : i - 1, e.shiftKey)
        break
      case 'Home':
        go(0, e.shiftKey)
        break
      case 'End':
        go(realRows.length - 1, e.shiftKey)
        break
      case 'ArrowRight':
        if (cur?.node.kind === 'dir') {
          if (!expanded.has(cur.node.rel)) expand(cur.node.rel)
          else if (cur.node.children?.length) go(i + 1, false)
        }
        break
      case 'ArrowLeft':
        if (cur?.node.kind === 'dir' && expanded.has(cur.node.rel)) toggle(cur.node.rel)
        else if (cur?.parent) go(index(cur.parent), false)
        break
      case 'Enter':
        if (cur) cur.node.kind === 'dir' ? toggle(cur.node.rel) : onopen(cur.node.rel)
        break
      case 'F2':
        if (cur) startRename(cur.node.rel)
        break
      case 'Delete': {
        const rels = topLevel(selected.size ? [...selected] : cur ? [cur.node.rel] : [])
        if (rels.length) ondelete(rels)
        break
      }
      case 'a':
        if (!(e.ctrlKey || e.metaKey)) return
        selected = new Set(realRows.map((r) => r.node.rel))
        break
      default:
        return
    }
    e.preventDefault()
  }

  // --- Inline rename and new folder ----------------------------------------------

  let renaming = $state<string | null>(null)
  let draft = $state('')
  let error = $state<string | null>(null)

  function startRename(rel: string) {
    creating = null
    renaming = rel
    draft = basename(rel)
    error = null
  }

  /** Puts the cursor in the field with the name (not the extension) selected. */
  function editing(input: HTMLInputElement, selectStem: boolean) {
    input.focus()
    input.setSelectionRange(0, selectStem ? splitExt(input.value)[0].length : input.value.length)
  }

  function validate(parent: string, name: string, own?: string): string | null {
    const bad = badName(name)
    if (bad) return bad
    const siblings = parent ? (find(parent)?.node.children ?? []) : nodes
    if (siblings.some((n) => n.rel !== own && n.name.toLowerCase() === name.toLowerCase())) return `${name} already exists here`
    return null
  }

  function commit() {
    const name = draft.trim()
    if (renaming) {
      const rel = renaming
      if (name === basename(rel)) return cancel()
      error = validate(dirname(rel), name, rel)
      if (error) return
      renaming = null
      onrename(rel, name)
      focusRow(joinRel(dirname(rel), name))
    } else if (creating !== null) {
      const dir = creating
      error = validate(dir, name)
      if (error) return
      creating = null
      oncreatefolder(dir, name)
    }
  }
  function cancel() {
    const rel = renaming
    renaming = null
    creating = null
    error = null
    if (rel) focusRow(rel)
  }
  function editKey(e: KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }
  function editBlur() {
    // Leaving the field keeps a good name and drops a bad one.
    if (!renaming && creating === null) return
    commit()
    if (error) cancel()
  }

  // --- Context menu --------------------------------------------------------------

  const absPath = (rel: string) => {
    const sep = root.includes('\\') ? '\\' : '/'
    return rel ? root.replace(/[\\/]$/, '') + sep + rel.split('/').join(sep) : root
  }

  async function oncontext(e: MouseEvent, node: TreeNode | null) {
    e.preventDefault()
    e.stopPropagation()
    if (node && !selected.has(node.rel)) {
      selected = new Set([node.rel])
      anchor = node.rel
    }
    if (node) focus = node.rel
    const rels = node ? topLevel([...selected]) : []
    const single = rels.length === 1 ? find(rels[0])?.node : undefined
    const dir = node ? (node.kind === 'dir' && rels.length === 1 ? node.rel : dirname(node.rel)) : ''
    const items: { id: string; label: string; enabled?: boolean; separator?: boolean }[] = [
      { id: 'new-file', label: 'New File…' },
      { id: 'new-folder', label: 'New Folder' },
    ]
    if (node) {
      items.push({ id: '', label: '', separator: true })
      if (single?.kind === 'file') items.push({ id: 'open', label: 'Open' })
      items.push({ id: 'rename', label: 'Rename', enabled: rels.length === 1 }, { id: 'delete', label: rels.length > 1 ? `Delete ${rels.length} items` : 'Delete' })
    }
    items.push({ id: '', label: '', separator: true }, { id: 'reveal', label: 'Reveal in File Manager' })
    if (node) items.push({ id: 'copy-path', label: 'Copy Path', enabled: rels.length === 1 }, { id: 'copy-rel', label: 'Copy Relative Path', enabled: rels.length === 1 })
    const id = await window.api.contextMenu(items)
    const target = rels[0] ?? ''
    switch (id) {
      case 'new-file':
        onnewfile(dir)
        break
      case 'new-folder':
        newFolder(dir)
        break
      case 'open':
        if (single) onopen(single.rel)
        break
      case 'rename':
        startRename(target)
        break
      case 'delete':
        ondelete(rels)
        break
      case 'reveal':
        window.api.revealFile(target)
        break
      case 'copy-path':
        navigator.clipboard.writeText(absPath(target))
        break
      case 'copy-rel':
        navigator.clipboard.writeText(target)
        break
    }
  }

  // --- Drag and drop ---------------------------------------------------------------

  let dragging: string[] = []
  let dropTarget = $state<string | null>(null) // a folder rel, or '' for the root
  let hoverTimer: ReturnType<typeof setTimeout> | undefined

  function ondragstart(e: DragEvent, node: TreeNode) {
    if (!e.dataTransfer) return
    const rels = selected.has(node.rel) ? topLevel([...selected]) : [node.rel]
    dragging = rels
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(rels))
    e.dataTransfer.setData('text/plain', rels.join('\n'))
    e.dataTransfer.effectAllowed = 'copyMove'
  }
  function ondragend() {
    dragging = []
    dropTarget = null
    clearTimeout(hoverTimer)
  }

  /** The moves dropping the dragged items into `dir` would make. */
  function movesInto(dir: string): Move[] {
    return dragging
      .filter((rel) => dirname(rel) !== dir && !isInside(dir, rel))
      .map((rel) => ({ from: rel, to: joinRel(dir, basename(rel)) }))
  }

  function ondragover(e: DragEvent, dir: string) {
    const types = e.dataTransfer?.types ?? []
    const fromOutside = types.includes('Files')
    const internal = types.includes(DRAG_TYPE)
    if (!fromOutside && !(internal && movesInto(dir).length)) {
      // A refused drop on a row isn't passed on to the tree's root.
      if (internal) e.stopPropagation()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = fromOutside ? 'copy' : 'move'
    if (dropTarget !== dir) {
      dropTarget = dir
      clearTimeout(hoverTimer)
      // Hovering over a closed folder opens it.
      if (dir && !expanded.has(dir)) hoverTimer = setTimeout(() => expand(dir), 600)
    }
  }
  function ondrop(e: DragEvent, dir: string) {
    const files = [...(e.dataTransfer?.files ?? [])]
    const moves = movesInto(dir)
    const internal = e.dataTransfer?.types.includes(DRAG_TYPE)
    ondragend()
    if (!internal && !files.length) return
    e.preventDefault()
    e.stopPropagation()
    if (internal) {
      if (moves.length) onmove(moves)
    } else {
      const paths = files.map((f) => window.api.pathForFile(f)).filter(Boolean)
      if (paths.length) oncopyin(paths, dir)
    }
  }
  function ondragleave(e: DragEvent, dir: string) {
    if (dropTarget === dir && !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) dropTarget = null
  }
</script>

<div
  bind:this={navEl}
  class="tree"
  role="tree"
  tabindex="-1"
  aria-label="Files"
  aria-multiselectable="true"
  class:drop={dropTarget === ''}
  {onkeydown}
  oncontextmenu={(e) => oncontext(e, null)}
  ondragover={(e) => ondragover(e, '')}
  ondrop={(e) => ondrop(e, '')}
  ondragleave={(e) => ondragleave(e, '')}
>
  {#each rows as row ('node' in row ? row.node.rel : 'creating')}
    {#if 'creating' in row}
      <div class="row" style:padding-left="{8 + row.depth * 14}px">
        <span class="chev"></span>
        <input
          class="edit"
          class:bad={!!error}
          bind:value={draft}
          title={error ?? ''}
          spellcheck="false"
          use:editing={false}
          onkeydown={editKey}
          onblur={editBlur}
          oninput={() => (error = null)}
        />
      </div>
    {:else}
      {@const node = row.node}
      {@const isDir = node.kind === 'dir'}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="row"
        class:file={!isDir}
        class:active={node.rel === active}
        class:sel={selected.has(node.rel)}
        class:drop={isDir && dropTarget === node.rel}
        role="treeitem"
        aria-selected={selected.has(node.rel)}
        aria-expanded={isDir ? expanded.has(node.rel) : undefined}
        tabindex={(focus ?? realRows[0]?.node.rel) === node.rel ? 0 : -1}
        data-rel={node.rel}
        style:padding-left="{(isDir ? 8 : 22) + row.depth * 14}px"
        title={node.rel}
        draggable={renaming !== node.rel}
        onclick={(e) => onrowclick(e, node)}
        oncontextmenu={(e) => oncontext(e, node)}
        ondragstart={(e) => ondragstart(e, node)}
        {ondragend}
        ondragover={(e) => ondragover(e, isDir ? node.rel : row.parent)}
        ondrop={(e) => ondrop(e, isDir ? node.rel : row.parent)}
        ondragleave={(e) => ondragleave(e, isDir ? node.rel : row.parent)}
      >
        {#if isDir}<span class="chev">{expanded.has(node.rel) ? '▾' : '▸'}</span>{/if}
        {#if renaming === node.rel}
          <input
            class="edit"
            class:bad={!!error}
            bind:value={draft}
            title={error ?? ''}
            spellcheck="false"
            use:editing={!isDir}
            onkeydown={editKey}
            onblur={editBlur}
            onclick={(e) => e.stopPropagation()}
            oninput={() => (error = null)}
          />
        {:else}
          {node.name}{#if dirty.has(node.rel)}<span class="dot">●</span>{/if}
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .tree {
    overflow: auto;
    height: 100%;
    padding: 4px 0;
    outline: none;
  }
  .tree.drop {
    background: color-mix(in srgb, var(--detail) 12%, transparent);
  }
  .row {
    display: block;
    width: 100%;
    box-sizing: border-box;
    text-align: left;
    padding-top: 3px;
    padding-bottom: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: default;
    user-select: none;
    outline: none;
  }
  .row:hover {
    background: var(--sel);
  }
  .row.sel {
    background: var(--sel);
  }
  .row:focus-visible {
    outline: 1px solid var(--detail);
    outline-offset: -1px;
  }
  .row.drop {
    background: color-mix(in srgb, var(--detail) 25%, transparent);
    outline: 1px dashed var(--detail);
    outline-offset: -1px;
  }
  .chev {
    display: inline-block;
    width: 14px;
    color: var(--ink-soft);
  }
  .active {
    background: var(--sel);
    font-weight: 600;
  }
  .dot {
    color: var(--detail);
    margin-left: 6px;
    font-size: 9px;
  }
  .edit {
    width: calc(100% - 20px);
    box-sizing: border-box;
    font: inherit;
    padding: 0 3px;
    margin: 0;
    border: 1px solid var(--detail);
    border-radius: 2px;
    background: var(--paper);
    color: var(--ink);
  }
  .edit.bad {
    border-color: #c0504d;
  }
</style>
