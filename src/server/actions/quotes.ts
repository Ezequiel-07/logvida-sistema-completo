
"use server";

import { getAdminDb, Timestamp } from "@/server/lib/firebaseAdmin";
import * as z from "zod";
import { sendNotification } from "./notifications";

const quoteStopSchema = z.object({
  name: z.string().optional().nullable(),
  address: z.string().min(1, "O endereço é obrigatório."),
  instructions: z.string().optional().nullable(),
});

const quoteFormSchema = z.object({
  name: z.string().min(3, "O nome é obrigatório"),
  document: z.string().min(11, "CNPJ ou CPF é obrigatório"),
  email: z.string().email("E-mail inválido."),
  phone: z.string().min(10, "Telefone é obrigatório."),
  message: z.string(),
  clientId: z.string().optional().nullable(),
  boxCount: z.coerce.number().optional(),
  calculatedPrice: z.coerce.number().optional(),
  origin: quoteStopSchema.optional(),
  destination: quoteStopSchema.optional(),
  intermediateStops: z.array(quoteStopSchema).optional(),
  distanceKm: z.coerce.number().optional(),
});


type QuoteFormData = z.infer<typeof quoteFormSchema>;

export async function submitQuote(data: QuoteFormData) {
  const validation = quoteFormSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: "Dados inválidos. Verifique os campos." };
  }

  const { name, document, email, phone, message, ...clientQuoteData } = validation.data;
  
  try {
    const adminDb = getAdminDb();
    const quoteRef = adminDb.collection("quotes").doc();

    await quoteRef.set({
      name,
      document,
      email,
      phone,
      message,
      status: "pending",
      createdAt: Timestamp.now(),
      adminNotes: "", 
      ...clientQuoteData,
    });

    const adminsSnapshot = await adminDb.collection('users').where('role', '==', 'admin').get();
    if (!adminsSnapshot.empty) {
        const adminIds = adminsSnapshot.docs.map(doc => doc.id);
        const notificationPromises = adminIds.map(adminId => 
            sendNotification(
                adminId,
                "Nova Solicitação de Orçamento!",
                `${name} enviou uma nova solicitação.`,
                "info",
                { eventType: 'newQuote', quoteId: quoteRef.id }
            )
        );
        await Promise.all(notificationPromises);
    }

    return { success: true, quoteId: quoteRef.id };
  } catch (error) {
    console.error("Error submitting quote:", error);
    return {
      success: false,
      error: "Não foi possível salvar o orçamento. Tente novamente mais tarde.",
    };
  }
}
