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
const AppError = require('./utils/appError');
const globalErrorHandler = require('./middlewares/errorController');
<<<<<<< HEAD

const { globalLimiter } = require('./middlewares/rateLimiter');

const app = express();

app.set('trust proxy', 1);

=======

const app = express();

>>>>>>> 512040c9b443dcfd83f97acf510c9f7ac67da363
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

<<<<<<< HEAD
// Apply global rate limiter to all /api routes
app.use('/api', globalLimiter);

=======
>>>>>>> 512040c9b443dcfd83f97acf510c9f7ac67da363
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
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
app.use('/api/leads',      leadRoutes);

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
