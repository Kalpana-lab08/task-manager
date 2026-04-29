const Project = require('../models/Project');
const Task = require('../models/Task');
const mongoose = require('mongoose');

const isValidObjectId = id => mongoose.Types.ObjectId.isValid(id);

function canAccessProject(project, user) {
  if (!project) return false;
  if (user.role === 'admin') return true;
  if (project.owner.toString() === user.id) return true;
  return project.teamMembers.some(memberId => memberId.toString() === user.id);
}

function canModifyProject(project, user) {
  if (!project) return false;
  if (user.role === 'admin') return true;
  return project.owner.toString() === user.id;
}

exports.createProject = async (req, res) => {
  try {
    const { name, description, status, teamMembers } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Project name is required.' });
    }

    const validTeamMembers = Array.isArray(teamMembers)
      ? teamMembers.filter(id => isValidObjectId(id))
      : [];

    const project = await Project.create({
      name,
      description: description || '',
      status: status || 'Not Started',
      owner: req.user.id,
      teamMembers: validTeamMembers
    });

    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: 'Unable to create project.' });
  }
};

exports.getProjects = async (req, res) => {
  try {
    const query = req.user.role === 'admin'
      ? {}
      : { $or: [{ owner: req.user.id }, { teamMembers: req.user.id }] };

    const projects = await Project.find(query)
      .populate('owner', 'username role')
      .populate('teamMembers', 'username role');

    const result = await Promise.all(projects.map(async project => {
      const taskCount = await Task.countDocuments({ projectId: project._id });
      return { ...project.toObject(), taskCount };
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Unable to load projects.' });
  }
};

exports.getProjectById = async (req, res) => {
  try {
    const projectId = req.params.id;
    if (!isValidObjectId(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID.' });
    }

    const project = await Project.findById(projectId)
      .populate('owner', 'username role')
      .populate('teamMembers', 'username role');

    if (!project || !canAccessProject(project, req.user)) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Unable to retrieve project.' });
  }
};

exports.getProjectTasks = async (req, res) => {
  try {
    const projectId = req.params.id;
    if (!isValidObjectId(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID.' });
    }

    const project = await Project.findById(projectId);
    if (!project || !canAccessProject(project, req.user)) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const tasks = await Task.find({ projectId }).populate('projectId', 'name').populate('assignedTo', 'username role');
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Unable to load project tasks.' });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    if (!isValidObjectId(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID.' });
    }

    const project = await Project.findById(projectId);
    if (!project || !canModifyProject(project, req.user)) {
      return res.status(404).json({ error: 'Project not found or unauthorized.' });
    }

    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.status) updates.status = req.body.status;
    if (Array.isArray(req.body.teamMembers)) {
      updates.teamMembers = req.body.teamMembers.filter(id => isValidObjectId(id));
    }

    const updatedProject = await Project.findByIdAndUpdate(projectId, { $set: updates }, { new: true })
      .populate('owner', 'username role')
      .populate('teamMembers', 'username role');

    res.json(updatedProject);
  } catch (error) {
    res.status(500).json({ error: 'Unable to update project.' });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    if (!isValidObjectId(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID.' });
    }

    const project = await Project.findById(projectId);
    if (!project || !canModifyProject(project, req.user)) {
      return res.status(404).json({ error: 'Project not found or unauthorized.' });
    }

    await project.deleteOne();
    await Task.deleteMany({ projectId: project._id });
    res.json({ success: true, projectId: project._id });
  } catch (error) {
    res.status(500).json({ error: 'Unable to delete project.' });
  }
};
