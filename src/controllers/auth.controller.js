const { env } = require("../config/env");
const jwt = require("jsonwebtoken");
const authService = require("../services/auth/auth.service");
const { getPermissions } = require("../services/auth/permission.service");
const { blacklistUserTokens } = require("../utils/tokenBlacklist");

/**
 * Handles user login.
 * Validates credentials using username and password only.
 * Issues a 30-day JWT set inside an httpOnly, Secure, SameSite=Strict cookie.
 * On invalid credentials (wrong username OR wrong password), returns an identical
 * generic error body to prevent field-level enumeration.
 */
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const user = await authService.findUserByUsername(username);
    if (!user) {
      return res.status(401).json({
        status: "error",
        message: "Invalid credentials",
      });
    }

    const isMatch = await authService.verifyPassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        status: "error",
        message: "Invalid credentials",
      });
    }

    if (user.status !== "ACTIVE") {
      return res.status(401).json({
        status: "error",
        message: "Invalid credentials",
      });
    }

    if (!user.userRole) {
      return res.status(500).json({
        status: "error",
        message: "Account role configuration is invalid",
      });
    }

    // Generate 30-day access token
    const token = authService.generateAccessToken(user);

    // Set token in httpOnly, Secure, SameSite=Strict cookie
    res.cookie(env.COOKIE_NAME, token, authService.getCookieOptions());

    // Resolve permissions for the user
    const permissions = await getPermissions(user, req);

    return res.status(200).json({
      status: "success",
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          roleId: user.roleId,
          role: {
            id: user.userRole.id,
            name: user.userRole.name,
          },
          departmentId: user.departmentId,
          department: user.department,
        },
        permissions,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handles session verification.
 * Protected by authenticate middleware.
 * Returns current authenticated user and resolved permissions.
 */
const getMe = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user.userRole) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized: Account role configuration is invalid",
      });
    }

    const permissions = await getPermissions(user, req);

    return res.status(200).json({
      status: "success",
      data: {
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          roleId: user.roleId,
          role: {
            id: user.userRole.id,
            name: user.userRole.name,
          },
          departmentId: user.departmentId,
          department: user.department,
        },
        permissions,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handles user logout.
 * Clears the auth cookie server-side with matching security options.
 */
const logout = async (req, res, next) => {
  try {
    // Blacklist the user's current token so it cannot be reused
    const token = req.cookies?.[env.COOKIE_NAME];
    if (token) {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        const userId = decoded.userId || decoded.id;
        if (userId) {
          await blacklistUserTokens(userId);
        }
      } catch (_err) {
        // Token may be invalid/expired — still clear the cookie
      }
    }

    res.clearCookie(env.COOKIE_NAME, authService.getClearCookieOptions());

    return res.status(200).json({
      status: "success",
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  getMe,
  logout,
};
