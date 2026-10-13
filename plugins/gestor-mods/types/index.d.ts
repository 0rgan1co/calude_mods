export type ModKind = 'instalado' | 'carpeta'

export type ModEntry = {
  /** `plugin@marketplace` for an installed mod; the folder's absolute path for a folder mod. */
  id: string
  name: string
  kind: ModKind
  isEnabled: boolean
  version: string
  description: string
}

declare module 'claude-code' {
  interface PluginState {
    'gestor-mods': {
      mods: ModEntry[]
      /** Id of the mod waiting for a second press on "Eliminar"; '' when none. */
      confirm: string
      /** Last outcome shown under the list; '' when none. */
      message: string
      isBusy: boolean
    }
  }
}
