/**
 * Som de notificação do painel.
 *
 * Navegadores só deixam tocar áudio depois de um gesto da pessoa (clique/toque/tecla).
 * Por isso existe um único AudioContext, "destravado" no primeiro gesto da sessão, e
 * reaproveitado em todos os avisos — inclusive com a aba em segundo plano.
 */
let ctx: AudioContext | null = null
let unlocked = false
const listeners = new Set<() => void>()

function getContext() {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx ??= new Ctor()
  return ctx
}

function unlock() {
  const c = getContext()
  if (!c) return
  const done = () => {
    unlocked = c.state === 'running'
    if (unlocked) {
      for (const ev of GESTURES) window.removeEventListener(ev, unlock, true)
      listeners.forEach((fn) => fn())
    }
  }
  if (c.state === 'suspended') c.resume().then(done, () => undefined)
  else done()
}

const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const

/** Chame uma vez quando o painel abre: o som fica pronto no primeiro clique. */
export function installSoundUnlock() {
  if (typeof window === 'undefined' || unlocked) return
  for (const ev of GESTURES) window.addEventListener(ev, unlock, { capture: true, passive: true })
}

export function soundReady() {
  return unlocked && ctx?.state === 'running'
}

export function onSoundReady(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Duas notas curtas e agradáveis (sem arquivo de áudio). Devolve false se o navegador bloqueou. */
export function playChime(): boolean {
  const c = getContext()
  if (!c) return false
  if (c.state === 'suspended') {
    // Tenta retomar (funciona se já houve um gesto antes); se não, fica para o próximo aviso
    c.resume().catch(() => undefined)
    if (c.state === 'suspended') return false
  }
  const notes = [880, 1318.5]
  notes.forEach((freq, i) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.value = freq
    const t = c.currentTime + i * 0.14
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
    o.connect(g).connect(c.destination)
    o.start(t)
    o.stop(t + 0.5)
  })
  return true
}
