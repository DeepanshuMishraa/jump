import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import appCss from "../styles.css?url";

const siteUrl = "https://tanstack-start-app.d4deepanshu723.workers.dev";
const siteTitle = "Jump: Fast Chrome Tab Switcher & Command Palette";
const siteDescription =
	"Jump is a fast, private Chrome tab switcher with visual previews and fuzzy search. Switch open tabs instantly from your keyboard and stay in flow.";
const ogImageUrl = `${siteUrl}/og-image.jpg`;

const structuredData = {
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "WebSite",
			"@id": `${siteUrl}/#website`,
			url: siteUrl,
			name: "Jump",
			description: siteDescription,
			inLanguage: "en",
		},
		{
			"@type": "SoftwareApplication",
			"@id": `${siteUrl}/#software`,
			name: "Jump",
			description: siteDescription,
			url: siteUrl,
			image: ogImageUrl,
			applicationCategory: "BrowserApplication",
			operatingSystem: "ChromeOS, macOS, Windows, Linux",
			browserRequirements: "Requires a Chromium-based browser",
			softwareVersion: "0.1.6",
			featureList: [
				"Visual tab switcher",
				"Fuzzy tab search",
				"Keyboard-first tab actions",
				"Private and offline operation",
			],
			offers: {
				"@type": "Offer",
				price: 0,
				priceCurrency: "USD",
				availability: "https://schema.org/InStock",
			},
			author: {
				"@type": "Person",
				name: "Deepanshu Mishra",
				url: "https://linkedin.com/in/deepanshum",
				sameAs: [
					"https://github.com/DeepanshuMishraa",
					"https://x.com/dipxsyy",
				],
			},
		},
	],
};

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{ title: siteTitle },
			{ name: "description", content: siteDescription },
			{
				name: "robots",
				content:
					"index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
			},
			{ name: "theme-color", content: "#fff0df" },
			{ name: "application-name", content: "Jump" },
			{ property: "og:site_name", content: "Jump" },
			{ property: "og:title", content: siteTitle },
			{ property: "og:description", content: siteDescription },
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: siteUrl },
			{ property: "og:locale", content: "en_US" },
			{ property: "og:image", content: ogImageUrl },
			{ property: "og:image:secure_url", content: ogImageUrl },
			{ property: "og:image:type", content: "image/jpeg" },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{
				property: "og:image:alt",
				content: "Jump — a fast, private Chrome tab switcher",
			},
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: siteTitle },
			{ name: "twitter:description", content: siteDescription },
			{ name: "twitter:image", content: ogImageUrl },
			{
				name: "twitter:image:alt",
				content: "Jump — a fast, private Chrome tab switcher",
			},
			{ name: "twitter:site", content: "@dipxsyy" },
		],
		links: [
			{ rel: "canonical", href: siteUrl },
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/icon.svg",
			},
			{ rel: "icon", type: "image/png", sizes: "32x32", href: "/icon-32.png" },
			{
				rel: "apple-touch-icon",
				sizes: "180x180",
				href: "/apple-touch-icon.png",
			},
			{ rel: "stylesheet", href: appCss },
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<script type="application/ld+json">
					{JSON.stringify(structuredData)}
				</script>
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
