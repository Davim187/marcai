import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => undefined,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('marcai-theme') as Theme) ?? 'light'
    } catch {
      return 'light'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('marcai-theme', theme)
    } catch {
      /* armazenamento indisponível */
    }
  }, [theme])
  return (
    <ThemeCtx.Provider
      value={{ theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }}
    >
      {children}
    </ThemeCtx.Provider>
  )
}

export const useTheme = () => useContext(ThemeCtx)

/** Aplica o modo escuro apenas enquanto o componente (painel) estiver montado. */
export function useApplyTheme() {
  const { theme } = useTheme()
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    return () => document.documentElement.classList.remove('dark')
  }, [theme])
}
