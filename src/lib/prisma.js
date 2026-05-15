const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const asyncLocalStorage = require('./asyncContext');

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 3, // Prevent EMAXCONNSESSION in development
  idleTimeoutMillis: 30000 
});
const adapter = new PrismaPg(pool);

const basePrisma = new PrismaClient({ adapter });

const TRACKED_MODELS = ['Deal', 'Lead', 'Customer', 'Invoice', 'ProspectMeta', 'Campaign', 'User', 'Tenant', 'Activity', 'CustomRole', 'Announcement', 'Attendance', 'LeaveRequest'];

function logActivity(record, model, action) {
  // Fire and forget so we don't block the request
  setImmediate(async () => {
    try {
      const tenantId = record.tenantId || (model === 'Tenant' ? record.id : null);
      if (!tenantId) return;

      const store = asyncLocalStorage.getStore();
      const userId = store?.user?.id || null;

      let details = `Performed ${action} on ${model}`;
      const identifier = record.name || record.title || record.clientName || record.email || record.invoiceNo;
      if (identifier) details += `: ${identifier}`;

      // Use basePrisma to avoid recursive hooks
      const systemActivity = await basePrisma.systemActivity.create({
        data: {
          tenantId,
          userId,
          action,
          entityType: model,
          entityId: String(record.id),
          details: JSON.stringify({ message: details, data: record }),
        }
      });

      // Include user data for immediate display in the frontend
      const activityWithUser = await basePrisma.systemActivity.findUnique({
        where: { id: systemActivity.id },
        include: { user: { select: { id: true, name: true, email: true } } }
      });

      const { getIO } = require('./socket');
      try {
        getIO().to(`tenant:${systemActivity.tenantId}:admin`).emit('system_activity', activityWithUser || systemActivity);
      } catch(e) {}
    } catch (err) {
      console.error('[AuditLog] Error saving activity:', err.message);
    }
  });
}

const extendedPrisma = basePrisma.$extends({
  query: {
    $allModels: {
      async create({ model, operation, args, query }) {
        const result = await query(args);
        if (TRACKED_MODELS.includes(model)) logActivity(result, model, 'CREATE');
        return result;
      },
      async update({ model, operation, args, query }) {
        const result = await query(args);
        if (TRACKED_MODELS.includes(model)) logActivity(result, model, 'UPDATE');
        return result;
      },
      async delete({ model, operation, args, query }) {
        const result = await query(args);
        if (TRACKED_MODELS.includes(model)) logActivity(result, model, 'DELETE');
        return result;
      }
    }
  }
});

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = extendedPrisma;
} else {
  if (!global.prisma) {
    global.prisma = extendedPrisma;
  }
  prisma = global.prisma;
}

module.exports = prisma;

// Gracefully close connections on nodemon restarts to prevent connection leaks
process.once('SIGUSR2', async () => {
  await prisma.$disconnect();
  await pool.end();
  process.kill(process.pid, 'SIGUSR2');
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  await pool.end();
  process.exit(0);
});
