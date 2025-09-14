
export type NotificationType = "info" | "warning" | "success" | "error";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string; // ISO date string
  read: boolean;
  type: NotificationType;
  routeId?: string; // Optional: link to a specific route
  routeName?: string; // Optional: name of the route for quick context
  senderId?: string; // Optional: for chat notifications
  senderName?: string; // Optional: for chat notifications
  chatId?: string; // Optional: for chat notifications
  quoteId?: string; // Optional: link to a specific quote
}
