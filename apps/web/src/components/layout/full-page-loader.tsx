import { LogoMark } from '../logo'

export function FullPageLoader() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center"
      role="status"
      aria-label="Carregando"
    >
      <LogoMark className="h-10 w-10 animate-pulse" />
    </div>
  )
}
