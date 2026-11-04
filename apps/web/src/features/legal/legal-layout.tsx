import { Link } from 'react-router'
import { BrandLogo } from '@/components/brand-logo'

export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-background min-h-dvh">
      <header className="border-b">
        <div className="container flex h-16 items-center">
          <Link to="/">
            <BrandLogo />
          </Link>
        </div>
      </header>
      <main className="container max-w-3xl py-10">
        <h1 className="text-3xl font-extrabold">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Última atualização: {updated}. Este é um texto-base; revise com sua assessoria jurídica
          antes de publicar.
        </p>
        <div className="[&_p]:text-muted-foreground [&_ul]:text-muted-foreground mt-8 space-y-6 leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>
    </div>
  )
}
