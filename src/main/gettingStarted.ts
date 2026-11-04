// The Getting-started vault: a sample lab report bundled with the app
// (resources/getting-started/), copied into the student's Documents the
// first time they ask for it, and reopened from there after.
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const exists = (p: string) => stat(p).then(() => true, () => false)

/**
 * The bundled vault's files, relative and with forward slashes. Read with
 * readdir and readFile (not fs.cp), so it works from inside the app's asar.
 */
async function bundledFiles(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = []
  for (const e of await readdir(join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...(await bundledFiles(dir, rel)))
    else if (e.isFile()) out.push(rel)
  }
  return out
}

async function copyBundle(bundled: string, target: string): Promise<void> {
  for (const rel of await bundledFiles(bundled)) {
    const to = join(target, rel)
    await mkdir(join(to, '..'), { recursive: true })
    await writeFile(to, await readFile(join(bundled, rel)))
  }
}

/**
 * Whether the copy differs from the bundle: a bundled file changed or gone.
 * Files the copy has besides (build products, say) don't count.
 */
async function differs(bundled: string, target: string): Promise<boolean> {
  for (const rel of await bundledFiles(bundled)) {
    const mine = await readFile(join(target, rel)).catch(() => null)
    if (!mine || !mine.equals(await readFile(join(bundled, rel)))) return true
  }
  return false
}

/**
 * Makes sure the student's copy of the bundled vault exists at `target`,
 * copying it there if not (`fresh`). An existing copy is left as it is;
 * `changed` says whether it differs from the bundle, so Start over is worth offering.
 */
export async function openCopy(bundled: string, target: string): Promise<{ fresh: boolean; changed: boolean }> {
  if (!(await exists(target))) {
    await copyBundle(bundled, target)
    return { fresh: true, changed: false }
  }
  return { fresh: false, changed: await differs(bundled, target) }
}

/**
 * Start over: sends the copy at `target` to the trash and makes a fresh one.
 * If trashing fails, the copy stays and the error is passed on.
 */
export async function replaceCopy(bundled: string, target: string, trash: (abs: string) => Promise<void>): Promise<void> {
  if (await exists(target)) await trash(target)
  await copyBundle(bundled, target)
}
