import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotificationBell() {
  return (
    <Button variant="ghost" size="icon" aria-label="Notificações">
      <Bell />
    </Button>
  )
}
