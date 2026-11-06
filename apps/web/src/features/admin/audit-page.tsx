import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { fmtLocal } from './admin-shared'

interface Person {
  id: string
  name: string
  email: string
}
interface AuditRow {
  id: string
  action: string
  createdAt: string
  ip: string | null
  actor: Person | null
  impersonator: Person | null
  targetUser: Person | null
  tenantName: string | null
}

/** Nome das ações; as que não estão aqui aparecem com o código técnico. */
const ACTIONS: Record<string, string> = {
  'admin.trial_extended': 'Estendeu o teste',
  'admin.tenant_blocked': 'Bloqueou estabelecimento',
  'admin.tenant_unblocked': 'Desbloqueou estabelecimento',
  'admin.tenant_deleted': 'Excluiu estabelecimento',
  'admin.tenant_restored': 'Restaurou estabelecimento',
  'admin.subscription_changed': 'Ajustou assinatura',
  'admin.impersonated': 'Entrou como (suporte)',
  'admin.session_revoked': 'Encerrou uma sessão',
  'admin.sessions_revoked': 'Desconectou de todos os aparelhos',
  'admin.user_created': 'Criou usuário',
  'admin.user_updated': 'Editou usuário',
  'admin.user_deleted': 'Excluiu usuário',
  'admin.user_disabled': 'Desativou conta',
  'admin.user_enabled': 'Reativou conta',
  'admin.password_reset_sent': 'Enviou link de nova senha',
  'admin.super_admin_granted': 'Tornou administrador',
  'admin.super_admin_revoked': 'Removeu administrador',
  'admin.maintenance_cleanup': 'Fez limpeza do sistema',
  'tenant.deleted': 'Estabelecimento excluído pela dona',
  'account.deleted': 'Conta excluída pela própria pessoa',
}

export default function AdminAuditPage() {
  const [filter, setFilter] = useState('admin')
  const { data: logs, isLoading } = useQuery({
    queryKey: ['admin-audit', filter],
    queryFn: () =>
      api<AuditRow[]>(
        filter === 'all'
          ? '/admin/audit'
          : filter === 'admin'
            ? '/admin/audit?onlyAdmin=true'
            : `/admin/audit?action=${encodeURIComponent(filter)}`,
      ),
  })
  return (
    <div>
      <PageHeader
        title="Auditoria"
        description="Registro das ações sensíveis: quem fez, o quê, quando e de onde."
        actions={
          <NativeSelect
            className="h-10 w-60"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filtrar ações"
          >
            <option value="admin">Ações dos administradores</option>
            <option value="all">Todas as ações</option>
            <optgroup label="Ação específica">
              {Object.entries(ACTIONS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </optgroup>
          </NativeSelect>
        }
      />
      <Card>
        <CardContent className="overflow-x-auto pt-5">
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : !logs?.length ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Nenhuma ação registrada.
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr>
                  <th className="py-2">Quando</th>
                  <th>Quem</th>
                  <th>Ação</th>
                  <th>Alvo</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((l) => {
                  // No "entrar como", quem agiu de verdade é o admin
                  const who = l.impersonator ?? l.actor
                  return (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap py-2.5 text-xs">
                        {fmtLocal(l.createdAt, 'dd/MM/yy HH:mm')}
                      </td>
                      <td>
                        {who ? (
                          <>
                            <p>{who.name}</p>
                            <p className="text-muted-foreground text-xs">{who.email}</p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Sistema</span>
                        )}
                      </td>
                      <td>
                        {ACTIONS[l.action] ?? (
                          <code className="text-muted-foreground text-xs">{l.action}</code>
                        )}
                      </td>
                      <td className="text-xs">
                        {l.targetUser
                          ? `${l.targetUser.name} (${l.targetUser.email})`
                          : (l.tenantName ?? '—')}
                      </td>
                      <td className="text-muted-foreground text-xs">{l.ip ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
