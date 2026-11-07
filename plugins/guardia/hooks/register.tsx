import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { clasificar, REGLAS } from './reglas'

const PALABRA = 'ejecutar'
const bloqueos = atom({ plugin: 'guardia', key: 'bloqueos' } as const, 0)

const corto = (command: string) => (command.length > 90 ? `${command.slice(0, 87)}...` : command)

const negar = (command: string, motivo: string, porque: string) => ({
  deny:
    `guardia: frenó \`${corto(command)}\` (${motivo}) porque ${porque}. ` +
    'No lo reintentes ni busques otra forma de hacer lo mismo: contale al usuario qué querías hacer y preguntale, o proponé una vía más segura.',
})

const anotarBloqueo = async ($: EngineInterface) => {
  const n = (await read($, bloqueos)) + 1
  await update($, bloqueos, () => n)
  $.ui.status(`guardia: ${n} frenado${n === 1 ? '' : 's'}`)
}

/** Pregunta al usuario, en pantalla, si el comando corre igual. Solo la palabra escrita lo habilita. */
const confirmar = async ($: EngineInterface, command: string, motivo: string): Promise<{ corre: boolean; porque: string }> => {
  try {
    const respuesta = await $.ui.ask(
      `GUARDIA · ${motivo}.\n\n${corto(command)}\n\nPara correrlo igual escribí "${PALABRA}" en Other. Cualquier otra cosa lo frena.`,
      { header: 'GUARDIA', options: ['Abortar', 'Abortar y buscar una vía más segura'] },
    )
    if (respuesta.trim().toLowerCase() === PALABRA) return { corre: true, porque: 'el usuario lo autorizó por escrito' }
    const porque = respuesta.startsWith('Abortar') ? 'el usuario eligió abortar' : 'el usuario no escribió la palabra de confirmación'
    return { corre: false, porque }
  } catch {
    return { corre: false, porque: 'no había nadie para confirmarlo (sesión sin pantalla)' }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'guardia',
      description: 'Guardia de infraestructura: /guardia reglas · /guardia test <comando>',
    })
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const peligro = clasificar(e.command)
    if (!peligro) return next(e)
    const veredicto = await confirmar($, e.command, peligro.motivo)
    if (veredicto.corre) {
      $.ui.toast(`guardia: ejecutado bajo tu orden (${peligro.regla})`)
      return next(e)
    }
    await anotarBloqueo($)
    return negar(e.command, peligro.motivo, veredicto.porque)
  })
    // Un hook que falla no deja pasar el comando.
    .catch(($, e, next) => {
      if (next.called) return next(e)
      const peligro = clasificar(e.command)
      return peligro
        ? negar(e.command, peligro.motivo, 'la verificación de guardia falló')
        : { deny: 'guardia: la verificación falló; preguntale al usuario antes de reintentar.' }
    })

  on('command.run', { command: 'guardia' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg.startsWith('test ')) {
      const peligro = clasificar(arg.slice(5))
      return { text: peligro ? `Pide confirmación: ${peligro.motivo} [${peligro.regla}].` : 'Pasa: corre sin preguntar.' }
    }
    const n = await read($, bloqueos)
    const lista = REGLAS.map(r => `· ${r.regla}: ${r.que}`).join('\n')
    return {
      text:
        `Guardia activa. Frenó ${n} comando${n === 1 ? '' : 's'} en esta sesión.\n` +
        `Reglas:\n${lista}\n` +
        `Para correr uno igual, escribí "${PALABRA}" cuando pregunte. /guardia test <comando> muestra el veredicto sin ejecutar nada.`,
    }
  })
}
