# calude_mods

Mods de Claude Code de Jota.

## Instalar

```
/plugin install progreso --marketplace 0rgan1co/calude_mods
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
