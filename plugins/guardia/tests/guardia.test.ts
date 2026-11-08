import { expect, test } from 'claude-code/testing'

import { clasificar, comandoRemoto } from '../hooks/reglas'

const frena = (cmd: string) => clasificar(cmd)?.regla ?? null

/** Responde el diálogo de $.ui.ask como lo haría la persona: `respuesta` a cada pregunta. */
const responder = (e: { questions: Array<{ question: string }> }, respuesta: string) => ({
  result: {
    questions: e.questions.map(q => ({ ...q, header: 'GUARDIA', options: [], multiSelect: false })),
    answers: Object.fromEntries(e.questions.map(q => [q.question, respuesta])),
  },
})

test('frena lo que toca a Hermes en Docker', async () => {
  expect(frena('docker rm -f hermes-webui-hbu7-hermes-agent-1')).toBe('hermes-docker')
  expect(frena('docker stop hermes-webui-hbu7-hermes-agent-1')).toBe('hermes-docker')
  expect(frena('docker kill hermes-webui-hbu7-hermes-agent-1')).toBe('hermes-docker')
  expect(frena('cd /opt/hermes && docker compose down -v')).toBe('hermes-docker')
  expect(frena('sudo docker compose -f hermes.yml down')).toBe('hermes-docker')
  expect(frena('docker system prune -af')).toBe('docker-prune')
  expect(frena('docker volume prune -f')).toBe('docker-prune')
})

test('deja pasar lo que no destruye a Hermes', async () => {
  expect(frena('docker ps')).toBe(null)
  expect(frena('docker restart hermes-webui-hbu7-hermes-agent-1')).toBe(null)
  expect(frena('docker logs --tail 100 hermes-webui-hbu7-hermes-agent-1')).toBe(null)
  expect(frena('docker exec -it hermes-webui-hbu7-hermes-agent-1 bash')).toBe(null)
  expect(frena('docker rm -f otro-contenedor')).toBe(null)
  expect(frena('docker compose up -d')).toBe(null)
})

test('frena lo que apaga el bridge de WhatsApp', async () => {
  expect(frena('launchctl unload ~/Library/LaunchAgents/com.whatsapp.bridge.plist')).toBe('whatsapp-launchctl')
  expect(frena('launchctl bootout gui/501/com.whatsapp.mcp-proxy')).toBe('whatsapp-launchctl')
  expect(frena('pkill -f whatsapp-bridge-bin')).toBe('whatsapp-kill')
  expect(frena('killall whatsapp-bridge-bin')).toBe('whatsapp-kill')
  expect(frena('rm -rf ~/whatsapp-mcp/store')).toBe('whatsapp-rm')
  expect(frena('rm ~/whatsapp-mcp/store/messages.db')).toBe('whatsapp-rm')
})

test('deja pasar lo que solo mira o reinicia el bridge', async () => {
  expect(frena('launchctl list | grep whatsapp')).toBe(null)
  expect(frena('launchctl load ~/Library/LaunchAgents/com.whatsapp.bridge.plist')).toBe(null)
  expect(frena('launchctl kickstart -k gui/501/com.whatsapp.bridge')).toBe(null)
  expect(frena('lsof -nP -i -a -p $(pgrep -f whatsapp-bridge-bin) | grep ESTABLISHED')).toBe(null)
  expect(frena('launchctl unload ~/Library/LaunchAgents/com.jota.obsidian-dashboard.plist')).toBe(null)
})

test('frena rm recursivo y Docker destructivo del otro lado de ssh', async () => {
  expect(frena('ssh root@vps "rm -rf /root/.hermes"')).toBe('ssh-rm')
  expect(frena("ssh -p 2222 -i ~/.ssh/vps root@vps 'docker rm -f hermes-webui-hbu7-hermes-agent-1'")).toBe('hermes-docker')
  expect(frena('ssh root@vps docker compose -f /opt/hermes/docker-compose.yml down')).toBe('hermes-docker')
  expect(clasificar('ssh root@vps "rm -rf /root/.hermes"')?.motivo.startsWith('por ssh:')).toBe(true)
})

test('deja pasar ssh inofensivo y rm local corriente (eso es de launch-codes)', async () => {
  expect(frena('ssh root@vps')).toBe(null)
  expect(frena('ssh root@vps "docker ps && df -h"')).toBe(null)
  expect(frena('ssh root@vps "rm /tmp/x.log"')).toBe(null)
  expect(frena('rm -rf ~/Desktop/basura')).toBe(null)
  expect(frena('rsync -a --delete ~/.claude/skills/ ~/second-brain/3-Recursos/Claude-Backup/skills/')).toBe(null)
})

test('frena git push --force-with-lease y deja pasar el push normal', async () => {
  expect(frena('git push --force-with-lease origin main')).toBe('git-force-with-lease')
  expect(frena('git push --force-with-lease=main:abc123 origin main')).toBe('git-force-with-lease')
  expect(frena('git -C ~/second-brain push --force-if-includes')).toBe('git-force-with-lease')
  expect(frena('git push -u origin claude/x')).toBe(null)
  expect(frena('git push --force origin main')).toBe(null)
})

test('comandoRemoto separa host de comando', async () => {
  expect(comandoRemoto(['root@vps', 'docker', 'ps'])).toBe('docker ps')
  expect(comandoRemoto(['-p', '2222', 'root@vps'])).toBe(null)
  expect(comandoRemoto(['-o', 'StrictHostKeyChecking=no', 'vps', 'rm -rf /x'])).toBe('rm -rf /x')
})

test('un Bash peligroso se frena cuando el usuario aborta, y el tool no corre', async ($, on) => {
  let corrio = false
  on('command.register', () => ({ value: { command: 'guardia' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => responder(e, 'Abortar'))
  on('tool.call', { tool: 'Bash' }, () => {
    corrio = true
    return { result: {} }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const r = await $.tool.call({ tool: 'Bash', command: 'docker rm -f hermes-webui-hbu7-hermes-agent-1' })

  expect(corrio).toBe(false)
  expect(String(r.deny ?? r.text ?? '')).toContain('guardia')
})

test('un Bash peligroso corre cuando el usuario escribe la palabra', async ($, on) => {
  let corrio = false
  on('command.register', () => ({ value: { command: 'guardia' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => responder(e, 'ejecutar'))
  on('tool.call', { tool: 'Bash' }, () => {
    corrio = true
    return { result: {} }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const r = await $.tool.call({ tool: 'Bash', command: 'launchctl unload ~/Library/LaunchAgents/com.whatsapp.bridge.plist' })

  expect(corrio).toBe(true)
  expect(r.deny).toBe(undefined)
})

test('un Bash inofensivo pasa sin preguntar', async ($, on) => {
  let pregunto = false
  let corrio = false
  on('command.register', () => ({ value: { command: 'guardia' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => {
    pregunto = true
    return responder(e, 'Abortar')
  })
  on('tool.call', { tool: 'Bash' }, () => {
    corrio = true
    return { result: {} }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'docker ps' })

  expect(pregunto).toBe(false)
  expect(corrio).toBe(true)
})

test('/guardia test da el veredicto sin ejecutar', async ($, on) => {
  on('command.register', () => ({ value: { command: 'guardia' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({
    command: 'guardia',
    args: 'test docker rm -f hermes-webui-hbu7-hermes-agent-1',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })

  expect(String(r.text ?? '')).toContain('hermes-docker')
})
