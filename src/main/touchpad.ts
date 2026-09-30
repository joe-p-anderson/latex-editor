// Absolute finger positions from the trackpad, for tracing symbols on it
// (see touchpad-helper.cs). Windows only, and only with a Precision
// Touchpad; otherwise start() says why and the symbol pad falls back to
// following the cursor.
//
// The helper is compiled on first use with the C# compiler that ships with
// Windows (.NET Framework), into the app's data folder, keyed by a hash of
// its source, and runs only while a trace is in progress.
import { app } from 'electron'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { TouchpadEvent } from '../shared/api'
import source from './touchpad-helper.cs?raw'

let helper: ChildProcess | null = null

async function helperExe(): Promise<string> {
  const hash = createHash('sha1').update(source).digest('hex').slice(0, 10)
  const dir = join(app.getPath('userData'), 'touchpad')
  const exe = join(dir, `touchpad-helper-${hash}.exe`)
  if (await access(exe).then(() => true, () => false)) return exe
  const windir = process.env.WINDIR ?? 'C:\\Windows'
  const csc = [join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'), join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')]
  const compiler = (await Promise.all(csc.map((c) => access(c).then(() => c, () => null)))).find(Boolean)
  if (!compiler) throw new Error("Windows' C# compiler (.NET Framework 4) isn't installed")
  await mkdir(dir, { recursive: true })
  const cs = join(dir, `touchpad-helper-${hash}.cs`)
  await writeFile(cs, source)
  await new Promise<void>((resolve, reject) =>
    execFile(compiler, ['-nologo', '-target:exe', '-optimize', '-r:System.Windows.Forms.dll', `-out:${exe}`, cs], { windowsHide: true }, (err, stdout) =>
      err ? reject(new Error(`Couldn't build the touchpad helper: ${stdout || err.message}`)) : resolve(),
    ),
  )
  return exe
}

/**
 * Starts streaming contacts to `onContact`. Resolves with the pad's aspect
 * ratio (width / height) once the helper has found the touchpad.
 */
export async function startTouchpad(onEvent: (e: TouchpadEvent) => void): Promise<{ aspect: number }> {
  if (process.platform !== 'win32') throw new Error('Reading the trackpad directly needs Windows')
  stopTouchpad()
  const child = spawn(await helperExe(), [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
  helper = child
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => (reject(new Error('The touchpad helper didn\'t answer')), stopTouchpad()), 8000)
    const fail = (message: string) => {
      clearTimeout(timer)
      reject(new Error(message))
      if (helper === child) stopTouchpad()
    }
    child.on('error', (e) => fail(e.message))
    child.on('exit', () => {
      if (helper === child) helper = null
      fail('The touchpad helper stopped')
    })
    createInterface({ input: child.stdout! }).on('line', (line) => {
      const [kind, ...rest] = line.trim().split(/\s+/)
      if (kind === 'size') {
        clearTimeout(timer)
        const [w, h] = rest.map(Number)
        resolve({ aspect: w > 0 && h > 0 ? w / h : 1.6 })
      } else if (kind === 'c') {
        const [id, tip, x, y] = rest.map(Number)
        onEvent({ type: 'contact', id, tip: tip === 1, x, y })
      } else if (kind === 'b') onEvent({ type: 'button', down: rest[0] === '1' })
      else if (kind === 'err') fail(rest.join(' '))
    })
  })
}

export function stopTouchpad(): void {
  const child = helper
  helper = null
  if (!child) return
  child.stdin?.end() // the helper exits when its input closes
  setTimeout(() => child.exitCode === null && child.kill(), 1000)
}
