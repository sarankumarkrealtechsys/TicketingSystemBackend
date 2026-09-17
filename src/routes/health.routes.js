const { Router } = require("express");
const { validate } = require("../validators");
const { healthQuerySchema } = require("../validators/health.validator");
const { getHealth } = require("../controllers/health.controller");

const router = Router();

router.get("/", validate(healthQuerySchema), getHealth);

module.exports = router;
