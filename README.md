[Download Jump from the Chrome Web Store](https://chromewebstore.google.com/detail/aphoamhbckckomhmpfgedaeppkcloaio?utm_source=item-share-cb)

# Jump

> **Limitations**
> 1. Jump cannot run on protected browser pages such as `chrome://settings`, `chrome://extensions`, the Chrome Web Store, or some built-in browser pages. It works on regular webpages and Jump’s new-tab page.
> 2. `Alt+Q` is the default visual-switcher shortcut because Chrome may reject `Ctrl+Tab` as an extension shortcut. You can try assigning `Ctrl+Tab` manually at `chrome://extensions/shortcuts`.

A keyboard-first Chromium extension with two fast ways to switch tabs:

- **Thumbnail switcher** — press `Alt+Q` to browse open tabs visually.
- **Search palette** — press `⌘ Shift P` on macOS or `Ctrl Shift P` on Windows/Linux to search open tabs or run a web search.

## Install

Requirements: Node.js 22.18+ and [pnpm](https://pnpm.io/installation).

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
