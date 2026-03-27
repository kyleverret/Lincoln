import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

export const metadata = { title: "Messages — Lincoln" };

export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const messageCount = await db.message.count({
    where: { tenantId: session.user.tenantId },
  });

  return (
    <div>
      <Header title="Messages" role={session.user.role} />
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Messaging Coming Soon</h2>
            <p className="text-muted-foreground max-w-md">
              Secure messaging between attorneys, staff, and clients is currently
              under development. Stay tuned for updates.
            </p>
            {messageCount > 0 && (
              <p className="text-sm text-muted-foreground mt-4">
                {messageCount} existing message{messageCount !== 1 ? "s" : ""} in
                the system.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
