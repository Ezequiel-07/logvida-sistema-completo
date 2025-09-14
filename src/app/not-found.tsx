
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <div className="max-w-md text-center">
        <Icons.mapPin className="mx-auto h-16 w-16 text-primary mb-6" />
        <h1 className="text-4xl font-bold mb-4">404 - Página Não Encontrada</h1>
        <p className="text-muted-foreground mb-6">
          Oops! A página que você está procurando não existe. Ela pode ter sido
          movida ou excluída.
        </p>
        <Button asChild>
          <Link href="/">
            <Icons.home className="mr-2 h-4 w-4" />
            Voltar para a Página Inicial
          </Link>
        </Button>
      </div>
    </div>
  );
}
