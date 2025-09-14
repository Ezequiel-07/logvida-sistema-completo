
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase"; // Assuming you have your firebase app initialized here
import { toast } from "@/hooks/use-toast"; // Assuming you have a toast component for feedback
import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { Icons } from "@/components/icons";
import Image from "next/image";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    if (!email) {
      toast({ title: "Erro", description: "Por favor, insira seu email." });
      setLoading(false);
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      toast({
        title: "Sucesso",
        description: "Link de redefinição de senha enviado para o seu email.",
      });
      router.push("/forgot-password/sent"); // Redirect to a confirmation page
    } catch (error) {
      const authError = error as FirebaseError;
      toast({
        title: "Erro ao enviar link",
        description:
          authError.message ||
          "Ocorreu um erro ao tentar enviar o link de redefinição.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Link href="/" className="mb-6 relative w-20 h-20">
        <Image src="/logvida-logo.png" alt="LogVida Logo" fill sizes="80px" className="object-contain" />
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Esqueceu a senha?</CardTitle>
          <CardDescription>
            Digite seu email abaixo para receber um link para redefinir sua
            senha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Icons.loader className="mr-2 h-4 w-4 animate-spin"/>}
                {loading ? "Enviando..." : "Enviar link de redefinição"}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
            <Button variant="link" asChild>
                <Link href="/login">Voltar para o login</Link>
            </Button>
        </CardFooter>
      </Card>
    </>
  );
}
