import { describe, expect, it } from 'vitest'
import { cn, initials } from './utils'

describe('utils do front', () => {
  it('gera iniciais', () => {
    expect(initials('Mary Lopes Unhas')).toBe('ML')
  })
  it('mescla classes do Tailwind', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})
