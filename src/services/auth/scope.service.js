const { prisma } = require("../../lib/prisma");

/**
 * Scope Check Service
 * Provides one resolver per Scope type (GLOBAL, OWN, ASSIGNED, TEAM, DEPARTMENT).
 * Each resolver takes (user, resource) and returns a Promise<boolean> or boolean.
 */

/**
 * GLOBAL scope: always allowed.
 */
const resolveGlobal = async (_user, _resource) => {
  return true;
};

/**
 * OWN scope: resource was created by or belongs to the user.
 */
const resolveOwn = async (user, resource) => {
  if (!user?.id || !resource) {
    return false;
  }
  const resourceUserId =
    resource.userId !== undefined ? resource.userId : resource.id;
  return (
    (resource.createdById != null &&
      Number(resource.createdById) === Number(user.id)) ||
    (resourceUserId != null && Number(resourceUserId) === Number(user.id))
  );
};

/**
 * ASSIGNED scope: user has an active TicketAssignee record on the resource.
 */
const resolveAssigned = async (user, resource) => {
  if (!user?.id || !resource?.id) {
    return false;
  }

  const activeAssignment = await prisma.ticketAssignee.findFirst({
    where: {
      ticketId: resource.id,
      userId: user.id,
      removedAt: null,
    },
  });

  return !!activeAssignment;
};

/**
 * TEAM scope: user has an active UserTeam membership on the resource's team.
 * When the resource has an `id` (e.g., a ticket), the teamId is verified from
 * the database to prevent user-supplied `req.body.teamId` from being trusted.
 */
const resolveTeam = async (user, resource) => {
  if (!user?.id || !resource) {
    return false;
  }

  let teamId =
    resource.teamId || (resource.entityType === "Team" ? resource.id : null);

  // If the resource has an `id` and a `teamId`, verify the teamId from DB
  // to prevent trusting user-controlled `req.body.teamId`
  if (resource.id && resource.teamId && resource.entityType !== "Team") {
    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(resource.id) },
      select: { teamId: true },
    });
    if (ticket) {
      teamId = ticket.teamId;
    }
  }

  if (!teamId) {
    return false;
  }

  const activeMembership = await prisma.userTeam.findFirst({
    where: {
      userId: user.id,
      teamId,
      removedAt: null,
    },
  });

  return !!activeMembership;
};

/**
 * DEPARTMENT scope: resource's department (or resource team's department) equals user.departmentId.
 */
const resolveDepartment = async (user, resource) => {
  if (!user?.departmentId || !resource) {
    return false;
  }

  let resourceDeptId =
    resource.departmentId ||
    (resource.entityType === "Department" ? resource.id : null);

  // If departmentId is not directly on the resource but teamId is present, derive it from the team
  if (!resourceDeptId && resource.teamId) {
    const team = await prisma.team.findUnique({
      where: { id: resource.teamId },
      select: { departmentId: true },
    });
    resourceDeptId = team?.departmentId;
  }

  return !!resourceDeptId && resourceDeptId === user.departmentId;
};

const scopeResolvers = {
  GLOBAL: resolveGlobal,
  OWN: resolveOwn,
  ASSIGNED: resolveAssigned,
  TEAM: resolveTeam,
  DEPARTMENT: resolveDepartment,
};

module.exports = {
  resolveGlobal,
  resolveOwn,
  resolveAssigned,
  resolveTeam,
  resolveDepartment,
  scopeResolvers,
};
