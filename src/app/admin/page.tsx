import { requireAdmin } from "@/lib/auth";
import {
  getSettings,
  getStorageStats,
  listKnowledgeDocuments,
  listRecentConversations
} from "@/lib/storage";
import { AdminDashboard } from "@/components/admin-dashboard";

export default async function AdminPage() {
  await requireAdmin();

  const [settings, documents, conversations, stats] = await Promise.all([
    getSettings(),
    listKnowledgeDocuments(),
    listRecentConversations(),
    getStorageStats()
  ]);

  return (
    <AdminDashboard
      initialSettings={settings}
      initialDocuments={documents}
      recentConversations={conversations}
      stats={stats}
    />
  );
}
