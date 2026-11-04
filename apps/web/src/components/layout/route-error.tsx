import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Button } from '../ui/button'
import { LogoMark } from '../logo'

export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  // Chunk desatualizado após um deploy: recarrega uma vez.
  if (
    error instanceof Error &&
    /dynamically imported module|Importing a module script failed/.test(error.message)
  ) {
    if (!sessionStorage.getItem('marcai-reloaded')) {
      sessionStorage.setItem('marcai-reloaded', '1')
      window.location.reload()
    }
  }
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark className="h-12 w-12" />
      <h1 className="text-2xl font-bold">
        {notFound ? 'Página não encontrada' : 'Ops, algo deu errado'}
      </h1>
      <p className="text-muted-foreground max-w-sm">
        {notFound
          ? 'O endereço pode ter mudado ou não existe mais.'
          : 'Tente recarregar a página. Se continuar, fale com a gente.'}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.location.reload()}>
          Recarregar
        </Button>
        <Button asChild>
          <Link to="/">Ir para o início</Link>
        </Button>
      </div>
    </div>
  )
}
