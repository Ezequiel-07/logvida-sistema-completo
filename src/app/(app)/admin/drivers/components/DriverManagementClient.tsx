
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import type { User } from "@/types/user";
import type { Vehicle } from "@/types/vehicle";
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
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  deleteDoc,
  doc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toISOString } from "@/lib/utils";
import { createTeamMember } from "@/server/actions/users";

const driverFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido").min(1, "E-mail é obrigatório"),
  role: z.enum(["admin", "driver"]),
  phone: z.string().optional(),
  vehicleId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
})
.refine((data) => {
    // Se a senha foi fornecida, a confirmação também deve ser e devem corresponder.
    if (data.password) {
        if (!data.confirmPassword) return false;
        if (data.password.length < 6) return false;
        return data.password === data.confirmPassword;
    }
    return true; // Se não houver senha, não há nada a validar aqui.
}, {
    message: "As senhas não coincidem ou são muito curtas (mín. 6 caracteres).",
    path: ["confirmPassword"], // O erro aparecerá no campo de confirmação de senha
});

type DriverFormData = z.infer<typeof driverFormSchema>;


export default function DriverManagementClient() {
  const { currentUser, isLoading: isAuthLoading } = useAuth();
  const [drivers, setDrivers] = useState<User[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDriverDialogOpen, setIsDriverDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<User | null>(null);
  const [isSavingDriver, setIsSavingDriver] = useState(false);
  const [driverToDelete, setDriverToDelete] = useState<User | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);


  const form = useForm<DriverFormData>({
    resolver: zodResolver(driverFormSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "driver",
      phone: "",
      vehicleId: "",
      password: "",
      confirmPassword: "",
      isActive: true,
    },
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!currentUser || currentUser.role !== "admin") {
        setDrivers([]);
        setVehicles([]);
        return;
      }
      // CORREÇÃO: Busca apenas usuários que são 'driver' ou 'admin'.
      const usersQuery = query(
        collection(db, "users"),
        where("role", "in", ["driver", "admin"]),
      );
      const vehiclesQuery = query(
        collection(db, "vehicles"),
        orderBy("name"),
      );

      const [usersSnapshot, vehiclesSnapshot] = await Promise.all([
        getDocs(usersQuery),
        getDocs(vehiclesQuery),
      ]);

      const loadedVehicles = vehiclesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Vehicle[];
      setVehicles(loadedVehicles);

      const loadedDrivers = usersSnapshot.docs.map((doc) => {
        const data = doc.data();
        const vehicle = loadedVehicles.find(
          (v) => v.id === data.vehicleId,
        );
        return {
          id: doc.id,
          name: data.name || "",
          email: data.email || "",
          role: data.role || "driver",
          phone: data.phone || null,
          vehicleId: data.vehicleId || null,
          vehicle: vehicle || null,
          createdAt: toISOString(data.createdAt) || new Date().toISOString(),
          isActive: data.isActive ?? true,
          notificationSettings:
            data.notificationSettings || {
              /* defaults */
            },
          profilePictureUrl: data.profilePictureUrl || null,
          salaryDetails: data.salaryDetails || null,
        } as User;
      });

      loadedDrivers.sort((a, b) => a.name.localeCompare(b.name));
      setDrivers(loadedDrivers);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
      toast({
        title: "Erro ao Carregar",
        description: "Não foi possível carregar os motoristas e veículos.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!isAuthLoading) {
      fetchData();
    }
  }, [isAuthLoading, fetchData]);

  const filteredDrivers = useMemo(() => {
    if (!searchTerm) {
      return drivers;
    }
    return drivers.filter(
      (driver) =>
        driver.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        driver.email.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [drivers, searchTerm]);

  const handleOpenNewDriverDialog = () => {
    setEditingDriver(null);
    form.reset({
      name: "",
      email: "",
      phone: "",
      vehicleId: null,
      password: "",
      confirmPassword: "",
      isActive: true,
      role: "driver",
    });
    form.clearErrors();
    setIsDriverDialogOpen(true);
  };

  const handleOpenEditDriverDialog = (driver: User) => {
    setEditingDriver(driver);
    form.reset({
      name: driver.name,
      email: driver.email,
      phone: driver.phone || "",
      vehicleId: driver.vehicleId || null,
      password: "",
      confirmPassword: "",
      isActive: driver.isActive,
      // CORREÇÃO: Garante que o role seja apenas 'admin' ou 'driver'
      role: driver.role === 'admin' ? 'admin' : 'driver',
    });
    form.clearErrors();
    setIsDriverDialogOpen(true);
  };

  const handleDriverFormSubmit = async (data: DriverFormData) => {
    setIsSavingDriver(true);
    try {
      if (editingDriver) {
        // --- EDITING LOGIC ---
        const batch = writeBatch(db);
        const userRef = doc(db, "users", editingDriver.id);
        batch.update(userRef, {
          name: data.name,
          phone: data.phone || null,
          isActive: data.isActive,
          vehicleId: data.vehicleId || null,
          role: data.role,
        });

        // If vehicle assignment changed
        if (editingDriver.vehicleId !== data.vehicleId) {
          // Unassign old vehicle
          if (editingDriver.vehicleId) {
            const oldVehicleRef = doc(db, "vehicles", editingDriver.vehicleId);
            batch.update(oldVehicleRef, {
              assignedDriverId: null,
              assignedDriverName: null,
            });
          }
          // Assign new vehicle
          if (data.vehicleId) {
            const newVehicleRef = doc(db, "vehicles", data.vehicleId);
            batch.update(newVehicleRef, {
              assignedDriverId: editingDriver.id,
              assignedDriverName: data.name,
            });
          }
        }
        await batch.commit();
      } else {
        // --- CREATING LOGIC using Server Action ---
        if (!data.password) {
          // Should be caught by form validation, but good to have a check
          throw new Error("A senha é obrigatória para novos membros.");
        }
        
        const result = await createTeamMember({
            name: data.name,
            email: data.email,
            password: data.password,
            role: data.role,
            phone: data.phone,
            vehicleId: data.vehicleId,
            isActive: data.isActive
        });
        
        if (!result.success) {
            // Throw an error with the message from the server action
            throw new Error(result.error || "Falha ao criar membro da equipe no servidor.");
        }
      }

      toast({
        title: editingDriver ? "Atualizado" : "Criado",
        description: `Membro da equipe ${editingDriver ? "atualizado" : "cadastrado"}.`,
      });
      fetchData();
      setIsDriverDialogOpen(false);
    } catch (err: any) {
      toast({
        title: "Erro ao Salvar",
        description: err.message || "Ocorreu um erro desconhecido.",
        variant: "destructive",
      });
    } finally {
      setIsSavingDriver(false);
    }
  };

  const openDeleteDialog = (driver: User) => {
    setDriverToDelete(driver);
    setIsDeleteConfirmOpen(true);
  };

  const handleDeleteDriver = async () => {
    if (!driverToDelete) return;
    setIsSavingDriver(true);
    const batch = writeBatch(db);
    try {
      const userRef = doc(db, "users", driverToDelete.id);
      batch.delete(userRef);

      // Unassign vehicle if one was assigned
      if (driverToDelete.vehicleId) {
        const vehicleRef = doc(db, "vehicles", driverToDelete.vehicleId);
        batch.update(vehicleRef, {
          assignedDriverId: null,
          assignedDriverName: null,
        });
      }

      await batch.commit();
      toast({
        title: "Membro da Equipe Excluído",
        description: `O registro de "${driverToDelete.name}" foi removido.`,
      });
      fetchData();
    } catch (err) {
      toast({
        title: "Erro ao Excluir",
        description: "Não foi possível remover o membro da equipe.",
        variant: "destructive",
      });
    } finally {
      setIsDeleteConfirmOpen(false);
      setDriverToDelete(null);
      setIsSavingDriver(false);
    }
  };

  const availableVehiclesForSelect = useMemo(() => {
    return vehicles.filter(
      (v) =>
        !v.assignedDriverId || v.assignedDriverId === editingDriver?.id,
    );
  }, [vehicles, editingDriver]);

  const isLastAdmin = editingDriver?.role === 'admin' && drivers.filter(d => d.role === 'admin').length === 1;

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <Input
          placeholder="Buscar membros da equipe..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <Button onClick={handleOpenNewDriverDialog}>Novo Membro da Equipe</Button>
      </div>

      <Card>
        {isLoading ? (
          <div className="text-center py-10">
            <Icons.loader className="animate-spin w-6 h-6 mx-auto" />
            <p className="mt-2 text-muted-foreground">Carregando...</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDrivers.map((driver) => (
                <TableRow key={driver.id}>
                  <TableCell>{driver.name}</TableCell>
                  <TableCell>{driver.email}</TableCell>
                  <TableCell>
                    <Badge variant={driver.role === 'admin' ? 'default' : 'secondary'}>
                      {driver.role === 'admin' ? 'Admin' : 'Motorista'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={driver.isActive ? "default" : "secondary"}>
                      {driver.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>{driver.vehicle?.name || "-"}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Abrir menu</span>
                          <Icons.moreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleOpenEditDriverDialog(driver)}
                        >
                          <Icons.edit className="mr-2 h-4 w-4" />
                          <span>Editar</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => openDeleteDialog(driver)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Icons.delete className="mr-2 h-4 w-4" />
                          <span>Excluir</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={isDriverDialogOpen} onOpenChange={setIsDriverDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingDriver ? "Editar Membro da Equipe" : "Novo Membro da Equipe"}
            </DialogTitle>
            <DialogDescription>
              {editingDriver
                ? "Atualize os dados do membro da equipe."
                : "Cadastre um novo membro no sistema."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={form.handleSubmit(handleDriverFormSubmit)}
            className="space-y-4 pt-4"
          >
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-destructive text-xs mt-1">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...form.register("email")}
                disabled={!!editingDriver}
              />
              {form.formState.errors.email && (
                <p className="text-destructive text-xs mt-1">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>
            {!editingDriver && (
              <>
                <div>
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    {...form.register("password")}
                  />
                  {form.formState.errors.password && (
                    <p className="text-destructive text-xs mt-1">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    {...form.register("confirmPassword")}
                  />
                  {form.formState.errors.confirmPassword && (
                    <p className="text-destructive text-xs mt-1">
                      {form.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>
              </>
            )}
             <div>
              <Label htmlFor="role">Função</Label>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isLastAdmin}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma função" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="driver">Motorista</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {isLastAdmin && (
                <p className="text-xs text-muted-foreground mt-1">
                  Não é possível alterar a função do último administrador.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="phone">Telefone (Opcional)</Label>
              <Input id="phone" {...form.register("phone")} />
            </div>
            <div>
              <Label htmlFor="vehicleId">Veículo Atribuído</Label>
              <Controller
                control={form.control}
                name="vehicleId"
                render={({ field }) => (
                  <Select
                    onValueChange={(value) => field.onChange(value === "--none--" ? null : value)}
                    value={field.value ?? "--none--"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhum veículo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="--none--">Nenhum veículo</SelectItem>
                      {availableVehiclesForSelect.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name} ({v.plate})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Controller
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <Switch
                    id="isActive"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="isActive">Membro Ativo</Label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDriverDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSavingDriver}>
                {isSavingDriver && (
                  <Icons.loader className="w-4 h-4 mr-2 animate-spin" />
                )}
                {editingDriver ? "Salvar Alterações" : "Cadastrar Membro"}
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
              Tem certeza que deseja excluir &quot;{driverToDelete?.name}&quot;? Esta ação não pode ser desfeita. A conta de autenticação associada não será removida e precisa ser gerenciada manualmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDriver}
              disabled={isSavingDriver}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isSavingDriver && (
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

    