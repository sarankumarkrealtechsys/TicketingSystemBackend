const { Router } = require('express');
const webRoutes = require('./web');

const router = Router();

// Mount all web routes under /api
router.use('/', webRoutes);

module.exports = router;
