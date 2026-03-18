import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "..", "shared"),
      "@assets": path.resolve(import.meta.dirname, "..", "attached_assets"),
    },
    dedupe: ["zod", "react", "react-dom", "drizzle-orm", "drizzle-zod"],
  },
  optimizeDeps: {
    include: [
      "zod",
      "drizzle-orm",
      "drizzle-zod",
      "react",
      "react-dom",
      "react-dom/client",
      "wouter",
      "@tanstack/react-query",
      "lucide-react",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
    ],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    commonjsOptions: {
      include: [/shared/, /node_modules/],
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    strictPort: true,
    allowedHosts: true,
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/App.tsx",
        "./src/pages/chat.tsx",
        "./src/contexts/UserContext.tsx",
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/agent': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/export': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/plan': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/plans': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/start': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/approve': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/status': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
