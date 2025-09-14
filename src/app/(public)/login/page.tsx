
"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/icons";
import { useAuth } from "@/hooks/useAuth";
import { FirebaseError } from "firebase/app";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);

  const { login, currentUser, isLoading: isAuthLoading } = useAuth();

  useEffect(() => {
    // If auth is not loading and a user is already logged in, redirect them.
    if (!isAuthLoading && currentUser) {
      if (currentUser.role === "admin") {
        router.replace("/dashboard");
      } else if (currentUser.role === "driver") {
        router.replace("/driver-dashboard");
      } else if (currentUser.role === "client") {
        router.replace("/client-dashboard");
      } else {
        router.replace("/dashboard"); // Fallback
      }
    }
  }, [currentUser, isAuthLoading, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Email e senha são obrigatórios.");
      return;
    }

    setIsLoadingSubmit(true);

    try {
      await login(email, password);
      // The useEffect above will handle the redirect once currentUser is updated.
    } catch (authError) {
      if (authError instanceof FirebaseError && authError.code) {
        switch (authError.code) {
          case "auth/invalid-credential":
          case "auth/user-not-found":
          case "auth/wrong-password":
          case "auth/invalid-email":
            setError("Email ou senha inválidos. Verifique e tente novamente.");
            break;
          case "auth/too-many-requests":
            setError(
              "Muitas tentativas de login. Por favor, tente novamente mais tarde.",
            );
            break;
          default:
            setError("Ocorreu um erro ao tentar fazer login. Tente novamente.");
        }
      } else {
        setError("Ocorreu um erro desconhecido durante o login.");
      }
    } finally {
      setIsLoadingSubmit(false);
    }
  };

  // While checking auth state, we can show a general loading state to prevent the form from flashing.
  if (isAuthLoading) {
      return (
         <div className="flex flex-col items-center justify-center min-h-[200px]">
             <Icons.loader className="h-12 w-12 animate-spin text-primary" />
             <p className="mt-4 text-muted-foreground">Carregando...</p>
         </div>
      );
  }

  // If already logged in, the useEffect will redirect, we can show a message or loader here as well.
  if (currentUser) {
       return (
         <div className="flex flex-col items-center justify-center min-h-[200px]">
            <Icons.loader className="h-12 w-12 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">Redirecionando para o seu painel...</p>
         </div>
      );
  }

  return (
    <>
      <Link href="/" className="mb-6 relative w-20 h-20">
        <Image src="/logvida-logo.png" alt="LogVida Logo" fill sizes="80px" className="object-contain" />
      </Link>
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <CardDescription className="pt-2 text-lg">
            Acesse seu painel
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoadingSubmit}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoadingSubmit}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:bg-transparent"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <Icons.eyeOff className="h-5 w-5" />
                  ) : (
                    <Icons.eye className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive text-center" role="alert">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoadingSubmit}
              size="lg"
              aria-busy={isLoadingSubmit}
            >
              {isLoadingSubmit ? (
                <Icons.loader
                  className="mr-2 h-5 w-5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Icons.logIn className="mr-2 h-5 w-5" aria-hidden="true" />
              )}
              Entrar
            </Button>
          </form>

          <div className="mt-4 text-center text-sm">
            <Link
              href="/forgot-password"
              className="underline text-primary hover:text-primary/80"
            >
              Esqueceu a senha?
            </Link>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
