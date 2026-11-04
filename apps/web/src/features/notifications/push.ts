import { api } from '@/lib/api'

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function currentPushSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** Pede permissão e inscreve este aparelho para receber push (PWA). */
export async function enablePush(publicKey: string) {
  if (!pushSupported())
    throw new Error(
      'Seu navegador não suporta notificações. No iPhone, instale o app na tela de início primeiro.',
    )
  const permission = await Notification.requestPermission()
  if (permission !== 'granted')
    throw new Error('Você não permitiu as notificações. Libere nas configurações do navegador.')
  const reg =
    (await navigator.serviceWorker.getRegistration()) ??
    (await navigator.serviceWorker.register('/sw.js'))
  await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  await api('/notifications/push/subscribe', { body: { endpoint: json.endpoint, keys: json.keys } })
}

export async function disablePush() {
  const sub = await currentPushSubscription()
  if (!sub) return
  await api('/notifications/push/unsubscribe', { body: { endpoint: sub.endpoint } })
  await sub.unsubscribe()
}
