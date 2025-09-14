
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import type { User } from "@/types/user";
import type { Vehicle, MaintenanceRecord } from "@/types/vehicle";
import type { Order } from "@/types/order";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, orderBy, doc, setDoc, where, getDoc, DocumentSnapshot } from "firebase/firestore";
import { toast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { startOfMonth, endOfMonth, addMonths, subMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FinancialChart } from "./components/FinancialChart";
import { toISOString } from "@/lib/utils";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";


const taxSettingsSchema = z.object({
  simplesNacionalRate: z.coerce.number().min(0, "A alíquota não pode ser negativa.").max(100, "A alíquota não pode ser maior que 100."),
});

const costItemSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, "O nome do custo é obrigatório."),
    value: z.coerce.number().min(0, "O valor do custo não pode ser negativo."),
});

const monthlyCostsSchema = z.object({
  generalCosts: z.array(costItemSchema).optional(),
  variableCosts: z.array(costItemSchema).optional(),
});
type MonthlyCostsFormData = z.infer<typeof monthlyCostsSchema>;

const administrativeCostsSchema = z.object({
    accountingCost: z.coerce.number().min(0, "O custo não pode ser negativo."),
    proLaboreValue: z.coerce.number().min(0, "O valor não pode ser negativo."),
    inssRateProLabore: z.coerce.number().min(0, "A alíquota não pode ser negativa.").max(100, "A alíquota não pode ser maior que 100."),
});

const driverCostsSchema = z.object({
  baseSalary: z.coerce.number().min(0, "O salário não pode ser negativo."),
  hazardPay: z.coerce.number().min(0, "O percentual é inválido.").max(100, "O percentual não pode ser maior que 100."),
  benefits: z.coerce.number().min(0, "O valor de benefícios é inválido."),
});

type TaxSettingsFormData = z.infer<typeof taxSettingsSchema>;
type AdministrativeCostsFormData = z.infer<typeof administrativeCostsSchema>;
type DriverCostsFormData = z.infer<typeof driverCostsSchema>;

const defaultTaxValues: TaxSettingsFormData = { simplesNacionalRate: 6 };
const defaultMonthlyCosts: MonthlyCostsFormData = { generalCosts: [{ name: "Custo Site/Hospedagem", value: 100 }], variableCosts: [] };
const defaultAdministrativeCostsValues: AdministrativeCostsFormData = { accountingCost: 500, proLaboreValue: 1412, inssRateProLabore: 11 };
const defaultDriverCostsValues: DriverCostsFormData = { baseSalary: 3000, hazardPay: 30, benefits: 750 };

const variableCostsFormSchema = taxSettingsSchema.extend({
  fuelPrice: z.coerce.number().positive("O preço do combustível deve ser positivo."),
});
type VariableCostsFormType = z.infer<typeof variableCostsFormSchema>;

export default function AccountingPage() {
  const [drivers, setDrivers] = useState<User[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDriverIdForSalary, setSelectedDriverIdForSalary] = useState<string>("");

  const variableCostsForm = useForm<VariableCostsFormType>({ resolver: zodResolver(variableCostsFormSchema), defaultValues: { ...defaultTaxValues, fuelPrice: 6.2 } });
  
  const monthlyCostsForm = useForm<MonthlyCostsFormData>({ resolver: zodResolver(monthlyCostsSchema), defaultValues: defaultMonthlyCosts });
  const { fields: generalCostFields, append: appendGeneralCost, remove: removeGeneralCost } = useFieldArray({ control: monthlyCostsForm.control, name: "generalCosts" });
  const { fields: variableCostFields, append: appendVariableCost, remove: removeVariableCost } = useFieldArray({ control: monthlyCostsForm.control, name: "variableCosts" });

  const administrativeCostsForm = useForm<AdministrativeCostsFormData>({ resolver: zodResolver(administrativeCostsSchema), defaultValues: defaultAdministrativeCostsValues });
  const driverCostsForm = useForm<DriverCostsFormData>({ resolver: zodResolver(driverCostsSchema), defaultValues: defaultDriverCostsValues });
  
  const watchedVariableCosts = variableCostsForm.watch();
  const watchedAdminCosts = administrativeCostsForm.watch();
  const watchedMonthlyCosts = monthlyCostsForm.watch();
  
  const calculateDriverMonthlyCost = useCallback((salaryDetails?: User["salaryDetails"]): number => {
    if (!salaryDetails) return 0;
    const baseSalary = Number(salaryDetails.baseSalary) || 0;
    const hazardPayPercent = Number(salaryDetails.hazardPay) || 0;
    const benefits = Number(salaryDetails.benefits) || 0;
    const hazardPayValue = baseSalary * (hazardPayPercent / 100);
    const grossSalary = baseSalary + hazardPayValue;
    const fgts = grossSalary * 0.08;
    const provision13th = grossSalary * 0.0833;
    const provisionVacation = grossSalary * 0.1111;
    return grossSalary + benefits + fgts + provision13th + provisionVacation;
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const driversQuery = query(collection(db, "users"), where("role", "in", ["driver", "admin"]));
      const vehiclesQuery = query(collection(db, "vehicles"), orderBy("name"));
      const ordersQuery = query(collection(db, "orders"));
      const maintenanceQuery = query(collection(db, "vehicleMaintenance"), orderBy("date", "desc"));
      const settingsRef = doc(db, "companySettings", "main");
      const monthId = format(currentMonth, 'yyyy-MM');
      const monthlyCostsRef = doc(db, "monthlyCosts", monthId);

      
      const [driversSnapshot, vehiclesSnapshot, ordersSnapshot, maintenanceSnapshot, settingsSnap, monthlyCostsSnap] = await Promise.all([
        getDocs(driversQuery),
        getDocs(vehiclesQuery),
        getDocs(ordersQuery),
        getDocs(maintenanceQuery),
        getDoc(settingsRef),
        getDoc(monthlyCostsRef)
      ]);
      
      const loadedDrivers = driversSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as User)).sort((a, b) => a.name.localeCompare(b.name));
      const loadedVehicles = vehiclesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Vehicle));
      const loadedOrders = ordersSnapshot.docs.map((doc) => sanitizeOrderFromFirestore(doc, "Accounting", loadedVehicles)).filter(Boolean) as Order[];
      const loadedMaintenance = maintenanceSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
              id: doc.id,
              ...data,
              date: toISOString(data.date) || new Date().toISOString(),
          } as MaintenanceRecord;
      });
      
      if (settingsSnap.exists()) {
        const settings = settingsSnap.data();
        variableCostsForm.reset({ simplesNacionalRate: settings.simplesNacionalRate ?? defaultTaxValues.simplesNacionalRate, fuelPrice: settings.fuelPrice ?? 6.2 });
        administrativeCostsForm.reset({ ...defaultAdministrativeCostsValues, ...settings });
      } else {
        variableCostsForm.reset({ ...defaultTaxValues, fuelPrice: 6.2 });
        administrativeCostsForm.reset(defaultAdministrativeCostsValues);
      }
      
      if (monthlyCostsSnap.exists()) {
        const monthlyData = monthlyCostsSnap.data();
        monthlyCostsForm.reset({ 
            generalCosts: monthlyData.generalCosts || defaultMonthlyCosts.generalCosts, 
            variableCosts: monthlyData.variableCosts || [] 
        });
      } else {
        monthlyCostsForm.reset(defaultMonthlyCosts);
      }

      setDrivers(loadedDrivers);
      setVehicles(loadedVehicles);
      setOrders(loadedOrders);
      setMaintenanceRecords(loadedMaintenance);

    } catch (err) {
      toast({ title: "Erro ao Carregar Dados", description: "Não foi possível buscar os dados financeiros.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [variableCostsForm, administrativeCostsForm, monthlyCostsForm, currentMonth]);

  useEffect(() => { fetchData() }, [fetchData]);

  useEffect(() => {
    if (selectedDriverIdForSalary) {
      const driver = drivers.find((d) => d.id === selectedDriverIdForSalary);
      if (driver?.salaryDetails) {
        driverCostsForm.reset({ ...defaultDriverCostsValues, ...driver.salaryDetails });
      } else {
        driverCostsForm.reset(defaultDriverCostsValues);
      }
    }
  }, [selectedDriverIdForSalary, drivers, driverCostsForm]);

  const financialSummary = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    const ordersThisMonth = orders.filter((o) => {
        if (o.executionStatus === 'cancelled') return false;
        const serviceDate = o.serviceDate ? new Date(o.serviceDate) : new Date(o.createdAt);
        return serviceDate >= start && serviceDate <= end;
    });

    const completedOrdersThisMonth = ordersThisMonth.filter(o => o.executionStatus === "completed");

    const faturamentoPotencial = ordersThisMonth.reduce((acc, order) => acc + (order.totalValue || 0), 0);
    const faturamentoConcluido = completedOrdersThisMonth.reduce((acc, order) => acc + (order.totalValue || 0), 0);
    
    const calculateFuelCostForOrders = (orderList: Order[]) => {
      return orderList.reduce((acc, order) => {
          const vehicle = vehicles.find(v => v.plate === order.assignedVehiclePlate);
          const fuelConsumption = vehicle?.costs?.fuelConsumption ?? 10;
          const distance = order.routeDistanceKm ?? 0;
          return acc + (distance / fuelConsumption * watchedVariableCosts.fuelPrice);
      }, 0);
    };

    const fuelCostThisMonth = calculateFuelCostForOrders(completedOrdersThisMonth);
    const fuelCostPotentialThisMonth = calculateFuelCostForOrders(ordersThisMonth.filter(o => o.executionStatus !== 'cancelled'));

    const maintenanceCostThisMonth = maintenanceRecords.filter(r => {
        const recordDate = new Date(r.date);
        return recordDate >= start && recordDate <= end;
    }).reduce((acc, r) => acc + r.cost, 0);

    const outrosCustosVariaveis = (watchedMonthlyCosts.variableCosts || []).reduce((sum, cost) => sum + (Number(cost.value) || 0), 0);
    const impostoSimples = faturamentoConcluido * (watchedVariableCosts.simplesNacionalRate / 100);
    const custosVariaveisTotal = fuelCostThisMonth + maintenanceCostThisMonth + impostoSimples + outrosCustosVariaveis;

    const custoMotoristas = drivers.reduce((acc, driver) => acc + calculateDriverMonthlyCost(driver.salaryDetails), 0);
    const custoAdministrativo = (Number(watchedAdminCosts.accountingCost) || 0) + (Number(watchedAdminCosts.proLaboreValue) || 0) * (1 + (Number(watchedAdminCosts.inssRateProLabore) || 0) / 100);
    const custosGeraisMensais = (watchedMonthlyCosts.generalCosts || []).reduce((sum, cost) => sum + (Number(cost.value) || 0), 0);
    const custosFixosTotal = custoMotoristas + custoAdministrativo + custosGeraisMensais;
    
    const resultadoRealizado = faturamentoConcluido - custosVariaveisTotal - custosFixosTotal;

    // Calculation for Break-even Point
    let pontoDeEquilibrio = 0;
    const margemDeContribuicaoAbsoluta = faturamentoConcluido - custosVariaveisTotal;
    let margemDeContribuicaoPercentual = 0;

    if (faturamentoConcluido > 0 && margemDeContribuicaoAbsoluta > 0) {
        margemDeContribuicaoPercentual = margemDeContribuicaoAbsoluta / faturamentoConcluido;
        pontoDeEquilibrio = custosFixosTotal / margemDeContribuicaoPercentual;
    } else {
        pontoDeEquilibrio = custosFixosTotal + custosVariaveisTotal;
    }


    return {
      name: format(currentMonth, "MMMM", { locale: ptBR }),
      faturamentoBruto: faturamentoPotencial,
      faturamentoConcluido,
      custosFixos: custosFixosTotal,
      custosVariaveis: custosVariaveisTotal,
      resultadoRealizado,
      pontoDeEquilibrio,
      details: {
        custoCombustivel: fuelCostThisMonth,
        custoCombustivelPotencial: fuelCostPotentialThisMonth,
        custoManutencao: maintenanceCostThisMonth,
        impostoSimples,
        outrosCustosVariaveis,
        custoMotoristas,
        custoAdministrativo,
        custosGerais: custosGeraisMensais,
        margemDeContribuicaoAbsoluta,
        margemDeContribuicaoPercentual,
      }
    };
  }, [orders, maintenanceRecords, drivers, vehicles, currentMonth, watchedVariableCosts, watchedAdminCosts, watchedMonthlyCosts, calculateDriverMonthlyCost]);

  const handleSettingsSubmit = async (data: any, type: "variable" | "admin" | "team" | "monthly") => {
    setIsSaving(true);
    try {
      if (type === 'team' && selectedDriverIdForSalary) {
          const userRef = doc(db, "users", selectedDriverIdForSalary);
          await setDoc(userRef, { salaryDetails: data }, { merge: true });
          toast({ title: "Custos do Membro Salvos" });
      } else if (type === 'monthly') {
          const monthId = format(currentMonth, 'yyyy-MM');
          const monthlyRef = doc(db, "monthlyCosts", monthId);
          await setDoc(monthlyRef, data, { merge: true });
          toast({ title: "Custos do Mês Salvos" });
      } else if (type !== 'team') {
          const settingsRef = doc(db, "companySettings", "main");
          await setDoc(settingsRef, data, { merge: true });
          toast({ title: "Configurações Salvas" });
      }
      await fetchData();
    } catch (error) {
      toast({ title: "Erro ao Salvar Configurações", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => window.print();
  
  const formatCurrency = (value: any) => {
    const numericValue = Number(value);
    if (isNaN(numericValue)) return "R$ 0,00";
    return `R$ ${numericValue.toFixed(2).replace(".", ",")}`;
  };

  const formatPercentage = (value: any) => {
    const numericValue = Number(value);
    if (isNaN(numericValue)) return "0,00%";
    return `${(numericValue * 100).toFixed(2).replace(".", ",")}%`;
  };

  return (
    <div className="py-8 w-full max-w-7xl mx-auto printable-area">
      <Card className="shadow-xl print:shadow-none print:border-none print:bg-white">
        <CardHeader className="print:p-2">
          <CardTitle className="text-3xl font-bold text-primary print:text-xl print:text-center">
            Visão Geral Financeira
          </CardTitle>
          <CardDescription className="print:hidden">
            Acompanhe o desempenho financeiro e gerencie todos os custos operacionais da sua empresa.
          </CardDescription>
        </CardHeader>
        <CardContent className="print:p-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 print-hidden">
              <TabsTrigger value="summary">Resumo Mensal</TabsTrigger>
              <TabsTrigger value="monthlyCosts">Custos do Mês</TabsTrigger>
              <TabsTrigger value="fixed">Custos Fixos</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center print:hidden">
                    <CardTitle>Análise Financeira do Mês</CardTitle>
                    <div className="flex items-center justify-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><Icons.chevronDown className="h-4 w-4 rotate-90" /></Button>
                      <span className="text-lg font-semibold w-36 text-center">{format(currentMonth, "MMMM yyyy", { locale: ptBR })}</span>
                      <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><Icons.chevronDown className="h-4 w-4 -rotate-90" /></Button>
                    </div>
                    <Button onClick={handlePrint} variant="outline"><Icons.printer className="mr-2 h-4 w-4" /> Imprimir</Button>
                  </div>
                   <CardTitle className="hidden print:block text-center mb-2">Relatório Financeiro - {format(currentMonth, "MMMM yyyy", { locale: ptBR })}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 print:space-y-2">
                  <FinancialChart data={[financialSummary]} />
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2">
                      <Card className="print:shadow-none"><CardHeader className="print:p-1.5"><CardTitle className="text-base print:text-sm">Faturamento Potencial</CardTitle></CardHeader><CardContent className="print:p-1.5 print:pt-0"><p className="text-2xl font-bold text-primary print:text-lg">{formatCurrency(financialSummary.faturamentoBruto)}</p><p className="text-xs text-muted-foreground print:text-[10px]">Realizado: {formatCurrency(financialSummary.faturamentoConcluido)}</p></CardContent></Card>
                      <Card onClick={() => setActiveTab('monthlyCosts')} className="print:shadow-none cursor-pointer hover:bg-muted/50 transition-colors"><CardHeader className="print:p-1.5"><CardTitle className="text-base print:text-sm">Custos Variáveis</CardTitle></CardHeader><CardContent className="print:p-1.5 print:pt-0"><p className="text-2xl font-bold text-variable-costs print:text-lg">{formatCurrency(financialSummary.custosVariaveis)}</p><p className="text-xs text-muted-foreground print:text-[10px]">Combustível + Manutenção + Imposto + Outros</p></CardContent></Card>
                      <Card onClick={() => setActiveTab('fixed')} className="print:shadow-none cursor-pointer hover:bg-muted/50 transition-colors"><CardHeader className="print:p-1.5"><CardTitle className="text-base print:text-sm">Custos Fixos</CardTitle></CardHeader><CardContent className="print:p-1.5 print:pt-0"><p className="text-2xl font-bold text-fixed-costs print:text-lg">{formatCurrency(financialSummary.custosFixos)}</p><p className="text-xs text-muted-foreground print:text-[10px]">Equipe + Admin + Gerais</p></CardContent></Card>
                      <Card className="print:shadow-none"><CardHeader className="print:p-1.5"><CardTitle className="text-base print:text-sm">Resultado do Mês</CardTitle></CardHeader><CardContent className="print:p-1.5 print:pt-0"><p className={`text-2xl font-bold ${financialSummary.resultadoRealizado >= 0 ? "text-profit" : "text-destructive"} print:text-lg`}>{formatCurrency(financialSummary.resultadoRealizado)}</p><p className="text-xs text-muted-foreground print:text-[10px]">Ponto de Equilíbrio: {formatCurrency(financialSummary.pontoDeEquilibrio)}</p></CardContent></Card>
                  </div>
                  <Card className="print:shadow-none"><CardHeader className="print:p-1.5"><CardTitle className="text-lg print:text-base">Detalhamento dos Custos</CardTitle></CardHeader><CardContent className="grid md:grid-cols-3 gap-6 text-sm print:grid-cols-3 print:gap-2 print:text-xs print:p-1.5 print:pt-0"><div><h4 className="font-semibold text-primary mb-1 print:mb-0.5">Custos Variáveis</h4><p><strong>Custo Combustível:</strong> {formatCurrency(financialSummary.details.custoCombustivel)}</p><p><strong>Custo Manutenção:</strong> {formatCurrency(financialSummary.details.custoManutencao)}</p><p><strong>Imposto (Simples):</strong> {formatCurrency(financialSummary.details.impostoSimples)}</p><p><strong>Outros Variáveis:</strong> {formatCurrency(financialSummary.details.outrosCustosVariaveis)}</p></div><div><h4 className="font-semibold text-primary mb-1 print:mb-0.5">Custos Fixos (Pessoal)</h4><p><strong>Custo Total com Equipe:</strong> {formatCurrency(financialSummary.details.custoMotoristas)}</p></div><div><h4 className="font-semibold text-primary mb-1 print:mb-0.5">Custos Fixos (Geral)</h4><p><strong>Custo Administrativo:</strong> {formatCurrency(financialSummary.details.custoAdministrativo)}</p><p><strong>Outros Custos Gerais:</strong> {formatCurrency(financialSummary.details.custosGerais)}</p></div></CardContent></Card>
                
                  {/* Memory of Calculation Card */}
                  <Card className="print:shadow-none print:mt-2">
                    <CardHeader className="print:p-1.5">
                      <CardTitle className="text-lg print:text-base">Memória de Cálculo - Ponto de Equilíbrio</CardTitle>
                      <CardDescription className="print:hidden">Entenda como o ponto de equilíbrio é calculado com base nos dados do mês.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm print:text-xs print:p-1.5 print:pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2">
                          {/* Column 1: Fixed and Variable Costs Summary */}
                          <div className="space-y-1">
                              <div className="flex justify-between"><span>Custos Fixos Totais (CF):</span> <span className="font-semibold">{formatCurrency(financialSummary.custosFixos)}</span></div>
                              <p className="text-xs text-muted-foreground pl-4 print:hidden"> (Equipe + Administrativo + Gerais)</p>
                              <div className="flex justify-between"><span>Custos Variáveis Totais (CV):</span> <span className="font-semibold">{formatCurrency(financialSummary.custosVariaveis)}</span></div>
                              <p className="text-xs text-muted-foreground pl-4 print:hidden"> (Combustível + Manutenção + Impostos + Outros)</p>
                              <div className="flex justify-between border-t pt-1 mt-1">
                                <span className="font-semibold">Custo Operacional Total (CF+CV):</span> 
                                <span className="font-bold text-base">{formatCurrency(financialSummary.custosFixos + financialSummary.custosVariaveis)}</span>
                              </div>
                          </div>
                          {/* Column 2: Margin Calculation */}
                          <div className="space-y-1">
                             <div className="flex justify-between"><span>Faturamento Realizado (FR):</span> <span className="font-semibold">{formatCurrency(financialSummary.faturamentoConcluido)}</span></div>
                              <div className="flex justify-between border-t pt-1 mt-1">
                                  <span className="font-semibold">Resultado Líquido (FR - Custo Total):</span>
                                  <span className={`font-bold text-base ${financialSummary.resultadoRealizado >= 0 ? "text-profit" : "text-destructive"}`}>{formatCurrency(financialSummary.resultadoRealizado)}</span>
                              </div>
                              <Separator className="my-1"/>
                              <div className="flex justify-between pt-1"><span>Margem de Contribuição (MC):</span> <span className="font-semibold">{formatCurrency(financialSummary.details.margemDeContribuicaoAbsoluta)}</span></div>
                              <p className="text-xs text-muted-foreground pl-4 print:hidden">(Fórmula: FR - CV)</p>
                              <div className="flex justify-between"><span>Índice MC (%):</span> <span className="font-semibold">{formatPercentage(financialSummary.details.margemDeContribuicaoPercentual)}</span></div>
                               <p className="text-xs text-muted-foreground pl-4 print:hidden">(Fórmula: MC / FR)</p>
                          </div>
                        </div>
                        <Separator />
                        <div className="p-2 bg-muted/50 rounded-lg text-center print:p-1">
                            <h4 className="text-md font-semibold text-primary mb-1 print:text-sm">Ponto de Equilíbrio (PE)</h4>
                            <p className="text-xs text-muted-foreground mb-1 print:hidden">(Fórmula: Custos Fixos / Índice da Margem de Contribuição)</p>
                            <p className="text-xl font-bold print:text-lg">{formatCurrency(financialSummary.pontoDeEquilibrio)}</p>
                            <p className="text-xs text-muted-foreground mt-1 print:text-[9px]">Este é o faturamento mínimo necessário para cobrir todos os custos do mês.</p>
                        </div>
                    </CardContent>
                  </Card>

                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="monthlyCosts" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Custos do Mês</CardTitle>
                  <CardDescription>Gerencie custos que mudam mensalmente, como operacionais, de marketing, ou gerais específicos para o período.</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Formulário de Impostos e Combustível (parte das Configurações Gerais) */}
                  <form onSubmit={variableCostsForm.handleSubmit((data) => handleSettingsSubmit(data, 'variable'))} className="space-y-8">
                    <div>
                      <h4 className="text-md font-medium text-primary mb-2">Configurações Gerais (afetam o cálculo do mês)</h4>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="simplesNacionalRate">Alíquota Simples Nacional (%)</Label>
                          <Input id="simplesNacionalRate" type="number" step="0.01" {...variableCostsForm.register("simplesNacionalRate")} disabled={isSaving} />
                          {variableCostsForm.formState.errors.simplesNacionalRate && (<p className="text-xs mt-1 text-destructive">{variableCostsForm.formState.errors.simplesNacionalRate.message}</p>)}
                        </div>
                        <div>
                          <Label htmlFor="fuelPrice">Preço do Combustível (R$/L)</Label>
                          <Input id="fuelPrice" type="number" step="0.01" {...variableCostsForm.register("fuelPrice")} disabled={isSaving} />
                          {variableCostsForm.formState.errors.fuelPrice && (<p className="text-xs mt-1 text-destructive">{variableCostsForm.formState.errors.fuelPrice.message}</p>)}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end pt-4">
                        <Button type="submit" disabled={isSaving}>
                            {isSaving && (<Icons.loader className="animate-spin mr-2" />)}{" "}Salvar Configurações Gerais
                        </Button>
                    </div>
                  </form>
                  <Separator className="my-8" />

                  {/* Formulário de Custos Mensais (Variáveis e Gerais) */}
                  <form onSubmit={monthlyCostsForm.handleSubmit((data) => handleSettingsSubmit(data, 'monthly'))} className="space-y-6">
                      <h4 className="text-md font-medium text-primary mb-2">Custos Gerais do Mês</h4>
                      <div className="space-y-4">
                            {generalCostFields.map((field, index) => (
                              <div key={field.id} className="flex items-end gap-2">
                                <div className="flex-grow grid grid-cols-2 gap-2">
                                   <Controller name={`generalCosts.${index}.name`} control={monthlyCostsForm.control} render={({ field }) => <Input {...field} placeholder="Nome do Custo Geral" disabled={isSaving} />} />
                                   <Controller name={`generalCosts.${index}.value`} control={monthlyCostsForm.control} render={({ field }) => <Input {...field} type="number" step="0.01" placeholder="Valor (R$)" disabled={isSaving} />} />
                                </div>
                                <Button type="button" variant="ghost" size="icon" onClick={() => removeGeneralCost(index)} disabled={isSaving}><Icons.delete className="h-4 w-4 text-destructive" /></Button>
                              </div>
                            ))}
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => appendGeneralCost({ name: '', value: 0 })}>
                        <Icons.plusCircle className="mr-2 h-4 w-4" /> Adicionar Custo Geral
                      </Button>
                      
                      <Separator className="my-6" />

                      <h4 className="text-md font-medium text-primary mb-2">Outros Custos Variáveis do Mês</h4>
                       <div className="space-y-4">
                            {variableCostFields.map((field, index) => (
                              <div key={field.id} className="flex items-end gap-2">
                                <div className="flex-grow grid grid-cols-2 gap-2">
                                   <Controller name={`variableCosts.${index}.name`} control={monthlyCostsForm.control} render={({ field }) => <Input {...field} placeholder="Nome do Custo Variável" disabled={isSaving} />} />
                                   <Controller name={`variableCosts.${index}.value`} control={monthlyCostsForm.control} render={({ field }) => <Input {...field} type="number" step="0.01" placeholder="Valor (R$)" disabled={isSaving} />} />
                                </div>
                                <Button type="button" variant="ghost" size="icon" onClick={() => removeVariableCost(index)} disabled={isSaving}><Icons.delete className="h-4 w-4 text-destructive" /></Button>
                              </div>
                            ))}
                          </div>
                           <Button type="button" variant="outline" size="sm" onClick={() => appendVariableCost({ name: '', value: 0 })}>
                              <Icons.plusCircle className="mr-2 h-4 w-4" /> Adicionar Custo Variável
                          </Button>
                          <div className="flex justify-end pt-4">
                            <Button type="submit" disabled={isSaving}>
                              {isSaving && <Icons.loader className="animate-spin mr-2" />} Salvar Custos do Mês
                            </Button>
                          </div>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="fixed" className="mt-6">
              <Tabs defaultValue="team" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="team">Equipe</TabsTrigger>
                      <TabsTrigger value="admin">Administrativo</TabsTrigger>
                  </TabsList>

                  <TabsContent value="team" className="mt-6">
                    <Card>
                      <CardHeader><CardTitle>Custos por Membro da Equipe</CardTitle><CardDescription>Gerencie os custos salariais e encargos de cada membro da equipe. Estes são custos fixos globais.</CardDescription></CardHeader>
                      <CardContent>
                        <form onSubmit={driverCostsForm.handleSubmit((data) => handleSettingsSubmit(data, 'team'))} className="space-y-6">
                          <div>
                            <Label htmlFor="driver-select">Selecione o Membro da Equipe</Label>
                            <Select value={selectedDriverIdForSalary} onValueChange={setSelectedDriverIdForSalary} disabled={isLoading}>
                              <SelectTrigger id="driver-select"><SelectValue placeholder={isLoading ? "Carregando..." : "Selecione um membro"} /></SelectTrigger>
                              <SelectContent>{drivers.map((driver) => (<SelectItem key={driver.id} value={driver.id}>{driver.name}</SelectItem>))}</SelectContent>
                            </Select>
                          </div>
                          {selectedDriverIdForSalary && (
                            <div className="space-y-6 pt-4 border-t">
                              <div className="grid md:grid-cols-3 gap-4">
                                <div><Label htmlFor="baseSalary">Salário Base (R$)</Label><Input id="baseSalary" type="number" {...driverCostsForm.register("baseSalary")} disabled={isSaving} />{driverCostsForm.formState.errors.baseSalary && (<p className="text-xs text-destructive mt-1">{driverCostsForm.formState.errors.baseSalary.message}</p>)}</div>
                                <div><Label htmlFor="hazardPay">Periculosidade (%)</Label><Input id="hazardPay" type="number" {...driverCostsForm.register("hazardPay")} disabled={isSaving} />{driverCostsForm.formState.errors.hazardPay && (<p className="text-xs text-destructive mt-1">{driverCostsForm.formState.errors.hazardPay.message}</p>)}</div>
                                <div><Label htmlFor="benefits">Benefícios (VR, VT, etc.) (R$)</Label><Input id="benefits" type="number" {...driverCostsForm.register("benefits")} disabled={isSaving} />{driverCostsForm.formState.errors.benefits && (<p className="text-xs text-destructive mt-1">{driverCostsForm.formState.errors.benefits.message}</p>)}</div>
                              </div>
                              <Separator />
                              <h4 className="text-md font-medium text-primary">Encargos Sociais e Provisões Mensais</h4>
                              <div className="grid md:grid-cols-3 gap-4">
                                <div><Label htmlFor="fgts">FGTS (%)</Label><Input id="fgts" type="number" value="8" disabled /></div>
                                <div><Label htmlFor="thirteenth-salary">Provisão 13º Salário (%)</Label><Input id="thirteenth-salary" type="number" value="8.33" disabled /></div>
                                <div><Label htmlFor="vacation">Provisão Férias + 1/3 (%)</Label><Input id="vacation" type="number" value="11.11" disabled /></div>
                              </div>
                              <Separator />
                              <div className="p-4 bg-muted/50 rounded-lg"><h4 className="text-md font-medium text-primary mb-2">Custo Mensal Total do Membro</h4><p className="text-2xl font-bold">{formatCurrency(calculateDriverMonthlyCost(driverCostsForm.getValues()))}</p><p className="text-xs text-muted-foreground">Soma de Salário Bruto, Benefícios e Encargos.</p></div>
                              <div className="flex justify-end pt-4"><Button type="submit" disabled={isSaving}>{isSaving && (<Icons.loader className="animate-spin mr-2" />)}Salvar Custos</Button></div>
                            </div>
                          )}
                        </form>
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  <TabsContent value="admin" className="mt-6">
                      <Card>
                          <CardHeader><CardTitle>Custos Administrativos</CardTitle><CardDescription>Gerencie as despesas com contabilidade e pró-labore. Estes são custos fixos globais.</CardDescription></CardHeader>
                          <CardContent>
                            <form onSubmit={administrativeCostsForm.handleSubmit((data) => handleSettingsSubmit(data, 'admin'))} className="space-y-6">
                                <div className="grid md:grid-cols-2 gap-4">
                                  <div><Label htmlFor="accountingCost">Custo Mensal Contabilidade (R$)</Label><Input id="accountingCost" type="number" step="0.01" {...administrativeCostsForm.register("accountingCost")} disabled={isSaving} />{administrativeCostsForm.formState.errors.accountingCost && (<p className="text-xs mt-1 text-destructive">{administrativeCostsForm.formState.errors.accountingCost.message}</p>)}</div>
                                  <div><Label htmlFor="proLaboreValue">Valor do Pró-labore (R$)</Label><Input id="proLaboreValue" type="number" step="0.01" {...administrativeCostsForm.register("proLaboreValue")} disabled={isSaving} />{administrativeCostsForm.formState.errors.proLaboreValue && (<p className="text-xs mt-1 text-destructive">{administrativeCostsForm.formState.errors.proLaboreValue.message}</p>)}</div>
                                  <div className="md:col-span-2"><Label htmlFor="inssRateProLabore">Alíquota INSS Pró-labore (%)</Label><Input id="inssRateProLabore" type="number" step="0.01" {...administrativeCostsForm.register("inssRateProLabore")} disabled={isSaving} />{administrativeCostsForm.formState.errors.inssRateProLabore && (<p className="text-xs mt-1 text-destructive">{administrativeCostsForm.formState.errors.inssRateProLabore.message}</p>)}</div>
                                </div>
                                <Separator />
                                <div className="p-4 bg-muted/50 rounded-lg"><h4 className="text-md font-medium text-primary mb-2">Custo Administrativo Fixo</h4><p className="text-2xl font-bold">{formatCurrency(financialSummary.details.custoAdministrativo)}</p><p className="text-xs text-muted-foreground">Soma de Contabilidade, Pró-Labore e INSS.</p></div>
                                <div className="flex justify-end pt-4"><Button type="submit" disabled={isSaving}>{isSaving && (<Icons.loader className="animate-spin mr-2" />)}{" "}Salvar Custos Administrativos</Button></div>
                            </form>
                          </CardContent>
                      </Card>
                  </TabsContent>

              </Tabs>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
