import { NextResponse } from "next/server";
import { z } from "zod";

import { generateChatAnswer } from "@/lib/chat";
import { getOpenAIClient } from "@/lib/openai";
import { upsertConversation } from "@/lib/storage";

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(12000),
  createdAt: z.string().optional()
});

const requestSchema = z.object({
  sessionId: z.string().min(8).max(120),
  messages: z.array(messageSchema).min(1).max(20)
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { sessionId, messages } = requestSchema.parse(json);

    const client = getOpenAIClient();
    const { answer } = await generateChatAnswer(client, sessionId, messages);

    if (!answer) {
      throw new Error("A resposta do modelo veio vazia.");
    }

    const persistedMessages = [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: answer,
        createdAt: new Date().toISOString()
      }
    ];

    await upsertConversation(sessionId, persistedMessages);

    return NextResponse.json({ answer });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Payload invalido para a conversa."
        : error instanceof Error
          ? error.message
          : "Falha interna ao processar a solicitacao.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
