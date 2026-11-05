import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router'
import { lazy, Suspense } from 'react'
import { useSession } from './lib/session'
import { FullPageLoader } from './components/layout/full-page-loader'
import { RouteError } from './components/layout/route-error'

const lazyRoute = (f: () => Promise<{ default: React.ComponentType }>) => {
  const C = lazy(f)
  return (
    <Suspense fallback={<FullPageLoader />}>
      <C />
    </Suspense>
  )
}

/** Raiz: landing (SaaS) ou página pública do estabelecimento (modo exclusivo). */
function Root() {
  const { data, isLoading } = useSession()
  if (isLoading || !data) return <FullPageLoader />
  if (data.appMode === 'single_tenant')
    return lazyRoute(() => import('./features/booking/public-booking-page'))
  return lazyRoute(() => import('./features/landing/landing-page'))
}

function RequireAuth({ needTenant = true }: { needTenant?: boolean }) {
  const { data, isLoading } = useSession()
  const location = useLocation()
  if (isLoading || !data) return <FullPageLoader />
  if (!data.authenticated)
    return <Navigate to={`/entrar?voltar=${encodeURIComponent(location.pathname)}`} replace />
  if (needTenant && !data.tenant) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

function GuestOnly() {
  const { data, isLoading } = useSession()
  if (isLoading || !data) return <FullPageLoader />
  if (data.authenticated) return <Navigate to={data.tenant ? '/painel' : '/onboarding'} replace />
  return <Outlet />
}

/** Telas exclusivas de quem tem acesso total. A API também recusa as escritas. */
function RequireOwner() {
  const { data } = useSession()
  if (data?.authenticated && data.tenant && data.tenant.role !== 'owner') return <NoAccess />
  return <Outlet />
}

function NoAccess() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-bold">Esta área é só da gestão</h1>
      <p className="text-muted-foreground mt-2">
        Peça para quem administra o estabelecimento fazer essa alteração ou liberar seu acesso.
      </p>
    </div>
  )
}

function RequireSuperAdmin() {
  const { data, isLoading } = useSession()
  if (isLoading || !data) return <FullPageLoader />
  if (!data.authenticated) return <Navigate to="/entrar?voltar=/admin" replace />
  if (!data.user.isSuperAdmin || data.impersonating) return <Navigate to="/painel" replace />
  return <Outlet />
}

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Root /> },
      {
        element: <GuestOnly />,
        children: [
          { path: '/entrar', element: lazyRoute(() => import('./features/auth/login-page')) },
          { path: '/cadastro', element: lazyRoute(() => import('./features/auth/register-page')) },
        ],
      },
      {
        path: '/recuperar-senha',
        element: lazyRoute(() => import('./features/auth/forgot-password-page')),
      },
      {
        path: '/redefinir-senha',
        element: lazyRoute(() => import('./features/auth/reset-password-page')),
      },
      { path: '/termos', element: lazyRoute(() => import('./features/legal/terms-page')) },
      { path: '/privacidade', element: lazyRoute(() => import('./features/legal/privacy-page')) },
      {
        path: '/a/:token',
        element: lazyRoute(() => import('./features/customer-area/customer-area-page')),
      },
      {
        element: <RequireAuth needTenant={false} />,
        children: [
          {
            path: '/onboarding',
            element: lazyRoute(() => import('./features/onboarding/onboarding-page')),
          },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: '/painel',
            element: lazyRoute(() => import('./components/layout/panel-layout')),
            children: [
              {
                index: true,
                element: lazyRoute(() => import('./features/dashboard/dashboard-page')),
              },
              { path: 'agenda', element: lazyRoute(() => import('./features/agenda/agenda-page')) },
              {
                path: 'agenda/:bookingId',
                element: lazyRoute(() => import('./features/agenda/agenda-page')),
              },
              {
                path: 'agendamentos',
                element: lazyRoute(() => import('./features/bookings/bookings-page')),
              },
              {
                path: 'clientes',
                element: lazyRoute(() => import('./features/customers/customers-page')),
              },
              {
                path: 'clientes/:id',
                element: lazyRoute(() => import('./features/customers/customer-detail-page')),
              },
              {
                path: 'horarios',
                element: lazyRoute(() => import('./features/schedule/schedule-page')),
              },
              {
                path: 'notificacoes',
                element: lazyRoute(
                  () => import('./features/notifications/notification-settings-page'),
                ),
              },
              {
                // Telas só da gestão: a profissional vê um aviso em vez de formulários inúteis
                element: <RequireOwner />,
                children: [
                  {
                    path: 'servicos',
                    element: lazyRoute(() => import('./features/services/services-page')),
                  },
                  {
                    path: 'formulario',
                    element: lazyRoute(() => import('./features/forms/form-builder-page')),
                  },
                  {
                    path: 'politicas',
                    element: lazyRoute(() => import('./features/settings/policies-page')),
                  },
                  { path: 'equipe', element: lazyRoute(() => import('./features/team/team-page')) },
                  {
                    path: 'relatorios',
                    element: lazyRoute(() => import('./features/reports/reports-page')),
                  },
                  {
                    path: 'aparencia',
                    element: lazyRoute(() => import('./features/appearance/appearance-page')),
                  },
                  {
                    path: 'assinatura',
                    element: lazyRoute(() => import('./features/billing/billing-page')),
                  },
                ],
              },
              {
                path: 'conta',
                element: lazyRoute(() => import('./features/account/account-page')),
              },
              { path: 'mais', element: lazyRoute(() => import('./components/layout/more-page')) },
            ],
          },
        ],
      },
      {
        element: <RequireSuperAdmin />,
        children: [
          { path: '/admin', element: lazyRoute(() => import('./features/admin/admin-page')) },
        ],
      },
      {
        path: '/:slug',
        element: lazyRoute(() => import('./features/booking/public-booking-page')),
      },
    ],
  },
])
