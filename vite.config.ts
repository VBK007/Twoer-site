import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    // Plain relative asset URLs, so the built site can be dropped at the root
    // of a domain or under a subpath without a rebuild — it is copied onto a
    // static host by hand, not deployed by a pipeline that knows its own URL.
    assetsDir: 'assets',
  },
})
