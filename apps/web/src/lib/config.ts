import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export interface PublicConfig {
  appMode: 'saas' | 'single_tenant'
  appName: string
  singleTenantSlug: string | null
  brand: {
    name: string
    logoUrl: string | null
    faviconUrl: string | null
    primaryColor: string
  } | null
}

export function usePublicConfig() {
  return useQuery({
    queryKey: ['public-config'],
    queryFn: () => api<PublicConfig>('/public/config'),
    staleTime: Infinity,
  })
}
