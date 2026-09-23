/**
 * seed.js
 * -------
 * Unified database seed and bootstrap script for RTS Help Desk.
 * Consolidates:
 *   1. bootstrapAdmin()       — Initial Department + ADMIN User + ADMIN Role (scoped replica mode)
 *   2. seedPermissions()      — 39 Permissions, ADMIN/USER Roles, Scope Mappings, roleId verification
 *   3. seedDefaultStatuses()  — 5 Global Ticket Statuses (ON CONFLICT DO NOTHING)
 *   4. seedMasterData()       — Departments, Teams, Projects, Priority Levels (upserts)
 *
 * Safe to run from a completely empty database to fully populated.
 * Safe to re-run multiple times with zero duplicates and zero errors.
 *
 * Usage:
 *   node prisma/seed.js
 *   -or-
 *   npm run prisma:seed
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// ─── Constants & Configuration ──────────────────────────────────────────────────
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_EMAIL = 'admin@rts.com';
const ADMIN_NAME = 'System Admin';
const DEFAULT_DEPARTMENT = 'Information Technology';

// ─── 39 System Permissions (BRD v14, Section 3.5) ──────────────────────────────
const PERMISSIONS = [
  // User management
  { key: 'USER_CREATE',              description: 'Create new user accounts',                                    category: 'User' },
  { key: 'USER_UPDATE',              description: 'Update user account details',                                 category: 'User' },
  { key: 'USER_DELETE',              description: 'Deactivate or delete user accounts',                          category: 'User' },
  { key: 'USER_VIEW',                description: 'View user profiles and details',                              category: 'User' },

  // Department management
  { key: 'DEPARTMENT_CREATE',        description: 'Create new departments',                                      category: 'Department' },
  { key: 'DEPARTMENT_UPDATE',        description: 'Update department details',                                   category: 'Department' },
  { key: 'DEPARTMENT_DELETE',        description: 'Deactivate or delete departments',                            category: 'Department' },
  { key: 'DEPARTMENT_VIEW',          description: 'View department information',                                 category: 'Department' },

  // Team management
  { key: 'TEAM_CREATE',              description: 'Create new teams within a department',                        category: 'Team' },
  { key: 'TEAM_UPDATE',              description: 'Update team details',                                         category: 'Team' },
  { key: 'TEAM_DEPARTMENT_CHANGE',   description: 'Reassign teams to a different department',                    category: 'Team' },
  { key: 'TEAM_DELETE',              description: 'Deactivate or delete teams',                                  category: 'Team' },
  { key: 'TEAM_VIEW',                description: 'View team information and members',                           category: 'Team' },

  // Project management
  { key: 'PROJECT_CREATE',           description: 'Create new projects',                                         category: 'Project' },
  { key: 'PROJECT_UPDATE',           description: 'Update project details',                                      category: 'Project' },
  { key: 'PROJECT_DELETE',           description: 'Deactivate or delete projects',                               category: 'Project' },
  { key: 'PROJECT_VIEW',             description: 'View project information',                                    category: 'Project' },

  // Priority & Status management
  { key: 'PRIORITY_CREATE',          description: 'Create new priority levels',                                  category: 'Priority & Status' },
  { key: 'PRIORITY_UPDATE',          description: 'Rename, recolor, or reorder existing priority levels',         category: 'Priority & Status' },
  { key: 'PRIORITY_RETIRE',          description: 'Retire (soft-delete) priority levels',                        category: 'Priority & Status' },
  { key: 'PRIORITY_MANAGE',          description: 'Create, update, reorder, and retire priority levels',         category: 'Priority & Status' },
  { key: 'STATUS_CREATE',            description: 'Create new ticket statuses (global or team-specific)',        category: 'Priority & Status' },
  { key: 'STATUS_UPDATE',            description: 'Rename or reorder existing ticket statuses',                  category: 'Priority & Status' },
  { key: 'STATUS_RETIRE',            description: 'Retire (soft-delete) ticket statuses',                        category: 'Priority & Status' },

  // Field & membership management
  { key: 'TICKET_FIELD_MANAGE',      description: 'Create, update, and retire custom ticket field definitions',  category: 'Ticket Field' },
  { key: 'TEAM_MEMBERSHIP_MANAGE',   description: 'Add or remove users from teams',                             category: 'Team' },

  // Ticket operations
  { key: 'TICKET_CREATE',            description: 'Create new tickets',                                          category: 'Ticket' },
  { key: 'TICKET_VIEW',              description: 'View ticket details and lists',                               category: 'Ticket' },
  { key: 'TICKET_UPDATE',            description: 'Update ticket summary, description, and custom fields',       category: 'Ticket' },
  { key: 'TICKET_ASSIGN',            description: 'Assign users to tickets',                                     category: 'Ticket' },
  { key: 'TICKET_REASSIGN',          description: 'Reassign tickets to different users or teams',                category: 'Ticket' },
  { key: 'TICKET_CHANGE_STATUS',     description: 'Change the status of a ticket',                               category: 'Ticket' },
  { key: 'TICKET_CHANGE_PRIORITY',   description: 'Change the priority level of a ticket',                       category: 'Ticket' },
  { key: 'TICKET_CLOSE',             description: 'Close a ticket (transition to CLOSED behavior)',              category: 'Ticket' },
  { key: 'TICKET_CREATE_SUBTICKET',  description: 'Create sub-tickets under an existing ticket',                 category: 'Ticket' },
  { key: 'TICKET_ADD_REMARK',        description: 'Add remarks/comments to a ticket',                            category: 'Ticket' },
  { key: 'TICKET_ATTACHMENT_MANAGE', description: 'Upload and delete ticket attachments',                        category: 'Ticket' },
  { key: 'TICKET_LOG_TIME',          description: 'Log time entries against a ticket',                           category: 'Ticket' },
  { key: 'TICKET_HISTORY_VIEW',      description: 'View the full audit history of a ticket',                     category: 'Ticket' },
  { key: 'TICKET_TEAM_MANAGE',       description: 'Add or remove collaborating teams on a ticket',              category: 'Ticket' },

  // Dashboard & reporting
  { key: 'DASHBOARD_VIEW',           description: 'View dashboard analytics and summaries',                      category: 'Dashboard' },
  { key: 'USER_PERFORMANCE_VIEW',    description: 'View user performance metrics and reports',                   category: 'Dashboard' },

  // Role management
  { key: 'ROLE_MANAGE',              description: 'Create, update, and manage roles and their permissions',      category: 'Role' },

  // System settings
  { key: 'SYSTEM_SETTINGS_MANAGE',   description: 'Manage global application settings and configuration',         category: 'System' },
];

const ADMIN_PERMISSIONS = PERMISSIONS.map((p) => ({
  key: p.key,
  scope: 'GLOBAL',
}));

const USER_PERMISSIONS = [
  { key: 'USER_VIEW',                scope: 'OWN' },
  { key: 'USER_UPDATE',              scope: 'OWN' },
  { key: 'DEPARTMENT_VIEW',          scope: 'OWN' },
  { key: 'TEAM_VIEW',                scope: 'TEAM' },
  { key: 'PROJECT_VIEW',             scope: 'TEAM' },
  { key: 'STATUS_CREATE',            scope: 'TEAM' },
  { key: 'TICKET_CREATE',            scope: 'TEAM' },
  { key: 'TICKET_VIEW',              scope: 'TEAM' },
  { key: 'TICKET_UPDATE',            scope: 'ASSIGNED' },
  { key: 'TICKET_ASSIGN',            scope: 'OWN' },
  { key: 'TICKET_REASSIGN',          scope: 'OWN' },
  { key: 'TICKET_CHANGE_STATUS',     scope: 'ASSIGNED' },
  { key: 'TICKET_CHANGE_PRIORITY',   scope: 'ASSIGNED' },
  { key: 'TICKET_CREATE_SUBTICKET',  scope: 'OWN' },
  { key: 'TICKET_CLOSE',             scope: 'ASSIGNED' },
  { key: 'TICKET_ADD_REMARK',        scope: 'OWN' },
  { key: 'TICKET_ATTACHMENT_MANAGE', scope: 'OWN' },
  { key: 'TICKET_LOG_TIME',          scope: 'OWN' },
  { key: 'TICKET_HISTORY_VIEW',      scope: 'TEAM' },
  { key: 'DASHBOARD_VIEW',           scope: 'OWN' },
];

// ─── 1. Bootstrap Admin ─────────────────────────────────────────────────────────
async function bootstrapAdmin() {
  console.log('── Step 1: Bootstrap Admin User ──');

  // Guard: Skip if an admin user already exists
  const existingAdmin = await prisma.user.findFirst({
    where: { legacyRole: 'ADMIN' },
    select: { id: true, username: true, email: true },
  });

  if (existingAdmin) {
    console.log(`✓ Admin already bootstrapped ("${existingAdmin.username}", ID: ${existingAdmin.id}), skipping.\n`);
    return existingAdmin;
  }

  console.log('No ADMIN user found. Bootstrapping first Department, Role, and Admin User...');
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await prisma.$transaction(async (tx) => {
    // ── Circular FK Block (Strictly Scoped Replica Mode) ───────────────────
    // Temporarily disable FK checks to solve the circular dependency:
    // Department needs createdById (User), User needs departmentId & roleId.
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);

    // 1. Insert Department (placeholder createdById = 1)
    await tx.$executeRawUnsafe(`
      INSERT INTO departments (name, description, status, "createdById", "createdAt")
      VALUES ($1, 'Core IT Department — bootstrap seed', 'ACTIVE', 1, NOW())
      ON CONFLICT (name) DO NOTHING
    `, DEFAULT_DEPARTMENT);

    const [dept] = await tx.$queryRawUnsafe(`
      SELECT id FROM departments WHERE name = $1
    `, DEFAULT_DEPARTMENT);

    // 2. Insert ADMIN Role (placeholder createdById = 1)
    await tx.$executeRawUnsafe(`
      INSERT INTO roles (name, description, status, "createdById", "createdAt")
      VALUES ('ADMIN', 'Full system administrator with global access to all features', 'ACTIVE', 1, NOW())
      ON CONFLICT (name) DO NOTHING
    `);

    const [adminRole] = await tx.$queryRawUnsafe(`
      SELECT id FROM roles WHERE name = 'ADMIN'
    `);

    // 3. Insert ADMIN User with actual dept.id and role.id
    await tx.$executeRawUnsafe(`
      INSERT INTO users (name, username, password, email, role, "roleId", status, "departmentId", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, 'ADMIN', $5, 'ACTIVE', $6, NOW(), NOW())
      ON CONFLICT (username) DO NOTHING
    `, ADMIN_NAME, ADMIN_USERNAME, hashedPassword, ADMIN_EMAIL, adminRole.id, dept.id);

    // ── Explicitly restore normal constraint & trigger enforcement ─────────
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'origin'`);

    const [adminUser] = await tx.$queryRawUnsafe(`
      SELECT id, username, email FROM users WHERE username = $1
    `, ADMIN_USERNAME);

    // 4. Update circular FKs to point to the actual created admin user
    await tx.$executeRawUnsafe(`
      UPDATE departments SET "createdById" = $1 WHERE id = $2
    `, adminUser.id, dept.id);

    await tx.$executeRawUnsafe(`
      UPDATE roles SET "createdById" = $1 WHERE id = $2
    `, adminUser.id, adminRole.id);

    return adminUser;
  });

  console.log(`✓ Bootstrapped Admin: "${admin.username}" (ID: ${admin.id})`);
  console.log(`  Credentials: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}\n`);
  return admin;
}

// ─── 2. Seed Permissions ───────────────────────────────────────────────────────
async function seedPermissions(adminUser) {
  console.log('── Step 2: Seed RBAC Permissions & Roles ──');

  await prisma.$transaction(async (tx) => {
    // 1. Upsert all 39 permissions
    for (const perm of PERMISSIONS) {
      await tx.permission.upsert({
        where: { key: perm.key },
        update: { description: perm.description, category: perm.category },
        create: perm,
      });
    }
    console.log(`  ✓ ${PERMISSIONS.length} permissions upserted.`);

    // 2. Upsert ADMIN and USER roles
    const adminRole = await tx.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: {
        name: 'ADMIN',
        description: 'Full system administrator with global access to all features',
        createdById: adminUser.id,
      },
    });

    const userRole = await tx.role.upsert({
      where: { name: 'USER' },
      update: {},
      create: {
        name: 'USER',
        description: 'Standard user with scoped access to assigned and team resources',
        createdById: adminUser.id,
      },
    });
    console.log(`  ✓ Roles: ADMIN (ID: ${adminRole.id}), USER (ID: ${userRole.id})`);

    // 3. Upsert RolePermission mappings
    const allPerms = await tx.permission.findMany();
    const permByKey = Object.fromEntries(allPerms.map((p) => [p.key, p]));

    const upsertRolePermissions = async (roleId, roleName, mappings) => {
      let count = 0;
      for (const mapping of mappings) {
        const perm = permByKey[mapping.key];
        if (!perm) continue;

        const scopeValue = mapping.scope || null;

        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId_scope: {
              roleId,
              permissionId: perm.id,
              scope: scopeValue,
            },
          },
          update: {},
          create: {
            roleId,
            permissionId: perm.id,
            scope: scopeValue,
            grantedById: adminUser.id,
          },
        });
        count++;
      }
      console.log(`  ✓ ${roleName}: ${count} mappings upserted.`);

      // ─────────────────────────────────────────────────────────────────────────────
      // CRITICAL ARCHITECTURE RULE / PRUNING WARNING:
      // USER_PERMISSIONS and ADMIN_PERMISSIONS arrays above are the SINGLE SOURCE
      // OF TRUTH for role permissions.
      //
      // Any permission grant or scope upserted directly into the live database
      // without being mirrored in USER_PERMISSIONS or ADMIN_PERMISSIONS WILL BE
      // SILENTLY DELETED by the pruning loop below whenever seed.js is run!
      //
      // If adding or widening a permission for any role, ALWAYS update the seed arrays
      // first before running seeds or live DB syncs.
      // ─────────────────────────────────────────────────────────────────────────────
      // Prune stale role_permissions strictly for this specific roleId
      const desiredMappings = mappings
        .map((m) => {
          const perm = permByKey[m.key];
          return perm ? { permissionId: perm.id, scope: m.scope || null } : null;
        })
        .filter(Boolean);

      const existingRPs = await tx.rolePermission.findMany({
        where: { roleId },
      });

      let prunedCount = 0;
      for (const existing of existingRPs) {
        const isKept = desiredMappings.some(
          (d) => d.permissionId === existing.permissionId && d.scope === existing.scope
        );
        if (!isKept) {
          await tx.rolePermission.delete({
            where: { id: existing.id },
          });
          prunedCount++;
        }
      }
      if (prunedCount > 0) {
        console.log(`  ✓ ${roleName}: ${prunedCount} stale mappings pruned.`);
      }
    };

    await upsertRolePermissions(adminRole.id, 'ADMIN', ADMIN_PERMISSIONS);
    await upsertRolePermissions(userRole.id, 'USER', USER_PERMISSIONS);

    // 4. Backfill roleId on existing users (if any exist without it)
    await tx.$executeRawUnsafe(`
      UPDATE users SET "roleId" = $1 WHERE role = 'ADMIN' AND "roleId" IS NULL
    `, adminRole.id);

    await tx.$executeRawUnsafe(`
      UPDATE users SET "roleId" = $1 WHERE role = 'USER' AND "roleId" IS NULL
    `, userRole.id);

    console.log('  ✓ Verified role assignments on all users.\n');
  });
}

// ─── 3. Seed Default Ticket Statuses ───────────────────────────────────────────
async function seedDefaultStatuses() {
  console.log('── Step 3: Seed Default Global Ticket Statuses ──');

  const result = await prisma.$executeRawUnsafe(`
    INSERT INTO ticket_statuses (label, description, "sortOrder", status, "isDefault", behavior, "teamId", "createdById", "createdAt", "updatedAt")
    VALUES
      ('Open',        'Ticket has been created and is awaiting action.',       1, 'ACTIVE', true, 'OPEN',        NULL, NULL, NOW(), NOW()),
      ('In Progress', 'Ticket is actively being worked on.',                   2, 'ACTIVE', true, 'IN_PROGRESS', NULL, NULL, NOW(), NOW()),
      ('On Hold',     'Ticket work is temporarily paused.',                    3, 'ACTIVE', true, 'ON_HOLD',     NULL, NULL, NOW(), NOW()),
      ('Resolved',    'Ticket issue has been resolved, pending closure.',      4, 'ACTIVE', true, 'RESOLVED',    NULL, NULL, NOW(), NOW()),
      ('Closed',      'Ticket is fully closed.',                               5, 'ACTIVE', true, 'CLOSED',      NULL, NULL, NOW(), NOW())
    ON CONFLICT DO NOTHING
  `);

  console.log(`  Raw insert rows affected: ${result} (0 on re-run = expected)`);

  const statuses = await prisma.$queryRawUnsafe(`
    SELECT id, label, behavior, "isDefault" FROM ticket_statuses
    WHERE "teamId" IS NULL AND "isDefault" = true
    ORDER BY "sortOrder"
  `);

  for (const s of statuses) {
    console.log(`  ✓ [ID ${s.id}] ${s.label} (${s.behavior})`);
  }
  console.log();
}

// ─── 4. Seed Dev/Test Master Data ───────────────────────────────────────────────
async function seedMasterData(adminUser) {
  console.log('── Step 4: Seed Dev/Test Master Data ──');

  // Departments
  console.log('Upserting departments...');
  const itDept = await prisma.department.upsert({
    where: { name: 'Information Technology' },
    update: {},
    create: {
      name: 'Information Technology',
      description: 'Core IT Department',
      createdById: adminUser.id,
    },
  });
  console.log(`  ✓ Department: Information Technology (ID: ${itDept.id})`);

  const hrDept = await prisma.department.upsert({
    where: { name: 'Human Resources' },
    update: {},
    create: {
      name: 'Human Resources',
      description: 'HR Department',
      createdById: adminUser.id,
    },
  });
  console.log(`  ✓ Department: Human Resources (ID: ${hrDept.id})\n`);

  // Teams (scoped per department)
  console.log('Upserting teams...');
  const backendTeam = await prisma.team.upsert({
    where: { departmentId_name: { departmentId: itDept.id, name: 'Backend Engineering' } },
    update: {},
    create: {
      name: 'Backend Engineering',
      description: 'Backend development team',
      teamAdminEmail: 'backend-lead@rts.com',
      departmentId: itDept.id,
      createdById: adminUser.id,
    },
  });
  console.log(`  ✓ Team: Backend Engineering [IT] (ID: ${backendTeam.id})`);

  const frontendTeam = await prisma.team.upsert({
    where: { departmentId_name: { departmentId: itDept.id, name: 'Frontend Engineering' } },
    update: {},
    create: {
      name: 'Frontend Engineering',
      description: 'Frontend development team',
      teamAdminEmail: 'frontend-lead@rts.com',
      departmentId: itDept.id,
      createdById: adminUser.id,
    },
  });
  console.log(`  ✓ Team: Frontend Engineering [IT] (ID: ${frontendTeam.id})`);

  const hrOpsTeam = await prisma.team.upsert({
    where: { departmentId_name: { departmentId: hrDept.id, name: 'HR Operations' } },
    update: {},
    create: {
      name: 'HR Operations',
      description: 'HR operations and administration',
      teamAdminEmail: 'hr-lead@rts.com',
      departmentId: hrDept.id,
      createdById: adminUser.id,
    },
  });
  console.log(`  ✓ Team: HR Operations [HR] (ID: ${hrOpsTeam.id})\n`);

  // Projects
  console.log('Upserting projects...');
  const proj1 = await prisma.project.upsert({
    where: { name: 'Internal Tools' },
    update: {},
    create: {
      name: 'Internal Tools',
      description: 'Internal company tools and automation',
      createdById: adminUser.id,
    },
  });
  console.log(`  ✓ Project: Internal Tools (ID: ${proj1.id})`);

  const proj2 = await prisma.project.upsert({
    where: { name: 'Customer Portal' },
    update: {},
    create: {
      name: 'Customer Portal',
      description: 'Customer-facing portal application',
      createdById: adminUser.id,
    },
  });
  console.log(`  ✓ Project: Customer Portal (ID: ${proj2.id})\n`);

  // Priority Levels
  console.log('Upserting priority levels...');
  const high = await prisma.priorityLevel.upsert({
    where: { label: 'High' },
    update: {},
    create: {
      label: 'High',
      sortOrder: 1,
      createdById: adminUser.id,
    },
  });
  console.log(`  ✓ Priority Level: High (sortOrder: 1, ID: ${high.id})`);

  const medium = await prisma.priorityLevel.upsert({
    where: { label: 'Medium' },
    update: {},
    create: {
      label: 'Medium',
      sortOrder: 2,
      createdById: adminUser.id,
    },
  });
  console.log(`  ✓ Priority Level: Medium (sortOrder: 2, ID: ${medium.id})`);

  const low = await prisma.priorityLevel.upsert({
    where: { label: 'Low' },
    update: {},
    create: {
      label: 'Low',
      sortOrder: 3,
      createdById: adminUser.id,
    },
  });
  console.log(`  ✓ Priority Level: Low (sortOrder: 3, ID: ${low.id})\n`);

  // Standard User: Saran
  console.log('Upserting user Saran...');
  const userRoleObj = await prisma.role.findUnique({ where: { name: 'USER' } });
  const saranPassword = await bcrypt.hash('Saran@123', 10);
  const saranUser = await prisma.user.upsert({
    where: { username: 'Saran' },
    update: {
      password: saranPassword,
      roleId: userRoleObj ? userRoleObj.id : undefined,
      departmentId: itDept.id,
      status: 'ACTIVE',
    },
    create: {
      name: 'Saran',
      username: 'Saran',
      password: saranPassword,
      email: 'saran@rts.com',
      legacyRole: 'USER',
      roleId: userRoleObj.id,
      departmentId: itDept.id,
      status: 'ACTIVE',
    },
  });
  console.log(`  ✓ User: Saran (Username: Saran, Password: Saran@123, Dept: IT, ID: ${saranUser.id})\n`);
}

// ─── Main Execution Pipeline ───────────────────────────────────────────────────
async function main() {
  console.log('====================================================');
  console.log('       RTS Help Desk — Unified Database Seed         ');
  console.log('====================================================\n');

  const adminUser = await bootstrapAdmin();
  await seedPermissions(adminUser);
  await seedDefaultStatuses();
  await seedMasterData(adminUser);

  console.log('====================================================');
  console.log('       ✓ All Seeds Completed Successfully           ');
  console.log('====================================================');
}

main()
  .catch((e) => {
    console.error('❌ Seed execution failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
