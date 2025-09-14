

import type { ReactNode } from "react";

// Este é um layout minimalista para páginas públicas.
// A estrutura principal <html> e <body>, bem como os provedores e o Toaster,
// são fornecidos pelo layout raiz (src/app/layout.tsx).
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-muted/30 dark:bg-card/20 p-4">
      {/* O conteúdo principal agora tem flex-grow para empurrar o rodapé para baixo */}
      <div className="flex flex-col items-center justify-center flex-grow w-full">
          {children}
      </div>
      <footer className="py-4 text-center text-xs text-muted-foreground w-full shrink-0">
            © {new Date().getFullYear()} LogVida - Vida em movimento. Todos os
            direitos reservados.
      </footer>
    </div>
  );
}
