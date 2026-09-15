const { Router } = require('express');
const authRoutes = require('./auth/auth.routes');
const healthRoutes = require('./health/health.routes');

const router = Router();

// Mount feature routes under /api
router.use('/auth', authRoutes);
router.use('/health', healthRoutes);

module.exports = router;
