# calude_mods

Mods de Claude Code de Jota.

## Instalar

```
/plugin install progreso --marketplace 0rgan1co/calude_mods
/plugin install gestor-mods --marketplace 0rgan1co/calude_mods
/plugin install guardia --marketplace 0rgan1co/calude_mods
```

## Mods

### progreso
Panel lateral **Progreso** con los pasos del plan de Claude:
○ pendiente · ◐ en curso · ● hecho, más un resumen en la línea de estado (`Paso 3/5 · …`).

- Se alimenta de las herramientas de plan de Claude (TodoWrite, TaskCreate, TaskUpdate).
- Se guarda por proyecto entre sesiones: al abrir una nueva ves el último plan como "sesión anterior".
- `/progreso` reabre el panel · `/progreso limpiar` lo vacía.

Desarrollo: `claude plugin validate plugins/progreso` · `claude plugin test plugins/progreso`.

### gestor-mods
Panel **Mods** (`/mods`) con todos tus mods (plugins con hooks de función):
● encendido · ○ apagado, con versión y descripción.

- **Apagar / Encender:** mods instalados vía `claude plugin disable|enable`; mods de carpeta editando `CLAUDE_CODE_PLUGIN_DIRS` en `~/.claude/settings.json` (deja copia en `settings.json.bak-gestor-mods`).
- **Eliminar** (pide confirmación): instalados → `claude plugin uninstall`; de carpeta → se apagan y se mueven a `~/.claude/mods-archivo/<nombre>-<fecha>` (reversible).
- Los cambios se aplican al reiniciar Claude Code. No se lista ni se borra a sí mismo.

### guardia
Guardia de Bash para la infraestructura crítica. Complementa a `launch-codes` (OneWave) con lo que ese mod no mira:

| Regla | Qué frena |
|---|---|
| `hermes-docker` | `docker rm / kill / stop / compose down` que nombre a `hermes` (también por `ssh`) |
| `docker-prune` | `docker system prune` / `docker volume prune` |
| `whatsapp-launchctl` | `launchctl unload / bootout / remove / kill / stop / disable` de `com.whatsapp.*` |
| `whatsapp-kill` | `pkill` / `killall` que nombre a `whatsapp` |
| `whatsapp-rm` | `rm` sobre rutas de `~/whatsapp-mcp` |
| `ssh-rm` | `rm` recursivo dentro de un comando `ssh` |
| `git-force-with-lease` | `git push --force-with-lease` / `--force-if-includes` |

- Ante un match abre el diálogo de preguntas de Claude Code: **Abortar** (default) o escribir `ejecutar` en Other para correrlo igual. Nada más lo habilita.
- **Falla cerrado**: si el hook falla o no hay nadie que responda (sesión headless, tareas programadas), el comando queda denegado y Claude recibe el motivo con la orden de no reintentar.
- Deja pasar `docker restart/logs/exec`, `launchctl load/kickstart`, `rm -rf` local corriente y `git push --force` a secas (esos dos son de launch-codes), y `rsync --delete`.
- Sin red, sin procesos, sin archivos, sin sonido. Un contador en la línea de estado (`guardia: N frenados`).
- `/guardia` lista las reglas · `/guardia test <comando>` muestra el veredicto sin ejecutar nada.

Instalar: `/plugin install guardia@calude-mods` (el marketplace `0rgan1co/calude_mods` ya está agregado).
Desarrollo: `claude plugin validate plugins/guardia` · `claude plugin test plugins/guardia`.
