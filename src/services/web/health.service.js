const { prisma } = require('../../lib/prisma');

/**
 * Health database service
 * Directly handles database queries and health check verification
 */
const checkDatabaseHealth = async () => {
  try {
    // Check database connectivity via Prisma query
    await prisma.$queryRaw`SELECT 1`;
    return { database: 'connected' };
  } catch (error) {
    return { database: 'disconnected', error: error.message };
  }
};

const getRecentHealthLogs = async (limit = 5) => {
  return prisma.healthCheck.findMany({
    take: limit,
    orderBy: { checkedAt: 'desc' },
  });
};

module.exports = {
  checkDatabaseHealth,
  getRecentHealthLogs,
};
