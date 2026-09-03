import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const contentBuild = mode === "content";

  return {
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "copy-extension-assets",
      closeBundle() {
        if (contentBuild) return;
        const outputDir = resolve(projectRoot, "dist");
        mkdirSync(outputDir, { recursive: true });
        copyFileSync(resolve(projectRoot, "manifest.json"), resolve(outputDir, "manifest.json"));
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: !contentBuild,
    modulePreload: false,
    rollupOptions: {
      input: contentBuild ? resolve(projectRoot, "src/content.tsx") : {
        app: resolve(projectRoot, "index.html"),
        popup: resolve(projectRoot, "popup.html"),
        background: resolve(projectRoot, "src/background.ts"),
      },
      output: contentBuild ? {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "assets/content.js",
      } : {
        entryFileNames: (chunk) => chunk.name === "background" ? "assets/background.js" : "assets/[name].js",
      },
    },
  },
  };
});
