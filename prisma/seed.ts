/**
 * Database seed script
 * Creates demo data: one tenant (law firm), users for each role, sample clients and matters.
 *
 * Run: npm run db:seed
 *
 * IMPORTANT: This creates demo accounts. Remove or change all passwords before production use.
 */

import { PrismaClient, UserRole, MatterStatus, Priority, BillingType } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ---------------------------------------------------------------------------
  // Create tenant (law firm)
  // ---------------------------------------------------------------------------
  const tenant = await db.tenant.upsert({
    where: { slug: "smith-associates" },
    update: {},
    create: {
      name: "Smith & Associates Law Firm",
      slug: "smith-associates",
      plan: "PROFESSIONAL",
      phone: "(555) 123-4567",
      address: "100 Main Street, Suite 500",
      city: "New York",
      state: "NY",
      zipCode: "10001",
      website: "https://smithlaw.example.com",
      barNumber: "NY-12345",
    },
  });

  console.log(`✓ Tenant: ${tenant.name}`);

  // ---------------------------------------------------------------------------
  // Password for all demo accounts
  // ---------------------------------------------------------------------------
  const demoPasswordHash = await bcrypt.hash("Demo@Password1!", 12);

  // ---------------------------------------------------------------------------
  // Super Admin (platform level)
  // ---------------------------------------------------------------------------
  const superAdmin = await db.user.upsert({
    where: { email: "superadmin@lincoln.example.com" },
    update: {},
    create: {
      email: "superadmin@lincoln.example.com",
      passwordHash: demoPasswordHash,
      firstName: "Platform",
      lastName: "Admin",
      isActive: true,
      emailVerified: new Date(),
    },
  });

  await db.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: superAdmin.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: superAdmin.id,
      role: UserRole.SUPER_ADMIN,
    },
  });

  // ---------------------------------------------------------------------------
  // Firm Admin
  // ---------------------------------------------------------------------------
  const firmAdmin = await db.user.upsert({
    where: { email: "admin@smith-associates.example.com" },
    update: {},
    create: {
      email: "admin@smith-associates.example.com",
      passwordHash: demoPasswordHash,
      firstName: "Sarah",
      lastName: "Smith",
      isActive: true,
      emailVerified: new Date(),
    },
  });

  await db.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: firmAdmin.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: firmAdmin.id,
      role: UserRole.FIRM_ADMIN,
      title: "Managing Partner",
    },
  });

  // ---------------------------------------------------------------------------
  // Attorneys
  // ---------------------------------------------------------------------------
  const attorney1 = await db.user.upsert({
    where: { email: "jdoe@smith-associates.example.com" },
    update: {},
    create: {
      email: "jdoe@smith-associates.example.com",
      passwordHash: demoPasswordHash,
      firstName: "James",
      lastName: "Doe",
      isActive: true,
      emailVerified: new Date(),
    },
  });

  await db.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: attorney1.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: attorney1.id,
      role: UserRole.ATTORNEY,
      title: "Senior Attorney",
    },
  });

  const attorney2 = await db.user.upsert({
    where: { email: "mjohnson@smith-associates.example.com" },
    update: {},
    create: {
      email: "mjohnson@smith-associates.example.com",
      passwordHash: demoPasswordHash,
      firstName: "Maria",
      lastName: "Johnson",
      isActive: true,
      emailVerified: new Date(),
    },
  });

  await db.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: attorney2.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: attorney2.id,
      role: UserRole.ATTORNEY,
      title: "Associate Attorney",
    },
  });

  // ---------------------------------------------------------------------------
  // Staff
  // ---------------------------------------------------------------------------
  const staff = await db.user.upsert({
    where: { email: "staff@smith-associates.example.com" },
    update: {},
    create: {
      email: "staff@smith-associates.example.com",
      passwordHash: demoPasswordHash,
      firstName: "Alex",
      lastName: "Brown",
      isActive: true,
      emailVerified: new Date(),
    },
  });

  await db.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: staff.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: staff.id,
      role: UserRole.STAFF,
      title: "Paralegal",
    },
  });

  console.log("✓ Users created (5 total)");

  // ---------------------------------------------------------------------------
  // Practice Areas
  // ---------------------------------------------------------------------------
  const practiceAreas = await Promise.all([
    db.practiceArea.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Criminal Defense" } },
      update: {},
      create: { tenantId: tenant.id, name: "Criminal Defense", color: "#dc2626" },
    }),
    db.practiceArea.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Family Law" } },
      update: {},
      create: { tenantId: tenant.id, name: "Family Law", color: "#7c3aed" },
    }),
    db.practiceArea.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Personal Injury" } },
      update: {},
      create: { tenantId: tenant.id, name: "Personal Injury", color: "#ea580c" },
    }),
    db.practiceArea.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Corporate" } },
      update: {},
      create: { tenantId: tenant.id, name: "Corporate", color: "#0284c7" },
    }),
  ]);

  // ---------------------------------------------------------------------------
  // Clients
  // ---------------------------------------------------------------------------
  const client1 = await db.client.upsert({
    where: { id: "seed-client-1" },
    update: {},
    create: {
      id: "seed-client-1",
      tenantId: tenant.id,
      firstName: "Robert",
      lastName: "Johnson",
      email: "robert.johnson@example.com",
      phone: "(555) 234-5678",
      city: "New York",
      state: "NY",
      conflictChecked: true,
      referralSource: "Referral",
    },
  });

  const client2 = await db.client.upsert({
    where: { id: "seed-client-2" },
    update: {},
    create: {
      id: "seed-client-2",
      tenantId: tenant.id,
      firstName: "Emily",
      lastName: "Chen",
      email: "emily.chen@example.com",
      phone: "(555) 345-6789",
      city: "Brooklyn",
      state: "NY",
      conflictChecked: true,
      referralSource: "Website",
    },
  });

  const client3 = await db.client.upsert({
    where: { id: "seed-client-3" },
    update: {},
    create: {
      id: "seed-client-3",
      tenantId: tenant.id,
      firstName: "Michael",
      lastName: "Torres",
      email: "m.torres@example.com",
      clientType: "BUSINESS",
      companyName: "Torres Tech LLC",
      phone: "(555) 456-7890",
      city: "Manhattan",
      state: "NY",
      conflictChecked: true,
    },
  });

  console.log("✓ Clients created (3 total)");

  // ---------------------------------------------------------------------------
  // Matters
  // ---------------------------------------------------------------------------
  const matter1 = await db.matter.upsert({
    where: { tenantId_matterNumber: { tenantId: tenant.id, matterNumber: "2024-0001" } },
    update: {},
    create: {
      tenantId: tenant.id,
      matterNumber: "2024-0001",
      title: "Johnson v. State - DUI Defense",
      description: "Client charged with DUI following traffic stop on I-95. Seeking dismissal based on improper stop procedures.",
      practiceAreaId: practiceAreas[0].id,
      status: MatterStatus.ACTIVE,
      priority: Priority.HIGH,
      billingType: BillingType.FLAT_FEE,
      flatFee: 5000,
      dueDate: new Date(Date.now() + 30 * 86400000),
      courtName: "New York Supreme Court",
      caseNumber: "CR-2024-1234",
      clients: {
        create: { clientId: client1.id, isPrimary: true, role: "Defendant" },
      },
      assignments: {
        create: [
          { userId: attorney1.id, isLead: true, role: "Lead Attorney" },
          { userId: staff.id, role: "Paralegal" },
        ],
      },
    },
  });

  const matter2 = await db.matter.upsert({
    where: { tenantId_matterNumber: { tenantId: tenant.id, matterNumber: "2024-0002" } },
    update: {},
    create: {
      tenantId: tenant.id,
      matterNumber: "2024-0002",
      title: "Chen Divorce Proceedings",
      description: "Contested divorce proceedings. Asset division and child custody are primary issues.",
      practiceAreaId: practiceAreas[1].id,
      status: MatterStatus.ACTIVE,
      priority: Priority.MEDIUM,
      billingType: BillingType.HOURLY,
      hourlyRate: 350,
      retainerAmount: 5000,
      dueDate: new Date(Date.now() + 60 * 86400000),
      clients: {
        create: { clientId: client2.id, isPrimary: true, role: "Petitioner" },
      },
      assignments: {
        create: [
          { userId: attorney2.id, isLead: true, role: "Lead Attorney" },
          { userId: staff.id, role: "Paralegal" },
        ],
      },
    },
  });

  const matter3 = await db.matter.upsert({
    where: { tenantId_matterNumber: { tenantId: tenant.id, matterNumber: "2024-0003" } },
    update: {},
    create: {
      tenantId: tenant.id,
      matterNumber: "2024-0003",
      title: "Torres Tech - Series A Contract Review",
      description: "Review and negotiation of Series A investment documents including SHA and SPA.",
      practiceAreaId: practiceAreas[3].id,
      status: MatterStatus.INTAKE,
      priority: Priority.URGENT,
      billingType: BillingType.FLAT_FEE,
      flatFee: 15000,
      dueDate: new Date(Date.now() + 7 * 86400000),
      clients: {
        create: { clientId: client3.id, isPrimary: true, role: "Client" },
      },
      assignments: {
        create: [{ userId: firmAdmin.id, isLead: true, role: "Lead Attorney" }],
      },
    },
  });

  console.log("✓ Matters created (3 total)");

  // ---------------------------------------------------------------------------
  // Default Kanban Board
  // ---------------------------------------------------------------------------
  const existingBoard = await db.kanbanBoard.findFirst({
    where: { tenantId: tenant.id, isDefault: true },
  });

  if (!existingBoard) {
    const board = await db.kanbanBoard.create({
      data: {
        tenantId: tenant.id,
        name: "Cases",
        isDefault: true,
        columns: {
          create: [
            { name: "Intake", color: "#8b5cf6", position: 0 },
            { name: "Active", color: "#22c55e", position: 1 },
            { name: "Pending Client", color: "#eab308", position: 2 },
            { name: "Pending Court", color: "#f97316", position: 3 },
            { name: "Closed", color: "#6b7280", position: 4, isTerminal: true },
          ],
        },
      },
      include: { columns: true },
    });

    // Populate cards
    const intakeCol = board.columns.find((c) => c.name === "Intake")!;
    const activeCol = board.columns.find((c) => c.name === "Active")!;

    await db.kanbanCard.createMany({
      data: [
        {
          columnId: activeCol.id,
          matterId: matter1.id,
          title: matter1.title,
          priority: matter1.priority,
          position: 0,
          dueDate: matter1.dueDate,
        },
        {
          columnId: activeCol.id,
          matterId: matter2.id,
          title: matter2.title,
          priority: matter2.priority,
          position: 1,
          dueDate: matter2.dueDate,
        },
        {
          columnId: intakeCol.id,
          matterId: matter3.id,
          title: matter3.title,
          priority: matter3.priority,
          position: 0,
          dueDate: matter3.dueDate,
        },
      ],
    });

    console.log("✓ Kanban board and cards created");
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n✅ Seed complete!\n");
  console.log("Demo accounts (password: Demo@Password1! for all):");
  console.log(`  Super Admin:  superadmin@lincoln.example.com`);
  console.log(`  Firm Admin:   admin@smith-associates.example.com`);
  console.log(`  Attorney 1:   jdoe@smith-associates.example.com`);
  console.log(`  Attorney 2:   mjohnson@smith-associates.example.com`);
  console.log(`  Staff:        staff@smith-associates.example.com`);
  console.log("\n⚠️  Change all passwords before production use!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
