import {
	Cancel01Icon,
	FlashIcon,
	GithubIcon,
	Globe02Icon,
	Key01Icon,
	Layers01Icon,
	Linkedin01Icon,
	Mail01Icon,
	NewTwitterIcon,
	PinIcon,
	Search01Icon,
	SecurityCheckIcon,
	Shield01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

const webStoreUrl =
	"https://chromewebstore.google.com/detail/aphoamhbckckomhmpfgedaeppkcloaio?utm_source=item-share-cb";
const githubUrl = "https://github.com/DeepanshuMishraa/jump";

export const Route = createFileRoute("/")({ component: Home });

function ChromeStoreLogo({ className = "" }: { className?: string }) {
	return (
		<img
			src="/chrome-web-store-seeklogo.svg"
			alt="Chrome Web Store"
			className={className}
			width={20}
			height={20}
		/>
	);
}

function BrandMark() {
	return (
		<span className="brand-mark" aria-hidden="true">
			<span className="brand-idle" />
			<span className="brand-reveal">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M7 17L17 7M17 7H9M17 7V15" />
				</svg>
			</span>
		</span>
	);
}

function ArrowRightIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M4 12h16m0 0-6-6m6 6-6 6" />
		</svg>
	);
}

function DownloadButton({
	onClick,
	className = "",
}: {
	onClick?: () => void;
	className?: string;
}) {
	return (
		<button
			type="button"
			className={`download-button ${className}`}
			onClick={onClick}
		>
			<span className="download-leading">
				<ChromeStoreLogo />
			</span>
			<span className="download-label">
				<span className="download-full">Download for Chrome</span>
				<span className="download-short">Install</span>
			</span>
			<span className="download-trailing">
				<ArrowRightIcon />
			</span>
		</button>
	);
}

function NavDownloadButton({ onClick }: { onClick?: () => void }) {
	return (
		<button type="button" className="nav-download" onClick={onClick}>
			<span className="download-leading">
				<ChromeStoreLogo />
			</span>
			<span className="download-label">
				<span className="download-full">Download for Chrome</span>
				<span className="download-short">Install</span>
			</span>
			<span className="download-trailing">
				<ArrowRightIcon />
			</span>
		</button>
	);
}

function Home() {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [copiedShortcut, setCopiedShortcut] = useState(false);
	const [copiedBuild, setCopiedBuild] = useState(false);

	const openDialog = useCallback(() => {
		if (dialogRef.current) {
			dialogRef.current.showModal();
		}
	}, []);

	const closeDialog = useCallback(() => {
		if (dialogRef.current) {
			dialogRef.current.close();
		}
	}, []);

	const copyToClipboard = (text: string, type: "shortcut" | "build") => {
		navigator.clipboard.writeText(text).then(() => {
			if (type === "shortcut") {
				setCopiedShortcut(true);
				setTimeout(() => setCopiedShortcut(false), 2000);
			} else {
				setCopiedBuild(true);
				setTimeout(() => setCopiedBuild(false), 2000);
			}
		});
	};

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && dialogRef.current?.open) {
				closeDialog();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [closeDialog]);

	return (
		<main className="page-shell">
			{/* HERO CONTAINER */}
			<div className="hero-container">
				{/* NAVIGATION */}
				<nav className="nav" aria-label="Main navigation">
					<a className="brand" href="/" aria-label="Jump home">
						<BrandMark />
						<span className="brand-name">Jump</span>
						<span className="version">v0.1.5</span>
					</a>

					<div className="nav-side">
						<a className="nav-link" href="#features">
							Features
						</a>
						<a className="nav-link" href="#limitations">
							Limitations
						</a>
						<a
							className="nav-link"
							href={githubUrl}
							target="_blank"
							rel="noreferrer"
						>
							<HugeiconsIcon icon={GithubIcon} size={18} />
							GitHub
						</a>
						<NavDownloadButton onClick={openDialog} />
					</div>
				</nav>

				{/* HERO SECTION (NO IMAGES, PURE MONOSPACE TYPOGRAPHY) */}
				<section className="hero-copy" id="top">
					<div className="hero-proof">
						<span className="hero-proof-dot" />
						<span>Used by 300+ people</span>
					</div>

					<h1>
						Switch open tabs.
						<br />
						At the <span className="hero-highlight">speed of thought.</span>
					</h1>

					<p className="lede">
						A lightweight, keyboard-driven visual tab switcher and fuzzy command
						palette for Chromium. Browse tabs instantly, keep your hands on the
						keys, and stay in flow.
					</p>

					<div className="actions">
						<DownloadButton onClick={openDialog} />
						<a
							className="source-button"
							href={githubUrl}
							target="_blank"
							rel="noreferrer"
						>
							<HugeiconsIcon icon={GithubIcon} size={18} />
							View source
						</a>
					</div>

					<div className="hero-shortcuts">
						<div className="shortcut-item">
							<kbd className="shortcut-kbd">⌘ ⇧ P</kbd>
							<span>Search palette</span>
						</div>
						<div className="shortcut-divider" />
						<div className="shortcut-item">
							<kbd className="shortcut-kbd">Alt Q</kbd>
							<span>Visual switcher</span>
						</div>
						<div className="shortcut-divider" />
						<div className="shortcut-item">
							<kbd className="shortcut-kbd">↑ ↓ Enter</kbd>
							<span>Instant jump</span>
						</div>
					</div>
				</section>
			</div>

			{/* FEATURES SECTION (MINIMAL, CLEAN, NO BOX CLUTTER) */}
			<section
				className="features-section"
				id="features"
				aria-labelledby="features-heading"
			>
				<div className="section-head">
					<span className="section-kicker">01 / Capabilities</span>
					<h2 className="section-title" id="features-heading">
						Built for pure speed.
					</h2>
					<p className="section-subtitle">
						No heavy toolbars or background bloat. Just instant keyboard flow.
					</p>
				</div>

				<div className="features-grid">
					<div className="feature-item">
						<div className="feature-header">
							<div className="feature-icon">
								<HugeiconsIcon icon={Layers01Icon} size={18} strokeWidth={2} />
							</div>
							<h3>Visual Switcher</h3>
						</div>
						<p>
							Press <kbd>Alt+Q</kbd> to inspect active tabs with spatial
							thumbnails and regain context instantly.
						</p>
					</div>

					<div className="feature-item">
						<div className="feature-header">
							<div className="feature-icon">
								<HugeiconsIcon icon={Search01Icon} size={18} strokeWidth={2} />
							</div>
							<h3>Fuzzy Search Palette</h3>
						</div>
						<p>
							Type any tab title, URL keyword, or open domain. Filters in
							sub-millisecond real time.
						</p>
					</div>

					<div className="feature-item">
						<div className="feature-header">
							<div className="feature-icon">
								<HugeiconsIcon icon={FlashIcon} size={18} strokeWidth={2} />
							</div>
							<h3>Zero Memory Bloat</h3>
						</div>
						<p>
							Engineered natively in ~1MB. No background battery drain, heavy
							frameworks, or idle lag.
						</p>
					</div>

					<div className="feature-item">
						<div className="feature-header">
							<div className="feature-icon">
								<HugeiconsIcon icon={PinIcon} size={18} strokeWidth={2} />
							</div>
							<h3>Tab Quick Actions</h3>
						</div>
						<p>
							Pin essential tabs, close duplicates, and switch between separate
							windows without a mouse.
						</p>
					</div>

					<div className="feature-item">
						<div className="feature-header">
							<div className="feature-icon">
								<HugeiconsIcon icon={Shield01Icon} size={18} strokeWidth={2} />
							</div>
							<h3>100% Private</h3>
						</div>
						<p>
							Zero analytics, telemetry, or cloud accounts. Your browsing data
							never leaves your machine.
						</p>
					</div>

					<div className="feature-item">
						<div className="feature-header">
							<div className="feature-icon">
								<HugeiconsIcon icon={Globe02Icon} size={18} strokeWidth={2} />
							</div>
							<h3>Direct Web Search</h3>
						</div>
						<p>
							Can’t find the tab you want? Dispatch your query straight to your
							favorite search engine.
						</p>
					</div>
				</div>
			</section>

			{/* LIMITATIONS & BROWSER BOUNDARIES SECTION */}
			<section
				className="limitations-section"
				id="limitations"
				aria-labelledby="limitations-heading"
			>
				<div className="section-head">
					<span className="section-kicker">02 / Boundaries</span>
					<h2 className="section-title" id="limitations-heading">
						Chromium guardrails.
					</h2>
					<p className="section-subtitle">
						Two native browser constraints and how Jump handles them.
					</p>
				</div>

				<div className="limitations-grid">
					{/* CARD 1 */}
					<div className="limitation-card">
						<div className="limitation-tag">
							<HugeiconsIcon icon={SecurityCheckIcon} size={14} />
							Internal System Pages
						</div>
						<h3>Protected browser URLs</h3>
						<p>
							Chromium restricts extensions from running content scripts inside{" "}
							<code>chrome://settings</code>, <code>chrome://extensions</code>,
							and the Chrome Web Store.
						</p>
						<p>
							Jump operates everywhere else across all standard web tabs and
							your new tab page.
						</p>
					</div>

					{/* CARD 2 */}
					<div className="limitation-card" id="shortcuts">
						<div className="limitation-tag">
							<HugeiconsIcon icon={Key01Icon} size={14} />
							Shortcut Assignment
						</div>
						<h3>Alt+Q default & Ctrl+Tab</h3>
						<p>
							<code>Alt+Q</code> is default because Chromium reserves{" "}
							<code>Ctrl+Tab</code> for sequential cycling. You can customize or
							rebind anytime:
						</p>
						<div className="command-copy">
							<code>chrome://extensions/shortcuts</code>
							<button
								type="button"
								onClick={() =>
									copyToClipboard("chrome://extensions/shortcuts", "shortcut")
								}
								aria-label="Copy shortcut URL"
							>
								{copiedShortcut ? "Copied" : "Copy"}
							</button>
						</div>
					</div>
				</div>
			</section>

			{/* SPECS & PERFORMANCE GRID */}
			<section className="specs-section" aria-label="Jump specifications">
				<div className="section-head">
					<span className="section-kicker">03 / Specs</span>
					<h2 className="section-title">Built for speed & privacy.</h2>
				</div>

				<div className="specs-grid">
					<div className="spec-card">
						<span className="spec-value">~1 MB</span>
						<span className="spec-title">Ultra-low footprint</span>
						<p className="spec-desc">
							Native scripts. Zero background memory bloat or battery drain.
						</p>
					</div>

					<div className="spec-card">
						<span className="spec-value">100%</span>
						<span className="spec-title">Offline & private</span>
						<p className="spec-desc">
							Zero analytics, tracking, or cloud servers. Everything stays
							local.
						</p>
					</div>

					<div className="spec-card">
						<span className="spec-value">&lt; 1 ms</span>
						<span className="spec-title">Instant response</span>
						<p className="spec-desc">
							Real-time tab fuzzy searching and instantaneous thumbnail
							switching.
						</p>
					</div>

					<div className="spec-card">
						<span className="spec-value">Universal</span>
						<span className="spec-title">All Chromium engines</span>
						<p className="spec-desc">
							Chrome, Arc, Brave, Microsoft Edge, Vivaldi, and Opera.
						</p>
					</div>
				</div>
			</section>

			{/* CLOSING SECTION */}
			<section className="closing">
				<p className="closing-kicker">Stay in flow</p>
				<h2>Fly through tabs without breaking your stride.</h2>
				<DownloadButton onClick={openDialog} />

				<nav className="social-links" aria-label="Project links">
					<a
						href={githubUrl}
						target="_blank"
						rel="noreferrer"
						aria-label="Jump on GitHub"
					>
						<HugeiconsIcon icon={GithubIcon} size={22} />
					</a>
					<a
						href="https://x.com/dipxsyy"
						target="_blank"
						rel="noreferrer"
						aria-label="Creator on X"
					>
						<HugeiconsIcon icon={NewTwitterIcon} size={22} />
					</a>
					<a
						href="https://linkedin.com/in/deepanshum"
						target="_blank"
						rel="noreferrer"
						aria-label="Creator on LinkedIn"
					>
						<HugeiconsIcon icon={Linkedin01Icon} size={22} />
					</a>
					<a href="mailto:hello@dipxsy.app" aria-label="Say hello via email">
						<HugeiconsIcon icon={Mail01Icon} size={22} />
					</a>
				</nav>
			</section>

			{/* WATERMARK FOOTER */}
			<footer className="footer" aria-hidden="true">
				<span>Jump</span>
			</footer>

			{/* DOWNLOAD & SETUP DIALOG */}
			<dialog
				ref={dialogRef}
				className="download-dialog"
				onCancel={closeDialog}
				aria-labelledby="dialog-title"
				aria-describedby="dialog-desc"
			>
				<div className="download-dialog-panel">
					<button
						className="dialog-close"
						type="button"
						onClick={closeDialog}
						aria-label="Close download dialog"
					>
						<HugeiconsIcon icon={Cancel01Icon} size={20} />
					</button>

					<div className="dialog-icon">
						<ChromeStoreLogo />
					</div>

					<p className="dialog-kicker">Install Jump</p>
					<h2 id="dialog-title">Get Jump from the Chrome Web Store</h2>

					<p className="dialog-copy" id="dialog-desc">
						Install Jump with a single click from the official Chrome Web Store.
						Compatible with Chrome, Arc, Brave, Edge, and all Chromium browsers.
					</p>

					<a
						className="dialog-download"
						href={webStoreUrl}
						target="_blank"
						rel="noreferrer"
					>
						<span>Add to Chrome (Free)</span>
						<ArrowRightIcon />
					</a>

					<div
						style={{
							marginTop: "32px",
							paddingTop: "24px",
							borderTop: "1px solid var(--line)",
						}}
					>
						<p className="dialog-kicker" style={{ marginBottom: "8px" }}>
							Or build & load from source
						</p>
						<p
							style={{
								fontSize: "14px",
								color: "var(--muted)",
								margin: "0 0 12px",
							}}
						>
							Clone the repository and build using pnpm:
						</p>
						<div className="command-copy">
							<code>pnpm install && pnpm build</code>
							<button
								type="button"
								onClick={() =>
									copyToClipboard("pnpm install && pnpm build", "build")
								}
							>
								{copiedBuild ? "Copied" : "Copy"}
							</button>
						</div>
						<p className="dialog-note">
							Enable Developer mode at <code>chrome://extensions</code> and
							click <strong>Load unpacked</strong> selecting the{" "}
							<code>dist</code> folder.
						</p>
					</div>
				</div>
			</dialog>
		</main>
	);
}
