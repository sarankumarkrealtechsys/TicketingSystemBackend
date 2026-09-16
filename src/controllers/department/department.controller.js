const departmentService = require("../../services/department/department.service");

const createDepartment = async (req, res, next) => {
  try {
    const data = await departmentService.createDepartment(
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

const listDepartments = async (req, res, next) => {
  try {
    const data = await departmentService.listDepartments(req.query);
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const getDepartmentById = async (req, res, next) => {
  try {
    const data = await departmentService.getDepartmentById(
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

const updateDepartment = async (req, res, next) => {
  try {
    const data = await departmentService.updateDepartment(
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

const retireDepartment = async (req, res, next) => {
  try {
    const data = await departmentService.retireDepartment(
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
  createDepartment,
  listDepartments,
  getDepartmentById,
  updateDepartment,
  retireDepartment,
};
