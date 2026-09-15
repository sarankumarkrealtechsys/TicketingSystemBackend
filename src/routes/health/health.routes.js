const { Router } = require('express');
const { validate } = require('../../validators');
const { healthQuerySchema } = require('../../validators/health/health.validator');
const { getHealth } = require('../../controllers/health/health.controller');

const router = Router();

// Flow: validation -> route -> controller
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Application health check endpoint
 *     parameters:
 *       - in: query
 *         name: detailed
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: Include database connectivity check
 *     responses:
 *       200:
 *         description: Server is healthy
 *       400:
 *         description: Invalid query parameters
 */
router.get('/', validate(healthQuerySchema), getHealth);

module.exports = router;
