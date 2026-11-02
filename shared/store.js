import fs from 'node:fs'
import path from 'node:path'

export function createStore(name, defaults, dir) {
  const data = structuredClone(defaults)
  let file = null
  let timer = null

  if (dir) {
    fs.mkdirSync(dir, { recursive: true })
    file = path.join(dir, `${name}.json`)
    if (fs.existsSync(file)) {
      try {
        Object.assign(data, JSON.parse(fs.readFileSync(file, 'utf8')))
      } catch {
        fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`)
      }
    }
  }

  function flush() {
    if (!file) return
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data))
    fs.renameSync(tmp, file)
  }

  function save() {
    if (!file) return
    clearTimeout(timer)
    timer = setTimeout(flush, 50)
    timer.unref?.()
  }

  return { data, save, flush }
}
