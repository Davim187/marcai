import { usePublicConfig } from '@/lib/config'
import { Logo } from './logo'

/** Logo da plataforma — ou, no modo exclusivo (white-label), a marca do cliente. */
export function BrandLogo({ className }: { className?: string }) {
  const { data } = usePublicConfig()
  if (!data) return <span className="h-8" />
  if (data.appMode === 'single_tenant' && data.brand) {
    return (
      <span
        className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className ?? ''}`}
      >
        {data.brand.logoUrl ? (
          <img src={data.brand.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm text-white"
            style={{ background: data.brand.primaryColor }}
          >
            {data.brand.name[0]}
          </span>
        )}
        <span className="truncate text-lg">{data.brand.name}</span>
      </span>
    )
  }
  return <Logo className={className} />
}
