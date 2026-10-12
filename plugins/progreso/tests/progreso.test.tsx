import { expect, mock, test } from 'claude-code/testing'

import { summarize } from '../hooks/register'

const PANE = {
  component: 'Pane',
  requestId: 'progreso',
  props: { title: 'Progreso', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const todos = [
  { content: 'Leer el vault', activeForm: 'Leyendo el vault', status: 'completed' as const },
  { content: 'Escribir el mod', activeForm: 'Escribiendo el mod', status: 'in_progress' as const },
  { content: 'Publicarlo', activeForm: 'Publicándolo', status: 'pending' as const },
]

test('summarize cuenta pasos y muestra el que está en curso', () => {
  expect(summarize([])).toBe(undefined)
  const steps = todos.map((t, i) => ({ id: String(i), text: t.content, active: t.activeForm, status: t.status }))
  expect(summarize(steps)).toBe('Paso 2/3 · Escribiendo el mod')
})

test('TodoWrite llena el plan, la línea de estado y el panel en cada superficie', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 1000 })
  const statuses: (string | undefined)[] = []
  on('ui.status', async (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('tool.call', { tool: 'TodoWrite' }, async (_$, e) => ({ result: { oldTodos: [], newTodos: e.todos } }))

  await $.tool.call({ tool: 'TodoWrite', todos })
  expect(statuses.at(-1)).toBe('Paso 2/3 · Escribiendo el mod')

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'progreso', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /1\/3 hechos/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Escribiendo el mod/ })).toBeDefined()
    await ui.unmount()
  }
})

test('TaskCreate y TaskUpdate siguen cada tarea; deleted la saca', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const statuses: (string | undefined)[] = []
  on('ui.status', async (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  let n = 0
  on('tool.call', { tool: 'TaskCreate' }, async (_$, e) => ({ result: { task: { id: String(++n), subject: e.subject } } }))
  on('tool.call', { tool: 'TaskUpdate' }, async (_$, e) => ({ result: { success: true, taskId: e.taskId, updatedFields: [] } }))

  await $.tool.call({ tool: 'TaskCreate', subject: 'A', description: 'a', activeForm: 'Haciendo A' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'B', description: 'b' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress' })
  expect(statuses.at(-1)).toBe('Paso 1/2 · Haciendo A')
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'deleted' })
  expect(statuses.at(-1)).toBe('✓ 1/1 pasos')

  const ui = await $.ui.mount({ plugin: 'progreso', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /● A/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /B/ })).toBeUndefined()
})
