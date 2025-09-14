
"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import type { Vehicle } from "@/types/vehicle";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  getDocs,
  orderBy,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { toast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { MaintenanceLog, type MaintenanceRecord } from "./MaintenanceLog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const vehicleFormSchema = z.object({
  name: z.string().min(1, "O nome do veículo é obrigatório."),
  plate: z
    .string()
    .min(7, "A placa deve ter pelo menos 7 caracteres.")
    .max(8, "A placa pode ter no máximo 8 caracteres.")
    .regex(
      /^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/i,
      "Formato de placa inválido (Ex: ABC-1234 ou ABC1D23).",
    ),
  costs: z.object({
    fuelConsumption: z.coerce.number().positive("O consumo deve ser um número positivo."),
    maintenanceCostPerKm: z.coerce.number().min(0, "O custo não pode ser negativo."),
    tireCostPerKm: z.coerce.number().min(0, "O custo não pode ser negativo."),
    depreciationPerKm: z.coerce.number().min(0, "O custo não pode ser negativo."),
  }),
});

type VehicleFormData = z.infer<typeof vehicleFormSchema>;

const maintenanceSchema = z.object({
    vehicleId: z.string().min(1, 'Selecione um veículo'),
    date: z.string().min(1, 'A data é obrigatória'),
    mileage: z.coerce.number().min(0, 'A quilometragem não pode ser negativa'),
    type: z.string().min(1, 'O tipo de manutenção é obrigatório'),
    cost: z.coerce.number().min(0, 'O custo não pode ser negativo'),
    notes: z.string().optional(),
});

type MaintenanceFormData = z.infer<typeof maintenanceSchema>;

export default function VehicleManagementClient() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isVehicleDialogOpen, setIsVehicleDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  
  const [isMaintenanceDialogOpen, setIsMaintenanceDialogOpen] = useState(false);
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState<MaintenanceRecord | null>(null);
  const [maintenanceToDelete, setMaintenanceToDelete] = useState<MaintenanceRecord | null>(null);


  const vehicleForm = useForm<VehicleFormData>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: { name: "", plate: "", costs: { fuelConsumption: 12, maintenanceCostPerKm: 0.08, tireCostPerKm: 0.05, depreciationPerKm: 0.38 } },
  });

  const maintenanceForm = useForm<MaintenanceFormData>({
    resolver: zodResolver(maintenanceSchema),
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const vehiclesQuery = query(collection(db, "vehicles"), orderBy("name"));
      const vehiclesSnapshot = await getDocs(vehiclesQuery);
      const loadedVehicles = vehiclesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle));
      setVehicles(loadedVehicles);
    } catch (err) {
      console.error("Erro ao carregar veículos:", err);
      toast({ title: "Erro ao Carregar Veículos", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenVehicleDialog = (vehicle: Vehicle | null = null) => {
    setEditingVehicle(vehicle);
    if (vehicle) {
      vehicleForm.reset({ 
          name: vehicle.name, 
          plate: vehicle.plate, 
          costs: {
            fuelConsumption: vehicle.costs.fuelConsumption,
            maintenanceCostPerKm: vehicle.costs.maintenanceCostPerKm ?? (vehicle.costs as any).maintenanceCost / 10000 ?? 0.08,
            tireCostPerKm: vehicle.costs.tireCostPerKm ?? (vehicle.costs as any).tireCost ?? 0.05,
            depreciationPerKm: vehicle.costs.depreciationPerKm ?? (vehicle.costs as any).depreciation ?? 0.38,
          }
      });
    } else {
      vehicleForm.reset({ name: "Fiat Fiorino Endurance", plate: "", costs: { fuelConsumption: 12, maintenanceCostPerKm: 0.08, tireCostPerKm: 0.05, depreciationPerKm: 0.38 } });
    }
    setIsVehicleDialogOpen(true);
  };
  
  const handleOpenMaintenanceDialog = (maintenance: MaintenanceRecord | null = null) => {
    setEditingMaintenance(maintenance);
    if (maintenance) {
      maintenanceForm.reset({
        vehicleId: maintenance.vehicleId,
        date: format(new Date(maintenance.date), 'yyyy-MM-dd'),
        mileage: maintenance.mileage,
        type: maintenance.type,
        cost: maintenance.cost,
        notes: maintenance.notes || '',
      });
    } else {
      maintenanceForm.reset({
        vehicleId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        mileage: 0,
        type: '',
        cost: 0,
        notes: '',
      });
    }
    setIsMaintenanceDialogOpen(true);
  };
  
  const handleVehicleSubmit = async (data: VehicleFormData) => {
    setIsSaving(true);
    try {
      if (editingVehicle) {
        await updateDoc(doc(db, "vehicles", editingVehicle.id), { ...data, updatedAt: Timestamp.now() });
        toast({ title: "Veículo atualizado." });
      } else {
        await addDoc(collection(db, "vehicles"), { ...data, createdAt: Timestamp.now() });
        toast({ title: "Veículo cadastrado." });
      }
      fetchData();
      setIsVehicleDialogOpen(false);
    } catch (error) {
      toast({ title: "Erro ao Salvar", description: "Não foi possível salvar o veículo.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleMaintenanceSubmit = async (data: MaintenanceFormData) => {
    setIsSavingMaintenance(true);
    try {
        const selectedVehicle = vehicles.find(v => v.id === data.vehicleId);
        if (!selectedVehicle) {
            toast({ title: "Veículo não encontrado", variant: "destructive" });
            return;
        }

        const recordData = {
            ...data,
            vehicleName: selectedVehicle.name,
            date: Timestamp.fromDate(new Date(data.date)),
        };

        if (editingMaintenance) {
            await updateDoc(doc(db, 'vehicleMaintenance', editingMaintenance.id), recordData);
            toast({ title: "Registro de Manutenção Atualizado" });
        } else {
            await addDoc(collection(db, 'vehicleMaintenance'), recordData);
            toast({ title: "Registro de Manutenção Adicionado" });
        }

        setIsMaintenanceDialogOpen(false);
    } catch (error) {
        toast({ title: `Erro ao ${editingMaintenance ? 'atualizar' : 'adicionar'} registro`, variant: "destructive" });
    } finally {
        setIsSavingMaintenance(false);
    }
  };

  const handleDeleteVehicle = async () => {
    if (!vehicleToDelete) return;
    if (vehicleToDelete.assignedDriverId) {
      toast({ title: "Ação Bloqueada", description: "Este veículo está atribuído a um motorista.", variant: "destructive" });
      setVehicleToDelete(null);
      return;
    }
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, "vehicles", vehicleToDelete.id));
      toast({ title: "Veículo excluído." });
      fetchData();
      setVehicleToDelete(null);
    } catch (error) {
      toast({ title: "Erro ao Excluir", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDeleteMaintenance = async () => {
    if(!maintenanceToDelete) return;
    setIsSavingMaintenance(true);
    try {
        await deleteDoc(doc(db, "vehicleMaintenance", maintenanceToDelete.id));
        toast({ title: "Registro de manutenção removido."});
    } catch(err) {
        toast({ title: "Erro ao remover registro.", variant: "destructive" });
    } finally {
        setMaintenanceToDelete(null);
        setIsSavingMaintenance(false);
    }
  };

  return (
    <>
      <Tabs defaultValue="fleet" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="fleet">Frota de Veículos</TabsTrigger>
          <TabsTrigger value="maintenance">Histórico de Manutenção</TabsTrigger>
        </TabsList>

        <TabsContent value="fleet" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => handleOpenVehicleDialog()}><Icons.plusCircle className="mr-2" /> Novo Veículo</Button>
          </div>
          {isLoading ? ( <div className="text-center py-10"><Icons.loader className="animate-spin w-6 h-6 mx-auto" /></div> ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Veículo</TableHead><TableHead>Placa</TableHead><TableHead>Motorista</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {vehicles.map((vehicle) => (
                  <TableRow key={vehicle.id}>
                    <TableCell>{vehicle.name}</TableCell>
                    <TableCell>{vehicle.plate}</TableCell>
                    <TableCell>{vehicle.assignedDriverName || <span className="text-muted-foreground italic">Nenhum</span>}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><Icons.moreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleOpenVehicleDialog(vehicle)}><Icons.edit className="mr-2 h-4 w-4" /> Editar Detalhes</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenMaintenanceDialog(null)}><Icons.plusCircle className="mr-2 h-4 w-4" /> Registrar Manutenção</DropdownMenuItem>
                          <Separator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setVehicleToDelete(vehicle)}><Icons.delete className="mr-2 h-4 w-4" /> Excluir Veículo</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
        <TabsContent value="maintenance" className="mt-6">
            <MaintenanceLog 
                onAdd={() => handleOpenMaintenanceDialog(null)}
                onEdit={(record) => handleOpenMaintenanceDialog(record)}
                onDelete={(record) => setMaintenanceToDelete(record)}
            />
        </TabsContent>
      </Tabs>

      <Dialog open={isVehicleDialogOpen} onOpenChange={setIsVehicleDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editingVehicle ? "Editar Veículo" : "Novo Veículo"}</DialogTitle><DialogDescription>Preencha os detalhes do veículo e seus custos estimados por KM para a precificação de rotas.</DialogDescription></DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto pr-2">
            <form onSubmit={vehicleForm.handleSubmit(handleVehicleSubmit)} className="space-y-6 py-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Nome do Veículo</Label>
                  <Controller name="name" control={vehicleForm.control} render={({ field }) => <Input {...field} id="name" disabled={isSaving} />} />
                  {vehicleForm.formState.errors.name && <p className="text-xs mt-1 text-destructive">{vehicleForm.formState.errors.name.message}</p>}
                </div>
                <div>
                  <Label htmlFor="plate">Placa</Label>
                  <Controller name="plate" control={vehicleForm.control} render={({ field }) => <Input {...field} id="plate" disabled={isSaving} />} />
                  {vehicleForm.formState.errors.plate && <p className="text-xs mt-1 text-destructive">{vehicleForm.formState.errors.plate.message}</p>}
                </div>
              </div>
              <Separator />
              <h4 className="text-md font-medium text-primary">Custos para Precificação</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fuelConsumption">Consumo de Combustível (km/L)</Label>
                  <Controller name="costs.fuelConsumption" control={vehicleForm.control} render={({ field }) => <Input {...field} id="fuelConsumption" type="number" step="0.1" disabled={isSaving} />} />
                  {vehicleForm.formState.errors.costs?.fuelConsumption && <p className="text-xs mt-1 text-destructive">{vehicleForm.formState.errors.costs.fuelConsumption.message}</p>}
                </div>
                <div>
                  <Label htmlFor="maintenanceCostPerKm">Custo de Manutenção (R$ / km)</Label>
                  <Controller name="costs.maintenanceCostPerKm" control={vehicleForm.control} render={({ field }) => <Input {...field} id="maintenanceCostPerKm" type="number" step="0.01" disabled={isSaving} />} />
                  {vehicleForm.formState.errors.costs?.maintenanceCostPerKm && <p className="text-xs mt-1 text-destructive">{vehicleForm.formState.errors.costs.maintenanceCostPerKm.message}</p>}
                </div>
                <div>
                  <Label htmlFor="tireCostPerKm">Custo de Pneus (R$ / km)</Label>
                  <Controller name="costs.tireCostPerKm" control={vehicleForm.control} render={({ field }) => <Input {...field} id="tireCostPerKm" type="number" step="0.01" disabled={isSaving} />} />
                  {vehicleForm.formState.errors.costs?.tireCostPerKm && <p className="text-xs mt-1 text-destructive">{vehicleForm.formState.errors.costs.tireCostPerKm.message}</p>}
                </div>
                <div>
                  <Label htmlFor="depreciationPerKm">Depreciação (R$ / km)</Label>
                  <Controller name="costs.depreciationPerKm" control={vehicleForm.control} render={({ field }) => <Input {...field} id="depreciationPerKm" type="number" step="0.01" disabled={isSaving} />} />
                  {vehicleForm.formState.errors.costs?.depreciationPerKm && <p className="text-xs mt-1 text-destructive">{vehicleForm.formState.errors.costs.depreciationPerKm.message}</p>}
                </div>
              </div>
              <DialogFooter className="pt-4"><Button type="button" variant="outline" onClick={() => setIsVehicleDialogOpen(false)} disabled={isSaving}>Cancelar</Button><Button type="submit" disabled={isSaving}>{isSaving && <Icons.loader className="animate-spin mr-2" />} Salvar Veículo</Button></DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!vehicleToDelete} onOpenChange={(open) => !open && setVehicleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle><AlertDialogDescription>Tem certeza de que deseja excluir o veículo &quot;{vehicleToDelete?.name}&quot;?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDeleteVehicle} disabled={isSaving} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">{isSaving && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />} Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isMaintenanceDialogOpen} onOpenChange={setIsMaintenanceDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{editingMaintenance ? 'Editar' : 'Adicionar'} Registro de Manutenção</DialogTitle>
                <DialogDescription>Preencha os detalhes da manutenção realizada.</DialogDescription>
            </DialogHeader>
            <form onSubmit={maintenanceForm.handleSubmit(handleMaintenanceSubmit)} className="space-y-4 pt-4">
                <div>
                    <Label htmlFor="vehicleId">Veículo</Label>
                    <Controller
                        name="vehicleId"
                        control={maintenanceForm.control}
                        render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value} disabled={isSavingMaintenance}>
                                <SelectTrigger id="vehicleId">
                                    <SelectValue placeholder="Selecione um veículo" />
                                </SelectTrigger>
                                <SelectContent>
                                    {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name} ({v.plate})</SelectItem>)}
                                </SelectContent>
                            </Select>
                        )}
                    />
                    {maintenanceForm.formState.errors.vehicleId && <p className="text-xs text-destructive mt-1">{maintenanceForm.formState.errors.vehicleId.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="date">Data</Label>
                        <Input id="date" type="date" {...maintenanceForm.register('date')} />
                        {maintenanceForm.formState.errors.date && <p className="text-xs text-destructive mt-1">{maintenanceForm.formState.errors.date.message}</p>}
                    </div>
                    <div>
                        <Label htmlFor="mileage">Quilometragem</Label>
                        <Input id="mileage" type="number" {...maintenanceForm.register('mileage')} />
                        {maintenanceForm.formState.errors.mileage && <p className="text-xs text-destructive mt-1">{maintenanceForm.formState.errors.mileage.message}</p>}
                    </div>
                </div>
                <div>
                    <Label htmlFor="type">Tipo de Manutenção</Label>
                    <Input id="type" placeholder="Ex: Troca de óleo e filtro" {...maintenanceForm.register('type')} />
                    {maintenanceForm.formState.errors.type && <p className="text-xs text-destructive mt-1">{maintenanceForm.formState.errors.type.message}</p>}
                </div>
                <div>
                    <Label htmlFor="cost">Custo (R$)</Label>
                    <Input id="cost" type="number" step="0.01" {...maintenanceForm.register('cost')} />
                    {maintenanceForm.formState.errors.cost && <p className="text-xs text-destructive mt-1">{maintenanceForm.formState.errors.cost.message}</p>}
                </div>
                  <div>
                    <Label htmlFor="notes">Notas (Opcional)</Label>
                    <Textarea id="notes" {...maintenanceForm.register('notes')} />
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsMaintenanceDialogOpen(false)} disabled={isSavingMaintenance}>Cancelar</Button>
                    <Button type="submit" disabled={isSavingMaintenance}>
                        {isSavingMaintenance && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}
                        Salvar Registro
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!maintenanceToDelete} onOpenChange={(open) => !open && setMaintenanceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir este registro de manutenção de {maintenanceToDelete?.vehicleName} do dia {maintenanceToDelete && format(new Date(maintenanceToDelete.date), 'dd/MM/yyyy')}? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteMaintenance} disabled={isSavingMaintenance} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                  {isSavingMaintenance && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}
                  Excluir
              </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
