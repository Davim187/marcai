import { z } from 'zod'

/** Parâmetro `:id` das rotas (ids do Prisma, cuid). */
export const idParam = z.object({ id: z.string().min(1).max(40) })
