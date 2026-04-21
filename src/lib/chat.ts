import type OpenAI from "openai";

import { findRelevantKnowledge, getConversation, getSettings } from "@/lib/storage";
import type { ChatMessage } from "@/lib/types";

function trimMessages(messages: ChatMessage[], limit = 12) {
  return messages.slice(-limit);
}

function buildKnowledgeSection(
  docs: Awaited<ReturnType<typeof findRelevantKnowledge>>
) {
  if (!docs.length) {
    return "";
  }

  return docs
    .map(
      (doc, index) =>
        `Documento ${index + 1} - ${doc.name}\n${doc.excerpt.trim()}`
    )
    .join("\n\n");
}

export async function buildModelInput(
  sessionId: string,
  incomingMessages: ChatMessage[]
) {
  const settings = await getSettings();
  const query = incomingMessages.at(-1)?.content || "";
  const [conversation, docs] = await Promise.all([
    getConversation(sessionId),
    findRelevantKnowledge(query)
  ]);

  const priorMessages = trimMessages(conversation?.messages || [], 8);
  const latestMessages = trimMessages(incomingMessages, 12);
  const knowledgeBlock = buildKnowledgeSection(docs);

  const systemPrompt = [
    settings.systemPrompt,
    "Use a memoria recente da conversa quando ela existir e use a base de conhecimento apenas quando for relevante.",
    knowledgeBlock
      ? `Base de conhecimento relevante:\n${knowledgeBlock}`
      : "Nenhum documento relevante foi encontrado para esta mensagem."
  ].join("\n\n");

  return {
    settings,
    input: [
      {
        role: "system" as const,
        content: systemPrompt
      },
      ...priorMessages.map((message) => ({
        role: message.role,
        content: message.content
      })),
      ...latestMessages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    ]
  };
}

export async function generateChatAnswer(
  client: OpenAI,
  sessionId: string,
  messages: ChatMessage[]
) {
  const { settings, input } = await buildModelInput(sessionId, messages);
  const response = await client.responses.create({
    model: settings.model,
    input
  });

  return {
    settings,
    answer: response.output_text?.trim() || ""
  };
}
