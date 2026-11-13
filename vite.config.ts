import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  // Content scripts must be single-file IIFEs, so each gets its own build pass.
  const contentEntries: Partial<Record<string, { input: string; output: string }>> = {
    content: { input: "src/content.tsx", output: "assets/content.js" },
    keyguard: { input: "src/keyGuard.ts", output: "assets/keyguard.js" },
  };
  const contentEntry = contentEntries[mode];
  const contentBuild = contentEntry !== undefined;

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
      input: contentBuild ? resolve(projectRoot, contentEntry.input) : {
        app: resolve(projectRoot, "index.html"),
        popup: resolve(projectRoot, "popup.html"),
        background: resolve(projectRoot, "src/background.ts"),
      },
      output: contentBuild ? {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: contentEntry.output,
      } : {
        entryFileNames: (chunk) => chunk.name === "background" ? "assets/background.js" : "assets/[name].js",
      },
    },
  },
  };
});
