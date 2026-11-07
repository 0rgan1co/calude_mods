/** Cuántos comandos frenó Guardia en la sesión. */
export type Bloqueos = number

declare module 'claude-code' {
  interface PluginState {
    guardia: { bloqueos: Bloqueos }
  }
}
