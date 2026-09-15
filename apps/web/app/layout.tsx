import "@workspace/ui/globals.css"
import { Metadata, Viewport } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import NextTopLoader from "nextjs-toploader"
import { AppProviders } from "@/providers/app-providers"
import { cn } from "@workspace/ui/lib/utils"

export const metadata: Metadata = {
  title: "Monorepo Agents",
  description:
    "A small library of extremely crafted, copy-paste components for chat agents, thinking states, human-in-the-loop approvals, and everything agents need to talk to humans beautifully.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fafaf7",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        GeistSans.variable,
        GeistMono.variable,
      )}
    >
      <body className="font-sans">
        <NextTopLoader color="var(--ink)" showSpinner={false} />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
