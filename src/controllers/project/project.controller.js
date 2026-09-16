const projectService = require("../../services/project/project.service");

const createProject = async (req, res, next) => {
  try {
    const data = await projectService.createProject(req.body, req.user.id);
    return res.status(201).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const listProjects = async (req, res, next) => {
  try {
    const data = await projectService.listProjects(req.query);
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const getProjectById = async (req, res, next) => {
  try {
    const data = await projectService.getProjectById(Number(req.params.id));
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

const updateProject = async (req, res, next) => {
  try {
    const data = await projectService.updateProject(
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

const retireProject = async (req, res, next) => {
  try {
    const data = await projectService.retireProject(Number(req.params.id));
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProject,
  listProjects,
  getProjectById,
  updateProject,
  retireProject,
};
