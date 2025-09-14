
export interface ChecklistItem {
  id?: string;
  text: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null; // Manter para compatibilidade, mas usar checklist para novos
  checklist?: ChecklistItem[]; // Novo campo para o checklist
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  dueDate?: string | null; // ISO Date String
  assigneeId?: string | null;
  assigneeName?: string | null;
  createdAt: string; // ISO Date String
  updatedAt?: string | null; // ISO Date String
}
