import { expect, test } from '@playwright/test'

/**
 * Fluxo completo: a cliente agenda pela página pública → o agendamento aparece no
 * painel → a notificação é criada para a profissional.
 */
test('cliente agenda pela página pública, aparece no painel e a notificação é criada', async ({
  page,
  browser,
}) => {
  const customer = `Cliente E2E ${Date.now().toString().slice(-6)}`

  // 1) Página pública
  await page.goto('/marylopes')
  await expect(page.getByRole('heading', { name: 'Mary Lopes Unhas & Perfumaria' })).toBeVisible()
  await page.getByRole('button', { name: /Esmaltação em gel/ }).click()

  // 2) Primeiro dia com horário livre e primeiro horário
  await expect(page.getByText('Escolha o dia e o horário')).toBeVisible()
  const freeDay = page.locator('[role=grid] button:not([disabled])').first()
  await freeDay.waitFor()
  if ((await page.locator('[role=grid] button:not([disabled])').count()) === 0) {
    await page.getByRole('button', { name: 'Próximo mês' }).click()
  }
  await page.locator('[role=grid] button:not([disabled])').first().click()
  await page
    .getByRole('button', { name: /^\d{2}:\d{2}$/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Continuar' }).click()

  // 3) Formulário (com campos personalizados) e confirmação
  await page.getByLabel('Seu nome').fill(customer)
  await page.getByLabel('Seu WhatsApp').fill('85998765432')
  await page.getByRole('radio', { name: 'Amendoada' }).click()
  await page.getByRole('checkbox').click()
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click()
  await expect(page.getByRole('heading', { name: /Horário confirmado/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Google Agenda/ })).toBeVisible()

  // 4) Painel da profissional
  const ctx = await browser.newContext()
  const panel = await ctx.newPage()
  await panel.goto('/entrar')
  await panel.getByLabel('E-mail').fill('demo@marcai.app')
  await panel.getByLabel('Senha').fill('demo1234')
  await panel.getByRole('button', { name: 'Entrar' }).click()
  await panel.waitForURL('**/painel')

  await panel.goto('/painel/agendamentos')
  await panel.getByLabel('Buscar').fill(customer)
  await expect(panel.getByText(customer)).toBeVisible()

  // 5) Notificação no sino
  await panel.getByRole('button', { name: /Notificações/ }).click()
  await expect(panel.getByText(new RegExp(`${customer} · Esmaltação em gel`))).toBeVisible()
  await ctx.close()
})

test('cadastro com onboarding em 4 passos gera o link pronto', async ({ page }) => {
  const slug = `studio-e2e-${Date.now().toString().slice(-6)}`
  await page.goto('/cadastro')
  await page.getByLabel('Seu nome').fill('Bianca Teste')
  await page.getByLabel('E-mail').fill(`${slug}@teste.com`)
  await page.getByLabel('Senha').fill('senha12345')
  await page.locator('#terms').click()
  await page.getByRole('button', { name: 'Criar minha conta grátis' }).click()

  await page.waitForURL('**/onboarding')
  await page.getByLabel('Nome do negócio').fill('Studio E2E')
  await page.getByLabel('Seu link de agendamento').fill(slug)
  await expect(page.getByLabel('Disponível')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('radio', { name: /Cílios/ }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Criar minha agenda' }).click()
  await expect(page.getByRole('heading', { name: /Sua agenda está no ar/ })).toBeVisible()
  await expect(page.getByText(`/${slug}`)).toBeVisible()
  await page.getByRole('button', { name: /Ir para o meu painel/ }).click()
  await expect(page.getByRole('heading', { name: /Bianca/ })).toBeVisible()
})
