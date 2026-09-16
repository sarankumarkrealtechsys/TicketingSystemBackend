const ticketFieldService = require("../../services/ticket-field/ticket-field.service");

const createFieldDefinition = async (req, res, next) => {
  try {
    const data = await ticketFieldService.createFieldDefinition(
      req.body,
      req.user.id,
    );
    return res.status(201).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const listFieldDefinitions = async (req, res, next) => {
  try {
    const data = await ticketFieldService.listFieldDefinitions({
      teamId: req.query.teamId,
      includeInactive:
        req.query.includeInactive === "true" ||
        req.query.includeInactive === true,
    });
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const getFieldDefinitionById = async (req, res, next) => {
  try {
    const data = await ticketFieldService.getFieldDefinitionById(
      Number(req.params.id),
    );
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const updateFieldDefinition = async (req, res, next) => {
  try {
    const data = await ticketFieldService.updateFieldDefinition(
      Number(req.params.id),
      req.body,
    );
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const retireFieldDefinition = async (req, res, next) => {
  try {
    const data = await ticketFieldService.retireFieldDefinition(
      Number(req.params.id),
    );
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createFieldDefinition,
  listFieldDefinitions,
  getFieldDefinitionById,
  updateFieldDefinition,
  retireFieldDefinition,
};
