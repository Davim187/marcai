import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router'
import { lazy, Suspense } from 'react'
import { useSession } from './lib/session'
import { FullPageLoader } from './components/layout/full-page-loader'
import { RouteError } from './components/layout/route-error'

const L = (f: () => Promise<{ default: React.ComponentType }>) => {
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
    return L(() => import('./features/booking/public-booking-page'))
  return L(() => import('./features/landing/landing-page'))
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
          { path: '/entrar', element: L(() => import('./features/auth/login-page')) },
          { path: '/cadastro', element: L(() => import('./features/auth/register-page')) },
        ],
      },
      {
        path: '/recuperar-senha',
        element: L(() => import('./features/auth/forgot-password-page')),
      },
      { path: '/redefinir-senha', element: L(() => import('./features/auth/reset-password-page')) },
      { path: '/termos', element: L(() => import('./features/legal/terms-page')) },
      { path: '/privacidade', element: L(() => import('./features/legal/privacy-page')) },
      {
        path: '/a/:token',
        element: L(() => import('./features/customer-area/customer-area-page')),
      },
      {
        element: <RequireAuth needTenant={false} />,
        children: [
          {
            path: '/onboarding',
            element: L(() => import('./features/onboarding/onboarding-page')),
          },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: '/painel',
            element: L(() => import('./components/layout/panel-layout')),
            children: [
              { index: true, element: L(() => import('./features/dashboard/dashboard-page')) },
              { path: 'agenda', element: L(() => import('./features/agenda/agenda-page')) },
              {
                path: 'agenda/:bookingId',
                element: L(() => import('./features/agenda/agenda-page')),
              },
              {
                path: 'agendamentos',
                element: L(() => import('./features/bookings/bookings-page')),
              },
              { path: 'clientes', element: L(() => import('./features/customers/customers-page')) },
              {
                path: 'clientes/:id',
                element: L(() => import('./features/customers/customer-detail-page')),
              },
              { path: 'servicos', element: L(() => import('./features/services/services-page')) },
              {
                path: 'formulario',
                element: L(() => import('./features/forms/form-builder-page')),
              },
              { path: 'horarios', element: L(() => import('./features/schedule/schedule-page')) },
              { path: 'politicas', element: L(() => import('./features/settings/policies-page')) },
              { path: 'equipe', element: L(() => import('./features/team/team-page')) },
              { path: 'relatorios', element: L(() => import('./features/reports/reports-page')) },
              {
                path: 'aparencia',
                element: L(() => import('./features/appearance/appearance-page')),
              },
              {
                path: 'notificacoes',
                element: L(() => import('./features/notifications/notification-settings-page')),
              },
              { path: 'assinatura', element: L(() => import('./features/billing/billing-page')) },
              { path: 'conta', element: L(() => import('./features/account/account-page')) },
              { path: 'mais', element: L(() => import('./components/layout/more-page')) },
            ],
          },
        ],
      },
      {
        element: <RequireSuperAdmin />,
        children: [{ path: '/admin', element: L(() => import('./features/admin/admin-page')) }],
      },
      { path: '/:slug', element: L(() => import('./features/booking/public-booking-page')) },
    ],
  },
])
