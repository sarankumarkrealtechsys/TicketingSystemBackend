-- CreateEnum
CREATE TYPE "LegacyRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MasterDataStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TicketStatusBehavior" AS ENUM ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketHistoryAction" AS ENUM ('CREATED', 'STATUS_CHANGED', 'ASSIGNEE_ADDED', 'ASSIGNEE_REMOVED', 'REASSIGNED', 'PRIORITY_CHANGED', 'REMARK_ADDED', 'SUB_TICKET_CREATED', 'TIME_LOGGED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED', 'CUSTOM_FIELD_CHANGED', 'TEAM_ADDED', 'TEAM_REMOVED');

-- CreateEnum
CREATE TYPE "TicketFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME', 'SELECT', 'MULTI_SELECT', 'EMAIL', 'URL');

-- CreateEnum
CREATE TYPE "TimeEntryWorkType" AS ENUM ('INVESTIGATION', 'DEVELOPMENT', 'BUG_FIX', 'TESTING', 'CODE_REVIEW', 'DEPLOYMENT', 'COMMUNICATION', 'DOCUMENTATION', 'OTHER');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('GLOBAL', 'OWN', 'ASSIGNED', 'TEAM', 'DEPARTMENT');

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "email" VARCHAR(190) NOT NULL,
    "role" "LegacyRole" NOT NULL DEFAULT 'USER',
    "roleId" INTEGER,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "departmentId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" SERIAL NOT NULL,
    "roleId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,
    "scope" "PermissionScope",
    "grantedById" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "teamAdminEmail" VARCHAR(190) NOT NULL,
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "departmentId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_teams" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "addedById" INTEGER NOT NULL,
    "removedById" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "user_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "priority_levels" (
    "id" SERIAL NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "priority_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_statuses" (
    "id" SERIAL NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "behavior" "TicketStatusBehavior" NOT NULL,
    "teamId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" SERIAL NOT NULL,
    "ticketNumber" VARCHAR(20) NOT NULL,
    "projectId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "summary" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "priorityId" INTEGER NOT NULL,
    "statusId" INTEGER NOT NULL,
    "parentTicketId" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_ticket_sequences" (
    "sequenceDate" DATE NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_ticket_sequences_pkey" PRIMARY KEY ("sequenceDate")
);

-- CreateTable
CREATE TABLE "ticket_assignees" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "teamId" INTEGER,
    "assignedById" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "ticket_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_teams" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "assignedById" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "ticket_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_history" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "action" "TicketHistoryAction" NOT NULL,
    "previousStatusId" INTEGER,
    "newStatusId" INTEGER,
    "previousBehavior" "TicketStatusBehavior",
    "newBehavior" "TicketStatusBehavior",
    "previousTeamId" INTEGER,
    "newTeamId" INTEGER,
    "previousPriorityId" INTEGER,
    "newPriorityId" INTEGER,
    "previousValue" TEXT,
    "newValue" TEXT,
    "remarks" TEXT,
    "updatedById" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "entityType" VARCHAR(40) NOT NULL,
    "entityId" INTEGER NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "performedById" INTEGER NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "minutesSpent" INTEGER NOT NULL,
    "workType" "TimeEntryWorkType" NOT NULL,
    "note" TEXT,
    "isBillable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_attachments" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "originalFileName" VARCHAR(255) NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "mimeType" VARCHAR(150) NOT NULL,
    "fileExtension" VARCHAR(20),
    "fileSizeBytes" BIGINT NOT NULL,
    "checksum" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,

    CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_field_definitions" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "fieldType" "TicketFieldType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "options" JSONB,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_field_values" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "fieldDefinitionId" INTEGER NOT NULL,
    "textValue" TEXT,
    "numberValue" BIGINT,
    "decimalValue" DECIMAL(18,4),
    "booleanValue" BOOLEAN,
    "dateValue" TIMESTAMP(3),
    "selectedOptions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE INDEX "departments_status_idx" ON "departments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_user_department_status_role" ON "users"("departmentId", "status", "role");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "roles_status_idx" ON "roles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_category_idx" ON "permissions"("category");

-- CreateIndex
CREATE INDEX "role_permissions_roleId_idx" ON "role_permissions"("roleId");

-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_scope_key" ON "role_permissions"("roleId", "permissionId", "scope");

-- CreateIndex
CREATE INDEX "idx_team_department_status" ON "teams"("departmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "teams_departmentId_name_key" ON "teams"("departmentId", "name");

-- CreateIndex
CREATE INDEX "idx_user_team_user_active" ON "user_teams"("userId", "removedAt");

-- CreateIndex
CREATE INDEX "idx_user_team_team_active" ON "user_teams"("teamId", "removedAt");

-- CreateIndex
CREATE INDEX "user_teams_addedById_idx" ON "user_teams"("addedById");

-- CreateIndex
CREATE INDEX "user_teams_removedById_idx" ON "user_teams"("removedById");

-- CreateIndex
CREATE UNIQUE INDEX "projects_name_key" ON "projects"("name");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE UNIQUE INDEX "priority_levels_label_key" ON "priority_levels"("label");

-- CreateIndex
CREATE INDEX "priority_levels_status_sortOrder_idx" ON "priority_levels"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "ticket_statuses_status_sortOrder_idx" ON "ticket_statuses"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "ticket_statuses_teamId_status_idx" ON "ticket_statuses"("teamId", "status");

-- CreateIndex
CREATE INDEX "ticket_statuses_behavior_idx" ON "ticket_statuses"("behavior");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticketNumber_key" ON "tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "idx_ticket_team_status_priority" ON "tickets"("teamId", "statusId", "priorityId");

-- CreateIndex
CREATE INDEX "idx_ticket_project_team_status" ON "tickets"("projectId", "teamId", "statusId");

-- CreateIndex
CREATE INDEX "idx_ticket_status_created" ON "tickets"("statusId", "createdAt");

-- CreateIndex
CREATE INDEX "tickets_parentTicketId_idx" ON "tickets"("parentTicketId");

-- CreateIndex
CREATE INDEX "tickets_createdById_idx" ON "tickets"("createdById");

-- CreateIndex
CREATE INDEX "tickets_createdAt_idx" ON "tickets"("createdAt");

-- CreateIndex
CREATE INDEX "tickets_resolvedAt_idx" ON "tickets"("resolvedAt");

-- CreateIndex
CREATE INDEX "tickets_closedAt_idx" ON "tickets"("closedAt");

-- CreateIndex
CREATE INDEX "idx_assignee_ticket_active" ON "ticket_assignees"("ticketId", "removedAt");

-- CreateIndex
CREATE INDEX "idx_assignee_user_active" ON "ticket_assignees"("userId", "removedAt");

-- CreateIndex
CREATE INDEX "idx_assignee_team_active" ON "ticket_assignees"("teamId", "removedAt");

-- CreateIndex
CREATE INDEX "idx_ticket_team_ticket_active" ON "ticket_teams"("ticketId", "removedAt");

-- CreateIndex
CREATE INDEX "idx_ticket_team_team_active" ON "ticket_teams"("teamId", "removedAt");

-- CreateIndex
CREATE INDEX "idx_history_ticket_updated" ON "ticket_history"("ticketId", "updatedAt");

-- CreateIndex
CREATE INDEX "ticket_history_action_idx" ON "ticket_history"("action");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_performedAt_idx" ON "audit_log"("entityType", "entityId", "performedAt");

-- CreateIndex
CREATE INDEX "audit_log_performedById_performedAt_idx" ON "audit_log"("performedById", "performedAt");

-- CreateIndex
CREATE INDEX "idx_time_ticket_work_date" ON "time_entries"("ticketId", "workDate");

-- CreateIndex
CREATE INDEX "idx_time_user_work_date" ON "time_entries"("userId", "workDate");

-- CreateIndex
CREATE INDEX "idx_time_user_work_type_date" ON "time_entries"("userId", "workType", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_attachments_storageKey_key" ON "ticket_attachments"("storageKey");

-- CreateIndex
CREATE INDEX "idx_attachment_ticket_created" ON "ticket_attachments"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_attachment_uploader_created" ON "ticket_attachments"("uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "idx_attachment_ticket_deleted" ON "ticket_attachments"("ticketId", "deletedAt");

-- CreateIndex
CREATE INDEX "idx_field_def_team_status_sort" ON "ticket_field_definitions"("teamId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "idx_field_def_status_sort" ON "ticket_field_definitions"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "idx_field_value_def" ON "ticket_field_values"("fieldDefinitionId");

-- CreateIndex
CREATE INDEX "idx_field_value_ticket" ON "ticket_field_values"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_field_values_ticketId_fieldDefinitionId_key" ON "ticket_field_values"("ticketId", "fieldDefinitionId");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_teams" ADD CONSTRAINT "user_teams_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_teams" ADD CONSTRAINT "user_teams_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_teams" ADD CONSTRAINT "user_teams_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_teams" ADD CONSTRAINT "user_teams_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "priority_levels" ADD CONSTRAINT "priority_levels_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_statuses" ADD CONSTRAINT "ticket_statuses_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_statuses" ADD CONSTRAINT "ticket_statuses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "priority_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "ticket_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_parentTicketId_fkey" FOREIGN KEY ("parentTicketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_teams" ADD CONSTRAINT "ticket_teams_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_teams" ADD CONSTRAINT "ticket_teams_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_teams" ADD CONSTRAINT "ticket_teams_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_history" ADD CONSTRAINT "ticket_history_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_history" ADD CONSTRAINT "ticket_history_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_field_definitions" ADD CONSTRAINT "ticket_field_definitions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_field_definitions" ADD CONSTRAINT "ticket_field_definitions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_field_values" ADD CONSTRAINT "ticket_field_values_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_field_values" ADD CONSTRAINT "ticket_field_values_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "ticket_field_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
