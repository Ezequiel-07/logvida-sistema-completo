
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import DriverManagementClient from "@/app/(app)/admin/drivers/components/DriverManagementClient";

export default function DriverManagementPage() {
  return (
    <div className="py-8 w-full max-w-7xl mx-auto">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary">
            Gerenciamento de Equipe
          </CardTitle>
          <CardDescription>
            Cadastre, visualize e gerencie os motoristas e administradores do sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DriverManagementClient />
        </CardContent>
      </Card>
    </div>
  );
}
