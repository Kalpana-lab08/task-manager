const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const mongoose = require('mongoose');

const isValidObjectId = id => mongoose.Types.ObjectId.isValid(id);

function buildTaskResponse(task) {
  return {
    ...task.toObject(),
    projectName: task.projectId ? task.projectId.name : null,
    projectId: task.projectId ? task.projectId._id : null,
    assignedToUser: task.assignedTo ? { id: task.assignedTo._id, username: task.assignedTo.username, role: task.assignedTo.role } : null
  };
}

function canAccessProject(project, user) {
  if (!project) return false;
  if (user.role === 'admin') return true;
  if (project.owner.toString() === user.id) return true;
  return project.teamMembers.some(memberId => memberId.toString() === user.id);
}

function isMemberOfProject(project, userId) {
  if (!project) return false;
  if (project.owner.toString() === userId) return true;
  return project.teamMembers.some(memberId => memberId.toString() === userId);
}

async function getAccessibleProjectIds(user) {
  if (user.role === 'admin') {
    const allProjects = await Project.find().select('_id');
    return allProjects.map(project => project._id);
  }

  const projects = await Project.find({ $or: [{ owner: user.id }, { teamMembers: user.id }] }).select('_id');
  return projects.map(project => project._id);
}

exports.createTask = async (req, res) => {
  try {
    const { title, description, deadline, projectId, priority, status, assignedTo } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Task title is required.' });
    }

    let finalPriority = priority;
    if (!finalPriority) {
      const days = deadline ? (new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24) : 7;
      finalPriority = days < 2 ? 'High' : 'Medium';
    }

    let project = null;
    if (projectId) {
      if (!isValidObjectId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }
      project = await Project.findById(projectId);
      if (!project || !canAccessProject(project, req.user)) {
        return res.status(404).json({ error: 'Project not found or unauthorized.' });
      }
    }

    let assignedUser = null;
    if (assignedTo) {
      if (!isValidObjectId(assignedTo)) {
        return res.status(400).json({ error: 'Invalid assigned user ID.' });
      }
      assignedUser = await User.findById(assignedTo);
      if (!assignedUser) {
        return res.status(404).json({ error: 'Assigned user not found.' });
      }
      if (project && !isMemberOfProject(project, assignedTo)) {
        return res.status(400).json({ error: 'Assigned user must be a project owner or team member.' });
      }
    }

    const task = await Task.create({
      title,
      description: description || '',
      deadline,
      priority: finalPriority,
      status: status || 'Pending',
      projectId: projectId || null,
      assignedTo: assignedTo || null,
      owner: req.user.id
    });
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: 'Unable to create task.' });
  }
};

exports.getTasks = async (req, res) => {
  try {
    let query = { owner: req.user.id };

    if (req.user.role === 'admin') {
      query = {};
    } else {
      const projectIds = await getAccessibleProjectIds(req.user);
      query = {
        $or: [
          { owner: req.user.id },
          { assignedTo: req.user.id },
          { projectId: { $in: projectIds } }
        ]
      };
    }

    const tasks = await Task.find(query)
      .populate('projectId', 'name')
      .populate('assignedTo', 'username role');

    res.json(tasks.map(buildTaskResponse));
  } catch (error) {
    res.status(500).json({ error: 'Unable to load tasks.' });
  }
};

exports.getTaskById = async (req, res) => {
  try {
    const taskId = req.params.id;
    if (!isValidObjectId(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID.' });
    }

    const task = await Task.findById(taskId)
      .populate('projectId', 'name teamMembers owner')
      .populate('assignedTo', 'username role');

    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    if (req.user.role !== 'admin' && task.owner.toString() !== req.user.id && (!task.assignedTo || task.assignedTo._id.toString() !== req.user.id)) {
      if (!task.projectId || !canAccessProject(task.projectId, req.user)) {
        return res.status(404).json({ error: 'Task not found.' });
      }
    }

    res.json(buildTaskResponse(task));
  } catch (error) {
    res.status(500).json({ error: 'Unable to retrieve task.' });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const taskId = req.params.id;
    if (!isValidObjectId(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID.' });
    }

    const task = await Task.findById(taskId).populate('projectId', 'teamMembers owner');
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const isOwner = task.owner.toString() === req.user.id;
    const isAssignee = task.assignedTo && task.assignedTo.toString() === req.user.id;
    if (req.user.role !== 'admin' && !isOwner && !isAssignee) {
      if (!task.projectId || !canAccessProject(task.projectId, req.user)) {
        return res.status(404).json({ error: 'Task not found or unauthorized.' });
      }
    }

    const updates = {};
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.deadline !== undefined) updates.deadline = req.body.deadline;
    if (req.body.priority !== undefined) updates.priority = req.body.priority;
    if (req.body.status !== undefined) updates.status = req.body.status;

    if (req.body.projectId) {
      if (!isValidObjectId(req.body.projectId)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }
      const project = await Project.findById(req.body.projectId);
      if (!project || !canAccessProject(project, req.user)) {
        return res.status(404).json({ error: 'Project not found or unauthorized.' });
      }
      updates.projectId = req.body.projectId;
    }

    if (req.body.assignedTo !== undefined) {
      if (req.body.assignedTo && !isValidObjectId(req.body.assignedTo)) {
        return res.status(400).json({ error: 'Invalid assigned user ID.' });
      }
      if (req.body.assignedTo) {
        const assignedUser = await User.findById(req.body.assignedTo);
        if (!assignedUser) {
          return res.status(404).json({ error: 'Assigned user not found.' });
        }
        if (updates.projectId || task.projectId) {
          const projectIdCheck = updates.projectId || task.projectId._id.toString();
          const project = await Project.findById(projectIdCheck);
          if (project && !isMemberOfProject(project, req.body.assignedTo)) {
            return res.status(400).json({ error: 'Assigned user must be a project owner or team member.' });
          }
        }
      }
      updates.assignedTo = req.body.assignedTo || null;
    }

    const updatedTask = await Task.findByIdAndUpdate(taskId, { $set: updates }, { new: true })
      .populate('projectId', 'name')
      .populate('assignedTo', 'username role');

    res.json(buildTaskResponse(updatedTask));
  } catch (error) {
    res.status(500).json({ error: 'Unable to update task.' });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const taskId = req.params.id;
    if (!isValidObjectId(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID.' });
    }

    const task = await Task.findById(taskId).populate('projectId', 'teamMembers owner');
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const isOwner = task.owner.toString() === req.user.id;
    const isAssignee = task.assignedTo && task.assignedTo.toString() === req.user.id;
    if (req.user.role !== 'admin' && !isOwner && !isAssignee) {
      if (!task.projectId || !canAccessProject(task.projectId, req.user)) {
        return res.status(404).json({ error: 'Task not found or unauthorized.' });
      }
    }

    await task.deleteOne();
    res.json({ success: true, taskId: task._id });
  } catch (error) {
    res.status(500).json({ error: 'Unable to delete task.' });
  }
};
