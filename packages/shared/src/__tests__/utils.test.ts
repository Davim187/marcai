import { describe, expect, it } from 'vitest'
import {
  brazilianHolidays,
  contrastRatio,
  formatBRL,
  formatPhone,
  generatePalette,
  isValidSlug,
  maskPhone,
  normalizeBrazilianMobile,
  parseBRLToCents,
  renderTemplate,
  slugify,
} from '../index'

describe('dinheiro', () => {
  it('formata em BRL', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56')
    expect(formatBRL(12000)).toBe('R$ 120,00')
  })
  it('converte texto em centavos', () => {
    expect(parseBRLToCents('1.234,56')).toBe(123456)
    expect(parseBRLToCents('R$ 99,9')).toBe(9990)
    expect(parseBRLToCents('abc')).toBeNull()
    expect(parseBRLToCents('50')).toBe(5000)
    expect(parseBRLToCents('1.500')).toBe(150000)
    expect(parseBRLToCents('R$ 80')).toBe(8000)
  })
})

describe('telefone', () => {
  it('normaliza celulares brasileiros', () => {
    expect(normalizeBrazilianMobile('(85) 99999-9999')).toBe('5585999999999')
    expect(normalizeBrazilianMobile('+55 85 99999-9999')).toBe('5585999999999')
    expect(normalizeBrazilianMobile('85 3333-4444')).toBeNull()
    expect(normalizeBrazilianMobile('(20) 99999-9999')).toBeNull()
  })
  it('formata e mascara', () => {
    expect(formatPhone('5585999999999')).toBe('(85) 99999-9999')
    expect(maskPhone('8599999')).toBe('(85) 9999-9')
    expect(maskPhone('8533334444')).toBe('(85) 3333-4444')
    expect(maskPhone('85999998888')).toBe('(85) 99999-8888')
    // Colado com código do país ou zero de operadora: não corta o número
    expect(maskPhone('+55 98 98765-4321')).toBe('(98) 98765-4321')
    expect(maskPhone('5585999998888')).toBe('(85) 99999-8888')
    expect(maskPhone('+55 85 99999-9999')).toBe('(85) 99999-9999')
    expect(maskPhone('085 99999-8888')).toBe('(85) 99999-8888')
    // DDD 55 (RS) digitado normalmente continua funcionando
    expect(maskPhone('55999998888')).toBe('(55) 99999-8888')
  })
})

describe('slug', () => {
  it('gera slugs limpos', () => {
    expect(slugify('Studio Vértice Cabelo & Barba')).toBe('studio-vertice-cabelo-e-barba')
    expect(slugify('Ângela Estética')).toBe('angela-estetica')
  })
  it('bloqueia slugs reservados', () => {
    expect(isValidSlug('painel')).toBe(false)
    expect(isValidSlug('studiovertice')).toBe(true)
    expect(isValidSlug('a')).toBe(false)
  })
})

describe('feriados', () => {
  it('calcula os feriados móveis de 2026', () => {
    const h = brazilianHolidays(2026).map((x) => x.date)
    expect(h).toContain('2026-04-03') // Sexta-feira Santa
    expect(h).toContain('2026-02-17') // Carnaval
    expect(h).toContain('2026-06-04') // Corpus Christi
    expect(h).toContain('2026-11-20')
  })
})

describe('cores', () => {
  it('gera paleta com contraste AA no botão', () => {
    const p = generatePalette('#F9A8D4') // rosa claro
    expect(contrastRatio(p.primary, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('templates', () => {
  it('substitui variáveis', () => {
    expect(renderTemplate('Oi, {cliente}! {x}', { cliente: 'Ana' })).toBe('Oi, Ana! {x}')
  })
})
