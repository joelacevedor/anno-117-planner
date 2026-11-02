import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig(({ mode }) => ({
  base: "./",
  resolve: mode === "single" ? { alias: { "virtual:pwa-register/react": "/src/stubs/pwa-register.ts" } } : {},
  build: mode === "single" ? { outDir: "dist-single", assetsInlineLimit: 1e8, cssCodeSplit: false, modulePreload: false, minify: true, rollupOptions: { output: { inlineDynamicImports: true } } } : {},
  plugins: [
    react(),
    mode !== "single" && VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon-64.png", "apple-touch-icon.png"],
      manifest: {
        name: "Praefectus · Anno 117",
        short_name: "Praefectus",
        description: "Planificador de Anno 117 para jugar con segunda pantalla: cadenas, casas, obra, rutas y partida compartida",
        theme_color: "#17211D",
        background_color: "#17211D",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        id: "./",
        lang: "es",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webp,webmanifest}"],
        importScripts: ["push-sw.js"],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: { include: ["tests/**/*.test.ts"] },
}));
