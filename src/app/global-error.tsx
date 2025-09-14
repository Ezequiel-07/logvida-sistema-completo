"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Idealmente, você logaria este erro para um serviço de monitoramento
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
          <div className="max-w-md text-center">
            <Icons.warning className="mx-auto h-16 w-16 text-destructive mb-6" />
            <h1 className="text-3xl font-bold text-destructive mb-4">
              Algo deu errado!
            </h1>
            <p className="text-muted-foreground mb-6">
              Lamentamos, mas um erro inesperado ocorreu. Nossa equipe já foi
              notificada (simulação). Por favor, tente recarregar a página ou
              volte mais tarde.
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              {error?.message && `Detalhe do erro (dev): ${error.message}`}
              {error?.digest && ` (Digest: ${error.digest})`}
            </p>
            <Button onClick={() => reset()} size="lg">
              <Icons.repeat className="mr-2 h-4 w-4" />
              Tentar Novamente
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
