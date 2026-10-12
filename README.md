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
