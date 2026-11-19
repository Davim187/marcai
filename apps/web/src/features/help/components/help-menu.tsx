import {
  BookOpen,
  CircleHelp,
  Compass,
  GraduationCap,
  LifeBuoy,
  MessageCircleQuestion,
  Play,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTenant } from '@/lib/session'
import { cn } from '@/lib/utils'
import { canSee, guideForRoute, TUTORIALS } from '../content'
import { useHelpUi } from '../help-ui'
import { useBeginnerMode, useHelpActions, useProgressMap } from '../state/help-state'
import { useTour } from '../tour/tour-context'

/** Botão "?" do cabeçalho: tudo de ajuda da página atual num lugar só. */
export function HelpMenu() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { tenant } = useTenant()
  const { start } = useTour()
  const { openAssistant } = useHelpUi()
  const beginner = useBeginnerMode()
  const { setBeginnerMode } = useHelpActions()
  const progress = useProgressMap()
  const guide = guideForRoute(pathname)
  const showGuide = guide && canSee(guide.audience, tenant.role)
  const pageTutorials = TUTORIALS.filter(
    (t) => t.route === pathname && canSee(t.audience, tenant.role),
  ).slice(0, 3)
  const tourDone = progress.get('tour:sistema')?.status === 'completed'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="round" size="icon" aria-label="Ajuda" data-tour="help-button">
          <CircleHelp />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {showGuide && (
          <DropdownMenuItem onSelect={() => start(guide.id, { restart: true })}>
            <Play />
            <span className="flex-1">Guia desta página</span>
            {progress.get(guide.id)?.status === 'completed' && (
              <span className="text-muted-foreground text-xs">visto</span>
            )}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => start('tour:sistema', { restart: tourDone })}>
          <Compass />
          <span className="flex-1">Tour pelo sistema</span>
          {tourDone && <span className="text-muted-foreground text-xs">visto</span>}
        </DropdownMenuItem>
        {pageTutorials.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Passo a passo desta página</DropdownMenuLabel>
            {pageTutorials.map((t) => (
              <DropdownMenuItem key={t.slug} onSelect={() => navigate(`/painel/ajuda/${t.slug}`)}>
                <BookOpen />
                <span className="truncate">{t.title}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/painel/ajuda')}>
          <LifeBuoy /> Central de ajuda
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openAssistant()}>
          <MessageCircleQuestion /> Perguntar ao assistente
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          role="menuitemcheckbox"
          aria-checked={beginner}
          // Não fecha o menu ao alternar: dá para ver a mudança
          onSelect={(e) => {
            e.preventDefault()
            setBeginnerMode(!beginner)
          }}
        >
          <GraduationCap />
          <span className="flex-1">Modo iniciante</span>
          <span
            aria-hidden
            className={cn(
              'relative h-5 w-9 shrink-0 rounded-full transition-colors',
              beginner ? 'bg-primary' : 'bg-input',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]',
                beginner ? 'left-[1.125rem]' : 'left-0.5',
              )}
            />
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
