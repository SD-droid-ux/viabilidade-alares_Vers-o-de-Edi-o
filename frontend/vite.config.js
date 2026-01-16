import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: false,
    allowedHosts: [
      "8471a0be-4ab3-4dfd-93ef-b8758b605ad0-00-22dqv1n0zpez.kirk.replit.dev",
      ".replit.dev",
      ".repl.co",
    ],
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  // Configuração para produção (ultra-otimizada)
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild', // esbuild é mais rápido que terser e já vem com Vite
    target: 'es2015', // Otimizar para browsers modernos
    cssMinify: true, // Minificar CSS também
    cssCodeSplit: true, // Code splitting para CSS
    reportCompressedSize: false, // Desabilitar relatório de tamanho (acelera build)
    rollupOptions: {
      output: {
        manualChunks: {
          'google-maps': ['@googlemaps/js-api-loader'],
          'utils': ['xlsx', 'html2canvas'],
        },
        // Otimizar nomes de arquivos para melhor cache
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 1000, // Aumentar limite de warning
    // Tree-shaking agressivo
    treeshake: {
      moduleSideEffects: false,
    },
  },
});
