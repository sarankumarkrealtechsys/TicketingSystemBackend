const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");
const { invalidateCachePattern } = require("../../utils/cache");

// System roles that cannot be renamed, deactivated, or deleted
const SYSTEM_ROLES = ["ADMIN", "USER"];

/**
 * List all roles with user count and permission count
 */
const listRoles = async (req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      include: {
        _count: {
          select: {
            users: true,
            rolePermissions: true,
          },
        },
      },
      orderBy: { id: "asc" },
    });

    const formattedRoles = roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      status: role.status,
      isSystem: SYSTEM_ROLES.includes(role.name.toUpperCase()),
      createdAt: role.createdAt,
      userCount: role._count.users,
      permissionCount: role._count.rolePermissions,
    }));

    return res.status(200).json({
      status: "success",
      data: formattedRoles,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get role details by ID with assigned permissions and scopes
 */
const getRoleById = async (req, res, next) => {
  try {
    const roleId = parseInt(req.params.id, 10);
    if (isNaN(roleId)) {
      throw new AppError("Invalid role ID", 400);
    }

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        _count: {
          select: {
            users: true,
            rolePermissions: true,
          },
        },
        rolePermissions: {
          include: {
            permission: {
              select: {
                id: true,
                key: true,
                description: true,
                category: true,
              },
            },
          },
        },
      },
    });

    if (!role) {
      throw new AppError("Role not found", 404);
    }

    const formattedRole = {
      id: role.id,
      name: role.name,
      description: role.description,
      status: role.status,
      isSystem: SYSTEM_ROLES.includes(role.name.toUpperCase()),
      createdAt: role.createdAt,
      userCount: role._count.users,
      permissionCount: role._count.rolePermissions,
      rolePermissions: role.rolePermissions.map((rp) => ({
        id: rp.id,
        permissionId: rp.permissionId,
        permissionKey: rp.permission?.key,
        category: rp.permission?.category,
        description: rp.permission?.description,
        scope: rp.scope,
      })),
    };

    return res.status(200).json({
      status: "success",
      data: formattedRole,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new custom role with optional template cloning
 */
const createRole = async (req, res, next) => {
  try {
    const { name, description, cloneFromRoleId } = req.body;
    const adminUserId = req.user.id;

    if (!name || !name.trim()) {
      throw new AppError("Role name is required", 400);
    }

    const trimmedName = name.trim();

    // Check uniqueness
    const existing = await prisma.role.findFirst({
      where: { name: { equals: trimmedName, mode: "insensitive" } },
    });
    if (existing) {
      throw new AppError("A role with this name already exists", 400);
    }

    // If cloning permissions from another role, fetch source permissions
    let sourcePermissions = [];
    if (cloneFromRoleId) {
      const parsedSourceId = parseInt(cloneFromRoleId, 10);
      if (!isNaN(parsedSourceId)) {
        sourcePermissions = await prisma.rolePermission.findMany({
          where: { roleId: parsedSourceId },
        });
      }
    }

    // Execute in transaction
    const newRole = await prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          name: trimmedName,
          description: description ? description.trim() : null,
          status: "ACTIVE",
          createdById: adminUserId,
        },
      });

      if (sourcePermissions.length > 0) {
        const clonedGrants = sourcePermissions.map((sp) => ({
          roleId: role.id,
          permissionId: sp.permissionId,
          scope: sp.scope,
          grantedById: adminUserId,
        }));

        await tx.rolePermission.createMany({
          data: clonedGrants,
        });
      }

      return role;
    });

    await invalidateCachePattern("roles:*");

    return res.status(201).json({
      status: "success",
      data: {
        id: newRole.id,
        name: newRole.name,
        description: newRole.description,
        status: newRole.status,
        isSystem: false,
        userCount: 0,
        permissionCount: sourcePermissions.length,
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      return next(new AppError("A role with this name already exists", 400));
    }
    next(error);
  }
};

/**
 * Update role metadata (name, description, status)
 */
const updateRole = async (req, res, next) => {
  try {
    const roleId = parseInt(req.params.id, 10);
    if (isNaN(roleId)) {
      throw new AppError("Invalid role ID", 400);
    }

    const { name, description, status } = req.body;

    const existingRole = await prisma.role.findUnique({
      where: { id: roleId },
    });
    if (!existingRole) {
      throw new AppError("Role not found", 404);
    }

    const isSystem = SYSTEM_ROLES.includes(existingRole.name.toUpperCase());

    // Protect system roles from name and status modifications
    if (isSystem) {
      if (name && name.trim().toUpperCase() !== existingRole.name.toUpperCase()) {
        throw new AppError("System default role names cannot be modified", 400);
      }
      if (status && status !== "ACTIVE") {
        throw new AppError("System default roles cannot be deactivated", 400);
      }
    }

    // Check name uniqueness if changed
    if (name && name.trim().toLowerCase() !== existingRole.name.toLowerCase()) {
      const duplicate = await prisma.role.findFirst({
        where: {
          name: { equals: name.trim(), mode: "insensitive" },
          id: { not: roleId },
        },
      });
      if (duplicate) {
        throw new AppError("A role with this name already exists", 400);
      }
    }

    const updated = await prisma.role.update({
      where: { id: roleId },
      data: {
        ...(name && !isSystem ? { name: name.trim() } : {}),
        description: description !== undefined ? (description ? description.trim() : null) : undefined,
        ...(status && !isSystem ? { status } : {}),
      },
      include: {
        _count: {
          select: {
            users: true,
            rolePermissions: true,
          },
        },
      },
    });

    await invalidateCachePattern("roles:*");

    return res.status(200).json({
      status: "success",
      data: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        status: updated.status,
        isSystem: SYSTEM_ROLES.includes(updated.name.toUpperCase()),
        userCount: updated._count.users,
        permissionCount: updated._count.rolePermissions,
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      return next(new AppError("A role with this name already exists", 400));
    }
    next(error);
  }
};

/**
 * Bulk update permission-scope matrix for a role
 */
const updateRolePermissions = async (req, res, next) => {
  try {
    const roleId = parseInt(req.params.id, 10);
    if (isNaN(roleId)) {
      throw new AppError("Invalid role ID", 400);
    }

    const { permissions } = req.body; // Array of { permissionId: number, scope: string|null }
    const adminUserId = req.user.id;

    if (!Array.isArray(permissions)) {
      throw new AppError("Permissions must be provided as an array", 400);
    }

    const role = await prisma.role.findUnique({
      where: { id: roleId },
    });
    if (!role) {
      throw new AppError("Role not found", 404);
    }

    // Deduplicate incoming grants: unique key = `${permissionId}_${scope || 'NULL'}`
    const seen = new Set();
    const cleanGrants = [];

    for (const p of permissions) {
      const pId = parseInt(p.permissionId, 10);
      if (isNaN(pId)) continue;
      const scope = p.scope || null;
      const key = `${pId}_${scope}`;
      if (!seen.has(key)) {
        seen.add(key);
        cleanGrants.push({
          roleId,
          permissionId: pId,
          scope,
          grantedById: adminUserId,
        });
      }
    }

    // Transactionally wipe and replace role_permissions
    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: { roleId },
      });

      if (cleanGrants.length > 0) {
        await tx.rolePermission.createMany({
          data: cleanGrants,
        });
      }
    });

    await invalidateCachePattern("roles:*");

    return res.status(200).json({
      status: "success",
      message: "Role permissions updated successfully",
      data: {
        roleId,
        permissionCount: cleanGrants.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete / retire a custom role
 */
const deleteRole = async (req, res, next) => {
  try {
    const roleId = parseInt(req.params.id, 10);
    if (isNaN(roleId)) {
      throw new AppError("Invalid role ID", 400);
    }

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    if (!role) {
      throw new AppError("Role not found", 404);
    }

    if (SYSTEM_ROLES.includes(role.name.toUpperCase())) {
      throw new AppError("System default roles cannot be deleted", 400);
    }

    if (role._count.users > 0) {
      throw new AppError(
        `Cannot delete role "${role.name}" because ${role._count.users} user(s) are currently assigned to it. Reassign users first.`,
        400
      );
    }

    // Delete role (cascade deletes role_permissions)
    await prisma.role.delete({
      where: { id: roleId },
    });

    await invalidateCachePattern("roles:*");

    return res.status(200).json({
      status: "success",
      message: `Role "${role.name}" deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List all system permissions categorized
 */
const listPermissions = async (req, res, next) => {
  try {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ category: "asc" }, { key: "asc" }],
    });

    return res.status(200).json({
      status: "success",
      data: permissions,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listRoles,
  getRoleById,
  createRole,
  updateRole,
  updateRolePermissions,
  deleteRole,
  listPermissions,
};
