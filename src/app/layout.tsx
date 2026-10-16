import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

// The Google Fonts subsets omit box-drawing and block glyphs. Bundle the full
// official font so those characters share the text's metrics instead of fallback.
const jetbrainsMono = localFont({
  src: [
    {
      path: "./fonts/JetBrainsMono-Variable.ttf",
      weight: "100 800",
      style: "normal",
    },
    {
      path: "./fonts/JetBrainsMono-Italic-Variable.ttf",
      weight: "100 800",
      style: "italic",
    },
  ],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.title,
    template: "%s | ttype",
  },
  description: site.description,
  applicationName: site.name,
  category: "developer tools",
  openGraph: {
    type: "website",
    url: "/",
    locale: "en_US",
    siteName: site.name,
    title: site.title,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.description,
    images: [{ url: "/opengraph-image.png", alt: site.imageAlt }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        "font-mono",
        jetbrainsMono.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
