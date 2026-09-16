-- =====================================================================
-- RAW SQL MIGRATION — Items 1–19 from schema.prisma migration checklist
-- =====================================================================
-- Apply as a Prisma migration after the initial schema migration.
-- Creates: 7 partial unique indexes, 4 CHECK constraints, 8 trigger functions + 9 triggers.
--
-- How to apply:
--   1. npx prisma migrate dev --create-only --name raw-sql-constraints
--   2. Replace the generated migration.sql with this file's contents
--   3. npx prisma migrate dev
-- =====================================================================


-- ═══════════════════════════════════════════════════════════════════════
-- (1) TICKET ASSIGNEE — Partial unique index: one active assignee per (ticket, user)
-- ═══════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX "uq_assignee_active"
ON "ticket_assignees" ("ticketId", "userId")
WHERE "removedAt" IS NULL;


-- ═══════════════════════════════════════════════════════════════════════
-- (2) TICKET ASSIGNEE — Trigger: enforce_assignee_team_and_dept
--     • assignee.teamId IS NULL OR equals ticket.teamId OR is an active
--       collaborating team on that ticket
--     • assignee user's departmentId must equal ticket.team.departmentId
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_enforce_assignee_team_and_dept()
RETURNS TRIGGER AS $$
DECLARE
  v_ticket_team_id INT;
  v_ticket_team_dept_id INT;
  v_user_dept_id INT;
BEGIN
  -- Fetch ticket's primary team and that team's department
  SELECT t."teamId", tm."departmentId"
  INTO v_ticket_team_id, v_ticket_team_dept_id
  FROM tickets t
  JOIN teams tm ON tm.id = t."teamId"
  WHERE t.id = NEW."ticketId";

  -- Fetch assignee user's department
  SELECT "departmentId" INTO v_user_dept_id
  FROM users WHERE id = NEW."userId";

  -- Department check: assignee must be in the same department as the ticket's team
  IF v_user_dept_id != v_ticket_team_dept_id THEN
    RAISE EXCEPTION 'Assignee user (id=%) belongs to department %, but ticket''s team belongs to department %. Cross-department assignment not allowed.',
      NEW."userId", v_user_dept_id, v_ticket_team_dept_id;
  END IF;

  -- Team scope check: if a contextual team is specified, it must be valid
  IF NEW."teamId" IS NOT NULL THEN
    IF NEW."teamId" != v_ticket_team_id
       AND NOT EXISTS (
         SELECT 1 FROM ticket_teams
         WHERE "ticketId" = NEW."ticketId"
           AND "teamId" = NEW."teamId"
           AND "removedAt" IS NULL
       )
    THEN
      RAISE EXCEPTION 'Assignee team (id=%) is neither the primary team nor an active collaborating team on ticket (id=%)',
        NEW."teamId", NEW."ticketId";
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_assignee_team_and_dept
BEFORE INSERT OR UPDATE ON ticket_assignees
FOR EACH ROW EXECUTE FUNCTION fn_enforce_assignee_team_and_dept();


-- ═══════════════════════════════════════════════════════════════════════
-- (3) TICKET — Trigger: enforce_ticket_status_team
--     status.teamId IS NULL OR equals ticket.teamId OR is in the
--     ticket's active collaborating teams
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_enforce_ticket_status_team()
RETURNS TRIGGER AS $$
DECLARE
  v_status_team_id INT;
BEGIN
  -- Get the team that owns this status (NULL = global, always valid)
  SELECT "teamId" INTO v_status_team_id
  FROM ticket_statuses WHERE id = NEW."statusId";

  -- If the status is team-scoped, it must match the ticket's primary or collaborating teams
  IF v_status_team_id IS NOT NULL
     AND v_status_team_id != NEW."teamId"
     AND NOT EXISTS (
       SELECT 1 FROM ticket_teams
       WHERE "ticketId" = NEW.id
         AND "teamId" = v_status_team_id
         AND "removedAt" IS NULL
     )
  THEN
    RAISE EXCEPTION 'Ticket status (id=%) belongs to team %, which is neither the primary team nor an active collaborating team on ticket (id=%)',
      NEW."statusId", v_status_team_id, NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_ticket_status_team
BEFORE INSERT OR UPDATE ON tickets
FOR EACH ROW EXECUTE FUNCTION fn_enforce_ticket_status_team();


-- ═══════════════════════════════════════════════════════════════════════
-- (4) TICKET — CHECK: no self-parenting
--     parent_ticket_id IS NULL OR parent_ticket_id <> id
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE tickets
ADD CONSTRAINT "chk_no_self_parenting"
CHECK ("parentTicketId" IS NULL OR "parentTicketId" <> id);


-- ═══════════════════════════════════════════════════════════════════════
-- (5) TEAM — Trigger: prevent_team_department_change
--     Block departmentId change once Team has tickets, active
--     assignments, or active memberships
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_prevent_team_department_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."departmentId" IS DISTINCT FROM NEW."departmentId" THEN
    -- Check for tickets referencing this team
    IF EXISTS (SELECT 1 FROM tickets WHERE "teamId" = NEW.id LIMIT 1) THEN
      RAISE EXCEPTION 'Cannot change department for team (id=%) — it has existing tickets', NEW.id;
    END IF;

    -- Check for active ticket assignments
    IF EXISTS (SELECT 1 FROM ticket_assignees WHERE "teamId" = NEW.id AND "removedAt" IS NULL LIMIT 1) THEN
      RAISE EXCEPTION 'Cannot change department for team (id=%) — it has active ticket assignments', NEW.id;
    END IF;

    -- Check for active team memberships
    IF EXISTS (SELECT 1 FROM user_teams WHERE "teamId" = NEW.id AND "removedAt" IS NULL LIMIT 1) THEN
      RAISE EXCEPTION 'Cannot change department for team (id=%) — it has active team memberships', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_team_department_change
BEFORE UPDATE ON teams
FOR EACH ROW EXECUTE FUNCTION fn_prevent_team_department_change();


-- ═══════════════════════════════════════════════════════════════════════
-- (6) USER — Trigger: prevent_user_department_change
--     Block departmentId change if it mismatches active team memberships
--     or user has active ticket assignments
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_prevent_user_department_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."departmentId" IS DISTINCT FROM NEW."departmentId" THEN
    -- Check for active team memberships in a team belonging to a different department
    IF EXISTS (
      SELECT 1 FROM user_teams ut
      JOIN teams t ON t.id = ut."teamId"
      WHERE ut."userId" = NEW.id
        AND ut."removedAt" IS NULL
        AND t."departmentId" != NEW."departmentId"
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'Cannot change department for user (id=%) — active team memberships exist in a different department', NEW.id;
    END IF;

    -- Check for active ticket assignments
    IF EXISTS (
      SELECT 1 FROM ticket_assignees
      WHERE "userId" = NEW.id AND "removedAt" IS NULL
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'Cannot change department for user (id=%) — active ticket assignments exist', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_user_department_change
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION fn_prevent_user_department_change();


-- ═══════════════════════════════════════════════════════════════════════
-- (7) TIME ENTRY — CHECK constraints
--     a) minutes_spent > 0
--     b) start_time IS NULL OR end_time IS NULL OR end_time > start_time
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE time_entries
ADD CONSTRAINT "chk_minutes_spent_positive"
CHECK ("minutesSpent" > 0);

ALTER TABLE time_entries
ADD CONSTRAINT "chk_time_range_valid"
CHECK ("startTime" IS NULL OR "endTime" IS NULL OR "endTime" > "startTime");


-- ═══════════════════════════════════════════════════════════════════════
-- (8) USER TEAM — Trigger: validate_user_team_department
--     User.departmentId must equal Team.departmentId
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_validate_user_team_department()
RETURNS TRIGGER AS $$
DECLARE
  v_user_dept_id INT;
  v_team_dept_id INT;
BEGIN
  SELECT "departmentId" INTO v_user_dept_id FROM users WHERE id = NEW."userId";
  SELECT "departmentId" INTO v_team_dept_id FROM teams WHERE id = NEW."teamId";

  IF v_user_dept_id != v_team_dept_id THEN
    RAISE EXCEPTION 'User (id=%) belongs to department %, but team (id=%) belongs to department %. Cross-department membership not allowed.',
      NEW."userId", v_user_dept_id, NEW."teamId", v_team_dept_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_user_team_department
BEFORE INSERT OR UPDATE ON user_teams
FOR EACH ROW EXECUTE FUNCTION fn_validate_user_team_department();


-- ═══════════════════════════════════════════════════════════════════════
-- (9) USER TEAM — Partial unique index: one active membership per (user, team)
-- ═══════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX "uq_user_team_active"
ON "user_teams" ("userId", "teamId")
WHERE "removedAt" IS NULL;


-- ═══════════════════════════════════════════════════════════════════════
-- (10) TICKET STATUS — Partial unique index: global label uniqueness
--      Unique on label WHERE teamId IS NULL
-- ═══════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX "uq_ticket_status_global_label"
ON "ticket_statuses" (label)
WHERE "teamId" IS NULL;


-- ═══════════════════════════════════════════════════════════════════════
-- (11) TICKET STATUS — Partial unique index: per-team label uniqueness
--      Unique on (teamId, label) WHERE teamId IS NOT NULL
-- ═══════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX "uq_ticket_status_team_label"
ON "ticket_statuses" ("teamId", label)
WHERE "teamId" IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════
-- (12) TICKET STATUS — Trigger: prevent_ticket_status_team_change
--      Block teamId change once referenced by any ticket
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_prevent_ticket_status_team_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."teamId" IS DISTINCT FROM NEW."teamId" THEN
    IF EXISTS (SELECT 1 FROM tickets WHERE "statusId" = NEW.id LIMIT 1) THEN
      RAISE EXCEPTION 'Cannot change teamId for ticket status (id=%) — it is referenced by existing tickets', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_ticket_status_team_change
BEFORE UPDATE ON ticket_statuses
FOR EACH ROW EXECUTE FUNCTION fn_prevent_ticket_status_team_change();


-- ═══════════════════════════════════════════════════════════════════════
-- (13) TICKET ATTACHMENT — CHECK: file_size_bytes > 0
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE ticket_attachments
ADD CONSTRAINT "chk_file_size_positive"
CHECK ("fileSizeBytes" > 0);


-- ═══════════════════════════════════════════════════════════════════════
-- (14) TICKET FIELD DEFINITION — Partial unique index: global field-name uniqueness
--      Unique on LOWER(name) WHERE teamId IS NULL
-- ═══════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX "uq_ticket_field_definition_global_name"
ON "ticket_field_definitions" (LOWER(name))
WHERE "teamId" IS NULL;


-- ═══════════════════════════════════════════════════════════════════════
-- (15) TICKET FIELD DEFINITION — Partial unique index: per-team field-name uniqueness
--      Unique on (teamId, LOWER(name)) WHERE teamId IS NOT NULL
-- ═══════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX "uq_ticket_field_definition_team_name"
ON "ticket_field_definitions" ("teamId", LOWER(name))
WHERE "teamId" IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════
-- (16) TICKET FIELD VALUE — Trigger: enforce_ticket_field_value_team_scope
--      fieldDefinition.teamId IS NULL OR equals ticket.teamId OR is an
--      active collaborating team on that ticket
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_enforce_ticket_field_value_team_scope()
RETURNS TRIGGER AS $$
DECLARE
  v_field_team_id INT;
  v_ticket_team_id INT;
BEGIN
  SELECT "teamId" INTO v_field_team_id
  FROM ticket_field_definitions WHERE id = NEW."fieldDefinitionId";

  SELECT "teamId" INTO v_ticket_team_id
  FROM tickets WHERE id = NEW."ticketId";

  IF v_field_team_id IS NOT NULL
     AND v_field_team_id != v_ticket_team_id
     AND NOT EXISTS (
       SELECT 1 FROM ticket_teams
       WHERE "ticketId" = NEW."ticketId"
         AND "teamId" = v_field_team_id
         AND "removedAt" IS NULL
     )
  THEN
    RAISE EXCEPTION 'Field definition (id=%) belongs to team %, which is not in scope for ticket (id=%). The team must be the primary team or an active collaborating team.',
      NEW."fieldDefinitionId", v_field_team_id, NEW."ticketId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_ticket_field_value_team_scope
BEFORE INSERT OR UPDATE ON ticket_field_values
FOR EACH ROW EXECUTE FUNCTION fn_enforce_ticket_field_value_team_scope();


-- ═══════════════════════════════════════════════════════════════════════
-- (17) TICKET TEAM — Partial unique index: one active collaboration per (ticket, team)
-- ═══════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX "uq_ticket_team_active"
ON "ticket_teams" ("ticketId", "teamId")
WHERE "removedAt" IS NULL;


-- ═══════════════════════════════════════════════════════════════════════
-- (18) TICKET TEAM — Trigger: enforce_ticket_team_not_primary
--      Block adding the ticket's primary team as a collaborating team
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_enforce_ticket_team_not_primary()
RETURNS TRIGGER AS $$
DECLARE
  v_primary_team_id INT;
BEGIN
  SELECT "teamId" INTO v_primary_team_id FROM tickets WHERE id = NEW."ticketId";

  IF NEW."teamId" = v_primary_team_id THEN
    RAISE EXCEPTION 'Cannot add ticket''s primary team (id=%) as a collaborating team on ticket (id=%)',
      NEW."teamId", NEW."ticketId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_ticket_team_not_primary
BEFORE INSERT OR UPDATE ON ticket_teams
FOR EACH ROW EXECUTE FUNCTION fn_enforce_ticket_team_not_primary();


-- ═══════════════════════════════════════════════════════════════════════
-- (19) TICKET TEAM — Trigger: enforce_ticket_team_department
--      Collaborating team.departmentId must equal ticket.team.departmentId
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_enforce_ticket_team_department()
RETURNS TRIGGER AS $$
DECLARE
  v_collab_dept_id INT;
  v_primary_dept_id INT;
BEGIN
  -- Get collaborating team's department
  SELECT "departmentId" INTO v_collab_dept_id FROM teams WHERE id = NEW."teamId";

  -- Get ticket's primary team's department
  SELECT t."departmentId" INTO v_primary_dept_id
  FROM tickets tk
  JOIN teams t ON t.id = tk."teamId"
  WHERE tk.id = NEW."ticketId";

  IF v_collab_dept_id != v_primary_dept_id THEN
    RAISE EXCEPTION 'Collaborating team (id=%) belongs to department %, but ticket''s primary team belongs to department %. Cross-department collaboration not allowed.',
      NEW."teamId", v_collab_dept_id, v_primary_dept_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_ticket_team_department
BEFORE INSERT OR UPDATE ON ticket_teams
FOR EACH ROW EXECUTE FUNCTION fn_enforce_ticket_team_department();


-- ═══════════════════════════════════════════════════════════════════════
-- END OF RAW SQL MIGRATION — All 19 items applied
-- Summary:
--   7 partial unique indexes
--   4 CHECK constraints
--   9 triggers (with 8 trigger functions, ticket_teams has 2 triggers
--     sharing the pattern but each has its own function)
-- ═══════════════════════════════════════════════════════════════════════
