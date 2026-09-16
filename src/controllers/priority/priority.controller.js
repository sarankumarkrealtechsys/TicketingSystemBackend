const priorityService = require("../../services/priority/priority.service");

const createPriority = async (req, res, next) => {
  try {
    const data = await priorityService.createPriority(req.body, req.user.id);
    return res.status(201).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const listPriorities = async (req, res, next) => {
  try {
    const data = await priorityService.listPriorities(req.query);
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const getPriorityById = async (req, res, next) => {
  try {
    const data = await priorityService.getPriorityById(Number(req.params.id));
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const updatePriority = async (req, res, next) => {
  try {
    const data = await priorityService.updatePriority(
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

const retirePriority = async (req, res, next) => {
  try {
    const data = await priorityService.retirePriority(Number(req.params.id));
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPriority,
  listPriorities,
  getPriorityById,
  updatePriority,
  retirePriority,
};
