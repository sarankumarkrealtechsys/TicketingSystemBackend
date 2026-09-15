const { Router } = require('express');
const { validate } = require('../../validators');
const { healthQuerySchema } = require('../../validators/web/health.validator');
const { getHealth } = require('../../controllers/web/health.controller');

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Application Health Check
 *     description: Validates query parameters, executes health check, and queries database status
 *     parameters:
 *       - in: query
 *         name: detailed
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Include database connectivity check
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
// Flow: validation -> route -> controller
router.get('/', validate(healthQuerySchema), getHealth);

module.exports = router;
