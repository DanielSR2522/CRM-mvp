import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import Script from "next/script";
import "./globals.css";
import AuthSync from "@/components/AuthSync";
import { BusinessLinesProvider } from "@/contexts/BusinessLinesContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SmarTrack CRM",
  description: "Insurance Agency CRM Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)] font-sans antialiased transition-colors">
        <Suspense fallback={null}>
          <AuthSync />
        </Suspense>
        <BusinessLinesProvider>
          {children}
        </BusinessLinesProvider>
      </body>
    </html>
  );
}
