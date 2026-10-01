<script lang="ts" module>
  /** What the paper map asks App to do. */
  export interface PaperMapActions {
    /** Open a file at a line. */
    open(rel: string, line: number): void
    /** Switch a file's include off, or back on. */
    toggle(rel: string): void
    /** Move a file's include before or after a sibling's. */
    move(rel: string, target: string, place: 'before' | 'after'): void
    /** A new section file after `rel` (or at the end of the root, for null). */
    newAfter(rel: string | null): void
    /** Move the section whose heading is on `line` of `rel` into a file of its own. */
    extract(rel: string, line: number, title: string): void
    /** Put a file's text back in place of its include. */
    inline(rel: string): void
    /** Stop treating the document as a multi-part paper. */
    unmark(): void
  }
</script>

<script lang="ts">
  import type { PaperInfo } from '@shared/api'
  import type { OutlineItem } from '@shared/latexedit'
  import type { PaperModel } from '@shared/papermodel'
  import Icon from './Icon.svelte'

  /**
   * Contents for a multi-part paper: every file in reading order, each with
   * its numbered sections. Click to open; drag a file among its siblings to
   * reorder; the eye switches a file off (comments out its \input); ⋯ and
   * right-click offer the rest.
   */
  let {
    paper,
    model,
    active,
    cursorLine,
    activeOutline,
    renames,
    onrenumber,
    ondismissrenumber,
    actions,
  }: {
    paper: PaperInfo
    model: PaperModel | null
    active: string | null
    cursorLine: number
    /** The open file's own outline, for a file the model hasn't numbered (switched off). */
    activeOutline: OutlineItem[]
    /** Renames that would put numbered file names back in order (empty when they are). */
    renames: { from: string; to: string }[]
    onrenumber: () => void
    ondismissrenumber: () => void
    actions: PaperMapActions
  } = $props()

  const base = (rel: string) => rel.slice(rel.lastIndexOf('/') + 1)

  interface Row {
    rel: string
    parent: string | null
    depth: number
    off: boolean
    exists: boolean
    sections: string | null
    headings: { level: number; number: string | null; title: string; line: number }[]
  }

  const rows = $derived.by<Row[]>(() =>
    paper.files.map((f) => {
      const known = model?.files.get(f.rel)
      const headings = known
        ? known.headings
        : f.rel === active
          ? activeOutline.filter((o) => o.kind !== 'question').map((o) => ({ level: o.depth + 1, number: null, title: o.title, line: o.line }))
          : []
      return { rel: f.rel, parent: f.parent, depth: f.depth, off: f.off, exists: f.exists, sections: model?.sectionsOf(f.rel) ?? null, headings }
    }),
  )
  const top = $derived(Math.min(1, ...rows.flatMap((r) => r.headings.map((h) => h.level))))
  // The heading the cursor is under, in the open file.
  const currentLine = $derived(rows.find((r) => r.rel === active)?.headings.findLast((h) => h.line <= cursorLine)?.line ?? null)

  // A small menu, for ⋯ and right-click.
  let menu = $state<{ x: number; y: number; items: { label: string; run: () => void; disabled?: boolean }[] } | null>(null)
  function openMenu(e: MouseEvent, items: { label: string; run: () => void; disabled?: boolean }[]): void {
    e.preventDefault()
    e.stopPropagation()
    const host = (e.currentTarget as HTMLElement).closest('.paper')!.getBoundingClientRect()
    // Kept inside the sidebar.
    menu = { x: Math.max(4, Math.min(e.clientX - host.left, host.width - 214)), y: e.clientY - host.top, items }
  }
  function fileMenu(e: MouseEvent, r: Row): void {
    const parent = r.parent ? base(r.parent) : ''
    openMenu(e, [
      { label: 'Open', run: () => actions.open(r.rel, 1), disabled: !r.exists },
      { label: 'New section file after this', run: () => actions.newAfter(r.rel) },
      { label: r.off ? 'Switch on' : 'Switch off', run: () => actions.toggle(r.rel) },
      { label: `Put back into ${parent}`, run: () => actions.inline(r.rel), disabled: !r.exists },
    ])
  }
  function headingMenu(e: MouseEvent, r: Row, h: Row['headings'][number]): void {
    openMenu(e, [
      { label: 'Go to', run: () => actions.open(r.rel, h.line) },
      { label: 'Move to a file of its own…', run: () => actions.extract(r.rel, h.line, h.title) },
    ])
  }

  // Dragging a file among its siblings.
  let dragging = $state<Row | null>(null)
  let drop = $state<{ rel: string; place: 'before' | 'after' } | null>(null)
  function over(e: DragEvent, r: Row): void {
    if (!dragging || r.parent !== dragging.parent || r.rel === dragging.rel || r.depth !== dragging.depth) return
    e.preventDefault()
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    drop = { rel: r.rel, place: e.clientY < box.top + box.height / 2 ? 'before' : 'after' }
  }
  function dropped(e: DragEvent): void {
    e.preventDefault()
    if (dragging && drop) actions.move(dragging.rel, drop.rel, drop.place)
    dragging = drop = null
  }
</script>

<svelte:window onclick={() => (menu = null)} onkeydown={(e) => e.key === 'Escape' && (menu = null)} />

<section class="paper">
  <header>
    <span class="name" title="{paper.root}: a multi-part paper">{paper.name}</span>
    <span class="count">{paper.files.length - 1} file{paper.files.length === 2 ? '' : 's'}</span>
    <button class="icon" title="New section file at the end" aria-label="New section file" onclick={() => actions.newAfter(null)}><Icon name="plus" size={14} /></button>
    <button
      class="icon"
      title="More"
      aria-label="More"
      onclick={(e) =>
        openMenu(e, [
          { label: `Open ${base(paper.root)}`, run: () => actions.open(paper.root, 1) },
          { label: 'New section file at the end', run: () => actions.newAfter(null) },
          { label: 'Stop treating as a multi-part paper', run: () => actions.unmark() },
        ])}><Icon name="more" size={14} /></button
    >
  </header>

  {#if renames.length}
    <div class="offer">
      <span>The numbered file names are out of order. Renumber them?</span>
      <ul>
        {#each renames as r (r.from)}<li><code>{base(r.from)}</code> → <code>{base(r.to)}</code></li>{/each}
      </ul>
      <div class="btns">
        <button onclick={onrenumber}>Renumber</button>
        <button onclick={ondismissrenumber}>Leave them</button>
      </div>
    </div>
  {/if}

  <nav>
    {#each rows as r (r.rel)}
      {#if r.rel !== paper.root || r.headings.length}
        <div
          class="file"
          class:active={r.rel === active}
          class:off={r.off}
          class:missing={!r.exists}
          class:root={r.rel === paper.root}
          class:drop-before={drop?.rel === r.rel && drop.place === 'before'}
          class:drop-after={drop?.rel === r.rel && drop.place === 'after'}
          style:padding-left="{4 + Math.max(0, r.depth - 1) * 14}px"
          role="treeitem"
          aria-selected={r.rel === active}
          tabindex="0"
          draggable={r.rel !== paper.root}
          ondragstart={(e) => {
            dragging = r
            e.dataTransfer?.setData('text/plain', r.rel)
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
          }}
          ondragover={(e) => over(e, r)}
          ondragleave={() => drop?.rel === r.rel && (drop = null)}
          ondrop={dropped}
          ondragend={() => (dragging = drop = null)}
          oncontextmenu={(e) => r.rel !== paper.root && fileMenu(e, r)}
          onclick={() => r.exists && actions.open(r.rel, 1)}
          onkeydown={(e) => e.key === 'Enter' && r.exists && actions.open(r.rel, 1)}
          title={r.exists ? r.rel : `${r.rel} doesn't exist`}
        >
          {#if r.rel !== paper.root}<span class="grip" title="Drag to reorder"><Icon name="grip" size={12} /></span>{/if}
          <span class="fname">{base(r.rel)}</span>
          {#if r.sections}<span class="secs">§{r.sections}</span>{/if}
          {#if r.rel !== paper.root}
            <button
              class="icon eye"
              title={r.off ? 'Switched off: not in the build. Click to switch on' : 'Switch off (comments out its \\input)'}
              aria-label={r.off ? 'Switch on' : 'Switch off'}
              onclick={(e) => {
                e.stopPropagation()
                actions.toggle(r.rel)
              }}><Icon name={r.off ? 'eyeoff' : 'eye'} size={14} /></button
            >
            <button class="icon more" title="More" aria-label="More" onclick={(e) => fileMenu(e, r)}><Icon name="more" size={14} /></button>
          {/if}
        </div>
        {#each r.headings as h (h.line)}
          <button
            class="h l{h.level - top}"
            class:current={r.rel === active && h.line === currentLine}
            class:off={r.off}
            style:padding-left="{22 + Math.max(0, r.depth - 1) * 14 + Math.max(0, h.level - top) * 14}px"
            title="{base(r.rel)}, line {h.line}. Right-click to move it to a file of its own"
            onclick={() => actions.open(r.rel, h.line)}
            oncontextmenu={(e) => headingMenu(e, r, h)}
          >
            {#if h.number}<span class="num">{h.number.replace(/^Appendix /, '')}</span>{/if}<span class="t">{h.title}</span>
          </button>
        {/each}
      {/if}
    {/each}
  </nav>

  {#if menu}
    <div class="menu" style:left="{menu.x}px" style:top="{menu.y}px" role="menu">
      {#each menu.items as it (it.label)}
        <button
          role="menuitem"
          disabled={it.disabled}
          onclick={(e) => {
            e.stopPropagation()
            menu = null
            it.run()
          }}>{it.label}</button
        >
      {/each}
    </div>
  {/if}
</section>

<style>
  .paper {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  header {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px 4px 10px;
  }
  .name {
    font: 600 14px var(--f-page);
    color: var(--ink);
  }
  .count {
    flex: 1;
    font-size: 11px;
    color: var(--ink-soft);
  }
  .icon {
    border: 0;
    background: none;
    padding: 2px;
    border-radius: 3px;
    color: var(--ink-soft);
    line-height: 0;
  }
  .icon:hover {
    color: var(--ink);
    background: var(--sel);
  }
  nav {
    overflow: auto;
    flex: 1;
    min-height: 0;
    padding-bottom: 6px;
  }
  .file {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 3px;
    padding-bottom: 3px;
    padding-right: 4px;
    margin-top: 4px;
    cursor: pointer;
    position: relative;
    color: var(--ink-soft);
    font-size: 12px;
  }
  .file:hover {
    background: var(--sel);
  }
  .file.active {
    color: var(--ink);
  }
  .file.active .fname {
    font-weight: 600;
  }
  .file.off .fname,
  .h.off {
    opacity: 0.5;
  }
  .file.off .fname {
    text-decoration: line-through;
  }
  .file.missing .fname {
    color: var(--err);
  }
  .fname {
    font-family: var(--f-mono);
    font-size: 11.5px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .secs {
    flex: 1;
    color: var(--detail);
    font-size: 11px;
    white-space: nowrap;
  }
  .file:not(:has(.secs)) .fname {
    flex: 1;
  }
  .grip {
    color: var(--ink-soft);
    opacity: 0.4;
    cursor: grab;
  }
  .file .eye,
  .file .more {
    visibility: hidden;
  }
  .file:hover .eye,
  .file:hover .more,
  .file.off .eye {
    visibility: visible;
  }
  .file.drop-before::before,
  .file.drop-after::after {
    content: '';
    position: absolute;
    left: 4px;
    right: 4px;
    height: 2px;
    background: var(--detail);
  }
  .file.drop-before::before {
    top: -2px;
  }
  .file.drop-after::after {
    bottom: -2px;
  }
  .h {
    display: flex;
    gap: 8px;
    width: 100%;
    text-align: left;
    border: none;
    border-radius: 0;
    background: none;
    padding-top: 2px;
    padding-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
  }
  .h:hover,
  .h.current {
    background: var(--sel);
  }
  .h.l0 {
    font-weight: 600;
  }
  .h.l1,
  .h.l2 {
    color: var(--ink-soft);
  }
  .h.current {
    color: var(--ink);
  }
  .num {
    flex: none;
    min-width: 1.8em;
    color: var(--detail);
    font-variant-numeric: tabular-nums;
  }
  .t {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .offer {
    margin: 2px 8px 6px;
    padding: 8px 10px;
    border-radius: 4px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--ink);
    background: color-mix(in srgb, var(--detail) 14%, var(--paper));
  }
  .offer ul {
    margin: 4px 0 6px;
    padding-left: 16px;
  }
  .offer code {
    font-size: 11px;
  }
  .btns {
    display: flex;
    gap: 6px;
  }
  .menu {
    position: absolute;
    z-index: 20;
    min-width: 200px;
    padding: 4px 0;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
  }
  .menu button {
    display: block;
    width: 100%;
    text-align: left;
    border: 0;
    border-radius: 0;
    background: none;
    padding: 4px 12px;
  }
  .menu button:hover:not(:disabled) {
    background: var(--sel);
  }
</style>
