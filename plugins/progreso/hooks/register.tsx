import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Plan, Step, StepStatus } from '../types'

const PANE = 'progreso'
const TITLE = 'Progreso'
const EMPTY: Plan = { steps: [], updatedAt: 0, isPrevious: false }
const plan = atom({ plugin: 'progreso', key: 'plan' } as const, EMPTY)

const MARK: Record<StepStatus, string> = { pending: '○', in_progress: '◐', completed: '●' }

let storeKey = 'plan'

export const summarize = (steps: Step[]): string | undefined => {
  if (steps.length === 0) return undefined
  const done = steps.filter(s => s.status === 'completed').length
  const now = steps.find(s => s.status === 'in_progress')
  if (done === steps.length) return `✓ ${done}/${steps.length} pasos`
  return `Paso ${Math.min(done + 1, steps.length)}/${steps.length}${now ? ` · ${now.active || now.text}` : ''}`
}

// Writes the plan to the session state, the store (per project) and the status line.
async function save($: EngineInterface, fn: (p: Plan) => Plan) {
  const at = await $.clock.now()
  let next: Plan = EMPTY
  await update($, plan, p => {
    const base = p ?? EMPTY
    // A plan inherited from an earlier session gives way to the first new one.
    const fresh = base.isPrevious ? EMPTY : base
    next = { ...fn(fresh), updatedAt: at, isPrevious: false }
    return next
  })
  await $.store.set(storeKey, next)
  $.ui.status(summarize(next.steps))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    storeKey = `plan:${e.cwd}`
    await $.command.register({
      name: 'progreso',
      description: 'Abrir el panel de progreso (/progreso limpiar lo vacía)',
    })
    const saved = (await $.store.get(storeKey)) as Plan | undefined
    if (saved && saved.steps.length > 0) {
      await update($, plan, () => ({ ...saved, isPrevious: true }))
    }
    if (e.isInteractive) void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'progreso' }, async ($, e) => {
    if (/limpiar|clear/i.test(String(e.args ?? ''))) {
      await update($, plan, () => EMPTY)
      await $.store.delete(storeKey)
      $.ui.status(undefined)
      return { text: 'Progreso vaciado.' }
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { text: opened.isPlaced ? 'Panel de progreso abierto.' : 'Panel listo; esta pantalla no tiene lugar para mostrarlo ahora.' }
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError) {
      await save($, () => ({
        ...EMPTY,
        steps: e.todos.map((t, i) => ({ id: `todo-${i}`, text: t.content, active: t.activeForm, status: t.status })),
      }))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError && ran.result?.task) {
      const step: Step = { id: ran.result.task.id, text: e.subject, active: e.activeForm ?? '', status: 'pending' }
      await save($, p => ({ ...p, steps: [...p.steps, step] }))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError) {
      await save($, p => ({
        ...p,
        steps:
          e.status === 'deleted'
            ? p.steps.filter(s => s.id !== e.taskId)
            : p.steps.map(s =>
                s.id !== e.taskId
                  ? s
                  : {
                      ...s,
                      text: e.subject ?? s.text,
                      active: e.activeForm ?? s.active,
                      status: (e.status as StepStatus | undefined) ?? s.status,
                    },
              ),
      }))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const p = await read($, plan)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 5)
    const done = p.steps.filter(s => s.status === 'completed').length

    if (p.steps.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Sin plan todavía.</Text>
          <Text dimColor>Aparece cuando Claude arma su lista de pasos.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text bold>
          {done}/{p.steps.length} hechos{p.isPrevious ? ' · sesión anterior' : ''}
        </Text>
        {p.steps.slice(0, room).map(s => (
          <Text key={s.id} dimColor={s.status === 'completed'} bold={s.status === 'in_progress'}>
            {MARK[s.status]} {s.status === 'in_progress' && s.active ? s.active : s.text}
          </Text>
        ))}
        {p.steps.length > room && <Text dimColor>… y {p.steps.length - room} más</Text>}
      </Box>
    )
  })
}
