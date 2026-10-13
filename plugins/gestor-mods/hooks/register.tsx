import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ModEntry } from '../types'

const PANE = 'gestor-mods'
const TITLE = 'Mods'
const mods = atom({ plugin: 'gestor-mods', key: 'mods' } as const, [])
const confirm = atom({ plugin: 'gestor-mods', key: 'confirm' } as const, '')
const message = atom({ plugin: 'gestor-mods', key: 'message' } as const, '')
const busy = atom({ plugin: 'gestor-mods', key: 'isBusy' } as const, false)

const APPLY = 'Reiniciá Claude Code para aplicarlo.'

type Listed = { id: string; version?: string; enabled?: boolean; installPath?: string }
type Manifest = { name?: string; version?: string; description?: string }

/** Splits CLAUDE_CODE_PLUGIN_DIRS and expands a leading ~. */
export function splitDirs(value: string | undefined, home: string): string[] {
  return (value ?? '')
    .split(':')
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => (p.startsWith('~') ? home + p.slice(1) : p).replace(/\/+$/, ''))
}

/** Joins the folders back, keeping the order and dropping duplicates. */
export function joinDirs(dirs: string[]): string {
  return [...new Set(dirs)].join(':')
}

async function home($: EngineInterface): Promise<string> {
  return (await $.env.get('HOME')) ?? ''
}

async function manifest($: EngineInterface, dir: string): Promise<Manifest> {
  try {
    return JSON.parse(await $.fs.read(`${dir}/.claude-plugin/plugin.json`)) as Manifest
  } catch {
    return {}
  }
}

/** A mod is a plugin whose hooks/hooks.json names a module of function hooks. */
async function isMod($: EngineInterface, dir: string): Promise<boolean> {
  try {
    const hooks = JSON.parse(await $.fs.read(`${dir}/hooks/hooks.json`)) as { modules?: unknown }
    return Array.isArray(hooks.modules) && hooks.modules.length > 0
  } catch {
    return false
  }
}

async function settingsPath($: EngineInterface): Promise<string> {
  return `${await home($)}/.claude/settings.json`
}

async function readUserSettings($: EngineInterface): Promise<Record<string, unknown>> {
  const path = await settingsPath($)
  if (!(await $.fs.exists(path))) return {}
  return JSON.parse(await $.fs.read(path)) as Record<string, unknown>
}

async function folderDirs($: EngineInterface): Promise<string[]> {
  const settings = await readUserSettings($)
  const env = (settings.env ?? {}) as Record<string, string>
  return splitDirs(env.CLAUDE_CODE_PLUGIN_DIRS, await home($))
}

/** Rewrites CLAUDE_CODE_PLUGIN_DIRS in ~/.claude/settings.json, keeping a backup of the file first. */
async function writeFolderDirs($: EngineInterface, dirs: string[]): Promise<void> {
  const path = await settingsPath($)
  const settings = await readUserSettings($)
  if (await $.fs.exists(path)) await $.fs.write(`${path}.bak-gestor-mods`, await $.fs.read(path))
  const env = { ...((settings.env ?? {}) as Record<string, string>) }
  if (dirs.length > 0) env.CLAUDE_CODE_PLUGIN_DIRS = joinDirs(dirs)
  else delete env.CLAUDE_CODE_PLUGIN_DIRS
  await $.fs.write(path, `${JSON.stringify({ ...settings, env }, null, 2)}\n`)
}

async function claude($: EngineInterface, args: string[]): Promise<{ isOk: boolean; text: string }> {
  try {
    const ran = await $.process.run(['claude', 'plugin', ...args], { timeoutMs: 60_000 })
    return { isOk: ran.exitCode === 0, text: (ran.stderr || ran.stdout).trim().split('\n').pop() ?? '' }
  } catch (error) {
    return { isOk: false, text: `no pude correr \`claude plugin ${args.join(' ')}\`: ${String(error)}` }
  }
}

async function scan($: EngineInterface): Promise<ModEntry[]> {
  const found: ModEntry[] = []
  const self = $.plugin.root.replace(/\/+$/, '')

  const listed = await $.process
    .run(['claude', 'plugin', 'list', '--json'], { timeoutMs: 60_000 })
    .then(r => (r.exitCode === 0 ? (JSON.parse(r.stdout) as Listed[]) : []))
    .catch(() => [] as Listed[])
  for (const p of listed) {
    if (!p.installPath || p.installPath.replace(/\/+$/, '') === self || !(await isMod($, p.installPath))) continue
    const m = await manifest($, p.installPath)
    if (m.name === $.plugin.name) continue
    found.push({
      id: p.id,
      name: m.name ?? p.id.split('@')[0] ?? p.id,
      kind: 'instalado',
      isEnabled: p.enabled !== false,
      version: p.version ?? m.version ?? '',
      description: m.description ?? '',
    })
  }

  // Folder mods: those named in CLAUDE_CODE_PLUGIN_DIRS (on) and the rest of ~/.claude/mods (off).
  const enabledDirs = await folderDirs($)
  const modsRoot = `${await home($)}/.claude/mods`
  const children = (await $.fs.exists(modsRoot))
    ? (await $.fs.list(modsRoot)).filter(e => e.kind === 'dir' || e.isLink).map(e => `${modsRoot}/${e.name}`)
    : []
  for (const dir of [...new Set([...enabledDirs, ...children])]) {
    if (dir === self || !(await isMod($, dir))) continue
    const m = await manifest($, dir)
    if (m.name === $.plugin.name) continue
    found.push({
      id: dir,
      name: m.name ?? dir.split('/').pop() ?? dir,
      kind: 'carpeta',
      isEnabled: enabledDirs.includes(dir),
      version: m.version ?? '',
      description: m.description ?? '',
    })
  }

  return found.sort((a, b) => a.name.localeCompare(b.name))
}

async function refresh($: EngineInterface): Promise<void> {
  const list = await scan($)
  await update($, mods, () => list)
}

/** Runs one action with the panel marked busy, then rescans and shows the outcome. */
async function act($: EngineInterface, work: () => Promise<string>): Promise<void> {
  if (await read($, busy)) return
  await update($, busy, () => true)
  await update($, confirm, () => '')
  let text: string
  try {
    text = await work()
  } catch (error) {
    text = `Falló: ${String(error)}`
  }
  await refresh($)
  await update($, message, () => text)
  await update($, busy, () => false)
}

async function toggle($: EngineInterface, mod: ModEntry): Promise<string> {
  if (mod.kind === 'instalado') {
    const ran = await claude($, [mod.isEnabled ? 'disable' : 'enable', mod.id])
    return ran.isOk ? `${mod.name} ${mod.isEnabled ? 'apagado' : 'encendido'}. ${APPLY}` : `No se pudo: ${ran.text}`
  }
  const dirs = await folderDirs($)
  await writeFolderDirs($, mod.isEnabled ? dirs.filter(d => d !== mod.id) : [...dirs, mod.id])
  return `${mod.name} ${mod.isEnabled ? 'apagado' : 'encendido'}. ${APPLY}`
}

/** Installed mods are uninstalled; folder mods are switched off and moved to ~/.claude/mods-archivo (reversible). */
async function remove($: EngineInterface, mod: ModEntry): Promise<string> {
  if (mod.kind === 'instalado') {
    const ran = await claude($, ['uninstall', mod.id])
    return ran.isOk ? `${mod.name} desinstalado. ${APPLY}` : `No se pudo: ${ran.text}`
  }
  const dirs = await folderDirs($)
  if (dirs.includes(mod.id)) await writeFolderDirs($, dirs.filter(d => d !== mod.id))
  const archive = `${await home($)}/.claude/mods-archivo`
  const stamp = new Date(await $.clock.now()).toISOString().slice(0, 10)
  const target = `${archive}/${mod.id.split('/').pop()}-${stamp}`
  const made = await $.process.run(['mkdir', '-p', archive])
  const moved = made.exitCode === 0 ? await $.process.run(['mv', mod.id, target]) : made
  return moved.exitCode === 0
    ? `${mod.name} archivado en ${target}. ${APPLY}`
    : `${mod.name} quedó apagado, pero no pude moverlo: ${moved.stderr.trim()}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mods', description: 'Ver tus mods, encenderlos, apagarlos o archivarlos' })
    await update($, busy, () => false)
    void refresh($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'mods' }, async $ => {
    await refresh($)
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    const list = await read($, mods)
    const onCount = list.filter(m => m.isEnabled).length
    return {
      text: opened.isPlaced
        ? `Panel de mods abierto: ${list.length} mods, ${onCount} encendidos.`
        : `${list.length} mods, ${onCount} encendidos. Esta pantalla no tiene lugar para el panel.`,
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, mods)
    const asking = await read($, confirm)
    const note = await read($, message)
    const isBusy = await read($, busy)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>
            {list.length} mods · {list.filter(m => m.isEnabled).length} encendidos
          </Text>
          <Button key="refresh" plain dimColor onPress={() => act($, async () => 'Lista actualizada.')}>
            Actualizar
          </Button>
        </Box>
        {list.length === 0 && <Text dimColor>No encontré mods (plugins con hooks de función).</Text>}
        {list.map(mod => (
          <Box key={mod.id} flexDirection="column" marginTop={1}>
            <Text bold={mod.isEnabled} dimColor={!mod.isEnabled}>
              {mod.isEnabled ? '●' : '○'} {mod.name}
              <Text dimColor>
                {' '}
                {mod.kind}
                {mod.version ? ` · v${mod.version}` : ''}
              </Text>
            </Text>
            {mod.description !== '' && <Text dimColor>  {mod.description}</Text>}
            {asking === mod.id ? (
              <Box flexDirection="row" gap={2}>
                <Text>  {mod.kind === 'instalado' ? '¿Desinstalarlo?' : '¿Archivarlo?'}</Text>
                <Button key={`yes:${mod.id}`} variant="primary" onPress={() => act($, () => remove($, mod))}>
                  Sí, eliminar
                </Button>
                <Button key={`no:${mod.id}`} plain onPress={() => update($, confirm, () => '')}>
                  Cancelar
                </Button>
              </Box>
            ) : (
              <Box flexDirection="row" gap={2}>
                <Text> </Text>
                <Button key={`toggle:${mod.id}`} plain onPress={() => act($, () => toggle($, mod))}>
                  {mod.isEnabled ? 'Apagar' : 'Encender'}
                </Button>
                <Button key={`del:${mod.id}`} plain dimColor onPress={() => update($, confirm, () => mod.id)}>
                  Eliminar
                </Button>
              </Box>
            )}
          </Box>
        ))}
        {isBusy && <Text dimColor>Trabajando…</Text>}
        {!isBusy && note !== '' && <Text>{note}</Text>}
      </Box>
    )
  })
}
