
"use client";

import Link from "next/link";
import React from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import Image from "next/image";

const PasswordResetEmailSentPage = () => {
  return (
    <>
      <Link href="/" className="mb-6 relative w-20 h-20">
        <Image src="/logvida-logo.png" alt="LogVida Logo" fill sizes="80px" className="object-contain" />
      </Link>
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
            <Icons.mail className="h-12 w-12 mx-auto text-primary" />
            <CardTitle className="mt-4">Verifique seu E-mail</CardTitle>
            <CardDescription>
                Um link de redefinição de senha foi enviado para o seu endereço de e-mail. Por favor, verifique sua caixa de entrada e pasta de spam.
            </CardDescription>
        </CardHeader>
        <CardFooter>
            <Button variant="outline" asChild className="w-full">
                <Link href="/login">
                    Voltar para o Login
                </Link>
            </Button>
        </CardFooter>
      </Card>
    </>
  );
};

export default PasswordResetEmailSentPage;
