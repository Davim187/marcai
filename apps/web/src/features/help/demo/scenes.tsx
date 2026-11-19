import { motion, useReducedMotion } from 'framer-motion'
import { Bell, Check, CheckCheck, Clock, FileImage, QrCode, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Quadros das demonstrações. Imitam as telas reais com dados de exemplo (o salão fictício
 * Studio Vértice) e animam só transform/opacity. Com "reduzir movimento", aparecem prontos.
 */

/** Entrada suave. O player usa `MotionConfig reducedMotion="user"`: quem pede menos movimento vê sem deslocamento. */
function enter(delay = 0) {
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
  }
}

/** Indicador de toque: onde a pessoa toca naquele momento. */
function Tap({ className, delay = 1.1 }: { className?: string; delay?: number }) {
  const reduce = useReducedMotion()
  if (reduce) return null
  return (
    <motion.span
      aria-hidden
      className={cn('bg-cobalt/35 pointer-events-none absolute h-9 w-9 rounded-full', className)}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: [0, 1, 0], scale: [0.4, 1, 1.4] }}
      transition={{ delay, duration: 0.9, ease: 'easeOut' }}
    />
  )
}

function Phone({ children, tone = 'page' }: { children: React.ReactNode; tone?: 'page' | 'wa' }) {
  return (
    <div className="border-foreground/85 bg-background shadow-lift relative mx-auto h-[340px] w-[200px] overflow-hidden rounded-[1.6rem] border-[5px]">
      <div
        className={cn(
          'h-full overflow-hidden',
          tone === 'wa' ? 'bg-[#e9e3da] dark:bg-[#1b2124]' : 'bg-background',
        )}
      >
        {children}
      </div>
    </div>
  )
}

function PanelWindow({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background shadow-lift mx-auto w-full max-w-[420px] overflow-hidden rounded-lg border">
      <div className="bg-card flex items-center gap-1.5 border-b px-3 py-2">
        <span className="bg-terra/70 h-2 w-2 rounded-full" />
        <span className="bg-mustard/80 h-2 w-2 rounded-full" />
        <span className="bg-green/70 h-2 w-2 rounded-full" />
        <span className="letters text-muted-foreground ml-2 text-[10px]">Painel Marcaí</span>
      </div>
      <div className="relative h-[290px] p-3">{children}</div>
    </div>
  )
}

function PageHead() {
  return (
    <div>
      <div className="bg-cobalt/80 h-14" />
      <div className="-mt-5 flex flex-col items-center">
        <span className="bg-card border-background letters flex h-10 w-10 items-center justify-center rounded-xl border-2 text-sm">
          V
        </span>
        <p className="letters mt-1 text-sm">Studio Vértice</p>
      </div>
    </div>
  )
}

function Line({ w = 'w-full', className }: { w?: string; className?: string }) {
  return <span className={cn('bg-muted block h-2 rounded-full', w, className)} />
}

const SERVICES = [
  ['Sessão individual', '50 min', 'R$ 150'],
  ['Massagem relaxante', '1h', 'R$ 120'],
  ['Avaliação', '1h', 'R$ 150'],
]

function PublicServices() {
  return (
    <Phone>
      <PageHead />
      <div className="space-y-1.5 p-2.5">
        {SERVICES.map(([n, d, p], i) => (
          <motion.div
            key={n}
            {...enter(0.15 + i * 0.12)}
            className={cn(
              'bg-card relative rounded-lg border p-2 text-[10px]',
              i === 0 && 'ring-primary ring-1',
            )}
          >
            <div className="flex justify-between font-semibold">
              <span>{n}</span>
              <span>{p}</span>
            </div>
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> {d}
            </span>
            {i === 0 && <Tap className="-right-1 -top-2" />}
          </motion.div>
        ))}
      </div>
    </Phone>
  )
}

const TIMES = ['08:00', '09:00', '10:00', '14:00', '15:00', '16:00']

function PublicSlots() {
  return (
    <Phone>
      <div className="p-2.5">
        <p className="text-[10px] font-semibold">Escolha o dia</p>
        <div className="mt-1.5 grid grid-cols-5 gap-1">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].map((d, i) => (
            <motion.span
              key={d}
              {...enter(0.1 + i * 0.05)}
              className={cn(
                'rounded-md border py-1 text-center text-[9px]',
                i === 3 && 'bg-primary text-primary-foreground border-transparent',
              )}
            >
              {d}
              <br />
              {20 + i}
            </motion.span>
          ))}
        </div>
        <p className="mt-3 text-[10px] font-semibold">Horários livres</p>
        <div className="relative mt-1.5 grid grid-cols-3 gap-1">
          {TIMES.map((t, i) => (
            <motion.span
              key={t}
              {...enter(0.4 + i * 0.06)}
              className={cn(
                'rounded-md border py-1.5 text-center text-[10px] font-medium',
                t === '14:00' && 'bg-primary text-primary-foreground border-transparent',
              )}
            >
              {t}
            </motion.span>
          ))}
          <Tap className="left-0 top-7" delay={1.4} />
        </div>
      </div>
    </Phone>
  )
}

function PublicForm() {
  return (
    <Phone>
      <div className="space-y-2.5 p-2.5 text-[10px]">
        <div className="bg-primary-soft rounded-lg p-2">
          <p className="font-semibold">Sessão individual</p>
          <p className="text-muted-foreground">Quinta, 23/10 às 14:00</p>
        </div>
        {[
          ['Seu nome', 'Ana Souza'],
          ['Seu WhatsApp', '(85) 99999-0000'],
          ['Como prefere ser atendida?', 'Presencial'],
        ].map(([l, v], i) => (
          <motion.div key={l} {...enter(0.2 + i * 0.25)}>
            <p className="font-semibold">{l}</p>
            <p className="bg-card mt-0.5 rounded-md border px-2 py-1.5">{v}</p>
          </motion.div>
        ))}
        <motion.span
          {...enter(1.1)}
          className="bg-primary text-primary-foreground relative mt-1 block rounded-md py-2 text-center font-semibold"
        >
          Confirmar agendamento
          <Tap className="right-6 top-0" delay={1.8} />
        </motion.span>
      </div>
    </Phone>
  )
}

function PublicSuccess() {
  const reduce = useReducedMotion()
  return (
    <Phone>
      <div className="flex h-full flex-col items-center p-3 pt-8 text-center text-[10px]">
        <motion.span
          initial={reduce ? false : { scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className="bg-primary text-primary-foreground flex h-12 w-12 items-center justify-center rounded-full"
        >
          <Check className="h-6 w-6" strokeWidth={3} />
        </motion.span>
        <p className="mt-3 text-sm font-bold">Horário confirmado</p>
        <p className="text-muted-foreground">Te esperamos, Ana!</p>
        <motion.div {...enter(0.5)} className="bg-card mt-4 w-full divide-y rounded-lg border">
          {[
            ['Serviço', 'Sessão individual'],
            ['Data', 'Quinta, 23/10'],
            ['Horário', '14:00 às 14:50'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between px-2 py-1.5">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
        </motion.div>
        <motion.p {...enter(0.8)} className="text-cobalt mt-3 font-semibold">
          Cancelar ou remarcar
        </motion.p>
      </div>
    </Phone>
  )
}

function AgendaGrid({ highlight }: { highlight?: boolean }) {
  return (
    <div className="grid grid-cols-[34px_1fr] gap-x-2 text-[10px]">
      {['13:00', '14:00', '15:00', '16:00'].map((h) => (
        <div key={h} className="contents">
          <span className="text-muted-foreground pt-0.5 text-right">{h}</span>
          <div className="relative h-12 border-t">
            {h === '13:00' && (
              <span className="bg-green/15 border-green absolute inset-x-0 top-1 rounded border-l-2 px-1.5 py-0.5">
                Pedro Lima · Avaliação
              </span>
            )}
            {h === '14:00' && highlight && (
              <motion.span
                {...enter(0.3)}
                className="bg-cobalt/15 border-cobalt ring-mustard absolute inset-x-0 top-1 rounded border-l-2 px-1.5 py-0.5 ring-2"
              >
                Ana Souza · Sessão individual
              </motion.span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function PanelToast() {
  return (
    <PanelWindow>
      <div className="flex justify-end">
        <span className="relative">
          <Bell className="h-5 w-5" />
          <motion.span
            {...enter(0.4)}
            className="bg-terra absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full"
          />
        </span>
      </div>
      <motion.div
        {...enter(0.7)}
        className="bg-card shadow-lift absolute right-3 top-10 w-60 rounded-lg border p-3 text-xs"
      >
        <p className="font-semibold">Novo agendamento!</p>
        <p className="text-muted-foreground mt-0.5">
          Ana Souza · Sessão individual · Quinta, 23/10 às 14:00
        </p>
      </motion.div>
      <div className="mt-16 space-y-2 opacity-60">
        <Line w="w-2/3" />
        <Line />
        <Line w="w-5/6" />
      </div>
    </PanelWindow>
  )
}

function PanelAgenda() {
  return (
    <PanelWindow>
      <p className="mb-2 text-xs font-semibold">Quinta-feira, 23 de outubro</p>
      <AgendaGrid highlight />
    </PanelWindow>
  )
}

function PanelDetail() {
  return (
    <PanelWindow>
      <motion.div {...enter(0.1)} className="bg-card rounded-lg border p-3 text-xs">
        <span className="bg-green/15 text-green rounded px-1.5 py-0.5 text-[10px] font-semibold">
          Confirmado
        </span>
        <p className="mt-1.5 font-semibold">Sessão individual</p>
        <p className="text-muted-foreground">Quinta, 23 de outubro · 14:00 às 14:50</p>
        <div className="mt-2 rounded-md border p-2">
          <p className="font-semibold">Ana Souza</p>
          <p className="text-muted-foreground">(85) 99999-0000</p>
        </div>
        <p className="bg-muted/60 mt-2 rounded-md p-2">Como prefere ser atendida? Presencial</p>
        <motion.div {...enter(0.5)} className="mt-2.5 grid grid-cols-3 gap-1.5 text-[10px]">
          {['Remarcar', 'Cancelar', 'WhatsApp'].map((b) => (
            <span key={b} className="rounded-md border py-1.5 text-center font-semibold">
              {b}
            </span>
          ))}
        </motion.div>
      </motion.div>
    </PanelWindow>
  )
}

function Bubble({ children, delay = 0.2 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      {...enter(delay)}
      className="bg-card ml-1 mr-6 rounded-lg rounded-tl-none p-2 text-[10px] leading-snug shadow-sm"
    >
      {children}
    </motion.div>
  )
}

function WaHeader() {
  return (
    <div className="bg-[#1f6e5b] px-2.5 py-2 text-[10px] font-semibold text-white">
      Studio Vértice
    </div>
  )
}

function WaConfirmation() {
  return (
    <Phone tone="wa">
      <WaHeader />
      <div className="space-y-2 p-2">
        <Bubble>
          Olá, Ana! ✅ Seu horário está confirmado.
          <br />✨ Sessão individual
          <br />
          📅 Quinta-feira, 23/10
          <br />
          🕐 14:00
          <br />
          <span className="text-cobalt">Ver, cancelar ou remarcar: marcai.app/a/…</span>
        </Bubble>
      </div>
    </Phone>
  )
}

function WaReminder() {
  return (
    <Phone tone="wa">
      <WaHeader />
      <div className="space-y-2 p-2">
        <Bubble delay={0}>Olá, Ana! ✅ Seu horário está confirmado…</Bubble>
        <p className="text-muted-foreground text-center text-[9px]">quarta-feira</p>
        <Bubble delay={0.5}>
          Oi, Ana! Passando para lembrar do seu horário ⏰
          <br />✨ Sessão individual
          <br />
          📅 Quinta-feira, 23/10 às 14:00
          <br />
          <span className="text-cobalt">✅ Confirmar presença</span>
          <br />
          <span className="text-cobalt">🔁 Preciso remarcar</span>
        </Bubble>
      </div>
    </Phone>
  )
}

function WaConfirmed() {
  return (
    <PanelWindow>
      <motion.div {...enter(0.1)} className="bg-card rounded-lg border p-3 text-xs">
        <p className="font-semibold">Ana Souza · Sessão individual</p>
        <p className="text-muted-foreground">Quinta, 23/10 às 14:00</p>
        <motion.p
          {...enter(0.6)}
          className="text-green mt-2 flex items-center gap-1.5 font-semibold"
        >
          <CheckCheck className="h-4 w-4" /> O cliente confirmou presença
        </motion.p>
      </motion.div>
      <motion.div
        {...enter(0.9)}
        className="bg-card shadow-lift absolute bottom-3 right-3 w-56 rounded-lg border p-2.5 text-[11px]"
      >
        <p className="font-semibold">Presença confirmada ✅</p>
        <p className="text-muted-foreground">Ana Souza confirmou Sessão individual</p>
      </motion.div>
    </PanelWindow>
  )
}

function PayPix() {
  return (
    <Phone>
      <div className="space-y-2 p-2.5 text-[10px]">
        <p className="text-sm font-bold">Falta o pagamento</p>
        <div className="bg-card rounded-lg border p-2">
          <p className="font-semibold">Sinal de 30%: R$ 45,00</p>
          <p className="text-muted-foreground">O horário fica segurado por 30 minutos.</p>
        </div>
        <motion.div
          {...enter(0.3)}
          className="bg-card flex flex-col items-center gap-1 rounded-lg border p-2"
        >
          <QrCode className="h-16 w-16" />
          <span className="font-semibold">Chave PIX</span>
          <span className="text-muted-foreground">Studio Vértice LTDA</span>
        </motion.div>
        <motion.span
          {...enter(0.6)}
          className="bg-primary text-primary-foreground block rounded-md py-1.5 text-center font-semibold"
        >
          Copiar código PIX
        </motion.span>
      </div>
    </Phone>
  )
}

function PayProof() {
  return (
    <Phone>
      <div className="space-y-2 p-2.5 text-[10px]">
        <p className="text-sm font-bold">Já pagou?</p>
        <motion.div
          {...enter(0.2)}
          className="relative flex flex-col items-center gap-1 rounded-lg border-2 border-dashed p-4"
        >
          <FileImage className="text-muted-foreground h-7 w-7" />
          <span className="font-semibold">Enviar comprovante</span>
          <span className="text-muted-foreground">Foto ou PDF</span>
          <Tap className="right-8 top-6" delay={0.9} />
        </motion.div>
        <motion.p
          {...enter(1.4)}
          className="bg-mustard/25 rounded-md p-2 text-center font-semibold"
        >
          Comprovante enviado. Studio Vértice vai conferir.
        </motion.p>
      </div>
    </Phone>
  )
}

function PayApprove() {
  return (
    <PanelWindow>
      <motion.div {...enter(0.1)} className="bg-card rounded-lg border p-3 text-xs">
        <span className="bg-mustard/25 rounded px-1.5 py-0.5 text-[10px] font-semibold">
          Pendente · comprovante enviado
        </span>
        <p className="mt-1.5 font-semibold">Ana Souza · Sessão individual</p>
        <p className="text-muted-foreground">Sinal de 30%: R$ 45,00</p>
        <span className="text-cobalt mt-1.5 block font-semibold">Abrir comprovante</span>
        <div className="relative mt-2.5 flex gap-1.5 text-[11px]">
          <span className="bg-green text-green-foreground flex-1 rounded-md py-1.5 text-center font-semibold">
            Aprovar pagamento
          </span>
          <span className="flex-1 rounded-md border py-1.5 text-center font-semibold">Recusar</span>
          <Tap className="-top-1 left-10" delay={1} />
        </div>
      </motion.div>
      <motion.p
        {...enter(1.6)}
        className="text-green mt-3 flex items-center gap-1.5 text-xs font-semibold"
      >
        <Check className="h-4 w-4" /> Horário confirmado
      </motion.p>
    </PanelWindow>
  )
}

function FixedChoose() {
  return (
    <Phone>
      <div className="space-y-2.5 p-2.5 text-[10px]">
        <div className="bg-primary-soft rounded-lg p-2">
          <p className="font-semibold">Sessão individual</p>
          <p className="text-muted-foreground">Quinta, 23/10 às 14:00</p>
        </div>
        <motion.div
          {...enter(0.3)}
          className="ring-primary bg-card relative flex gap-2 rounded-lg border p-2 ring-2"
        >
          <span className="bg-primary text-primary-foreground mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded">
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
          <span>
            <span className="font-semibold">Quero esse horário fixo toda semana</span>
            <span className="text-muted-foreground block">
              Reservamos toda quinta-feira às 14:00 nas próximas 8 semanas.
            </span>
          </span>
          <Tap className="-left-1 -top-1" delay={0.9} />
        </motion.div>
        <motion.span
          {...enter(1.2)}
          className="bg-primary text-primary-foreground block rounded-md py-2 text-center font-semibold"
        >
          Confirmar horário fixo
        </motion.span>
      </div>
    </Phone>
  )
}

const WEEKS = ['23/10', '30/10', '06/11', '13/11', '20/11', '27/11']

function FixedWeeks({ renew }: { renew?: boolean }) {
  return (
    <PanelWindow>
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <Repeat className="h-3.5 w-3.5" /> Horário fixo: toda quinta-feira às 14:00
      </p>
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-[11px]">
        {WEEKS.map((w, i) => {
          const skipped = !renew && w === '20/11'
          return (
            <motion.span
              key={w}
              {...enter(0.15 + i * 0.12)}
              className={cn(
                'rounded-md border px-2 py-2 text-center font-semibold',
                skipped
                  ? 'text-muted-foreground border-dashed line-through'
                  : 'bg-cobalt/10 border-cobalt/40',
              )}
            >
              {w}
              <span className="block text-[9px] font-normal">{skipped ? 'feriado' : '14:00'}</span>
            </motion.span>
          )
        })}
        {renew &&
          ['04/12', '11/12', '18/12'].map((w, i) => (
            <motion.span
              key={w}
              {...enter(1 + i * 0.25)}
              className="bg-mustard/25 border-mustard/60 rounded-md border px-2 py-2 text-center font-semibold"
            >
              {w}
              <span className="block text-[9px] font-normal">nova semana</span>
            </motion.span>
          ))}
      </div>
    </PanelWindow>
  )
}

export const SCENES: Record<string, () => React.ReactElement> = {
  'public-services': PublicServices,
  'public-slots': PublicSlots,
  'public-form': PublicForm,
  'public-success': PublicSuccess,
  'panel-toast': PanelToast,
  'panel-agenda': PanelAgenda,
  'panel-detail': PanelDetail,
  'wa-confirmation': WaConfirmation,
  'wa-reminder': WaReminder,
  'wa-confirmed': WaConfirmed,
  'pay-pix': PayPix,
  'pay-proof': PayProof,
  'pay-approve': PayApprove,
  'fixed-choose': FixedChoose,
  'fixed-weeks': () => <FixedWeeks />,
  'fixed-renew': () => <FixedWeeks renew />,
}
