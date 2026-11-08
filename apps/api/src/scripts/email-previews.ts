/**
 * Gera a vitrine dos e-mails em docs/emails/: um .html por e-mail que o sistema envia e um
 * index.html com todos lado a lado. Abre direto no navegador, sem rodar nada.
 *
 *   pnpm --filter @marcai/api email:previews
 *
 * Com `--enviar voce@exemplo.com`, também manda todos de verdade (pelo Resend/SMTP do .env)
 * para esse endereço, com "[Teste]" no assunto:
 *
 *   pnpm --filter @marcai/api email:previews --enviar voce@exemplo.com
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_TEMPLATES,
  type MessageTemplateKey,
  renderTemplate,
  SAMPLE_TEMPLATE_VARS,
} from '@marcai/shared'
import { env } from '../config/env'
import { emailLayout, emailTransport, sendEmail } from '../lib/mailer'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../docs/emails')
const APP = 'https://marcai.app'
const SALON = 'Studio Vértice'
const SALON_COLOR = '#2B4CC0'
const tpl = (key: MessageTemplateKey) =>
  renderTemplate(DEFAULT_TEMPLATES[key], SAMPLE_TEMPLATE_VARS)

interface Preview {
  file: string
  group: string
  subject: string
  layout: Parameters<typeof emailLayout>[0]
}

const forSalon = { brandName: `${SALON} via ${env.APP_NAME}`, color: SALON_COLOR }
const details = (url: string) => ({ label: 'Ver detalhes', url })

const previews: Preview[] = [
  // ---------- Conta ----------
  {
    file: 'conta-boas-vindas',
    group: 'Conta',
    subject: `Boas-vindas ao ${env.APP_NAME}!`,
    layout: {
      title: 'Boas-vindas, Maria!',
      body: 'Sua conta foi criada. Falta pouco para sua agenda online ficar pronta: termine o cadastro do seu negócio e compartilhe o link na bio do Instagram.\nVocê tem 30 dias grátis para testar tudo, sem cartão.',
      cta: { label: 'Continuar cadastro', url: `${APP}/onboarding` },
    },
  },
  {
    file: 'conta-redefinir-senha',
    group: 'Conta',
    subject: 'Redefinição de senha',
    layout: {
      title: 'Redefinir sua senha',
      body: 'Recebemos um pedido para redefinir a senha da sua conta. O link vale por 1 hora.\nSe não foi você, é só ignorar este e-mail.',
      cta: { label: 'Criar nova senha', url: `${APP}/redefinir-senha?token=exemplo123` },
    },
  },
  {
    file: 'conta-convite-equipe',
    group: 'Conta',
    subject: `Convite para a equipe de ${SALON}`,
    layout: {
      title: `Convite para a equipe de ${SALON}`,
      body: `Maria Souza convidou você para a equipe de ${SALON}. Pelo painel você vê sua agenda e seus agendamentos.`,
      cta: { label: 'Criar minha senha', url: `${APP}/redefinir-senha?token=exemplo123` },
      brandName: SALON,
      color: SALON_COLOR,
    },
  },
  // ---------- Para a cliente ----------
  {
    file: 'cliente-confirmacao',
    group: 'Para a cliente',
    subject: `Agendamento em ${SALON}`,
    layout: {
      title: `Agendamento em ${SALON}`,
      body: tpl('customer_confirmation'),
      cta: details(`${APP}/a/abc123`),
      ...forSalon,
    },
  },
  {
    file: 'cliente-pedido-recebido',
    group: 'Para a cliente',
    subject: `Pedido recebido — ${SALON}`,
    layout: {
      title: `Pedido recebido — ${SALON}`,
      body: tpl('customer_pending'),
      cta: details(`${APP}/a/abc123`),
      ...forSalon,
    },
  },
  {
    file: 'cliente-lembrete',
    group: 'Para a cliente',
    subject: `Lembrete: ${SAMPLE_TEMPLATE_VARS.servico}`,
    layout: {
      title: `Lembrete: ${SAMPLE_TEMPLATE_VARS.servico}`,
      body: tpl('customer_reminder'),
      cta: details(`${APP}/a/abc123`),
      ...forSalon,
    },
  },
  {
    file: 'cliente-remarcado',
    group: 'Para a cliente',
    subject: `Horário remarcado — ${SALON}`,
    layout: {
      title: `Horário remarcado — ${SALON}`,
      body: tpl('customer_rescheduled'),
      cta: details(`${APP}/a/abc123`),
      ...forSalon,
    },
  },
  {
    file: 'cliente-cancelado',
    group: 'Para a cliente',
    subject: `Horário cancelado — ${SALON}`,
    layout: {
      title: `Horário cancelado — ${SALON}`,
      body: tpl('customer_canceled'),
      cta: details(`${APP}/a/abc123`),
      ...forSalon,
    },
  },
  // ---------- Para a profissional / dona ----------
  {
    file: 'painel-novo-agendamento',
    group: 'Para a profissional',
    subject: `Novo agendamento! — ${SAMPLE_TEMPLATE_VARS.cliente}`,
    layout: {
      title: `Novo agendamento! — ${SAMPLE_TEMPLATE_VARS.cliente}`,
      body: tpl('professional_new_booking'),
      cta: details(`${APP}/painel/agenda/abc123`),
    },
  },
  {
    file: 'painel-agendamento-remarcado',
    group: 'Para a profissional',
    subject: `Agendamento remarcado — ${SAMPLE_TEMPLATE_VARS.cliente}`,
    layout: {
      title: `Agendamento remarcado — ${SAMPLE_TEMPLATE_VARS.cliente}`,
      body: tpl('professional_booking_rescheduled'),
      cta: details(`${APP}/painel/agenda/abc123`),
    },
  },
  {
    file: 'painel-agendamento-cancelado',
    group: 'Para a profissional',
    subject: `Agendamento cancelado — ${SAMPLE_TEMPLATE_VARS.cliente}`,
    layout: {
      title: `Agendamento cancelado — ${SAMPLE_TEMPLATE_VARS.cliente}`,
      body: tpl('professional_booking_canceled'),
      cta: details(`${APP}/painel/agenda/abc123`),
    },
  },
  {
    file: 'painel-resumo-do-dia',
    group: 'Para a profissional',
    subject: 'Sua agenda de hoje',
    layout: {
      title: 'Sua agenda de hoje',
      body: tpl('professional_daily_summary'),
      cta: details(`${APP}/painel/agenda`),
      brandName: SALON,
      color: SALON_COLOR,
    },
  },
  {
    file: 'painel-teste-de-email',
    group: 'Para a profissional',
    subject: 'Teste de e-mail',
    layout: {
      title: 'Teste de e-mail',
      body: `✅ Os e-mails de ${SALON} estão funcionando. Novos agendamentos, cancelamentos e o resumo do dia chegam por aqui.`,
      cta: details(`${APP}/painel/notificacoes`),
    },
  },
  // ---------- Avisos da plataforma ----------
  {
    file: 'aviso-fatura-disponivel',
    group: 'Avisos da plataforma',
    subject: 'Sua fatura está disponível',
    layout: {
      title: 'Sua fatura está disponível',
      body: 'A fatura da sua assinatura vence em 10/11/2026. Pague por PIX ou boleto pelo painel para manter sua agenda no ar.',
      cta: details(`${APP}/painel/assinatura`),
    },
  },
  {
    file: 'aviso-whatsapp-desconectado',
    group: 'Avisos da plataforma',
    subject: 'Seu WhatsApp desconectou',
    layout: {
      title: 'Seu WhatsApp desconectou',
      body: 'As mensagens de WhatsApp pararam de sair. No painel, abra Notificações e leia o QR Code de novo.',
      cta: details(`${APP}/painel/notificacoes`),
    },
  },
  {
    file: 'aviso-acesso-de-suporte',
    group: 'Avisos da plataforma',
    subject: 'Acesso de suporte à sua conta',
    layout: {
      title: 'Acesso de suporte à sua conta',
      body: `A equipe de suporte acessou o painel de ${SALON} em 06/11/2026, 14:32:10 para ajudar você. Se não pediu ajuda, troque sua senha e fale com o suporte.`,
      cta: details(`${APP}/painel`),
    },
  },
]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

mkdirSync(OUT, { recursive: true })
for (const p of previews) writeFileSync(`${OUT}/${p.file}.html`, emailLayout(p.layout).html)

const groups = [...new Set(previews.map((p) => p.group))]
const index = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>E-mails do ${esc(env.APP_NAME)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600&family=Barlow:wght@400;600&display=swap" rel="stylesheet">
<style>
  body{margin:0;background:#25282D;color:#F7F4EC;font-family:Barlow,Arial,sans-serif}
  header{padding:32px 40px 8px}
  h1,h2{font-family:'Barlow Condensed',Arial,sans-serif;text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin:0}
  h1{font-size:40px} h2{font-size:22px;margin:32px 40px 16px;color:#E2A823}
  p.lead{color:#B3B8C0;margin:6px 0 0}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:20px;padding:0 40px}
  .item{background:#2F3238;border:1px solid #3B3F46;border-radius:6px;overflow:hidden}
  .meta{padding:12px 14px;font-size:14px;display:flex;justify-content:space-between;gap:12px;align-items:baseline}
  .meta a{color:#F7F4EC} .meta span{color:#B3B8C0;font-size:12px}
  iframe{display:block;width:100%;height:640px;border:0;background:#EEEFF1}
  footer{padding:40px;color:#B3B8C0;font-size:13px}
</style></head><body>
<header><h1>E-mails do ${esc(env.APP_NAME)}</h1>
<p class="lead">Exemplos com dados fictícios. Clique no nome para abrir o e-mail em tela cheia.</p></header>
${groups
  .map(
    (g) =>
      `<h2>${esc(g)}</h2><div class="grid">${previews
        .filter((p) => p.group === g)
        .map(
          (p) =>
            `<div class="item"><div class="meta"><a href="${p.file}.html" target="_blank">${esc(p.subject)}</a><span>${p.file}.html</span></div><iframe src="${p.file}.html" loading="lazy" title="${esc(p.subject)}"></iframe></div>`,
        )
        .join('')}</div>`,
  )
  .join('\n')}
<footer>Gerado por <code>pnpm --filter @marcai/api email:previews</code> a partir de <code>apps/api/src/lib/mailer.ts</code>.</footer>
</body></html>`
writeFileSync(`${OUT}/index.html`, index)
console.log(`✅ ${previews.length} e-mails em ${OUT}`)

const sendTo = process.argv[process.argv.indexOf('--enviar') + 1]
if (process.argv.includes('--enviar')) {
  if (!sendTo?.includes('@')) throw new Error('Informe o destino: --enviar voce@exemplo.com')
  console.log(`📧 Enviando para ${sendTo} via ${emailTransport()}…`)
  let ok = 0
  for (const p of previews) {
    const { html, text } = emailLayout(p.layout)
    try {
      await sendEmail({
        to: sendTo,
        subject: `[Teste] ${p.subject}`,
        html,
        text,
        fromName: p.layout.brandName,
      })
      ok++
      console.log(`  ✓ ${p.file}`)
    } catch (err) {
      console.log(`  ✗ ${p.file}: ${(err as Error).message}`)
    }
  }
  console.log(`${ok}/${previews.length} enviados`)
}
