import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts', 'src/worker.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // O pacote compartilhado é empacotado junto; dependências do npm ficam externas.
  noExternal: ['@marcai/shared'],
})
