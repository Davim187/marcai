import { describe, expect, it } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { forTenant, TenantIsolationError } from '../src/lib/tenant-db'
import { createOwner } from './helpers'

describe('isolamento entre tenants', () => {
  it('o cliente escopado nunca enxerga dados de outro tenant', async () => {
    const a = await createOwner({ slug: 'studio-a' })
    const b = await createOwner({ slug: 'studio-b' })
    const dbA = forTenant(a.tenant.id)

    const servicesA = await dbA.service.findMany()
    expect(servicesA.length).toBeGreaterThan(0)
    expect(servicesA.every((s) => s.tenantId === a.tenant.id)).toBe(true)

    const serviceB = await prisma.service.findFirstOrThrow({ where: { tenantId: b.tenant.id } })
    // Mesmo buscando pelo id exato, não acha o serviço do outro tenant
    expect(await dbA.service.findUnique({ where: { id: serviceB.id } })).toBeNull()
    expect(await dbA.service.findFirst({ where: { id: serviceB.id } })).toBeNull()
    // Nem atualiza nem apaga
    const upd = await dbA.service.updateMany({
      where: { id: serviceB.id },
      data: { name: 'invadido' },
    })
    expect(upd.count).toBe(0)
    await expect(
      dbA.service.update({ where: { id: serviceB.id }, data: { name: 'invadido' } }),
    ).rejects.toThrow()
    const del = await dbA.service.deleteMany({ where: { id: serviceB.id } })
    expect(del.count).toBe(0)
    expect((await prisma.service.findUniqueOrThrow({ where: { id: serviceB.id } })).name).not.toBe(
      'invadido',
    )
  })

  it('injeta o tenantId ao criar e bloqueia gravação com tenantId de outro tenant', async () => {
    const a = await createOwner({ slug: 'studio-c' })
    const b = await createOwner({ slug: 'studio-d' })
    const dbA = forTenant(a.tenant.id)
    const created = await dbA.serviceCategory.create({ data: { name: 'Nova' } as never })
    expect(created.tenantId).toBe(a.tenant.id)
    await expect(
      dbA.serviceCategory.create({ data: { name: 'X', tenantId: b.tenant.id } }),
    ).rejects.toBeInstanceOf(TenantIsolationError)
    await expect(dbA.service.findMany({ where: { tenantId: b.tenant.id } })).rejects.toBeInstanceOf(
      TenantIsolationError,
    )
  })

  it('a API do painel não deixa uma dona acessar recursos de outra', async () => {
    const a = await createOwner({ slug: 'studio-e' })
    const b = await createOwner({ slug: 'studio-f' })
    const tenantA = await a.agent.get('/api/tenant')
    expect(tenantA.json().id).toBe(a.tenant.id)
    // Troca de tenant para um do qual não faz parte → 403
    const sw = await a.agent.post('/api/auth/switch-tenant', { tenantId: b.tenant.id })
    expect(sw.statusCode).toBe(403)
  })

  it('exige tenantId para criar o cliente escopado', () => {
    expect(() => forTenant('')).toThrow(TenantIsolationError)
  })
})
