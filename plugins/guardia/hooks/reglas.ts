/**
 * Reglas de Guardia: qué comandos de Bash necesitan confirmación escrita.
 * Puro: entra un comando, sale un motivo (o null). Cubre lo que launch-codes
 * (OneWave) no mira: Hermes en Docker, el bridge de WhatsApp, rm remoto por
 * ssh y git push --force-with-lease.
 */

export type Peligro = { regla: string; motivo: string }

type Token = { op: string } | { word: string }

/** Parte una línea en palabras y operadores, respetando comillas y barras. */
export const tokenizar = (line: string): Token[] => {
  const out: Token[] = []
  let word = ''
  let hasWord = false
  const flush = () => {
    if (hasWord) out.push({ word })
    word = ''
    hasWord = false
  }
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (c === "'") {
      const end = line.indexOf("'", i + 1)
      word += line.slice(i + 1, end === -1 ? line.length : end)
      hasWord = true
      i = end === -1 ? line.length : end
    } else if (c === '"') {
      let j = i + 1
      while (j < line.length && line[j] !== '"') {
        if (line[j] === '\\' && j + 1 < line.length) j++
        word += line[j]
        j++
      }
      hasWord = true
      i = j
    } else if (c === '\\' && i + 1 < line.length) {
      word += line[i + 1]
      hasWord = true
      i++
    } else if (c === ' ' || c === '\t') {
      flush()
    } else if (c === '\n' || c === ';') {
      flush()
      out.push({ op: ';' })
    } else if (c === '&' || c === '|') {
      flush()
      const pair = line[i + 1] === c
      out.push({ op: pair ? c + c : c })
      if (pair) i++
    } else if (c === '(' || c === ')') {
      flush()
      out.push({ op: c })
    } else {
      word += c
      hasWord = true
    }
  }
  flush()
  return out
}

/** Comandos simples: cada tramo entre operadores. */
const simples = (tokens: Token[]): string[][] => {
  const out: string[][] = []
  let words: string[] = []
  for (const t of tokens) {
    if ('op' in t) {
      if (words.length) out.push(words)
      words = []
    } else words.push(t.word)
  }
  if (words.length) out.push(words)
  return out
}

const ENVOLTORIOS = new Set(['sudo', 'time', 'command', 'exec', 'nohup', 'env', 'doas', 'xargs'])

/** El programa que de verdad corre, pasando sudo, env VAR=x, etc. */
const programa = (words: string[]) => {
  let i = 0
  while (i < words.length) {
    const w = words[i]!
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w) || ENVOLTORIOS.has(w) || (w.startsWith('-') && i > 0)) {
      i++
      continue
    }
    break
  }
  return { name: (words[i] ?? '').split('/').pop() ?? '', args: words.slice(i + 1) }
}

const HERMES = /hermes/i
const WHATSAPP = /whatsapp/i

const DOCKER_DESTRUCTIVO = new Set(['rm', 'kill', 'stop', 'down', 'prune'])

const dockerPeligro = (args: string[], comandoEntero: string): Peligro | null => {
  const joined = args.join(' ')
  // docker system prune / volume prune: borra volúmenes sin nombrar a nadie.
  if (/\b(system|volume)\s+prune\b/.test(joined)) {
    return { regla: 'docker-prune', motivo: 'docker prune borra contenedores y volúmenes parados, incluidos los de Hermes' }
  }
  // El verbo destructivo puede venir después de flags con valor (compose -f x.yml down).
  const verbo = args.find(a => DOCKER_DESTRUCTIVO.has(a))
  // "hermes" puede estar en el nombre del contenedor, en el .yml o en un cd previo del mismo comando.
  if (verbo && HERMES.test(comandoEntero)) {
    return { regla: 'hermes-docker', motivo: `toca el contenedor de Hermes (docker ${verbo})` }
  }
  return null
}

const LAUNCHCTL_APAGA = new Set(['unload', 'bootout', 'remove', 'kill', 'stop', 'disable'])

const SSH_CON_VALOR = new Set(['-p', '-i', '-l', '-o', '-F', '-J', '-L', '-R', '-D', '-W', '-b', '-c', '-e', '-m', '-O', '-Q', '-S', '-w', '-E', '-B', '-I'])

/** El comando que ssh corre del otro lado, o null si solo abre una shell. */
export const comandoRemoto = (args: string[]): string | null => {
  let i = 0
  while (i < args.length && args[i]!.startsWith('-')) {
    i += SSH_CON_VALOR.has(args[i]!) ? 2 : 1
  }
  // args[i] es el host; lo que sigue es el comando remoto.
  const resto = args.slice(i + 1)
  return resto.length ? resto.join(' ') : null
}

const rmRecursivo = (args: string[]) =>
  args.some(a => a === '--recursive' || (/^-[a-zA-Z]+$/.test(a) && /[rR]/.test(a)))

const objetivosRm = (args: string[]) => args.filter(a => !a.startsWith('-'))

/** El primer peligro que `command` encierra, o null si puede correr sin preguntar. */
export const clasificar = (command: string, profundidad = 0): Peligro | null => {
  for (const words of simples(tokenizar(command))) {
    const { name, args } = programa(words)
    const joined = args.join(' ')

    if (name === 'docker' || name === 'docker-compose' || name === 'podman') {
      const d = dockerPeligro(args, command)
      if (d) return d
    }

    if (name === 'launchctl' && args.some(a => LAUNCHCTL_APAGA.has(a)) && WHATSAPP.test(joined)) {
      return { regla: 'whatsapp-launchctl', motivo: `apaga el bridge de WhatsApp (launchctl ${args.find(a => LAUNCHCTL_APAGA.has(a))})` }
    }

    if ((name === 'pkill' || name === 'killall') && WHATSAPP.test(joined)) {
      return { regla: 'whatsapp-kill', motivo: `mata el proceso del bridge de WhatsApp (${name})` }
    }

    if (name === 'rm') {
      const objetivos = objetivosRm(args)
      const toca = objetivos.filter(o => /whatsapp-mcp/i.test(o))
      if (toca.length) {
        return { regla: 'whatsapp-rm', motivo: `borra archivos del bridge de WhatsApp (${toca[0]})` }
      }
      if (profundidad > 0 && rmRecursivo(args) && objetivos.length) {
        return { regla: 'ssh-rm', motivo: `rm recursivo en un servidor remoto (${objetivos.slice(0, 2).join(' ')})` }
      }
    }

    if (name === 'git') {
      let at = 0
      while (at < args.length && args[at]!.startsWith('-')) at += ['-C', '-c', '--git-dir', '--work-tree'].includes(args[at]!) ? 2 : 1
      if (args[at] === 'push' && args.slice(at + 1).some(a => a.startsWith('--force-with-lease') || a === '--force-if-includes')) {
        return { regla: 'git-force-with-lease', motivo: 'git push --force-with-lease reescribe historia remota (launch-codes no lo detecta)' }
      }
    }

    if (name === 'ssh' && profundidad < 2) {
      const remoto = comandoRemoto(args)
      if (remoto) {
        const d = clasificar(remoto, profundidad + 1)
        if (d) return { regla: d.regla, motivo: `por ssh: ${d.motivo}` }
      }
    }
  }
  return null
}

/** Las reglas, para /guardia reglas. */
export const REGLAS: readonly { regla: string; que: string }[] = [
  { regla: 'hermes-docker', que: 'docker rm / kill / stop / compose down que nombre a hermes' },
  { regla: 'docker-prune', que: 'docker system prune / volume prune' },
  { regla: 'whatsapp-launchctl', que: 'launchctl unload / bootout / remove / kill / stop / disable de com.whatsapp.*' },
  { regla: 'whatsapp-kill', que: 'pkill / killall que nombre a whatsapp' },
  { regla: 'whatsapp-rm', que: 'rm sobre rutas de ~/whatsapp-mcp' },
  { regla: 'ssh-rm', que: 'rm recursivo dentro de un comando ssh' },
  { regla: 'git-force-with-lease', que: 'git push --force-with-lease / --force-if-includes' },
]
