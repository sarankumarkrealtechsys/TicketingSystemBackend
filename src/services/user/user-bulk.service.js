const XLSX = require("xlsx");
const bcrypt = require("bcrypt");
const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../utils/errors");

const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~])/;

/**
 * Normalizes an object's keys to lowercase alphanumeric for flexible column matching
 */
const normalizeRowKeys = (row) => {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    const cleanKey = key.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    normalized[cleanKey] = typeof value === "string" ? value.trim() : value;
  }
  return normalized;
};

/**
 * Generates an Excel template (.xlsx) containing only the column names
 */
const generateUserUploadTemplate = async () => {
  // Column names only as requested — zero sample rows, zero extra sheets
  const headers = [
    [
      "Full Name",
      "Username",
      "Email",
      "Department",
      "Role",
      "Password",
      "Status",
    ],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(headers);

  // Set clean column widths
  worksheet["!cols"] = [
    { wch: 22 }, // Full Name
    { wch: 20 }, // Username
    { wch: 30 }, // Email
    { wch: 22 }, // Department
    { wch: 16 }, // Role
    { wch: 20 }, // Password
    { wch: 14 }, // Status
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Users");

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  return buffer;
};

/**
 * Validates and batch-creates users from an uploaded spreadsheet buffer
 */
const processBulkUserUpload = async (fileBuffer, defaultPassword = "User@123456") => {
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    throw new AppError("No file buffer provided for bulk upload.", 400);
  }

  // 1. Parse Excel buffer
  let workbook;
  try {
    workbook = XLSX.read(fileBuffer, { type: "buffer" });
  } catch (err) {
    throw new AppError("Failed to parse spreadsheet file. Please verify it is a valid .xlsx, .xls, or .csv file.", 400);
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new AppError("The uploaded workbook contains no sheets.", 400);
  }

  // Find 'Users' sheet or fallback to first sheet
  const targetSheetName = workbook.SheetNames.includes("Users")
    ? "Users"
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetSheetName];

  // Convert to JSON objects
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!rawRows || rawRows.length === 0) {
    throw new AppError("The uploaded spreadsheet contains no data rows.", 400);
  }

  // 2. Pre-fetch reference data from DB to avoid N+1 queries
  const [departments, roles, existingUsers] = await Promise.all([
    prisma.department.findMany({
      select: { id: true, name: true, status: true },
    }),
    prisma.role.findMany({
      select: { id: true, name: true, status: true },
    }),
    prisma.user.findMany({
      select: { username: true, email: true },
    }),
  ]);

  const deptMap = new Map();
  departments.forEach((d) => deptMap.set(d.name.trim().toLowerCase(), d));

  const roleMap = new Map();
  roles.forEach((r) => roleMap.set(r.name.trim().toLowerCase(), r));

  const existingUsernames = new Set(
    existingUsers.map((u) => u.username.toLowerCase()),
  );
  const existingEmails = new Set(
    existingUsers.map((u) => u.email.toLowerCase()),
  );

  // Track in-sheet duplicates
  const sheetUsernames = new Set();
  const sheetEmails = new Set();

  const validRows = [];
  const errors = [];

  // Default fallback password validation
  const effectiveDefaultPassword =
    defaultPassword && defaultPassword.trim().length >= 8
      ? defaultPassword.trim()
      : "User@123456";

  // 3. Row-by-row validation
  for (let i = 0; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const excelRowNum = i + 2; // Row 1 is header
    const row = normalizeRowKeys(rawRow);

    // Extract fields with multiple possible header variations
    const usernameRaw = row.username || row.user || row.uname || "";
    const emailRaw = row.email || row.emailaddress || row.mail || "";
    const fullNameRaw = row.fullname || row.name || row.displayname || "";
    const deptRaw = row.department || row.dept || "";
    const roleRaw = row.role || row.rolename || "";
    const passwordRaw = row.password || row.pass || row.pwd || "";
    const statusRaw = row.status || "ACTIVE";

    // If completely empty row, ignore
    if (!usernameRaw && !emailRaw && !deptRaw && !roleRaw) {
      continue;
    }

    const rowErrors = [];

    // Validate Username
    const username = usernameRaw.toString().trim();
    if (!username) {
      rowErrors.push("Username is mandatory.");
    } else if (username.length < 3 || username.length > 100) {
      rowErrors.push("Username must be between 3 and 100 characters.");
    } else if (sheetUsernames.has(username.toLowerCase())) {
      rowErrors.push(`Duplicate username "${username}" found within spreadsheet.`);
    } else if (existingUsernames.has(username.toLowerCase())) {
      rowErrors.push(`Username "${username}" is already taken in the system.`);
    }

    // Validate Email
    const email = emailRaw.toString().trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      rowErrors.push("Email is mandatory.");
    } else if (!emailRegex.test(email) || email.length > 190) {
      rowErrors.push("Invalid email address format.");
    } else if (sheetEmails.has(email)) {
      rowErrors.push(`Duplicate email "${email}" found within spreadsheet.`);
    } else if (existingEmails.has(email)) {
      rowErrors.push(`Email "${email}" is already registered in the system.`);
    }

    // Validate Department
    const deptKey = deptRaw.toString().trim().toLowerCase();
    let matchedDept = null;
    if (!deptKey) {
      rowErrors.push("Department is mandatory.");
    } else {
      matchedDept = deptMap.get(deptKey);
      if (!matchedDept) {
        rowErrors.push(`Department "${deptRaw}" does not exist in the system.`);
      } else if (matchedDept.status !== "ACTIVE") {
        rowErrors.push(`Department "${deptRaw}" is currently inactive.`);
      }
    }

    // Validate Role
    const roleKey = roleRaw.toString().trim().toLowerCase();
    let matchedRole = null;
    if (!roleKey) {
      rowErrors.push("Role is mandatory.");
    } else {
      matchedRole = roleMap.get(roleKey);
      if (!matchedRole) {
        rowErrors.push(`Role "${roleRaw}" does not exist in the system.`);
      } else if (matchedRole.status !== "ACTIVE") {
        rowErrors.push(`Role "${roleRaw}" is currently inactive.`);
      }
    }

    // Validate Password
    let passwordToUse = passwordRaw ? passwordRaw.toString().trim() : effectiveDefaultPassword;
    if (passwordRaw && passwordToUse.length < 8) {
      rowErrors.push("Password must be at least 8 characters long.");
    } else if (passwordRaw && !PASSWORD_REGEX.test(passwordToUse)) {
      rowErrors.push("Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.");
    }

    // Validate Status
    const statusUpper = statusRaw.toString().trim().toUpperCase();
    const status = statusUpper === "INACTIVE" ? "INACTIVE" : "ACTIVE";

    // Display / Full Name
    const name = fullNameRaw ? fullNameRaw.toString().trim() : username;

    if (rowErrors.length > 0) {
      errors.push({
        row: excelRowNum,
        username: username || `Row ${excelRowNum}`,
        email: email || "",
        error: rowErrors.join(" "),
      });
    } else {
      // Mark as seen in sheet to prevent duplicates in subsequent rows
      sheetUsernames.add(username.toLowerCase());
      sheetEmails.add(email);

      validRows.push({
        excelRowNum,
        name,
        username,
        email,
        password: passwordToUse,
        departmentId: matchedDept.id,
        roleId: matchedRole.id,
        legacyRole: matchedRole.name === "ADMIN" ? "ADMIN" : "USER",
        status,
        departmentName: matchedDept.name,
        roleName: matchedRole.name,
      });
    }
  }

  // 4. Batch Create Valid Users
  const createdUsers = [];
  for (const item of validRows) {
    try {
      const hashedPassword = await bcrypt.hash(item.password, 10);
      const user = await prisma.user.create({
        data: {
          name: item.name,
          username: item.username,
          password: hashedPassword,
          email: item.email,
          departmentId: item.departmentId,
          roleId: item.roleId,
          legacyRole: item.legacyRole,
          status: item.status,
        },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          status: true,
        },
      });

      // Add to existing sets so if same file or subsequent queries run they know
      existingUsernames.add(user.username.toLowerCase());
      existingEmails.add(user.email.toLowerCase());

      createdUsers.push({
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        department: item.departmentName,
        role: item.roleName,
      });
    } catch (createErr) {
      errors.push({
        row: item.excelRowNum,
        username: item.username,
        email: item.email,
        error: createErr.message || "Database insertion failed.",
      });
    }
  }

  const totalProcessed = validRows.length + errors.filter((e) => !validRows.some((v) => v.excelRowNum === e.row)).length;

  return {
    success: true,
    totalRows: totalProcessed,
    successfulCount: createdUsers.length,
    failedCount: errors.length,
    createdUsers,
    errors,
  };
};

module.exports = {
  generateUserUploadTemplate,
  processBulkUserUpload,
};
