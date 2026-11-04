import { describe, expect, it } from 'vitest'
import {
  accessLevel,
  effectivePlan,
  hasFeature,
  trialDaysLeft,
  type SubscriptionLike,
} from '../plans'

const now = new Date('2025-11-04T12:00:00Z')
const day = 86_400_000
const sub = (o: Partial<SubscriptionLike>): SubscriptionLike => ({
  plan: 'essencial',
  status: 'active',
  trialEndsAt: null,
  currentPeriodEnd: new Date(now.getTime() + 10 * day),
  ...o,
})

describe('feature gating por plano', () => {
  it('Essencial não tem WhatsApp', () => {
    expect(hasFeature(sub({}), 'whatsapp_professional')).toBe(false)
    expect(hasFeature(sub({}), 'whatsapp_customer')).toBe(false)
    expect(hasFeature(sub({}), 'agenda')).toBe(true)
    expect(hasFeature(sub({}), 'push_notifications')).toBe(true)
  })
  it('Pro tem WhatsApp', () => {
    expect(hasFeature(sub({ plan: 'pro' }), 'whatsapp_professional')).toBe(true)
    expect(hasFeature(sub({ plan: 'pro' }), 'whatsapp_customer')).toBe(true)
  })
  it('teste grátis libera tudo do Pro', () => {
    expect(effectivePlan(sub({ status: 'trial' }))).toBe('pro')
    expect(hasFeature(sub({ status: 'trial' }), 'whatsapp_customer')).toBe(true)
  })
  it('modo exclusivo libera tudo do Pro', () => {
    expect(hasFeature(null, 'whatsapp_professional', 'single_tenant')).toBe(true)
    expect(accessLevel(null, now, 'single_tenant')).toBe('full')
  })
  it('sem assinatura não tem acesso', () => {
    expect(hasFeature(null, 'whatsapp_professional')).toBe(false)
    expect(accessLevel(null, now)).toBe('blocked')
  })
})

describe('nível de acesso pela situação da assinatura', () => {
  it('em dia → full', () => {
    expect(accessLevel(sub({}), now)).toBe('full')
  })
  it('teste vigente → full; dias restantes', () => {
    const s = sub({
      status: 'trial',
      trialEndsAt: new Date(now.getTime() + 5 * day),
      currentPeriodEnd: null,
    })
    expect(accessLevel(s, now)).toBe('full')
    expect(trialDaysLeft(s, now)).toBe(5)
  })
  it('vencida há até 7 dias → grace', () => {
    const s = sub({ status: 'past_due', currentPeriodEnd: new Date(now.getTime() - 3 * day) })
    expect(accessLevel(s, now)).toBe('grace')
  })
  it('vencida há mais de 7 dias → blocked', () => {
    const s = sub({ status: 'past_due', currentPeriodEnd: new Date(now.getTime() - 8 * day) })
    expect(accessLevel(s, now)).toBe('blocked')
  })
  it('teste acabou há mais de 7 dias → blocked', () => {
    const s = sub({
      status: 'trial',
      trialEndsAt: new Date(now.getTime() - 9 * day),
      currentPeriodEnd: null,
    })
    expect(accessLevel(s, now)).toBe('blocked')
  })
  it('cancelada mas ainda dentro do período pago → full', () => {
    const s = sub({ status: 'canceled', currentPeriodEnd: new Date(now.getTime() + 2 * day) })
    expect(accessLevel(s, now)).toBe('full')
  })
})
