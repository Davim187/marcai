/**
 * Cria a dona e o estabelecimento pela linha de comando — usado no modo exclusivo
 * (white-label), em que não existe cadastro público.
 *
 *   pnpm --filter @marcai/api tenant:create -- --nome "Studio Bella" --slug studiobella \
 *     --email dona@studiobella.com.br --senha "trocar123" --tipo cilios --cor "#7C3AED"
 */
import { parseArgs } from 'node:util'
import { isValidSlug } from '@marcai/shared'
import { prisma } from '../lib/prisma'
import { hashPassword } from '../modules/auth/auth.service'
import { createTenantFromOnboarding } from '../modules/tenants/tenant.service'

const { values } = parseArgs({
  options: {
    nome: { type: 'string' },
    slug: { type: 'string' },
    email: { type: 'string' },
    senha: { type: 'string' },
    dona: { type: 'string' },
    tipo: { type: 'string', default: 'manicure' },
    cor: { type: 'string', default: '#B4235A' },
  },
})

async function main() {
  const { nome, slug, email, senha } = values
  if (!nome || !slug || !email || !senha) {
    console.error(
      'Uso: --nome "Nome do negócio" --slug meu-slug --email dona@email.com --senha "minhasenha" [--dona "Nome"] [--tipo manicure] [--cor "#B4235A"]',
    )
    process.exit(1)
  }
  if (!isValidSlug(slug)) throw new Error('Slug inválido')
  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.create({
      data: { email, name: values.dona ?? nome, passwordHash: await hashPassword(senha) },
    }))
  const shifts = [2, 3, 4, 5, 6].flatMap((weekday) => [
    { weekday, start: '08:00', end: '12:00' },
    { weekday, start: '13:30', end: '19:00' },
  ])
  const tenant = await createTenantFromOnboarding(user.id, {
    businessName: nome,
    slug,
    businessType: values.tipo!,
    shifts,
    primaryColor: values.cor,
  })
  console.log(`✅ Estabelecimento criado: ${tenant.name} (slug: ${tenant.slug})`)
  console.log(`   Login: ${email}`)
  console.log(
    `   Para o modo exclusivo, defina APP_MODE=single_tenant e SINGLE_TENANT_SLUG=${tenant.slug}`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
