import { afterAll, beforeEach } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { resetDb } from './helpers'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await prisma.$disconnect()
})
