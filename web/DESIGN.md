# DESIGN.md: StayRunning-inspired Jump landing page

## Source
- URL: https://stayrunning.dipxsy.app
- Capture date: 2026-03-09
- Evidence: Firecrawl branding/images scrape and page capture; local extension screenshots.

## Design Summary
A warm, editorial utility landing page: oversized dark-brown typography on a cream field, a single acid-lime accent, rounded dark CTAs, and an airy product image below the hero. The adaptation is for Jump, a keyboard-first Chrome extension for switching and searching open tabs.

## Design Tokens

### Colors
- Canvas: `#FFF0DF` (observed)
- Ink: `#292524` (observed)
- Soft panel: `#F6E5D4` (observed)
- Acid accent: `#D9FF54` (observed)
- Muted ink: `#75675D` (inferred)
- Fine rule: `rgba(41, 37, 36, .16)` (inferred)

### Typography
- System UI stack: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` (observed)
- Hero: very large, tight, heavy display treatment; fluid `clamp(3.4rem, 10.5vw, 9rem)`.
- Body: compact 1rem–1.15rem with relaxed line-height.

### Spacing And Layout
- 4px base rhythm; max content width 1240px.
- Generous hero spacing, rounded 18px buttons, 11–22px media radius.
- Mostly flat surfaces; only restrained shadow on the primary CTA.

## Components
- Minimal header with brand wordmark, small version/status label, and utility links.
- Primary pill CTA: “Download extension” with Chrome Web Store mark.
- Secondary soft CTA: “See how it works”.
- Large hero copy with lime-highlighted phrase.
- Product screenshot showcase with caption strip.
- Feature list using thin dividers and compact labels, not nested cards.
- Closing CTA band and sparse footer.

## Page Patterns
Header → hero → product showcase → feature rows → use-case statement → closing CTA → footer. On narrow screens, nav links collapse visually, hero remains left-aligned, and the screenshot becomes a horizontally contained image.

## Content Style
Short, direct, confident copy. Emphasize speed and focus. Use keyboard cues (`⌘ ⇧ P`, `Alt Q`) as product proof rather than decoration.

## Agent Build Instructions
Preserve the cream/ink/lime relationship and the source’s generous vertical rhythm. Use Jump-specific copy and screenshots; do not reuse StayRunning copy or assets. The primary CTA must point to the Chrome Web Store and show a Web Store icon. Keep the page accessible, responsive, keyboard navigable, and respectful of reduced motion.

## Rerun Inputs
workflow: firecrawl-website-design-clone
source_url: https://stayrunning.dipxsy.app
target_stack: TanStack Start + React + CSS
output: DESIGN.md
