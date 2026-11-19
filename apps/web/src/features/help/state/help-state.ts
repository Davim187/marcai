import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { HelpProgressStatus } from '@marcai/shared'
import { api } from '@/lib/api'

export interface HelpProgressItem {
  itemId: string
  step: number
  status: HelpProgressStatus
  timesCompleted: number
  startedAt: string
  completedAt: string | null
  updatedAt: string
}

export interface HelpState {
  beginnerMode: boolean
  introSeenAt: string | null
  progress: HelpProgressItem[]
}

export const HELP_STATE_KEY = ['help-state'] as const

/** Preferências e progresso da ajuda do usuário logado. */
export function useHelpState() {
  return useQuery({
    queryKey: HELP_STATE_KEY,
    queryFn: () => api<HelpState>('/help/state'),
    staleTime: 5 * 60_000,
  })
}

export function useProgressOf(itemId: string) {
  const { data } = useHelpState()
  return data?.progress.find((p) => p.itemId === itemId) ?? null
}

/** Mapa itemId → progresso, para listas (central de ajuda). */
export function useProgressMap() {
  const { data } = useHelpState()
  return new Map((data?.progress ?? []).map((p) => [p.itemId, p]))
}

export function useBeginnerMode() {
  return useHelpState().data?.beginnerMode ?? false
}

/**
 * Escritas da ajuda. Atualizam o cache na hora (otimista) e confirmam com o servidor;
 * se a rede falhar, o progresso fica na tela e é só um "visto" a menos, sem erro na cara.
 */
export function useHelpActions() {
  const qc = useQueryClient()

  const patchCache = (fn: (s: HelpState) => HelpState) =>
    qc.setQueryData<HelpState>(HELP_STATE_KEY, (s) => (s ? fn(s) : s))

  const prefs = useMutation({
    mutationFn: (body: { beginnerMode?: boolean; introSeen?: boolean }) =>
      api<HelpState>('/help/preferences', { method: 'PUT', body }),
    onMutate: (body) =>
      patchCache((s) => ({
        ...s,
        ...(body.beginnerMode !== undefined ? { beginnerMode: body.beginnerMode } : {}),
        ...(body.introSeen !== undefined
          ? { introSeenAt: body.introSeen ? new Date().toISOString() : null }
          : {}),
      })),
    onSuccess: (s) => qc.setQueryData(HELP_STATE_KEY, s),
  })

  const progress = useMutation({
    mutationFn: (v: { itemId: string; step: number; status: HelpProgressStatus }) =>
      api<HelpProgressItem>(`/help/progress/${encodeURIComponent(v.itemId)}`, {
        method: 'PUT',
        body: { step: v.step, status: v.status },
      }),
    onMutate: (v) =>
      patchCache((s) => {
        const now = new Date().toISOString()
        const prev = s.progress.find((p) => p.itemId === v.itemId)
        const next: HelpProgressItem = {
          itemId: v.itemId,
          step: v.step,
          status: v.status,
          timesCompleted:
            (prev?.timesCompleted ?? 0) +
            (v.status === 'completed' && prev?.status !== 'completed' ? 1 : 0),
          startedAt: prev?.startedAt ?? now,
          completedAt: v.status === 'completed' ? now : (prev?.completedAt ?? null),
          updatedAt: now,
        }
        return { ...s, progress: [next, ...s.progress.filter((p) => p.itemId !== v.itemId)] }
      }),
    onSuccess: (saved) =>
      patchCache((s) => ({
        ...s,
        progress: [saved, ...s.progress.filter((p) => p.itemId !== saved.itemId)],
      })),
  })

  const reset = useMutation({
    mutationFn: () => api<HelpState>('/help/progress', { method: 'DELETE' }),
    onSuccess: (s) => qc.setQueryData(HELP_STATE_KEY, s),
  })

  return {
    setBeginnerMode: (on: boolean) => prefs.mutate({ beginnerMode: on }),
    markIntroSeen: () => prefs.mutate({ introSeen: true }),
    saveProgress: (itemId: string, step: number, status: HelpProgressStatus) =>
      progress.mutate({ itemId, step, status }),
    resetAll: () => reset.mutateAsync(),
    resetting: reset.isPending,
  }
}
