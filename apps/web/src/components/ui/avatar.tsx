import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cn, initials } from '@/lib/utils'

export function Avatar({
  name,
  src,
  className,
}: {
  name: string
  src?: string | null
  className?: string
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'bg-primary-soft relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full',
        className,
      )}
    >
      {src && (
        <AvatarPrimitive.Image
          src={src}
          alt={name}
          className="aspect-square h-full w-full object-cover"
        />
      )}
      <AvatarPrimitive.Fallback className="text-primary flex h-full w-full items-center justify-center text-sm font-semibold">
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}
