import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
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
  title: "ttype — text with character",
  description:
    "A monospace editor for rich terminal documents. Style your text visually and export real ANSI escape codes.",
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
