import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { joinDirs, splitDirs } from '../hooks/register'

const PANE = {
  component: 'Pane',
  requestId: 'gestor-mods',
  props: { title: 'Mods', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const RUN = { command: 'mods', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

const MOD_HOOKS = JSON.stringify({ modules: ['./register.tsx'] })
const SKILL_HOOKS = JSON.stringify({ hooks: {} })

/** A fake Mac: files, folders, settings.json and the claude CLI, answered beneath the plugin. */
function world(on: On) {
  const files = new Map<string, string>([
    ['/h/.claude/settings.json', JSON.stringify({ theme: 'dark', env: { CLAUDE_CODE_PLUGIN_DIRS: '~/.claude/mods/tinta', OTHER: '1' } })],
    ['/h/.claude/mods/tinta/hooks/hooks.json', MOD_HOOKS],
    ['/h/.claude/mods/tinta/.claude-plugin/plugin.json', JSON.stringify({ name: 'tinta', version: '0.2.0', description: 'Clawd flotante' })],
    ['/h/.claude/mods/objetivo/hooks/hooks.json', MOD_HOOKS],
    ['/h/.claude/mods/objetivo/.claude-plugin/plugin.json', JSON.stringify({ name: 'objetivo', version: '0.1.0' })],
    ['/h/p/progreso/hooks/hooks.json', MOD_HOOKS],
    ['/h/p/progreso/.claude-plugin/plugin.json', JSON.stringify({ name: 'progreso', version: '0.1.0' })],
    ['/h/p/bitacora/hooks/hooks.json', SKILL_HOOKS],
  ])
  const dirs = ['/h/.claude/mods/tinta', '/h/.claude/mods/objetivo']
  const runs: string[][] = []
  const done = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  const listed = [
    { id: 'progreso@calude-mods', version: '0.1.0', enabled: true, installPath: '/h/p/progreso' },
    { id: 'bitacora@synced', version: '0.13.1', enabled: true, installPath: '/h/p/bitacora' },
  ]

  on('env.get', async (_$, e) => ({ value: e.name === 'HOME' ? '/h' : undefined }))
  on('fs.exists', async (_$, e) => ({ value: files.has(e.path) || dirs.includes(e.path) || e.path === '/h/.claude/mods' }))
  on('fs.read', async (_$, e) => {
    const text = files.get(e.path)
    if (text === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: text }
  })
  on('fs.write', async (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', async (_$, e) => ({
    value: dirs
      .filter(d => d.startsWith(`${e.path}/`))
      .map(d => ({ name: d.slice(e.path.length + 1), kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('process.run', async (_$, e) => {
    const argv = [...e.argv]
    runs.push(argv)
    if (argv.join(' ') === 'claude plugin list --json') return done(JSON.stringify(listed))
    if (argv[0] === 'mv') dirs.splice(dirs.indexOf(argv[1] ?? ''), 1)
    if (argv[2] === 'disable') listed[0]!.enabled = false
    return done()
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('clock.now', async () => ({ value: Date.UTC(2026, 9, 13) }))

  const pluginDirs = () => (JSON.parse(files.get('/h/.claude/settings.json')!) as { env: Record<string, string> }).env.CLAUDE_CODE_PLUGIN_DIRS
  return { files, runs, pluginDirs }
}

test('splitDirs expande ~ y joinDirs no repite', () => {
  expect(splitDirs('~/.claude/mods/a: /x/b/ ::', '/h')).toEqual(['/h/.claude/mods/a', '/x/b'])
  expect(joinDirs(['/a', '/b', '/a'])).toBe('/a:/b')
})

test('/mods lista solo los mods, con su estado', async ($, on) => {
  world(on)
  const ran = await $.command.run(RUN)
  expect(ran.text).toBe('Panel de mods abierto: 3 mods, 2 encendidos.')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'gestor-mods', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /● tinta/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /○ objetivo/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /● progreso/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /bitacora/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('encender un mod de carpeta lo agrega a settings.json sin tocar lo demás', async ($, on) => {
  const w = world(on)
  await $.command.run(RUN)
  const ui = await $.ui.mount({ plugin: 'gestor-mods', surface: 'terminal', ...PANE })

  await ui.press({ key: 'toggle:/h/.claude/mods/objetivo' })
  expect(w.pluginDirs()).toBe('/h/.claude/mods/tinta:/h/.claude/mods/objetivo')
  const settings = JSON.parse(w.files.get('/h/.claude/settings.json')!) as { theme: string; env: Record<string, string> }
  expect(settings.theme).toBe('dark')
  expect(settings.env.OTHER).toBe('1')
  expect(w.files.has('/h/.claude/settings.json.bak-gestor-mods')).toBe(true)
  expect(await ui.find({ type: 'Text', text: /● objetivo/ })).toBeDefined()
})

test('eliminar pide confirmación y archiva la carpeta', async ($, on) => {
  const w = world(on)
  await $.command.run(RUN)
  const ui = await $.ui.mount({ plugin: 'gestor-mods', surface: 'terminal', ...PANE })

  await ui.press({ key: 'del:/h/.claude/mods/tinta' })
  expect(w.runs.some(r => r[0] === 'mv')).toBe(false)
  await ui.press({ key: 'yes:/h/.claude/mods/tinta' })

  expect(w.runs).toContainEqual(['mv', '/h/.claude/mods/tinta', '/h/.claude/mods-archivo/tinta-2026-10-13'])
  expect(w.pluginDirs()).toBe(undefined)
  expect(await ui.find({ type: 'Text', text: /tinta archivado/ })).toBeDefined()
})

test('apagar un mod instalado usa claude plugin disable', async ($, on) => {
  const w = world(on)
  await $.command.run(RUN)
  const ui = await $.ui.mount({ plugin: 'gestor-mods', surface: 'terminal', ...PANE })

  await ui.press({ key: 'toggle:progreso@calude-mods' })
  expect(w.runs).toContainEqual(['claude', 'plugin', 'disable', 'progreso@calude-mods'])
  expect(await ui.find({ type: 'Text', text: /○ progreso/ })).toBeDefined()
})
