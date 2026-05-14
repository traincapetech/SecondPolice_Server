const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes      = require('./routes/authRoutes');
const userRoutes      = require('./routes/userRoutes');
const customerRoutes  = require('./routes/customerRoutes');
const dealRoutes      = require('./routes/dealRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const activityRoutes  = require('./routes/activityRoutes');
const reportsRoutes   = require('./routes/reportsRoutes');
const roleRoutes      = require('./routes/roleRoutes');
const leadRoutes      = require('./routes/leadRoutes');
const settingsRoutes  = require('./routes/settingsRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const invoiceRoutes       = require('./routes/invoiceRoutes');
const prospectRoutes      = require('./routes/prospectRoutes');
const productRoutes       = require('./routes/productRoutes');
const pushRoutes          = require('./routes/pushRoutes');
const toolRoutes          = require('./routes/toolRoutes');
const scheduledEmailRoutes = require('./routes/scheduledEmailRoutes');
const jobRoutes            = require('./routes/jobRoutes');
const campaignRoutes       = require('./routes/campaignRoutes');
const systemActivityRoutes = require('./routes/systemActivityRoutes');
const announcementRoutes   = require('./routes/announcementRoutes');
const hrOrgRoutes          = require('./routes/hrOrgRoutes');
const hrEmployeeRoutes     = require('./routes/hrEmployeeRoutes');
const AppError = require('./utils/appError');
const globalErrorHandler = require('./middlewares/errorController');

const { globalLimiter } = require('./middlewares/rateLimiter');

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Apply global rate limiter to all /api routes
app.use('/api', globalLimiter);

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-cron-secret']
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Routes
app.use('/api/auth',       authRoutes);
app.use('/api/users',      userRoutes);
app.use('/api/customers',  customerRoutes);
app.use('/api/deals',      dealRoutes);
app.use('/api/dashboard',  dashboardRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/reports',    reportsRoutes);
app.use('/api/roles',      roleRoutes);
app.use('/api/leads',          leadRoutes);
app.use('/api/settings',       settingsRoutes);
app.use('/api/notifications',  notificationRoutes);
app.use('/api/invoices',        invoiceRoutes);
app.use('/api/prospects',       prospectRoutes);
app.use('/api/products',        productRoutes);
app.use('/api/tools',           toolRoutes);
app.use('/api/push',              pushRoutes);
app.use('/api/scheduled-emails',  scheduledEmailRoutes);
app.use('/api/jobs',              jobRoutes);
app.use('/api/campaigns',         campaignRoutes);
app.use('/api/system-activities', systemActivityRoutes);
app.use('/api/announcements',     announcementRoutes);
app.use('/api/hr',                hrOrgRoutes);
app.use('/api/hr/employees',      hrEmployeeRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'API is running' });
});

// 404
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handler
app.use(globalErrorHandler);

module.exports = app;
