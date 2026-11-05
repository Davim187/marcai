import { expect, test } from '@playwright/test'

/**
 * Área da cliente: WhatsApp colado com +55 é entendido certo e o "voltar" do celular
 * durante a remarcação volta para os detalhes (sem sair da página).
 */
test('WhatsApp com +55 e voltar do celular na remarcação', async ({ page }) => {
  await page.goto('/studiovertice')
  await page.getByRole('button', { name: /Esmaltação em gel/ }).click()
  // Um dia mais à frente: a política só deixa remarcar até 12h antes
  await page.locator('[role=grid] button:not([disabled])').first().waitFor()
  await page.locator('[role=grid] button:not([disabled])').last().click()
  await page
    .getByRole('button', { name: /^\d{2}:\d{2}$/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Continuar' }).click()

  await page.getByLabel('Seu nome').fill(`Cliente Área ${Date.now().toString().slice(-5)}`)
  const phone = page.getByLabel('Seu WhatsApp')
  await phone.fill('+55 98 98765-4321')
  await expect(phone).toHaveValue('(98) 98765-4321')
  await page.getByRole('radio', { name: 'Sim' }).click()
  await page.getByRole('checkbox').click()
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click()
  await expect(page.getByRole('heading', { name: /Horário confirmado/ })).toBeVisible()

  // Link de gestão do agendamento
  const manage = page.locator('a[href*="/a/"]').first()
  await page.goto((await manage.getAttribute('href'))!.replace(/^https?:\/\/[^/]+/, ''))
  const reschedule = page.getByRole('button', { name: /Remarcar/ })
  await expect(reschedule).toBeVisible()
  await reschedule.click()
  await expect(page).toHaveURL(/remarcando=1/)
  await page.goBack()
  await expect(page).not.toHaveURL(/remarcando=1/)
  await expect(page.getByRole('button', { name: /Remarcar/ })).toBeVisible()
})
