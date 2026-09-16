const bcrypt = require("bcrypt");
const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { validateRoleAssignable } = require("../auth/validation.service");

/**
 * Creates a new User account.
 * Admin-only operation gated by USER_CREATE.
 * Password is encrypted with bcrypt and never exposed in responses.
 * Team membership is NOT configured during account creation.
 */
const createUser = async (data) => {
  const { name, username, password, email, departmentId, roleId, status } =
    data;

  // 1. Verify username uniqueness
  const existingUsername = await prisma.user.findUnique({
    where: { username },
  });
  if (existingUsername) {
    throw new AppError("Username is already taken", 400);
  }

  // 2. Verify email uniqueness
  const existingEmail = await prisma.user.findUnique({
    where: { email },
  });
  if (existingEmail) {
    throw new AppError("Email is already in use", 400);
  }

  // 3. Verify department existence
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
  });
  if (!department) {
    throw new AppError("Department does not exist", 400);
  }

  // 4. Verify role is valid and assignable (has at least 1 permission)
  const isRoleAssignable = await validateRoleAssignable(roleId);
  if (!isRoleAssignable) {
    throw new AppError(
      "Role does not exist or has no permissions configured",
      400,
    );
  }

  const roleRecord = await prisma.role.findUnique({
    where: { id: roleId },
  });
  const legacyRole = roleRecord?.name === "ADMIN" ? "ADMIN" : "USER";

  // 5. Hash password with bcrypt
  const hashedPassword = await bcrypt.hash(password, 10);

  // 6. Create user record
  const createdUser = await prisma.user.create({
    data: {
      name,
      username,
      password: hashedPassword,
      email,
      departmentId,
      roleId,
      legacyRole,
      status: status || "ACTIVE",
    },
    include: {
      department: {
        select: { id: true, name: true },
      },
      userRole: {
        select: { id: true, name: true },
      },
    },
  });

  // 7. Strip password hash from response
  const safeUser = { ...createdUser };
  delete safeUser.password;
  return {
    ...safeUser,
    role: safeUser.userRole,
  };
};

/**
 * Lists users with department and role information.
 * Suitable for department-based grouping/filtering.
 * Gated by USER_VIEW.
 */
const listUsers = async (query = {}) => {
  const { departmentId, roleId, status, search } = query;

  const where = {};
  if (departmentId) where.departmentId = departmentId;
  if (roleId) where.roleId = roleId;
  if (status) where.status = status;

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { username: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      status: true,
      departmentId: true,
      roleId: true,
      createdAt: true,
      updatedAt: true,
      department: {
        select: { id: true, name: true },
      },
      userRole: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ departmentId: "asc" }, { name: "asc" }],
  });

  return users.map((u) => ({
    ...u,
    role: u.userRole,
  }));
};

/**
 * Retrieves an individual user's profile and active team memberships.
 * Gated by USER_VIEW.
 */
const getUserById = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      status: true,
      departmentId: true,
      roleId: true,
      createdAt: true,
      updatedAt: true,
      department: {
        select: { id: true, name: true, description: true },
      },
      userRole: {
        select: { id: true, name: true },
      },
      teamMemberships: {
        where: { removedAt: null },
        select: {
          id: true,
          teamId: true,
          joinedAt: true,
          removedAt: true,
          team: {
            select: {
              id: true,
              name: true,
              departmentId: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return {
    ...user,
    role: user.userRole,
  };
};

/**
 * Updates user attributes: Department, Role, and/or Status.
 * Gated by USER_UPDATE.
 * Department changes run against the Phase 2 PostgreSQL trigger.
 * Trigger errors are caught and converted to clean, user-friendly messages.
 */
const updateUser = async (userId, updateData) => {
  const { departmentId, roleId, status, name, email } = updateData;

  // 1. Ensure user exists
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!existingUser) {
    throw new AppError("User not found", 404);
  }

  // 2. Validate department if changing
  if (departmentId !== undefined) {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department) {
      throw new AppError("Department does not exist", 400);
    }
  }

  // 3. Validate role if changing
  if (roleId !== undefined) {
    const isRoleAssignable = await validateRoleAssignable(roleId);
    if (!isRoleAssignable) {
      throw new AppError(
        "Role does not exist or has no permissions configured",
        400,
      );
    }
  }

  // 4. Validate email uniqueness if changing
  if (email !== undefined && email !== existingUser.email) {
    const emailInUse = await prisma.user.findUnique({
      where: { email },
    });
    if (emailInUse) {
      throw new AppError("Email is already in use", 400);
    }
  }

  // 5. Construct update payload
  const updatePayload = {};
  if (departmentId !== undefined) updatePayload.departmentId = departmentId;
  if (status !== undefined) updatePayload.status = status;
  if (name !== undefined) updatePayload.name = name;
  if (email !== undefined) updatePayload.email = email;

  if (roleId !== undefined) {
    updatePayload.roleId = roleId;
    const roleRecord = await prisma.role.findUnique({ where: { id: roleId } });
    updatePayload.legacyRole = roleRecord?.name === "ADMIN" ? "ADMIN" : "USER";
  }

  // 6. Attempt update; catch DB trigger errors cleanly
  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updatePayload,
      include: {
        department: {
          select: { id: true, name: true },
        },
        userRole: {
          select: { id: true, name: true },
        },
      },
    });

    const safeUser = { ...updatedUser };
    delete safeUser.password;
    return {
      ...safeUser,
      role: safeUser.userRole,
    };
  } catch (error) {
    // Intercept PostgreSQL trigger fn_prevent_user_department_change
    if (
      error.message &&
      (error.message.includes("Cannot change department") ||
        error.message.includes("active team memberships exist") ||
        error.message.includes("active ticket assignments exist"))
    ) {
      throw new AppError(
        "The user's department cannot be changed while the user has active team memberships or active ticket assignments that belong to the current department.",
        400,
      );
    }

    // Intercept uniqueness constraints
    if (error.code === "P2002") {
      const targets = error.meta?.target || [];
      if (targets.includes("username"))
        throw new AppError("Username is already taken", 400);
      if (targets.includes("email"))
        throw new AppError("Email is already in use", 400);
    }

    throw error;
  }
};

/**
 * Deactivates a user (soft retirement).
 * Gated by USER_DELETE.
 * Does NOT delete the user row, nor ticket history, nor assignments, nor memberships.
 */
const deactivateUser = async (userId) => {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!existingUser) {
    throw new AppError("User not found", 404);
  }

  const deactivatedUser = await prisma.user.update({
    where: { id: userId },
    data: { status: "INACTIVE" },
    include: {
      department: {
        select: { id: true, name: true },
      },
      userRole: {
        select: { id: true, name: true },
      },
    },
  });

  const safeUser = { ...deactivatedUser };
  delete safeUser.password;
  return {
    ...safeUser,
    role: safeUser.userRole,
  };
};

module.exports = {
  createUser,
  listUsers,
  getUserById,
  updateUser,
  deactivateUser,
};
