
"use client";

import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@/app/globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";
import Script from "next/script";
import type { ReactNode } from "react";
import { getFirebaseApp } from "@/lib/firebase";

// Garante que o Firebase seja inicializado quando o aplicativo for carregado no cliente.
// É seguro chamar isso aqui porque getFirebaseApp lida com a lógica de singleton.
if (typeof window !== "undefined") {
  try {
    getFirebaseApp();
  } catch (error) {
    console.error("Falha na inicialização do Firebase no RootLayout:", error);
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>LogVida</title>
          <meta name="description" content="LogVida - Gerenciamento Logístico Inteligente" />
          <link rel="icon" href="/favicon.ico" />
          <meta name="theme-color" media="(prefers-color-scheme: light)" content="#2E8B57" />
          <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1a1a1a" />
      </head>
      <body className="font-sans antialiased">
        <Providers>
          {children}
          <Toaster />
        </Providers>

        <Script id="before-install-prompt" strategy="afterInteractive">
          {`
            window.addEventListener('beforeinstallprompt', (e) => {
              // Prevent the mini-infobar from appearing on mobile
              e.preventDefault();
              // Stash the event so it can be triggered later.
              window.deferredPrompt = e;
              // Dispatch a custom event to inform React components that the prompt is ready.
              const event = new CustomEvent('pwa-prompt-ready', { detail: e });
              window.dispatchEvent(event);
            });
          `}
        </Script>
      </body>
    </html>
  );
}
