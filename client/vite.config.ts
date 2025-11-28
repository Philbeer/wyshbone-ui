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
    // Ensure shared folder imports resolve from client's node_modules
    dedupe: ["zod", "react", "react-dom", "drizzle-orm", "drizzle-zod"],
  },
  optimizeDeps: {
    include: ["zod", "drizzle-orm", "drizzle-zod"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    commonjsOptions: {
      include: [/shared/, /node_modules/],
    },
  },
  server: {
    // Proxy API requests to backend server in development
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/agent': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/export': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

