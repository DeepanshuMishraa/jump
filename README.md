# Jump — Tab Command Palette

Jump is a keyboard-first Manifest V3 extension for Chromium browsers. It opens a centered overlay directly over the current page, searches every open tab by title or URL, and focuses the selected tab.

## Development

```sh
pnpm install
pnpm build
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `cmd/dist`. After rebuilding, reload the extension and refresh any existing tabs so the updated content script is injected.

The default shortcut is `Command+Shift+P` on macOS and `Ctrl+Shift+P` elsewhere. Chromium reserves browser shortcuts such as `Command+P`, so use the shortcut editor at `chrome://extensions/shortcuts` to remap it.
