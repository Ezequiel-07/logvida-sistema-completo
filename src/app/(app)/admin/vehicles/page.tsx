
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import VehicleManagementClient from "./components/VehicleManagementClient";

export default function VehiclePage() {
  return (
    <div className="py-8 w-full max-w-7xl mx-auto">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary">
            Gerenciamento de Frota
          </CardTitle>
          <CardDescription>
            Gerencie os veículos da sua frota, seus custos e histórico de manutenção.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VehicleManagementClient />
        </CardContent>
      </Card>
    </div>
  );
}
