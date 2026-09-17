-- Case-insensitive uniqueness indexes
-- These prevent creating entities with names that differ only by case
-- e.g., "Engineering" and "engineering" in the same department

-- 1. Case-insensitive unique department name
CREATE UNIQUE INDEX IF NOT EXISTS uq_department_name_lower
  ON departments (LOWER(name));

-- 2. Case-insensitive unique team name per department
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_dept_name_lower
  ON teams ("departmentId", LOWER(name));

-- 3. Case-insensitive unique project name
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_name_lower
  ON projects (LOWER(name));

-- 4. Case-insensitive unique priority label
CREATE UNIQUE INDEX IF NOT EXISTS uq_priority_label_lower
  ON priority_levels (LOWER(label));
