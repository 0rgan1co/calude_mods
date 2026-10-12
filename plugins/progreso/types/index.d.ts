export type StepStatus = 'pending' | 'in_progress' | 'completed'

export type Step = { id: string; text: string; active: string; status: StepStatus }

export type Plan = {
  steps: Step[]
  /** Epoch ms of the last change. */
  updatedAt: number
  /** True while the plan shown was loaded from an earlier session. */
  isPrevious: boolean
}

declare module 'claude-code' {
  interface PluginState {
    progreso: { plan: Plan }
  }
}
