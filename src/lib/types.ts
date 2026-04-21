export type Role = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt?: string;
};

export type ConversationRecord = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type SettingsRecord = {
  model: string;
  systemPrompt: string;
  welcomeMessage: string;
  updatedAt: string;
};

export type KnowledgeDocument = {
  id: string;
  name: string;
  uploadedAt: string;
  size: number;
  type: string;
  excerpt: string;
  path: string;
};
