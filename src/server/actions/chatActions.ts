
'use server';

import { getAdminDb, Timestamp, FieldValue } from '@/server/lib/firebaseAdmin';
import { sendNotification } from './notifications';

interface SendMessageData {
  senderId: string;
  recipientId: string;
  text: string;
}

export async function sendMessage(data: SendMessageData) {
  const { senderId, recipientId, text } = data;

  if (!senderId || !recipientId || !text.trim()) {
    return { success: false, error: 'Dados da mensagem inválidos.' };
  }

  const db = getAdminDb();
  const chatId = [senderId, recipientId].sort().join('_');
  const chatRef = db.collection('chats').doc(chatId);
  const messagesRef = chatRef.collection('messages');

  try {
    const [senderSnap, recipientSnap] = await Promise.all([
      db.collection('users').doc(senderId).get(),
      db.collection('users').doc(recipientId).get(),
    ]);

    if (!senderSnap.exists || !recipientSnap.exists) {
      return { success: false, error: 'Usuário remetente ou destinatário não encontrado.' };
    }

    const senderData = senderSnap.data()!;
    const now = Timestamp.now();
    const batch = db.batch();

    const newMessageRef = messagesRef.doc();
    const messageData = {
      id: newMessageRef.id,
      senderId,
      senderName: senderData.name,
      text,
      timestamp: now,
      read: false,
    };
    batch.set(newMessageRef, messageData);
    
    const conversationData = {
        lastMessage: {
            text,
            timestamp: now,
            senderId,
        },
        [`unreadCount.${recipientId}`]: FieldValue.increment(1),
    };

    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) {
        const recipientData = recipientSnap.data()!;
        batch.set(chatRef, {
            ...conversationData,
            participantIds: [senderId, recipientId],
            participants: {
                [senderId]: { name: senderData.name, profilePictureUrl: senderData.profilePictureUrl || null },
                [recipientId]: { name: recipientData.name, profilePictureUrl: recipientData.profilePictureUrl || null },
            },
            [`unreadCount.${senderId}`]: 0 
        });
    } else {
        batch.set(chatRef, conversationData, { merge: true });
    }

    await batch.commit();

    await sendNotification(
      recipientId,
      `Nova mensagem de ${senderData.name}`,
      text,
      'info',
      {
        eventType: 'chatMessage',
        senderId: senderId,
        senderName: senderData.name,
        chatId: chatId
      },
    );

    return { success: true };
  } catch (error: any) {
    return { success: false, error: `Erro do Servidor: ${error.message}` };
  }
}

async function deleteCollection(collectionRef: FirebaseFirestore.CollectionReference, batchSize: number) {
  const query = collectionRef.limit(batchSize);
  let snapshot = await query.get();

  while (snapshot.size > 0) {
    const batch = collectionRef.firestore.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    snapshot = await query.get();
  }
}

export async function deleteChatHistory(data: { chatId: string }) {
  const { chatId } = data;
  if (!chatId) {
    return { success: false, error: "ID do Chat não fornecido." };
  }

  const db = getAdminDb();
  const chatRef = db.collection('chats').doc(chatId);
  const messagesRef = chatRef.collection('messages');

  try {
    // Delete all messages in the subcollection
    await deleteCollection(messagesRef, 100);
    
    // Update the main chat document to reset its state
    await chatRef.update({
      lastMessage: { text: "Histórico de mensagens excluído.", senderId: "system", timestamp: Timestamp.now() },
      'unreadCount': {}
    });
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: "Falha ao excluir o histórico no servidor." };
  }
}
