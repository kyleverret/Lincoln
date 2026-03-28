import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Building2, User, Shield } from "lucide-react";
import { FirmNameForm } from "@/components/settings/firm-name-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { tenantId, role, id: userId } = session.user;

  const [tenant, user] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        website: true,
        plan: true,
      },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        mfaEnabled: true,
        lastLoginAt: true,
        passwordChangedAt: true,
      },
    }),
  ]);

  if (!tenant || !user) redirect("/login");

  const canEditFirm = hasPermission(role, "FIRM_DASHBOARD");

  return (
    <>
      <Header title="Settings" role={role} />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Firm Settings */}
          {canEditFirm && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" aria-label="Firm settings" />
                  Firm Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <FirmNameForm currentName={tenant.name} />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Phone</p>
                    <p className="text-sm">{tenant.phone || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Website</p>
                    <p className="text-sm">{tenant.website || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Address</p>
                    <p className="text-sm">{tenant.address || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">City / State / Zip</p>
                    <p className="text-sm">
                      {[tenant.city, tenant.state, tenant.zipCode]
                        .filter(Boolean)
                        .join(", ") || "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Plan</p>
                    <Badge variant="secondary">{tenant.plan}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* User Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" aria-label="User profile" />
                User Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Name</p>
                  <p className="text-sm">{user.firstName} {user.lastName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Email</p>
                  <p className="text-sm">{user.email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Phone</p>
                  <p className="text-sm">{user.phone || "Not set"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Role</p>
                  <Badge variant="secondary">{role}</Badge>
                </div>
                {user.lastLoginAt && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Last Login</p>
                    <p className="text-sm">{new Date(user.lastLoginAt).toLocaleString()}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" aria-label="Security settings" />
                Security
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Multi-Factor Authentication
                  </p>
                  <div className="mt-1">
                    {user.mfaEnabled ? (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                        Enabled
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Disabled</Badge>
                    )}
                  </div>
                </div>
                {user.passwordChangedAt && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Password Last Changed
                    </p>
                    <p className="text-sm">
                      {new Date(user.passwordChangedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
