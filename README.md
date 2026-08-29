# Jump

A keyboard-first Chromium extension with two fast ways to switch tabs:

- **Thumbnail switcher** — press `Alt+Q` to browse open tabs visually.
- **Search palette** — press `⌘ Shift P` on macOS or `Ctrl Shift P` on Windows/Linux to search tabs by title or URL.

## Install

Requirements: Node.js and [pnpm](https://pnpm.io/installation).

```sh
pnpm install
pnpm build
```

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this project’s `dist` folder.

After rebuilding, click **Reload** on the extension. Refresh open tabs to inject the latest content script.

## Shortcuts

Change shortcuts at `chrome://extensions/shortcuts`.
