const { AppError } = require("../../utils/errors");

/**
 * Validates a custom field value against its definition and maps to the appropriate DB column.
 */
const validateAndFormatFieldValue = (definition, rawValue) => {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    if (definition.isRequired) {
      throw new AppError(`Field "${definition.name}" is required`, 400);
    }
    return null;
  }

  const result = {
    fieldDefinitionId: definition.id,
    textValue: null,
    numberValue: null,
    decimalValue: null,
    booleanValue: null,
    dateValue: null,
    selectedOptions: null,
  };

  switch (definition.fieldType) {
    case "TEXT":
    case "LONG_TEXT": {
      result.textValue = String(rawValue);
      break;
    }

    case "NUMBER": {
      const num = Number(rawValue);
      if (isNaN(num) || !Number.isInteger(num)) {
        throw new AppError(
          `Invalid value for NUMBER field "${definition.name}". Must be an integer.`,
          400,
        );
      }
      result.numberValue = BigInt(num);
      break;
    }

    case "DECIMAL": {
      const dec = Number(rawValue);
      if (isNaN(dec)) {
        throw new AppError(
          `Invalid value for DECIMAL field "${definition.name}". Must be numeric.`,
          400,
        );
      }
      result.decimalValue = dec;
      break;
    }

    case "BOOLEAN": {
      if (typeof rawValue === "boolean") {
        result.booleanValue = rawValue;
      } else if (rawValue === "true" || rawValue === "1") {
        result.booleanValue = true;
      } else if (rawValue === "false" || rawValue === "0") {
        result.booleanValue = false;
      } else {
        throw new AppError(
          `Invalid value for BOOLEAN field "${definition.name}". Must be true or false.`,
          400,
        );
      }
      break;
    }

    case "DATE":
    case "DATETIME": {
      const parsedDate = new Date(rawValue);
      if (isNaN(parsedDate.getTime())) {
        throw new AppError(
          `Invalid date format for field "${definition.name}".`,
          400,
        );
      }
      result.dateValue = parsedDate;
      break;
    }

    case "SELECT": {
      const strVal = String(rawValue).trim();
      const validOptions = Array.isArray(definition.options)
        ? definition.options.map((o) => (typeof o === "object" ? o.value : o))
        : [];
      if (!validOptions.includes(strVal)) {
        throw new AppError(
          `Invalid option "${strVal}" for SELECT field "${definition.name}". Allowed options: ${validOptions.join(", ")}`,
          400,
        );
      }
      result.textValue = strVal;
      break;
    }

    case "MULTI_SELECT": {
      if (!Array.isArray(rawValue)) {
        throw new AppError(
          `Value for MULTI_SELECT field "${definition.name}" must be an array of selected options.`,
          400,
        );
      }
      const validOptions = Array.isArray(definition.options)
        ? definition.options.map((o) => (typeof o === "object" ? o.value : o))
        : [];
      for (const val of rawValue) {
        if (!validOptions.includes(String(val))) {
          throw new AppError(
            `Invalid option "${val}" for MULTI_SELECT field "${definition.name}". Allowed options: ${validOptions.join(", ")}`,
            400,
          );
        }
      }
      result.selectedOptions = rawValue;
      break;
    }

    case "EMAIL": {
      const emailRegex = /^[^\s@]+@[^\s@]+$/;
      const strVal = String(rawValue).trim();
      if (!emailRegex.test(strVal)) {
        throw new AppError(
          `Invalid email format for field "${definition.name}".`,
          400,
        );
      }
      result.textValue = strVal;
      break;
    }

    case "URL": {
      try {
        new URL(String(rawValue));
        result.textValue = String(rawValue).trim();
      } catch {
        throw new AppError(
          `Invalid URL format for field "${definition.name}".`,
          400,
        );
      }
      break;
    }

    default:
      result.textValue = String(rawValue);
  }

  return result;
};

module.exports = {
  validateAndFormatFieldValue,
};
