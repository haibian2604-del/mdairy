import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    react(),
    {
      // 丢弃 KaTeX 的 ttf/woff 旧字体格式（共 ~876K）：Tauri 会把 dist 原样嵌进二进制，
      // 而 WKWebView 一律走 woff2（CSS src 列表首个即 woff2），旧格式纯属体积陪葬
      name: "drop-legacy-fonts",
      apply: "build",
      closeBundle() {
        const dir = join(process.cwd(), "dist/assets");
        for (const f of readdirSync(dir)) {
          if (/\.(ttf|woff)$/.test(f)) rmSync(join(dir, f));
        }
      },
    },
  ],

  test: { environment: "jsdom", globals: true, setupFiles: "./src/test-setup.ts" },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
