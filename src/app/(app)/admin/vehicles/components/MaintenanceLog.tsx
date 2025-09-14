
"use client";

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { Icons } from '@/components/icons';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { toISOString } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';


export interface MaintenanceRecord {
    id: string;
    vehicleId: string;
    vehicleName: string;
    date: string; // ISO String
    mileage: number;
    type: string;
    cost: number;
    notes?: string;
}

interface MaintenanceLogProps {
  onAdd: () => void;
  onEdit: (record: MaintenanceRecord) => void;
  onDelete: (record: MaintenanceRecord) => void;
}

export function MaintenanceLog({ onAdd, onEdit, onDelete }: MaintenanceLogProps) {
    const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchMaintenanceRecords = useCallback(() => {
        setIsLoading(true);
        const q = query(collection(db, 'vehicleMaintenance'), orderBy('date', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const records = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    date: toISOString(data.date) || new Date().toISOString(),
                } as MaintenanceRecord;
            });
            setMaintenanceRecords(records);
            setIsLoading(false);
        }, (error) => {
            console.error("Erro ao buscar manutenções:", error);
            toast({ title: "Erro ao buscar registros", variant: "destructive" });
            setIsLoading(false);
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        const unsubscribe = fetchMaintenanceRecords();
        return () => unsubscribe();
    }, [fetchMaintenanceRecords]);
    
    const formatCurrency = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button onClick={onAdd}>
                    <Icons.plusCircle className="mr-2" /> Novo Registro
                </Button>
            </div>
            {isLoading ? (
                <div className="text-center py-10"><Icons.loader className="animate-spin w-6 h-6 mx-auto" /></div>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Veículo</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Quilometragem</TableHead>
                            <TableHead>Custo</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {maintenanceRecords.length > 0 ? maintenanceRecords.map(record => (
                            <TableRow key={record.id}>
                                <TableCell>{format(new Date(record.date), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>{record.vehicleName}</TableCell>
                                <TableCell>{record.type}</TableCell>
                                <TableCell>{record.mileage.toLocaleString('pt-BR')} km</TableCell>
                                <TableCell>{formatCurrency(record.cost)}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0"><Icons.moreVertical className="h-4 w-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem onClick={() => onEdit(record)}><Icons.edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => onDelete(record)} className="text-destructive focus:text-destructive"><Icons.delete className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        )) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">Nenhum registro de manutenção encontrado.</TableCell>
                          </TableRow>
                        )}
                    </TableBody>
                </Table>
            )}
        </div>
    );
}
