
"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { submitQuote } from "@/server/actions/quotes";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { useSearchParams } from 'next/navigation';

// Esquema de validação simplificado para o novo formulário.
const quoteFormSchema = z.object({
  document: z.string().refine((doc) => {
    const cleaned = doc.replace(/\D/g, '');
    return cleaned.length === 11 || cleaned.length === 14;
  }, "Por favor, insira um CPF (11 dígitos) ou CNPJ (14 dígitos) válido."),
  name: z.string().min(3, "O nome é obrigatório"),
  email: z.string().email("Por favor, insira um e-mail válido."),
  phone: z.string().min(10, "O telefone é obrigatório."),
  message: z.string().min(10, "A mensagem deve ter pelo menos 10 caracteres.").max(1000, "A mensagem não pode exceder 1000 caracteres."),
});

type QuoteFormData = z.infer<typeof quoteFormSchema>;

export default function QuoteClient() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isFetchingCnpj, setIsFetchingCnpj] = useState(false);
  const searchParams = useSearchParams();

  const form = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      document: "",
      name: "",
      email: "",
      phone: "",
      message: "",
    },
  });
  
  const { register, handleSubmit, watch, setValue, formState: { errors } } = form;

  useEffect(() => {
    const messageParam = searchParams.get('message');
    if (messageParam) {
      setValue('message', messageParam);
    }
  }, [searchParams, setValue]);

  const handleFetchCnpjData = async (documentValue: string) => {
    if (!documentValue) return;
    const cleanedCnpj = documentValue.replace(/\D/g, "");
    if (cleanedCnpj.length !== 14) return; 

    setIsFetchingCnpj(true);
    form.clearErrors("document");
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanedCnpj}`);
      if (!response.ok) return; 
      
      const data = await response.json();
      if (data.razao_social) setValue("name", data.razao_social, { shouldValidate: true });
      if (data.email) setValue("email", data.email, { shouldValidate: true });

      const phone = data.ddd_telefone_1 || data.ddd_telefone_2;
      if(phone) setValue("phone", phone, { shouldValidate: true });

    } catch (error) {
        // Fail silently
    } finally {
        setIsFetchingCnpj(false);
    }
  }
  
  const onSubmit = async (data: QuoteFormData) => {
    setIsSubmitting(true);
    
    try {
        const result = await submitQuote(data);
        if (result.success) {
            toast({ title: "Solicitação Enviada!", description: "Recebemos sua mensagem e entraremos em contato em breve." });
            setIsSubmitted(true);
            form.reset();
        } else {
            toast({ title: "Erro ao Enviar", description: result.error || "Dados inválidos.", variant: "destructive" });
        }
    } catch (error) {
        toast({ title: "Erro Inesperado", description: "Ocorreu um erro. Tente novamente.", variant: "destructive" });
    }
    
    setIsSubmitting(false);
  };
  
  if (isSubmitted) {
    return (
        <Card className="w-full max-w-2xl text-center p-8">
            <Icons.checkCircle className="h-16 w-16 mx-auto text-green-500 mb-4" />
            <CardTitle className="text-2xl">Obrigado!</CardTitle>
            <CardDescription className="mt-2">Sua solicitação foi enviada com sucesso. Nossa equipe entrará em contato em breve para finalizar os detalhes.</CardDescription>
            <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
                <Button onClick={() => setIsSubmitted(false)}>Fazer Nova Solicitação</Button>
                <Button asChild variant="outline">
                    <Link href="/">Voltar para o Site</Link>
                </Button>
            </div>
        </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-2xl">Solicitar um Orçamento</CardTitle>
        <CardDescription>
          Preencha seus dados e envie sua dúvida ou necessidade. Nossa equipe entrará em contato rapidamente.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-6">
          
          <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
             <h3 className="font-semibold text-lg">Seus Dados</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <Label htmlFor="document">CPF / CNPJ</Label>
                    <div className="relative">
                        <Input id="document" {...register("document")} disabled={isSubmitting || isFetchingCnpj} onBlur={(e) => handleFetchCnpjData(e.target.value)} />
                        {isFetchingCnpj && <Icons.loader className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />}
                    </div>
                    {errors.document && <p className="text-xs text-destructive mt-1">{errors.document.message}</p>}
                </div>
                 <div>
                    <Label htmlFor="name">Nome Completo / Razão Social</Label>
                    <Input id="name" {...register("name")} disabled={isSubmitting || isFetchingCnpj} />
                    {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
                 </div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" type="email" {...register("email")} disabled={isSubmitting || isFetchingCnpj}/>
                    {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
                 </div>
                 <div>
                    <Label htmlFor="phone">Celular (WhatsApp)</Label>
                    <Input id="phone" type="tel" {...register("phone")} disabled={isSubmitting || isFetchingCnpj}/>
                    {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone.message}</p>}
                 </div>
             </div>
          </div>

          <div className="space-y-2 p-4 border rounded-lg">
             <Label htmlFor="message" className="font-semibold text-lg">Mensagem</Label>
             <Textarea 
                id="message" 
                {...register("message")} 
                disabled={isSubmitting} 
                rows={5}
                placeholder="Olá, gostaria de saber mais sobre os preços para transporte de materiais para a área da saúde entre Tubarão e Florianópolis..."
              />
             {errors.message && <p className="text-xs text-destructive mt-1">{errors.message.message}</p>}
          </div>
          
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
             {isSubmitting && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}
            Enviar Solicitação
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
