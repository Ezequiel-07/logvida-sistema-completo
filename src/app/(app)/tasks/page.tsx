
"use client";

import { Suspense, useState } from "react";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import TaskManagementClient from "./components/TaskManagementClient";
import { Card, CardContent } from "@/components/ui/card";

// O componente de página exportado agora é o componente de cliente
export default function TaskManagementPage() {
  const [openDialog, setOpenDialog] = useState<((task: any | null) => void) | null>(null);

  const handleOpenDialog = () => {
    if (openDialog) {
      openDialog(null);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto py-8 px-4 md:px-6 lg:px-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary">
            Gerenciamento de Tarefas
          </h1>
          <p className="text-muted-foreground mt-1">
            Crie e acompanhe tarefas, defina prazos e atribua responsáveis.
          </p>
        </div>
        <Button onClick={handleOpenDialog}>
          <Icons.plusCircle className="mr-2 h-4 w-4" />
          Nova Tarefa
        </Button>
      </div>

      <Card className="shadow-lg">
        <CardContent className="p-0">
          <Suspense fallback={<div className="flex justify-center p-10"><Icons.loader className="h-8 w-8 animate-spin"/></div>}>
            <TaskManagementClient setOpenDialog={setOpenDialog} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
