
"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import type { Client } from "@/types/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
  where,
} from "firebase/firestore";
import { toISOString } from "@/lib/utils";
import { createClientUser } from "@/server/actions/users";
import { useSearchParams, useRouter } from "next/navigation";


const clientFormSchema = z.object({
  cnpj: z
    .string()
    .min(1, "CNPJ é obrigatório")
    .regex(
      /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$|^\d{14}$/,
      "CNPJ inválido. Use XX.XXX.XXX/XXXX-XX ou 14 dígitos.",
    ),
  companyName: z.string().min(1, "Nome da empresa é obrigatório"),
  address: z.string().min(1, "Endereço é obrigatório"),
  email: z.string().email("E-mail inválido").min(1, "E-mail é obrigatório"),
  phone: z.string().min(10, "Telefone inválido").max(15, "Telefone inválido"),
});
type ClientFormData = z.infer<typeof clientFormSchema>;

const portalAccessFormSchema = z.object({
  email: z.string().email("Por favor, insira um e-mail válido."),
});
type PortalAccessFormData = z.infer<typeof portalAccessFormSchema>;

export function ClientManagementClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [isFetchingCnpj, setIsFetchingCnpj] = useState(false);

  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const [isPortalAccessDialogOpen, setIsPortalAccessDialogOpen] =
    useState(false);
  const [clientForPortal, setClientForPortal] = useState<Client | null>(null);
  const [isCreatingPortalAccess, setIsCreatingPortalAccess] = useState(false);

  const portalAccessForm = useForm<PortalAccessFormData>({
    resolver: zodResolver(portalAccessFormSchema),
  });

  const clientForm = useForm<ClientFormData>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      cnpj: "",
      companyName: "",
      address: "",
      email: "",
      phone: "",
    },
  });

  // Effect to pre-fill form from URL params
  useEffect(() => {
    const fromQuote = searchParams.get('fromQuote');
    if (fromQuote === 'true') {
      const cnpj = searchParams.get('cnpj') || '';
      const companyName = searchParams.get('companyName') || '';
      const email = searchParams.get('email') || '';
      const phone = searchParams.get('phone') || '';
      
      clientForm.reset({
        cnpj: cnpj,
        companyName: companyName,
        address: '', // Address is not available from quote
        email: email,
        phone: phone,
      });
      
      setIsClientDialogOpen(true);
      // Clean up URL params
      router.replace('/clients', undefined);
    }
  }, [searchParams, clientForm, router]);


  const fetchClients = async () => {
    setIsLoading(true);
    try {
      const clientsCollectionRef = collection(db, "clients");
      const q = query(clientsCollectionRef, orderBy("companyName", "asc"));
      const querySnapshot = await getDocs(q);
      const clientsData = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          cnpj: data.cnpj,
          companyName: data.companyName,
          address: data.address,
          email: data.email,
          phone: data.phone,
          createdAt:
            toISOString(doc.data().createdAt) || new Date().toISOString(),
        };
      }) as Client[];
      setClients(clientsData);
    } catch (error: unknown) {
      toast({
        title: "Erro ao Carregar Clientes",
        description: "Não foi possível buscar os dados dos clientes.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleFetchCnpjData = async (cnpjValue: string) => {
    if (!cnpjValue) return;

    const cleanedCnpj = cnpjValue.replace(/\D/g, "");
    if (cleanedCnpj.length !== 14) {
      toast({
        title: "CNPJ Inválido",
        description: "O CNPJ deve conter 14 dígitos.",
        variant: "default",
      });
      return;
    }

    setIsFetchingCnpj(true);
    clientForm.clearErrors();

    try {
      const response = await fetch(
        `https://brasilapi.com.br/api/cnpj/v1/${cleanedCnpj}`,
      );
      if (!response.ok) {
        if (response.status === 404) {
          toast({
            title: "CNPJ não encontrado",
            description:
              "O CNPJ informado não foi encontrado na base de dados.",
            variant: "default",
          });
          clientForm.setError("cnpj", {
            type: "manual",
            message: "CNPJ não encontrado na BrasilAPI.",
          });
        } else {
          const errorData: any = await response.json().catch(() => ({}));
          toast({
            title: "Erro na API",
            description: `Falha ao consultar CNPJ: ${
              errorData.message || response.statusText
            }`,
            variant: "destructive",
          });
          clientForm.setError("cnpj", {
            type: "manual",
            message: "Erro ao consultar API.",
          });
        }
        return;
      }
      const data: any = await response.json();

      if (data.razao_social)
        clientForm.setValue("companyName", data.razao_social, {
          shouldValidate: true,
        });

      const addressParts = [];
      if (data.descricao_tipo_de_logradouro)
        addressParts.push(data.descricao_tipo_de_logradouro);
      if (data.logradouro) addressParts.push(data.logradouro);
      const streetAndType = addressParts.join(" ");

      let fullAddress = streetAndType;
      if (data.numero) fullAddress += `, ${data.numero}`;
      if (data.complemento) fullAddress += ` - ${data.complemento}`;
      if (data.bairro) fullAddress += ` - ${data.bairro}`;
      if (data.municipio) fullAddress += `, ${data.municipio}`;
      if (data.uf) fullAddress += ` - ${data.uf}`;
      if (data.cep)
        fullAddress += `, CEP: ${data.cep
          .replace(/\D/g, "")
          .replace(/^(\d{5})(\d{3})$/, "$1-$2")}`;

      if (fullAddress)
        clientForm.setValue(
          "address",
          fullAddress.trim().replace(/^, |^ - /, ""),
          { shouldValidate: true },
        );

      if (data.email)
        clientForm.setValue("email", data.email, { shouldValidate: true });

      let phoneNumber = "";
      if (data.ddd_telefone_1) {
        const ddd = data.ddd_telefone_1.substring(0, 2);
        const number = data.ddd_telefone_1.substring(2);
        phoneNumber = `(${ddd}) ${number}`;
      } else if (data.telefone) {
        phoneNumber = data.telefone;
      }
      if (phoneNumber)
        clientForm.setValue("phone", phoneNumber.slice(0, 15), {
          shouldValidate: true,
        });

      toast({
        title: "Dados do CNPJ Carregados",
        description: "Campos preenchidos com informações da API.",
      });
    } catch (error: unknown) {
      toast({
        title: "Erro ao Consultar CNPJ",
        description: "Não foi possível buscar os dados do CNPJ.",
        variant: "destructive",
      });
      clientForm.setError("cnpj", {
        type: "manual",
        message: "Falha na consulta à API.",
      });
    } finally {
      setIsFetchingCnpj(false);
    }
  };

  const handleOpenNewClientDialog = () => {
    setEditingClient(null);
    clientForm.reset({
      cnpj: "",
      companyName: "",
      address: "",
      email: "",
      phone: "",
    });
    clientForm.clearErrors();
    setIsClientDialogOpen(true);
  };

  const handleOpenPortalAccessDialog = (client: Client) => {
    setClientForPortal(client);
    portalAccessForm.reset({ email: client.email }); // Pre-fill with client's main email
    setIsPortalAccessDialogOpen(true);
  };

  const handleCreatePortalAccess = async (data: PortalAccessFormData) => {
    if (!clientForPortal) return;
    setIsCreatingPortalAccess(true);
    const result = await createClientUser({
      email: data.email,
      clientId: clientForPortal.id,
      clientName: clientForPortal.companyName,
    });
    if (result.success) {
      toast({
        title: "Acesso ao Portal Criado!",
        description: `Um usuário para ${data.email} foi criado. Envie o link para o cliente definir a senha.`,
      });
      // You might want to copy the link to clipboard here.
      setIsPortalAccessDialogOpen(false);
    } else {
      toast({
        title: "Erro ao Criar Acesso",
        description: result.error,
        variant: "destructive",
      });
    }
    setIsCreatingPortalAccess(false);
  };

  const handleOpenEditClientDialog = (client: Client) => {
    setEditingClient(client);
    clientForm.reset(client);
    clientForm.clearErrors();
    setIsClientDialogOpen(true);
  };

  const handleClientFormSubmit = async (data: ClientFormData) => {
    setIsSavingClient(true);
    const clientsCollectionRef = collection(db, "clients");

    if (editingClient) {
      try {
        const { ...updateData } = data;
        const clientRef = doc(db, "clients", editingClient.id);
        await updateDoc(clientRef, updateData);
        toast({
          title: "Cliente Atualizado",
          description: `Cliente "${data.companyName}" foi atualizado.`,
        });
        fetchClients();
      } catch (error: unknown) {
        toast({
          title: "Erro",
          description: "Não foi possível atualizar o cliente.",
          variant: "destructive",
        });
      }
    } else {
      try {
        const q = query(clientsCollectionRef, where("cnpj", "==", data.cnpj));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          clientForm.setError("cnpj", {
            type: "manual",
            message: "Este CNPJ já está cadastrado.",
          });
          setIsSavingClient(false);
          return;
        }

        const newClientData = {
          ...data,
          createdAt: Timestamp.fromDate(new Date()),
        };
        await addDoc(clientsCollectionRef, newClientData);
        toast({
          title: "Cliente Cadastrado",
          description: `Cliente "${data.companyName}" salvo.`,
        });
        fetchClients();
      } catch (error: unknown) {
        toast({
          title: "Erro",
          description: "Não foi possível cadastrar o cliente.",
          variant: "destructive",
        });
      }
    }
    setIsClientDialogOpen(false);
    setEditingClient(null);
    setIsSavingClient(false);
  };

  const confirmDeleteClient = (client: Client) => {
    setClientToDelete(client);
    setIsDeleteConfirmOpen(true);
  };

  const handleDeleteClient = async () => {
    if (clientToDelete) {
      setIsSavingClient(true);
      try {
        const clientRef = doc(db, "clients", clientToDelete.id);
        await deleteDoc(clientRef);
        toast({
          title: "Cliente Excluído",
          description: `Cliente "${clientToDelete.companyName}" foi excluído.`,
        });
        fetchClients();
        setClientToDelete(null);
      } catch (error: unknown) {
        toast({
          title: "Erro",
          description: "Não foi possível excluir o cliente.",
          variant: "destructive",
        });
      } finally {
        setIsSavingClient(false);
      }
    }
    setIsDeleteConfirmOpen(false);
  };

  const filteredClients = clients.filter(
    (client) =>
      client.cnpj.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-xl text-muted-foreground">
          Carregando clientes...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative flex-grow w-full sm:w-auto">
          <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por CNPJ, nome ou email..."
            className="pl-10 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/orders">
              <Icons.clipboardList className="mr-2 h-4 w-4" /> Ir para Ordens de Serviço
            </Link>
          </Button>
          <Button
            onClick={handleOpenNewClientDialog}
            className="w-full sm:w-auto"
          >
            <Icons.plusCircle className="mr-2 h-4 w-4" /> Cadastrar Novo Cliente
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-2 py-3 sm:px-4">CNPJ</TableHead>
              <TableHead className="px-2 py-3 sm:px-4">
                Nome da Empresa
              </TableHead>
              <TableHead className="px-2 py-3 sm:px-4">Email</TableHead>
              <TableHead className="px-2 py-3 sm:px-4">Telefone</TableHead>
              <TableHead className="text-right px-2 py-3 sm:px-4">
                Ações
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClients.length > 0 ? (
              filteredClients.map((client) => (
                <TableRow key={client.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium px-2 py-3 sm:px-4">
                    {client.cnpj}
                  </TableCell>
                  <TableCell className="px-2 py-3 sm:px-4">
                    {client.companyName}
                  </TableCell>
                  <TableCell className="px-2 py-3 sm:px-4">
                    {client.email}
                  </TableCell>
                  <TableCell className="px-2 py-3 sm:px-4">
                    {client.phone}
                  </TableCell>
                  <TableCell className="text-right px-2 py-3 sm:px-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Icons.moreVertical className="h-4 w-4" />
                          <span className="sr-only">Ações</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => handleOpenEditClientDialog(client)}
                          className="cursor-pointer"
                        >
                          <Icons.edit className="mr-2 h-4 w-4" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleOpenPortalAccessDialog(client)}
                          className="cursor-pointer"
                        >
                          <Icons.logIn className="mr-2 h-4 w-4" /> Criar Acesso
                          ao Portal
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => confirmDeleteClient(client)}
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                        >
                          <Icons.delete className="mr-2 h-4 w-4" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground px-2 py-3 sm:px-4"
                >
                  Nenhum cliente encontrado. Cadastre um novo cliente.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isClientDialogOpen} onOpenChange={setIsClientDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingClient ? "Editar Cliente" : "Cadastrar Novo Cliente"}
            </DialogTitle>
            <DialogDescription>
              {editingClient
                ? "Atualize os dados do cliente."
                : "Preencha os dados para cadastrar um novo cliente."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto pr-2">
            <form
              onSubmit={clientForm.handleSubmit(handleClientFormSubmit)}
              className="space-y-4 pt-4"
            >
              <div>
                <Label htmlFor="cnpj">CNPJ</Label>
                <div className="relative">
                  <Input
                    id="cnpj"
                    placeholder="00.000.000/0000-00"
                    {...clientForm.register("cnpj")}
                    disabled={isSavingClient || isFetchingCnpj || !!editingClient}
                    onBlur={(e) => {
                      if (!editingClient && e.target.value) {
                        handleFetchCnpjData(e.target.value);
                      }
                    }}
                  />
                  {isFetchingCnpj && (
                    <Icons.loader className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
                  )}
                </div>
                {clientForm.formState.errors.cnpj && (
                  <p className="text-xs text-destructive mt-1">
                    {clientForm.formState.errors.cnpj.message}
                  </p>
                )}
                {!!editingClient && (
                  <p className="text-xs text-muted-foreground mt-1">
                    O CNPJ não pode ser alterado após o cadastro.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="companyName">Nome da Empresa</Label>
                <Input
                  id="companyName"
                  {...clientForm.register("companyName")}
                  disabled={isSavingClient || isFetchingCnpj}
                />
                {clientForm.formState.errors.companyName && (
                  <p className="text-xs text-destructive mt-1">
                    {clientForm.formState.errors.companyName.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="address">Endereço Completo</Label>
                <Input
                  id="address"
                  {...clientForm.register("address")}
                  disabled={isSavingClient || isFetchingCnpj}
                />
                {clientForm.formState.errors.address && (
                  <p className="text-xs text-destructive mt-1">
                    {clientForm.formState.errors.address.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  {...clientForm.register("email")}
                  disabled={isSavingClient || isFetchingCnpj}
                />
                {clientForm.formState.errors.email && (
                  <p className="text-xs text-destructive mt-1">
                    {clientForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(XX) XXXXX-XXXX"
                  {...clientForm.register("phone")}
                  disabled={isSavingClient || isFetchingCnpj}
                />
                {clientForm.formState.errors.phone && (
                  <p className="text-xs text-destructive mt-1">
                    {clientForm.formState.errors.phone.message}
                  </p>
                )}
              </div>
              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsClientDialogOpen(false)}
                  disabled={isSavingClient || isFetchingCnpj}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSavingClient || isFetchingCnpj}>
                  {(isSavingClient || isFetchingCnpj) && (
                    <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingClient ? "Salvar Alterações" : "Salvar Cliente"}
                </Button>
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isPortalAccessDialogOpen}
        onOpenChange={setIsPortalAccessDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Criar Acesso ao Portal para {clientForPortal?.companyName}
            </DialogTitle>
            <DialogDescription>
              Isso criará um novo usuário para que este cliente possa acessar o
              portal. Um e-mail com instruções para definir a senha será gerado
              (simulado para fins de desenvolvimento).
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={portalAccessForm.handleSubmit(handleCreatePortalAccess)}
            className="space-y-4 pt-4"
          >
            <div>
              <Label htmlFor="portal-email">E-mail de Acesso do Cliente</Label>
              <Input
                id="portal-email"
                type="email"
                {...portalAccessForm.register("email")}
              />
              {portalAccessForm.formState.errors.email && (
                <p className="text-xs text-destructive mt-1">
                  {portalAccessForm.formState.errors.email.message}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsPortalAccessDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isCreatingPortalAccess}>
                {isCreatingPortalAccess && (
                  <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                )}
                Criar Acesso
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cliente &quot;
              {clientToDelete?.companyName}&quot;? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setIsDeleteConfirmOpen(false);
                setClientToDelete(null);
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteClient}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isSavingClient}
            >
              {isSavingClient && (
                <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
