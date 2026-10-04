import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // Application installable depuis le navigateur (Edge / Chrome), utilisable hors ligne.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'mascot.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Minion',
        short_name: 'Minion',
        description: 'L’univers personnel d’Einat : notes, envies, projets, moodboards, calendrier et journal.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#FAF6EF',
        theme_color: '#FAF6EF',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  base: './',
  server: { port: 5173, open: false },
  preview: { port: 4173 },
})
