const DEFAULT_SYSTEM_PROMPT =
  "Voce e EZTROGUN, uma IA web para tarefas amplas, analise, criacao, suporte e produtividade. Seja objetiva, competente e segura.";
const DEFAULT_WELCOME_MESSAGE =
  "Eu sou a EZTROGUN. Posso conversar, estruturar ideias, produzir conteudo, analisar cenarios e usar a memoria e os arquivos enviados para responder melhor.";

export function getServerConfig() {
  return {
    openAiApiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
    systemPrompt: process.env.EZTROGUN_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
    welcomeMessage:
      process.env.EZTROGUN_WELCOME_MESSAGE || DEFAULT_WELCOME_MESSAGE,
    adminUser: process.env.ADMIN_USER || "admin",
    adminPassword: process.env.ADMIN_PASSWORD,
    sessionSecret:
      process.env.ADMIN_SESSION_SECRET ||
      process.env.ADMIN_PASSWORD ||
      "eztrogun-dev-session-secret"
  };
}
