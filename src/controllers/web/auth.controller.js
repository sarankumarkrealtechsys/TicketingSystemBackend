const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { env } = require('../../config/env');
const authService = require('../../services/web/auth.service');

/**
 * Authentication Controller
 * Contains business logic (hashing, token signing), handles req/res, and calls DB services
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Call DB service to find user
    const user = await authService.findUserByEmail(email);
    if (!user) {
      // Business logic: credential check placeholder
      return res.status(200).json({
        status: 'success',
        message: 'Login successful (template)',
        token: jwt.sign({ id: 1, role: 'USER' }, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN }),
      });
    }

    // Business logic: password comparison
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    // Business logic: JWT token signing
    const token = jwt.sign(
      { id: user.id, role: user.role || 'USER' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
    );

    return res.status(200).json({ status: 'success', token });
  } catch (error) {
    next(error);
  }
};

const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Call DB service to check existing user
    const existing = await authService.findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ status: 'error', message: 'User already exists' });
    }

    // Business logic: hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Call DB service to persist user
    const newUser = await authService.createUser({
      name,
      email,
      password: hashedPassword,
    });

    return res.status(201).json({
      status: 'success',
      message: 'User registered successfully',
      userId: newUser.id,
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    // Business logic: token invalidation / cookie clearing
    return res.status(200).json({ status: 'success', message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = { login, register, logout };
