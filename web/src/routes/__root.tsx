import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Jump — Switch tabs at the speed of thought",
			},
			{
				name: "description",
				content:
					"A keyboard-first Chromium extension with a blazing visual switcher and fuzzy search command palette. Switch tabs instantly and stay in flow.",
			},
			{
				name: "theme-color",
				content: "#fff0df",
			},
			{
				property: "og:title",
				content: "Jump — Switch tabs at the speed of thought",
			},
			{
				property: "og:description",
				content:
					"A keyboard-first Chromium extension with a blazing visual switcher and fuzzy search command palette. Switch tabs instantly and stay in flow.",
			},
			{
				property: "og:type",
				content: "website",
			},
			{
				name: "twitter:card",
				content: "summary_large_image",
			},
			{
				name: "twitter:title",
				content: "Jump — Switch tabs at the speed of thought",
			},
			{
				name: "twitter:description",
				content:
					"A keyboard-first Chromium extension with a blazing visual switcher and fuzzy search command palette. Switch tabs instantly and stay in flow.",
			},
		],
		links: [
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/icon.svg",
			},
			{
				rel: "apple-touch-icon",
				href: "/icon.svg",
			},
			{
				rel: "stylesheet",
				href: appCss,
			},
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
