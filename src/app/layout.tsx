import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import AuthSync from "@/components/AuthSync";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var raw = localStorage.getItem('smartrack:theme-settings');
                  if (raw) {
                    var s = JSON.parse(raw);
                    if (s.accent) document.documentElement.setAttribute('data-accent', s.accent);
                    var isDark = s.mode === 'dark' || (s.mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                    if (isDark) {
                      document.documentElement.classList.add('dark');
                      document.documentElement.setAttribute('data-mode', 'dark');
                    } else {
                      document.documentElement.classList.remove('dark');
                      document.documentElement.setAttribute('data-mode', 'light');
                    }
                  } else {
                    document.documentElement.setAttribute('data-accent', 'ocean');
                    document.documentElement.setAttribute('data-mode', 'light');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)] font-sans antialiased transition-colors">
        <Suspense fallback={null}>
          <AuthSync />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
