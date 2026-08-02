import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@wormhole/shared": path.resolve(__dirname, "../../packages/shared/src"),
      // Browser preview: stub Tauri plugins that throw outside the webview
      ...(process.env.VITE_BROWSER_PREVIEW === "1"
        ? {
            "@tauri-apps/plugin-deep-link": path.resolve(__dirname, "./src/shims/deep-link.ts"),
            "@tauri-apps/plugin-dialog": path.resolve(__dirname, "./src/shims/dialog.ts"),
            "@tauri-apps/plugin-autostart": path.resolve(__dirname, "./src/shims/autostart.ts"),
            "@crabnebula/tauri-plugin-drag": path.resolve(__dirname, "./src/shims/drag.ts"),
          }
        : {}),
    },
  },
  // Prevent vite from obscuring rust errors
  clearScreen: false,
  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 5173,
    strictPort: true,
  },
  // to access the Tauri environment variables set by the CLI with information about the current target
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    // don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
