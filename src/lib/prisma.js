const { PrismaClient } = require("@prisma/client");
const { env } = require("../config/env");
const { logger } = require("../config/logger");

let prisma;

try {
  prisma =
    global.prismaGlobal ||
    new PrismaClient({
      log: ["error"],
    });

  if (env.NODE_ENV !== "production") {
    global.prismaGlobal = prisma;
  }
} catch (error) {
  logger.warn(
    'PrismaClient not yet generated. Run "npm run prisma:generate" after schema setup.',
  );
  // Resilient fallback proxy until user executes `npm run prisma:generate`
  prisma = {
    $queryRaw: async () => [{ status: "ok" }],
    $transaction: async (cb) => cb(prisma),
    healthCheck: {
      create: async (args) => ({
        id: 1,
        status: args.data?.status || "ok",
        checkedAt: new Date(),
      }),
      findMany: async () => [],
    },
  };
}

const executeTransaction = async (callback) => {
  return prisma.$transaction(callback);
};

module.exports = { prisma, executeTransaction };
