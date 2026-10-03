// Drives the running endleaf window over the Chrome DevTools Protocol.
//   node drive.mjs eval "<js>"        evaluate (await-able) in the window, print the JSON result
//   node drive.mjs evalfile steps.js  the same, from a file: use this for anything with a backslash
//   node drive.mjs shot out.png       screenshot the window (then Read the PNG and look at it)
// PORT (default 9233) is the app's --remoteDebuggingPort.
import { readFileSync, writeFileSync } from 'node:fs'

const port = process.env.PORT ?? 9233
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools'))
if (!page) throw new Error(`No app window on port ${port}`)
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) pending.get(m.id)(m)
})
const call = (method, params = {}) =>
  new Promise((r) => {
    pending.set(++id, r)
    ws.send(JSON.stringify({ id, method, params }))
  })

const [cmd, arg] = process.argv.slice(2)
if (cmd === 'eval' || cmd === 'evalfile') {
  const expression = cmd === 'evalfile' ? readFileSync(arg, 'utf8') : arg
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  const ex = r.result?.exceptionDetails
  console.log(ex ? `Exception: ${ex.exception?.description ?? ex.text}` : JSON.stringify(r.result?.result?.value, null, 1))
} else if (cmd === 'shot') {
  const r = await call('Page.captureScreenshot', { format: 'png' })
  writeFileSync(arg, Buffer.from(r.result.data, 'base64'))
  console.log('saved', arg)
} else console.log('usage: node drive.mjs eval "<js>" | evalfile <file> | shot <png>')
ws.close()
