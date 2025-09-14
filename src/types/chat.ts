
export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string; // ISO string for date
  read: boolean;
}

// Representa os metadados da conversa, armazenados no documento principal.
// As mensagens em si são armazenadas em uma subcoleção.
export interface ChatConversation {
  id: string; // Composite ID, e.g., user1_user2
  participantIds: string[];
  participants: {
    [key: string]: { // key is userId
      name: string;
      profilePictureUrl: string | null;
    };
  };
  lastMessage: {
    text: string;
    timestamp: string; // ISO string for date
    senderId: string;
  };
  unreadCount: {
    [key: string]: number; // key is userId
  };
}
