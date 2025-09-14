import type { ReactNode } from "react";

// Este é um layout minimalista para páginas públicas.
// A estrutura principal <html> e <body>, bem como os provedores e o Toaster,
// são fornecidos pelo layout raiz (src/app/layout.tsx).
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-muted/30 p-4">
      {children}
    </div>
  );
}
