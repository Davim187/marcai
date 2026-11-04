import { Download } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Button } from './ui/button'

export function QrCode({
  value,
  filename = 'qrcode-agendamento.png',
  size = 200,
}: {
  value: string
  filename?: string
  size?: number
}) {
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    QRCode.toDataURL(value, {
      width: 1024,
      margin: 2,
      color: { dark: '#2B2024', light: '#FFFFFF' },
    }).then(setSrc)
  }, [value])
  if (!src)
    return (
      <div style={{ width: size, height: size }} className="bg-muted animate-pulse rounded-xl" />
    )
  return (
    <div className="flex flex-col items-center gap-3">
      <img
        src={src}
        alt={`QR Code para ${value}`}
        width={size}
        height={size}
        className="rounded-xl border bg-white p-2"
      />
      <Button variant="outline" size="sm" asChild>
        <a href={src} download={filename}>
          <Download /> Baixar QR Code para imprimir
        </a>
      </Button>
    </div>
  )
}
