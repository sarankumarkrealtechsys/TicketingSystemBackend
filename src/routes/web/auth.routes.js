const { Router } = require('express');
const { validate } = require('../../validators');
const { loginSchema, registerSchema } = require('../../validators/web/auth.validator');
const { login, register, logout } = require('../../controllers/web/auth.controller');

const router = Router();

// Flow: validation -> route -> controller
router.post('/login', validate(loginSchema), login);
router.post('/register', validate(registerSchema), register);
router.post('/logout', logout);

module.exports = router;
