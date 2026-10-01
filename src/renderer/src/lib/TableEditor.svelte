<script lang="ts">
  import { onMount, tick } from 'svelte'
  import {
    applyStyle,
    cellText,
    clipboardGrid,
    deleteColumn,
    deleteRow,
    insertColumn,
    insertRow,
    mergeCells,
    moveColumn,
    moveRow,
    numericColumn,
    packagesFor,
    pasteGrid,
    serializeTable,
    setCell,
    splitCell,
    styleOf,
    type Align,
    type TableModel,
    type TableStyle,
  } from '@shared/tablemodel'
  import type { RenderFn } from './mathPreview'
  import { richText } from './live/widgets'

  /**
   * The table editor: a grid of cells (raw LaTeX), with row, column, rule
   * and float controls, and a rendered preview. Apply hands the model back;
   * the caller writes it into the document.
   */
  let {
    initial,
    title,
    render,
    startRow = 0,
    onapply,
    oncancel,
  }: {
    initial: TableModel
    title: string
    render: RenderFn
    /** Row to put the cursor in first (e.g. where pasted rows went). */
    startRow?: number
    onapply: (model: TableModel) => void
    oncancel: () => void
  } = $props()

  // svelte-ignore state_referenced_locally
  let model = $state.raw<TableModel>(initial)
  let history: TableModel[] = []
  let future: TableModel[] = []
  // The selected cell, and the other corner of a selected range (shift-click).
  // svelte-ignore state_referenced_locally
  let sel = $state({ r: Math.min(startRow, initial.rows.length - 1), c: 0 })
  let anchor = $state<{ r: number; c: number } | null>(null)
  let rawPaste = $state(false)
  let grid: HTMLDivElement

  /** Applies a change, remembering the old table for undo. */
  function update(next: TableModel, focus = true): void {
    if (next === model) return
    history.push(model)
    if (history.length > 200) history.shift()
    future = []
    model = next
    editingKey = ''
    if (focus) focusSel()
  }

  function undo(): void {
    const prev = history.pop()
    if (!prev) return
    future.push(model)
    model = prev
    clampSel()
    focusSel()
  }
  function redo(): void {
    const next = future.pop()
    if (!next) return
    history.push(model)
    model = next
    clampSel()
    focusSel()
  }

  function clampSel(): void {
    sel = { r: Math.max(0, Math.min(sel.r, model.rows.length - 1)), c: Math.max(0, Math.min(sel.c, model.cols.length - 1)) }
  }

  /** The column where the cell covering (r, c) starts. */
  function ownerCol(r: number, c: number): number {
    const cells = model.rows[r]?.cells ?? []
    for (let i = Math.min(c, cells.length - 1); i >= 0; i--) if (cells[i]) return i
    return 0
  }

  async function focusSel(): Promise<void> {
    clampSel()
    await tick()
    const c = ownerCol(sel.r, sel.c)
    grid?.querySelector<HTMLInputElement>(`input[data-r="${sel.r}"][data-c="${c}"]`)?.focus()
  }

  onMount(() => focusSel())

  // Typing in one cell is one undo step: the snapshot is taken on its first keystroke.
  let editingKey = ''
  function typed(r: number, c: number, value: string): void {
    const key = `${r}:${c}`
    if (key !== editingKey) {
      history.push(model)
      future = []
      editingKey = key
    }
    model = setCell(model, r, c, value)
  }

  function select(r: number, c: number, extend = false): void {
    if (extend) anchor ??= { ...sel }
    else anchor = null
    sel = { r, c }
  }

  /** The next cell to the right (wrapping), skipping spanned slots; null past the end. */
  function step(r: number, c: number, dir: 1 | -1): { r: number; c: number } | null {
    let rr = r
    let cc = c
    for (;;) {
      cc += dir
      if (cc >= model.cols.length) {
        rr++
        cc = 0
      } else if (cc < 0) {
        rr--
        cc = model.cols.length - 1
      }
      if (rr < 0 || rr >= model.rows.length) return null
      if (model.rows[rr].cells[cc]) return { r: rr, c: cc }
    }
  }

  function cellKeydown(e: KeyboardEvent, r: number, c: number): void {
    const input = e.currentTarget as HTMLInputElement
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key === 'Enter') {
      e.preventDefault()
      apply()
    } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault()
      redo()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const next = step(r, c, e.shiftKey ? -1 : 1)
      if (next) {
        select(next.r, next.c)
        focusSel()
      } else if (!e.shiftKey) {
        // Tab from the last cell starts a new row.
        sel = { r: model.rows.length, c: 0 }
        update(insertRow(model, model.rows.length))
      }
    } else if (e.key === 'Enter' || (e.key === 'ArrowDown' && !e.altKey)) {
      e.preventDefault()
      if (r + 1 < model.rows.length) {
        select(r + 1, c)
        focusSel()
      } else if (e.key === 'Enter') {
        sel = { r: r + 1, c }
        update(insertRow(model, r + 1))
      }
    } else if (e.key === 'ArrowUp' && !e.altKey) {
      e.preventDefault()
      if (r > 0) {
        select(r - 1, c)
        focusSel()
      }
    } else if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault()
      rowMove(-1)
    } else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault()
      rowMove(1)
    } else if (e.key === 'ArrowLeft' && input.selectionStart === 0 && input.selectionEnd === 0) {
      const prev = step(r, c, -1)
      if (prev) {
        e.preventDefault()
        select(prev.r, prev.c, e.shiftKey)
        focusSel()
      }
    } else if (e.key === 'ArrowRight' && input.selectionStart === input.value.length) {
      const next = step(r, c, 1)
      if (next) {
        e.preventDefault()
        select(next.r, next.c, e.shiftKey)
        focusSel()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      oncancel()
    }
  }

  /** Spreadsheet cells pasted into the grid fill it from the selected cell, adding rows and columns. */
  function cellPaste(e: ClipboardEvent, r: number, c: number): void {
    const data = e.clipboardData
    if (!data) return
    const pasted = clipboardGrid(data.getData('text/plain'), data.getData('text/html'), rawPaste)
    if (!pasted) return
    e.preventDefault()
    update(pasteGrid(model, r, c, pasted))
  }

  // --- Toolbar actions ------------------------------------------------------

  const rowAdd = (below: boolean) => {
    const at = sel.r + (below ? 1 : 0)
    sel = { r: at, c: sel.c }
    update(insertRow(model, at))
  }
  const rowDelete = () => update(deleteRow(model, sel.r))
  const rowMove = (by: -1 | 1) => {
    const next = moveRow(model, sel.r, by)
    if (next === model) return
    sel = { r: sel.r + by, c: sel.c }
    update(next)
  }
  const colAdd = (right: boolean) => {
    const at = sel.c + (right ? 1 : 0)
    sel = { r: sel.r, c: at }
    update(insertColumn(model, at))
  }
  const colDelete = () => update(deleteColumn(model, sel.c))
  const colMove = (by: -1 | 1) => {
    const next = moveColumn(model, sel.c, by)
    if (next === model) return
    sel = { r: sel.r, c: sel.c + by }
    update(next)
  }

  function setAlign(c: number, align: Align): void {
    const cols = model.cols.map((col, i) =>
      i === c ? { ...col, align, arg: align === 'p' || align === 'm' || align === 'b' ? (col.arg && col.align === align ? col.arg : '3cm') : align === 'S' ? col.arg : undefined } : col,
    )
    update({ ...model, cols }, false)
  }

  function setWidth(c: number, arg: string): void {
    update({ ...model, cols: model.cols.map((col, i) => (i === c ? { ...col, arg } : col)) }, false)
  }

  function toggleLine(boundary: number): void {
    const seps = model.seps.map((s, i) => (i === boundary ? (s.includes('|') ? s.replace(/\|/g, '') : s + '|') : s))
    update({ ...model, seps }, false)
  }

  const RULES = [
    { value: '', label: 'none' },
    { value: '\\hline', label: 'line (\\hline)' },
    { value: '\\toprule', label: 'top rule' },
    { value: '\\midrule', label: 'mid rule' },
    { value: '\\bottomrule', label: 'bottom rule' },
  ]
  const ruleValue = (rules: string[]) => rules[0] ?? ''
  function setRule(row: number | 'below', value: string): void {
    if (row === 'below') update({ ...model, rulesBelow: value ? [value] : [] }, false)
    else {
      const rows = model.rows.map((r, i) => (i === row ? { ...r, rules: value ? [value] : [] } : r))
      update({ ...model, rows }, false)
    }
  }

  const range = $derived.by(() => {
    if (!anchor || anchor.r !== sel.r) return null
    const from = Math.min(anchor.c, sel.c)
    const to = Math.max(anchor.c, sel.c)
    return to > from ? { r: sel.r, from, to } : null
  })
  const selCell = $derived(model.rows[sel.r]?.cells[ownerCol(sel.r, sel.c)] ?? null)

  function merge(): void {
    if (!range) return
    anchor = null
    sel = { r: range.r, c: range.from }
    update(mergeCells(model, range.r, range.from, range.to))
  }
  const split = () => update(splitCell(model, sel.r, sel.c))

  const BOLD = /^\\textbf\{([\s\S]*)\}$/
  const headerBold = $derived(model.rows[0]?.cells.every((c) => !c || !c.tex.trim() || BOLD.test(c.tex.trim())) && model.rows[0]?.cells.some((c) => c?.tex.trim()))
  function toggleHeaderBold(): void {
    const on = !headerBold
    let m = model
    model.rows[0].cells.forEach((c, i) => {
      if (!c || !c.tex.trim()) return
      const t = c.tex.trim()
      m = setCell(m, 0, i, on ? `\\textbf{${t}}` : (BOLD.exec(t)?.[1] ?? t))
    })
    update(m, false)
  }

  const style = $derived(styleOf(model))
  const setStyle = (s: TableStyle) => update(applyStyle(model, s), false)

  // Columns of numbers that aren't aligned on the decimal point yet.
  const numeric = $derived(model.cols.map((col, i) => col.align !== 'S' && numericColumn(cellText(model), i)))
  const alignDecimal = () => update({ ...model, cols: model.cols.map((col, i) => (numeric[i] ? { ...col, align: 'S' as Align, arg: undefined } : col)) }, false)

  // --- Float ------------------------------------------------------------------

  function setFloat(on: boolean): void {
    update({ ...model, float: on ? { env: 'table', placement: 'htbp', caption: '', label: 'tab:', captionBelow: false, centering: true, extra: [] } : null }, false)
  }
  // The label follows the caption (tab:<slug>) until it's edited by hand.
  let labelTouched = $state(false)
  const slug = (s: string) =>
    s
      .replace(/\\[a-zA-Z]+\*?/g, ' ')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .split('-')
      .slice(0, 4)
      .join('-')
  function setCaption(caption: string): void {
    if (!model.float) return
    const auto = !labelTouched && (!model.float.label || /^tab:[a-z0-9-]*$/.test(model.float.label))
    update({ ...model, float: { ...model.float, caption, ...(auto && { label: `tab:${slug(caption)}` }) } }, false)
  }
  function setFloatField<K extends 'label' | 'placement' | 'captionBelow' | 'centering'>(k: K, v: NonNullable<TableModel['float']>[K]): void {
    if (!model.float) return
    if (k === 'label') labelTouched = true
    update({ ...model, float: { ...model.float, [k]: v } }, false)
  }

  function apply(): void {
    onapply(model)
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      oncancel()
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      apply()
    }
  }

  const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `C${i + 1}`)
  const packages = $derived(packagesFor(model))
  const source = $derived(serializeTable(model))
  let showSource = $state(false)

  /** The rendered preview, rebuilt when the table changes. */
  function preview(node: HTMLElement, m: TableModel) {
    const draw = (t: TableModel) => {
      node.replaceChildren()
      if (t.float?.caption !== null && t.float && !t.float.captionBelow) node.append(caption(t))
      const table = document.createElement('table')
      for (const [k, row] of t.rows.entries()) {
        const tr = document.createElement('tr')
        if (row.rules.length) tr.classList.add(row.rules.some((r) => /toprule|bottomrule/.test(r)) ? 'rule-thick' : 'rule-above')
        if (k === t.rows.length - 1 && t.rulesBelow.length) tr.classList.add(t.rulesBelow.some((r) => /bottomrule/.test(r)) ? 'rule-below-thick' : 'rule-below')
        row.cells.forEach((cell, i) => {
          if (!cell) return
          const td = document.createElement('td')
          td.colSpan = cell.span
          const a = cell.span > 1 ? (/[lcr]/.exec(cell.spec ?? 'c')?.[0] ?? 'c') : t.cols[i].align
          td.className = `align-${a === 'S' || a === 'r' ? 'r' : a === 'c' ? 'c' : 'l'}`
          if (t.seps[i].includes('|')) td.classList.add('vl')
          if (t.seps[i + cell.span]?.includes('|') && i + cell.span === t.cols.length) td.classList.add('vr')
          td.append(richText(cell.tex, render))
          tr.append(td)
        })
        table.append(tr)
      }
      node.append(table)
      if (t.float?.caption !== null && t.float?.captionBelow) node.append(caption(t))
    }
    const caption = (t: TableModel) => {
      const div = document.createElement('div')
      div.className = 'caption'
      const b = document.createElement('strong')
      b.textContent = 'Table: '
      div.append(b, richText(t.float?.caption ?? '', render))
      return div
    }
    draw(m)
    return { update: draw }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={oncancel}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()} {onkeydown} role="dialog" aria-label={title} tabindex="-1">
    <div class="top">
      <strong>{title}</strong>
      <label class="field">
        Style
        <select value={style} onchange={(e) => setStyle((e.currentTarget as HTMLSelectElement).value as TableStyle)}>
          <option value="booktabs">booktabs (top/mid/bottom rules)</option>
          <option value="grid">grid (all lines)</option>
          <option value="plain">plain (no lines)</option>
        </select>
      </label>
      <span class="spacer"></span>
      <button onclick={undo} title="Undo (Ctrl+Z)">↶</button>
      <button onclick={redo} title="Redo (Ctrl+Y)">↷</button>
    </div>

    <div class="toolbar">
      <span class="group">
        <span class="label">Row {sel.r + 1}</span>
        <button onclick={() => rowAdd(false)} title="Insert a row above">+ above</button>
        <button onclick={() => rowAdd(true)} title="Insert a row below">+ below</button>
        <button onclick={() => rowMove(-1)} title="Move up (Alt+↑)">↑</button>
        <button onclick={() => rowMove(1)} title="Move down (Alt+↓)">↓</button>
        <button onclick={rowDelete} disabled={model.rows.length <= 1} title="Delete the row">✕</button>
        <select title="Line above this row" value={ruleValue(model.rows[sel.r]?.rules ?? [])} onchange={(e) => setRule(sel.r, (e.currentTarget as HTMLSelectElement).value)}>
          {#each RULES as r (r.value)}<option value={r.value}>above: {r.label}</option>{/each}
          {#if !RULES.some((r) => r.value === ruleValue(model.rows[sel.r]?.rules ?? []))}
            <option value={ruleValue(model.rows[sel.r]?.rules ?? [])}>above: {ruleValue(model.rows[sel.r]?.rules ?? [])}</option>
          {/if}
        </select>
      </span>
      <span class="group">
        <span class="label">Column {letter(sel.c)}</span>
        <button onclick={() => colAdd(false)} title="Insert a column to the left">+ left</button>
        <button onclick={() => colAdd(true)} title="Insert a column to the right">+ right</button>
        <button onclick={() => colMove(-1)} title="Move left">←</button>
        <button onclick={() => colMove(1)} title="Move right">→</button>
        <button onclick={colDelete} disabled={model.cols.length <= 1} title="Delete the column">✕</button>
        <button class:on={model.seps[sel.c]?.includes('|')} onclick={() => toggleLine(sel.c)} title="Vertical line on the left">|◻</button>
        <button class:on={model.seps[sel.c + 1]?.includes('|')} onclick={() => toggleLine(sel.c + 1)} title="Vertical line on the right">◻|</button>
      </span>
      <span class="group">
        <button disabled={!range} onclick={merge} title="Merge the selected cells (shift-click or shift+arrows to select)">Merge</button>
        <button disabled={!selCell || selCell.span < 2} onclick={split} title="Split a merged cell">Split</button>
        <button class:on={headerBold} onclick={toggleHeaderBold} title="Bold header row">B header</button>
      </span>
    </div>

    {#if numeric.some(Boolean)}
      <div class="hint">
        Column{numeric.filter(Boolean).length > 1 ? 's' : ''}
        {numeric.map((n, i) => (n ? letter(i) : '')).filter(Boolean).join(', ')} hold{numeric.filter(Boolean).length > 1 ? '' : 's'} numbers.
        <button onclick={alignDecimal}>Align on the decimal point</button>
        <span class="muted">(siunitx S column)</span>
      </div>
    {/if}

    <div class="grid" bind:this={grid}>
      <table>
        <thead>
          <tr>
            <th class="corner"></th>
            {#each model.cols as col, c (c)}
              <th class:sel={c === sel.c}>
                <div class="colhead">
                  <button class="colname" onclick={() => (select(sel.r, c), focusSel())}>{letter(c)}</button>
                  <select value={col.align} onchange={(e) => setAlign(c, (e.currentTarget as HTMLSelectElement).value as Align)} title="Alignment">
                    <option value="l">left</option>
                    <option value="c">centre</option>
                    <option value="r">right</option>
                    <option value="p">wrap (p)</option>
                    <option value="S">decimal (S)</option>
                    {#if model.env === 'tabularx' || col.align === 'X'}<option value="X">stretch (X)</option>{/if}
                    {#if col.align === 'm'}<option value="m">wrap, middle (m)</option>{/if}
                    {#if col.align === 'b'}<option value="b">wrap, bottom (b)</option>{/if}
                  </select>
                  {#if col.align === 'p' || col.align === 'm' || col.align === 'b'}
                    <input class="width" value={col.arg ?? ''} onchange={(e) => setWidth(c, (e.currentTarget as HTMLInputElement).value)} title="Column width, e.g. 3cm or 0.3\linewidth" />
                  {/if}
                </div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each model.rows as row, r (r)}
            <tr class:rule={row.rules.length > 0}>
              <th class="rowhead" class:sel={r === sel.r}>
                <button onclick={() => (select(r, sel.c), focusSel())} title={row.rules.join(' ') || 'No line above'}>{r + 1}</button>
              </th>
              {#each row.cells as cell, c (c)}
                {#if cell}
                  {@const inRange = range && range.r === r && c >= range.from && c <= range.to}
                  <td colspan={cell.span} class:sel={r === sel.r && c === ownerCol(sel.r, sel.c)} class:range={inRange} class:merged={cell.span > 1}>
                    <input
                      data-r={r}
                      data-c={c}
                      value={cell.tex}
                      spellcheck="false"
                      oninput={(e) => typed(r, c, (e.currentTarget as HTMLInputElement).value)}
                      onfocus={() => {
                        if (sel.r !== r || ownerCol(sel.r, sel.c) !== c) select(r, c)
                      }}
                      onmousedown={(e) => {
                        if (e.shiftKey) {
                          e.preventDefault()
                          select(r, c, true)
                        }
                      }}
                      onkeydown={(e) => cellKeydown(e, r, c)}
                      onpaste={(e) => cellPaste(e, r, c)}
                    />
                  </td>
                {/if}
              {/each}
            </tr>
          {/each}
          <tr class:rule={model.rulesBelow.length > 0}><td class="end" colspan={model.cols.length + 1}></td></tr>
        </tbody>
      </table>
    </div>

    <div class="below">
      <label class="field">
        <select title="Line under the last row" value={ruleValue(model.rulesBelow)} onchange={(e) => setRule('below', (e.currentTarget as HTMLSelectElement).value)}>
          {#each RULES as r (r.value)}<option value={r.value}>under the table: {r.label}</option>{/each}
        </select>
      </label>
      <label class="check"><input type="checkbox" bind:checked={rawPaste} /> Paste LaTeX as is (don't escape % & $ _)</label>
    </div>

    <div class="float">
      <label class="check"><input type="checkbox" checked={!!model.float} onchange={(e) => setFloat((e.currentTarget as HTMLInputElement).checked)} /> In a table float</label>
      {#if model.float}
        <label class="field grow">Caption <input value={model.float.caption ?? ''} oninput={(e) => setCaption((e.currentTarget as HTMLInputElement).value)} /></label>
        <label class="field">Label <input class="mono" value={model.float.label ?? ''} oninput={(e) => setFloatField('label', (e.currentTarget as HTMLInputElement).value)} /></label>
        <label class="field">Placement <input class="mono short" value={model.float.placement} oninput={(e) => setFloatField('placement', (e.currentTarget as HTMLInputElement).value)} /></label>
        <label class="check"><input type="checkbox" checked={model.float.captionBelow} onchange={(e) => setFloatField('captionBelow', (e.currentTarget as HTMLInputElement).checked)} /> caption below</label>
        <label class="check"><input type="checkbox" checked={model.float.centering} onchange={(e) => setFloatField('centering', (e.currentTarget as HTMLInputElement).checked)} /> centred</label>
      {/if}
    </div>

    <div class="preview-wrap">
      <div class="tabs">
        <button class:on={!showSource} onclick={() => (showSource = false)}>Preview</button>
        <button class:on={showSource} onclick={() => (showSource = true)}>LaTeX</button>
      </div>
      {#if showSource}
        <pre class="source">{source}</pre>
      {:else}
        <div class="preview" use:preview={model}></div>
      {/if}
    </div>

    <div class="bottom">
      {#if packages.length}
        <span class="muted">Uses {packages.join(', ')}; added to the preamble if it's missing.</span>
      {/if}
      <span class="spacer"></span>
      <button onclick={oncancel}>Cancel</button>
      <button class="primary" onclick={apply} title="Ctrl+Enter">Apply</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 4vh;
    z-index: 100;
  }
  .dialog {
    width: min(1100px, 95vw);
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    background: var(--paper);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    outline: none;
    overflow: hidden;
  }
  .top,
  .toolbar,
  .below,
  .float,
  .bottom,
  .hint {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 14px;
  }
  .top {
    border-bottom: 1px solid var(--line);
  }
  .toolbar {
    gap: 14px;
    background: var(--side);
    border-bottom: 1px solid var(--line);
  }
  .group {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .group .label {
    color: var(--ink-soft);
    margin-right: 4px;
    min-width: 62px;
  }
  .toolbar button {
    padding: 2px 7px;
  }
  button.on {
    color: var(--detail);
    border-color: var(--detail);
    background: var(--sel);
  }
  button.primary {
    background: var(--detail);
    border-color: var(--detail);
    color: var(--paper);
  }
  button.primary:hover {
    background: color-mix(in srgb, var(--detail) 85%, var(--ink));
  }
  select,
  input {
    font: inherit;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 2px 4px;
    background: var(--paper);
  }
  .hint {
    padding-top: 6px;
    padding-bottom: 6px;
    background: color-mix(in srgb, var(--warn) 18%, var(--paper));
    color: var(--ink);
  }
  .muted {
    color: var(--ink-soft);
  }
  .spacer {
    flex: 1;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--ink-soft);
  }
  .field input {
    color: var(--ink);
  }
  .field.grow {
    flex: 1;
    min-width: 200px;
  }
  .field.grow input {
    flex: 1;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .mono {
    font-family: Consolas, 'Cascadia Mono', monospace;
  }
  .short {
    width: 60px;
  }

  .grid {
    overflow: auto;
    padding: 8px 14px;
    min-height: 120px;
    flex: 1 1 auto;
  }
  .grid table {
    border-collapse: collapse;
  }
  .grid th {
    font-weight: normal;
    color: var(--ink-soft);
    padding: 2px;
  }
  .grid th.sel {
    color: var(--detail);
  }
  .colhead {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .colhead select {
    font-size: 11px;
    padding: 0 2px;
  }
  .colname,
  .rowhead button {
    border: none;
    background: none;
    color: inherit;
    padding: 0 4px;
    font-weight: 600;
  }
  .width {
    width: 70px;
    font-size: 11px;
    font-family: Consolas, monospace;
  }
  .grid td {
    padding: 0;
    border: 1px solid var(--line);
    min-width: 90px;
  }
  .grid tr.rule td {
    border-top: 2px solid var(--ink-soft);
  }
  .grid td.end {
    border: none;
    height: 0;
  }
  .grid tr.rule td.end {
    border-top: 2px solid var(--ink-soft);
  }
  .grid td input {
    width: 100%;
    min-width: 90px;
    border: none;
    border-radius: 0;
    padding: 4px 6px;
    font-family: Consolas, 'Cascadia Mono', monospace;
    font-size: 13px;
    background: transparent;
    outline: none;
  }
  .grid td.sel {
    outline: 2px solid var(--detail);
    outline-offset: -1px;
  }
  .grid td.range {
    background: var(--sel);
  }
  .grid td.merged {
    background: var(--side);
  }

  .below {
    padding-top: 0;
  }
  .float {
    border-top: 1px solid var(--line);
  }
  .preview-wrap {
    border-top: 1px solid var(--line);
    padding: 6px 14px;
    max-height: 30vh;
    overflow: auto;
    flex: none;
  }
  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 6px;
  }
  .tabs button {
    font-size: 12px;
    padding: 1px 8px;
  }
  .source {
    margin: 0;
    font-family: Consolas, 'Cascadia Mono', monospace;
    font-size: 12px;
    white-space: pre;
  }
  .preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-family: 'Latin Modern Roman', 'Cambria', Georgia, serif;
    font-size: 15px;
  }
  .preview :global(table) {
    border-collapse: collapse;
  }
  .preview :global(td) {
    padding: 2px 10px;
  }
  .preview :global(td.align-l) {
    text-align: left;
  }
  .preview :global(td.align-c) {
    text-align: center;
  }
  .preview :global(td.align-r) {
    text-align: right;
  }
  .preview :global(td.vl) {
    border-left: 1px solid var(--ink);
  }
  .preview :global(td.vr) {
    border-right: 1px solid var(--ink);
  }
  .preview :global(tr.rule-above td) {
    border-top: 1px solid var(--ink);
  }
  .preview :global(tr.rule-thick td) {
    border-top: 2px solid var(--ink);
  }
  .preview :global(tr.rule-below td) {
    border-bottom: 1px solid var(--ink);
  }
  .preview :global(tr.rule-below-thick td) {
    border-bottom: 2px solid var(--ink);
  }
  .preview :global(.caption) {
    margin: 4px 0;
    font-size: 0.92em;
  }
  .bottom {
    border-top: 1px solid var(--line);
  }
</style>
