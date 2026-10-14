const { PrismaClient } = require('@prisma/client');
// One Prisma pool per API process. Credentials never enter DTOs or query logs.
module.exports = new PrismaClient({ log: [] });
