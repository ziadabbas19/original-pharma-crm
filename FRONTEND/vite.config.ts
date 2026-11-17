import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:5080'

  return {
    plugins: [
      // File-based routing; every route component becomes its own lazy chunk.
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: '/rep',
          name: 'Original Pharma',
          short_name: 'Original Pharma',
          description: 'Original Pharma field app for medical reps',
          lang: 'ar',
          dir: 'rtl',
          start_url: '/rep',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#ffffff',
          theme_color: '#0f766e',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: '/index.html',
          // API calls, the realtime hub and backend tools are never served from cache.
          navigateFallbackDenylist: [/^\/api\//, /^\/hubs\//, /^\/swagger/, /^\/hangfire/, /^\/health/],
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    },
    server: {
      port: 5173,
      // Same-origin in dev: the refresh cookie and CORS just work.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false },
        '/hubs': { target: apiTarget, ws: true, changeOrigin: false },
      },
    },
    build: {
      sourcemap: true,
      // maplibre-gl alone is ~1.1 MB minified; it only loads with the live map route chunk.
      chunkSizeWarningLimit: 1200,
    },
  }
})
