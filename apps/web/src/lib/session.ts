import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, setCsrfToken } from './api'
import type { Session } from './types'

export const SESSION_KEY = ['session'] as const

export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      const s = await api<Session>('/auth/me')
      if (s.authenticated) setCsrfToken(s.csrfToken)
      return s
    },
    staleTime: 60_000,
  })
}

/** Sessão autenticada com tenant ativo (para uso dentro do painel). */
export function useTenant() {
  const { data } = useSession()
  if (!data?.authenticated || !data.tenant) throw new Error('useTenant fora do painel')
  return { ...data, tenant: data.tenant }
}

export function useRefreshSession() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: SESSION_KEY })
}

export function useHasFeature() {
  const { data } = useSession()
  return (f: string) => Boolean(data?.authenticated && data.tenant?.features.includes(f as never))
}
