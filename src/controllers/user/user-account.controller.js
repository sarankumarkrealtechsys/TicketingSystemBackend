const bcrypt = require("bcrypt");
const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { validateRoleAssignable } = require("../../services/auth/validation.service");
const { blacklistUserTokens } = require("../../utils/tokenBlacklist");

// ============================================================================
// USER ACCOUNT CONTROLLER (Direct DB Operations)
// ============================================================================

const createUser = async (req, res, next) => {
  try {
    const { name, username, password, email, departmentId, roleId, status } = req.body;

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      throw new AppError("Username is already taken", 400);
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      throw new AppError("Email is already in use", 400);
    }

    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      throw new AppError("Department does not exist", 400);
    }

    const isRoleAssignable = await validateRoleAssignable(roleId);
    if (!isRoleAssignable) {
      throw new AppError("Role does not exist or has no permissions configured", 400);
    }

    const roleRecord = await prisma.role.findUnique({ where: { id: roleId } });
    const legacyRole = roleRecord?.name === "ADMIN" ? "ADMIN" : "USER";

    const hashedPassword = await bcrypt.hash(password, 10);

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
        department: { select: { id: true, name: true } },
        userRole: { select: { id: true, name: true } },
      },
    });

    const safeUser = { ...createdUser };
    delete safeUser.password;

    return res.status(201).json({
      status: "success",
      message: "User created successfully",
      data: {
        user: {
          ...safeUser,
          role: safeUser.userRole,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const { departmentId, roleId, status, search } = req.query;

    const where = {};
    if (departmentId) where.departmentId = Number(departmentId);
    if (roleId) where.roleId = Number(roleId);
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
        legacyRole: true,
        createdAt: true,
        updatedAt: true,
        department: { select: { id: true, name: true } },
        userRole: { select: { id: true, name: true } },
        teamMemberships: {
          where: { removedAt: null },
          include: { team: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      status: "success",
      data: {
        users: users.map((u) => ({
          ...u,
          role: u.userRole,
          teams: u.teamMemberships.map((tm) => tm.team),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

const getUserProfile = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId || req.user.id);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: { select: { id: true, name: true } },
        userRole: { select: { id: true, name: true } },
        teamMemberships: {
          where: { removedAt: null },
          include: { team: { select: { id: true, name: true } } },
        },
      },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const safeUser = { ...user };
    delete safeUser.password;

    return res.status(200).json({
      status: "success",
      data: {
        user: {
          ...safeUser,
          role: safeUser.userRole,
          teams: safeUser.teamMemberships.map((tm) => tm.team),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const { name, email, departmentId, roleId, status, password } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      throw new AppError("User not found", 404);
    }

    // Non-admin (OWN scope) callers can only update safe fields (name, password)
    if (!req.isGlobalScope) {
      if (departmentId !== undefined || roleId !== undefined || status !== undefined) {
        throw new AppError(
          "Forbidden: Only administrators can modify role, department, or account status",
          403,
        );
      }
    }

    if (email && email !== existingUser.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email } });
      if (emailTaken) throw new AppError("Email is already in use", 400);
    }

    if (departmentId && departmentId !== existingUser.departmentId) {
      const deptExists = await prisma.department.findUnique({ where: { id: departmentId } });
      if (!deptExists) throw new AppError("Department does not exist", 400);

      const activeMemberships = await prisma.userTeam.count({
        where: { userId, removedAt: null },
      });
      if (activeMemberships > 0) {
        throw new AppError(
          "The user's department cannot be changed while the user has active team memberships or active ticket assignments that belong to the current department.",
          400,
        );
      }

      const activeAssignments = await prisma.ticketAssignee.count({
        where: { userId, removedAt: null },
      });
      if (activeAssignments > 0) {
        throw new AppError(
          "The user's department cannot be changed while the user has active team memberships or active ticket assignments that belong to the current department.",
          400,
        );
      }
    }

    if (roleId && roleId !== existingUser.roleId) {
      const isRoleAssignable = await validateRoleAssignable(roleId);
      if (!isRoleAssignable) {
        throw new AppError("Role does not exist or has no permissions configured", 400);
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (departmentId !== undefined) updateData.departmentId = departmentId;
    if (roleId !== undefined) {
      updateData.roleId = roleId;
      const roleRecord = await prisma.role.findUnique({ where: { id: roleId } });
      updateData.legacyRole = roleRecord?.name === "ADMIN" ? "ADMIN" : "USER";
    }
    if (status !== undefined) updateData.status = status;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Track whether session invalidation is needed
    const needsSessionInvalidation = !!password || (status === "INACTIVE" && existingUser.status === "ACTIVE");

    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        include: {
          department: { select: { id: true, name: true } },
          userRole: { select: { id: true, name: true } },
        },
      });

      const safeUser = { ...updatedUser };
      delete safeUser.password;

      // Invalidate all sessions if password changed or user was deactivated
      if (needsSessionInvalidation) {
        await blacklistUserTokens(userId);
      }

      return res.status(200).json({
        status: "success",
        message: "User updated successfully",
        data: {
          user: {
            ...safeUser,
            role: safeUser.userRole,
          },
        },
      });
    } catch (error) {
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

      if (error.code === "P2002") {
        const targets = error.meta?.target || [];
        if (targets.includes("username")) throw new AppError("Username is already taken", 400);
        if (targets.includes("email")) throw new AppError("Email is already in use", 400);
      }

      throw error;
    }
  } catch (error) {
    next(error);
  }
};

const deactivateUser = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);

    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      throw new AppError("User not found", 404);
    }

    const deactivatedUser = await prisma.user.update({
      where: { id: userId },
      data: { status: "INACTIVE" },
      include: {
        department: { select: { id: true, name: true } },
        userRole: { select: { id: true, name: true } },
      },
    });

    // Invalidate all active sessions for this user
    await blacklistUserTokens(userId);

    const safeUser = { ...deactivatedUser };
    delete safeUser.password;

    return res.status(200).json({
      status: "success",
      message: "User deactivated successfully",
      data: {
        user: {
          ...safeUser,
          role: safeUser.userRole,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createUser,
  listUsers,
  getUserProfile,
  updateUser,
  deactivateUser,
};
