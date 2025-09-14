
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";
import type { Quote } from "@/types/quote";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDateDisplay, toISOString } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

const quoteStatusTranslations: Record<Quote["status"], string> = {
  pending: "Pendente",
  contacted: "Contatado",
  converted: "Convertido",
};

const getStatusBadgeVariant = (status: Quote["status"]) => {
  switch (status) {
    case "converted":
      return "default";
    case "contacted":
      return "secondary";
    case "pending":
    default:
      return "outline";
  }
};

const stopTypeTranslations: Record<string, string> = {
  origin: 'Origem',
  intermediate: 'Parada',
  destination: 'Destino',
};

export default function QuoteListClient() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  
  const [selectedVisitorQuote, setSelectedVisitorQuote] = useState<Quote | null>(null);
  const [selectedClientQuote, setSelectedClientQuote] = useState<Quote | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  
  const [quoteToUpdateStatus, setQuoteToUpdateStatus] = useState<Quote | null>(null);
  const [newStatus, setNewStatus] = useState<Quote['status']>('pending');
  const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null);

  const clearPendingQuotesNotification = useCallback(() => {
    localStorage.setItem('hasPendingQuotes', 'false');
    window.dispatchEvent(new Event('storage')); 
  }, []);

  useEffect(() => {
    setIsLoading(true);
    const quotesCollectionRef = collection(db, "quotes");
    const q = query(quotesCollectionRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const quotesData = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            read: data.read ?? false,
            createdAt: toISOString(data.createdAt) || new Date().toISOString(),
          } as Quote;
        });
        setQuotes(quotesData);
        setIsLoading(false);
      },
      (error) => {
        console.error("Erro ao buscar orçamentos:", error);
        toast({
          title: "Erro ao Carregar",
          description: "Não foi possível buscar os orçamentos.",
          variant: "destructive",
        });
        setIsLoading(false);
      }
    );
    
    clearPendingQuotesNotification();

    return () => unsubscribe();
  }, [clearPendingQuotesNotification]);

  const { visitorQuotes, clientQuotes, hasUnreadVisitor, hasUnreadClient } = useMemo(() => {
    const result = quotes.reduce(
      (acc, quote) => {
        if (quote.clientId) {
          acc.clientQuotes.push(quote);
          if (!quote.read) acc.hasUnreadClient = true;
        } else {
          acc.visitorQuotes.push(quote);
          if (!quote.read) acc.hasUnreadVisitor = true;
        }
        return acc;
      },
      { 
        visitorQuotes: [] as Quote[], 
        clientQuotes: [] as Quote[],
        hasUnreadVisitor: false,
        hasUnreadClient: false
      }
    );
    return result;
  }, [quotes]);
  
  const markAsRead = async (quoteId: string) => {
      try {
        const quoteRef = doc(db, "quotes", quoteId);
        await updateDoc(quoteRef, { read: true });
        // Optimistic UI update
        setQuotes(prev => prev.map(q => q.id === quoteId ? {...q, read: true} : q));
      } catch (error) {
          // No need to toast, it's a background operation
      }
  }

  useEffect(() => {
    if (selectedVisitorQuote) {
      setAdminNotes(selectedVisitorQuote.adminNotes || "");
      if (!selectedVisitorQuote.read) {
          markAsRead(selectedVisitorQuote.id);
      }
    }
  }, [selectedVisitorQuote]);
  
  useEffect(() => {
    if (selectedClientQuote) {
       if (!selectedClientQuote.read) {
          markAsRead(selectedClientQuote.id);
      }
    }
  }, [selectedClientQuote]);

  const handleOpenUpdateDialog = (quote: Quote) => {
    setQuoteToUpdateStatus(quote);
    setNewStatus(quote.status);
  };
  
  const handleUpdateStatus = async () => {
    if (!quoteToUpdateStatus) return;
    setIsUpdating(true);
    try {
      const quoteRef = doc(db, "quotes", quoteToUpdateStatus.id);
      await updateDoc(quoteRef, { status: newStatus });
      toast({ title: "Status Atualizado", description: `O orçamento foi marcado como "${quoteStatusTranslations[newStatus]}".` });
      if(selectedClientQuote?.id === quoteToUpdateStatus.id) {
          setSelectedClientQuote(prev => prev ? {...prev, status: newStatus} : null);
      }
      if(selectedVisitorQuote?.id === quoteToUpdateStatus.id) {
          setSelectedVisitorQuote(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (error) {
      toast({ title: "Erro ao Atualizar", description: "Não foi possível alterar o status.", variant: "destructive" });
    } finally {
      setIsUpdating(false);
      setQuoteToUpdateStatus(null);
    }
  };

  const handleSaveAdminNotes = async () => {
    if (!selectedVisitorQuote) return;
    setIsUpdating(true);
    try {
      const quoteRef = doc(db, "quotes", selectedVisitorQuote.id);
      await updateDoc(quoteRef, { adminNotes: adminNotes });
      toast({ title: "Anotações Salvas", description: "Suas anotações foram salvas com sucesso." });
      // Optimistically update the local state
      setSelectedVisitorQuote(prev => prev ? { ...prev, adminNotes: adminNotes } : null);
    } catch (error) {
      toast({ title: "Erro ao Salvar Anotações", variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };
  
  const handleConfirmDelete = async () => {
    if (!quoteToDelete) return;
    setIsUpdating(true);
    try {
        await deleteDoc(doc(db, "quotes", quoteToDelete.id));
        toast({title: "Orçamento Excluído"});
        if (selectedVisitorQuote?.id === quoteToDelete.id) setSelectedVisitorQuote(null);
        if (selectedClientQuote?.id === quoteToDelete.id) setSelectedClientQuote(null);
    } catch (error) {
        toast({title: "Erro ao excluir", variant: "destructive"});
    } finally {
        setIsUpdating(false);
        setQuoteToDelete(null);
    }
  }
  
  const handleSaveVisitorAsClient = (quote: Quote) => {
    const params = new URLSearchParams();
    params.set('fromQuote', 'true');
    params.set('companyName', quote.name);
    params.set('cnpj', quote.document);
    params.set('email', quote.email);
    params.set('phone', quote.phone);
    router.push(`/clients?${params.toString()}`);
  }

  const handleConvertToOrder = (quote: Quote) => {
    const params = new URLSearchParams();
    params.set('fromQuote', 'true');
    
    if (quote.clientId) {
      params.set('clientId', quote.clientId);
    }
    
    // For visitor quotes, we pass basic info to the new client form instead
    if (!quote.clientId) {
        handleSaveVisitorAsClient(quote);
        return;
    }

    if (quote.boxCount) {
        params.set('numberOfBoxes', String(quote.boxCount));
    }
    
    if (quote.origin?.address) {
      params.set('origin_address', quote.origin.address);
      if (quote.origin.name) params.set('origin_name', quote.origin.name);
      if (quote.origin.instructions) params.set('origin_instructions', quote.origin.instructions);
    }
    if (quote.destination?.address) {
      params.set('destination_address', quote.destination.address);
      if (quote.destination.name) params.set('destination_name', quote.destination.name);
      if (quote.destination.instructions) params.set('destination_instructions', quote.destination.instructions);
    }
    quote.intermediateStops?.forEach((stop, index) => {
        if(stop.address) {
          const prefix = `intermediate_${index}`;
          params.append(`${prefix}_address`, stop.address);
          if (stop.name) params.append(`${prefix}_name`, stop.name);
          if (stop.instructions) params.append(`${prefix}_instructions`, stop.instructions);
        }
    })

    router.push(`/pricing?${params.toString()}`);
  }

  const renderStopDetails = (stop: Quote['origin'], type: string, key?: string | number) => {
    if (!stop?.address) return null;
    return (
      <div key={key} className="text-sm p-2 bg-background rounded-md border">
        <p className="font-semibold text-primary">{stopTypeTranslations[type] || 'Parada'}: {stop.name || 'N/A'}</p>
        <p className="text-muted-foreground">{stop.address}</p>
        {stop.instructions && <p className="text-xs mt-1 text-foreground/80"><i>Instruções: {stop.instructions}</i></p>}
      </div>
    );
  };
  
  const renderUnreadIndicator = () => (
    <div className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
    </div>
  );

  return (
    <Tabs defaultValue="visitors">
      <TabsList className="mb-4">
        <TabsTrigger value="visitors">
            Solicitações de Visitantes {hasUnreadVisitor && renderUnreadIndicator()}
        </TabsTrigger>
        <TabsTrigger value="clients">
            Pedidos de Clientes {hasUnreadClient && renderUnreadIndicator()}
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="visitors">
        <div className="grid md:grid-cols-[1fr_2fr] gap-4">
          <div>
            <h4 className="font-semibold mb-2">Solicitações Recebidas</h4>
            <ScrollArea className="h-[60vh] border rounded-lg">
                <Table>
                    <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Nome</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={3} className="text-center h-24"><Icons.loader className="animate-spin h-6 w-6 mx-auto" /></TableCell></TableRow>
                        ) : visitorQuotes.length > 0 ? (
                            visitorQuotes.map((quote) => (
                            <TableRow key={quote.id} onClick={() => setSelectedVisitorQuote(quote)} className="cursor-pointer" data-state={selectedVisitorQuote?.id === quote.id ? 'selected' : undefined}>
                                <TableCell>{formatDateDisplay(quote.createdAt)}</TableCell>
                                <TableCell className="flex items-center gap-2">{!quote.read && renderUnreadIndicator()} {quote.name}</TableCell>
                                <TableCell><Badge variant={getStatusBadgeVariant(quote.status)}>{quoteStatusTranslations[quote.status]}</Badge></TableCell>
                            </TableRow>
                            ))
                        ) : (
                            <TableRow><TableCell colSpan={3} className="text-center h-24 text-muted-foreground">Nenhuma solicitação de visitantes ainda.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </ScrollArea>
          </div>
          <div>
            {selectedVisitorQuote ? (
                <Card className="h-full flex flex-col">
                    <CardHeader className="flex flex-row justify-between items-start">
                        <div>
                            <CardTitle>Detalhes da Solicitação</CardTitle>
                            <CardDescription>{selectedVisitorQuote.name}</CardDescription>
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><Icons.moreVertical /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem onClick={() => handleOpenUpdateDialog(selectedVisitorQuote)}><Icons.edit className="mr-2 h-4 w-4"/> Alterar Status</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleSaveVisitorAsClient(selectedVisitorQuote)}><Icons.user className="mr-2 h-4 w-4"/> Converter em Cliente</DropdownMenuItem>
                                <DropdownMenuSeparator/>
                                <DropdownMenuItem onClick={() => setQuoteToDelete(selectedVisitorQuote)} className="text-destructive focus:text-destructive"><Icons.delete className="mr-2 h-4 w-4"/> Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </CardHeader>
                    <CardContent className="space-y-4 flex-grow">
                        <div className="text-sm">
                            <p><strong>Contato:</strong> {selectedVisitorQuote.email}, {selectedVisitorQuote.phone}</p>
                            <p><strong>CNPJ/CPF:</strong> {selectedVisitorQuote.document}</p>
                        </div>
                        <blockquote className="border-l-2 pl-4 italic text-sm">&quot;{selectedVisitorQuote.message}&quot;</blockquote>
                        <Separator/>
                        <div>
                            <Label htmlFor="admin-notes">Anotações do Administrador</Label>
                            <Textarea id="admin-notes" value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={3} />
                        </div>
                    </CardContent>
                    <CardFooter className="justify-end gap-2">
                        <Button variant="outline" onClick={handleSaveAdminNotes} disabled={isUpdating}>
                            {isUpdating ? <Icons.loader className="animate-spin mr-2"/> : <Icons.check className="mr-2"/>} Salvar Anotações
                        </Button>
                    </CardFooter>
                </Card>
            ) : (
                <div className="flex items-center justify-center h-full border rounded-lg bg-muted/50">
                  <p className="text-muted-foreground">Selecione uma solicitação para ver os detalhes</p>
                </div>
            )}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="clients">
        <div className="grid md:grid-cols-[1fr_2fr] gap-4">
            <div>
              <h4 className="font-semibold mb-2">Pedidos de Clientes</h4>
               <ScrollArea className="h-[60vh] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={3} className="text-center h-24"><Icons.loader className="animate-spin h-6 w-6 mx-auto" /></TableCell></TableRow>
                    ) : clientQuotes.length > 0 ? (
                      clientQuotes.map((quote) => (
                        <TableRow key={quote.id} onClick={() => setSelectedClientQuote(quote)} className="cursor-pointer" data-state={selectedClientQuote?.id === quote.id ? 'selected' : undefined}>
                          <TableCell className="flex items-center gap-2">{!quote.read && renderUnreadIndicator()} {quote.name}</TableCell>
                          <TableCell>{formatDateDisplay(quote.createdAt)}</TableCell>
                          <TableCell><Badge variant={getStatusBadgeVariant(quote.status)}>{quoteStatusTranslations[quote.status]}</Badge></TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow><TableCell colSpan={3} className="text-center h-24 text-muted-foreground">Nenhum pedido de clientes ainda.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
               </ScrollArea>
            </div>
            <div>
               {selectedClientQuote ? (
                  <Card className="h-full flex flex-col">
                      <CardHeader className="flex flex-row justify-between items-start">
                        <div>
                          <CardTitle>Detalhes do Pedido</CardTitle>
                           <p className="text-sm text-muted-foreground">{selectedClientQuote.name}</p>
                        </div>
                        <div className="flex gap-2">
                           <Button variant="default" size="sm" onClick={() => handleConvertToOrder(selectedClientQuote)} disabled={isUpdating}>
                               <Icons.plusCircle className="mr-2 h-4 w-4"/> Converter em Ordem
                           </Button>
                           <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><Icons.moreVertical /></Button></DropdownMenuTrigger>
                              <DropdownMenuContent>
                                  <DropdownMenuItem onClick={() => handleOpenUpdateDialog(selectedClientQuote)}><Icons.edit className="mr-2 h-4 w-4"/> Alterar Status</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setQuoteToDelete(selectedClientQuote)} className="text-destructive focus:text-destructive"><Icons.delete className="mr-2 h-4 w-4"/> Excluir Pedido</DropdownMenuItem>
                              </DropdownMenuContent>
                           </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="flex-grow">
                          <ScrollArea className="h-full pr-4">
                            <div className="space-y-4">
                              {selectedClientQuote.boxCount && (
                                <p><strong>Qtd. Caixas:</strong> {selectedClientQuote.boxCount}</p>
                              )}
                              {selectedClientQuote.message && (
                                <blockquote className="border-l-2 pl-4 italic">&quot;{selectedClientQuote.message}&quot;</blockquote>
                              )}
                              <div className="space-y-2">
                                {renderStopDetails(selectedClientQuote.origin, 'origin')}
                                {selectedClientQuote.intermediateStops?.map((stop, index) => renderStopDetails(stop, 'intermediate', `intermediate-${index}`))}
                                {renderStopDetails(selectedClientQuote.destination, 'destination')}
                              </div>
                            </div>
                          </ScrollArea>
                      </CardContent>
                  </Card>
               ) : (
                 <div className="flex items-center justify-center h-full border rounded-lg bg-muted/50">
                    <p className="text-muted-foreground">Selecione um pedido para ver os detalhes</p>
                 </div>
               )}
            </div>
        </div>
      </TabsContent>

      {/* Dialogs */}
      <AlertDialog open={!!quoteToUpdateStatus} onOpenChange={(open) => !open && setQuoteToUpdateStatus(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Alterar Status do Orçamento</AlertDialogTitle>
                <AlertDialogDescription>Selecione o novo status para esta solicitação.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
                <Select value={newStatus} onValueChange={(value) => setNewStatus(value as Quote['status'])}>
                    <SelectTrigger><SelectValue placeholder="Selecione um status" /></SelectTrigger>
                    <SelectContent>{Object.entries(quoteStatusTranslations).map(([key, value]) => (<SelectItem key={key} value={key}>{value}</SelectItem>))}</SelectContent>
                </Select>
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setQuoteToUpdateStatus(null)}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleUpdateStatus} disabled={isUpdating || newStatus === quoteToUpdateStatus?.status}>
                    {isUpdating && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />} Salvar
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        
      <AlertDialog open={!!quoteToDelete} onOpenChange={(open) => !open && setQuoteToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                <AlertDialogDescription>Tem certeza que deseja excluir esta solicitação de {quoteToDelete?.name}? Esta ação não pode ser desfeita.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmDelete} disabled={isUpdating} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                    {isUpdating && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />} Excluir
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}
