import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SiteNav } from "@/components/site-nav";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Two demos that split a problem in two: code does what code is better at, and TypeSafe's Jev answers the part that needs to know what something means.";

export const metadata: Metadata = {
  // Required for the opengraph-image files to resolve to absolute URLs, which
  // is the only kind a social card reader will fetch.
  metadataBase: new URL("https://lab.saeed.sh"),
  title: "Jev demos",
  description: DESCRIPTION,
  // No description on openGraph on purpose: each page sets its own, and Next
  // fills og:description and twitter:description from whichever one resolves.
  openGraph: {
    type: "website",
    siteName: "lab.saeed.sh",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SiteNav />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
