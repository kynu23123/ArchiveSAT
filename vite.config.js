import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    assetsInlineLimit: 35000,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        assetFileNames: ({ names }) => names.some((name) => name.endsWith("_nowasm_fallback.js"))
          ? "assets/[name][extname]"
          : "assets/[name]-[hash][extname]",
      },
    },
  },
});
