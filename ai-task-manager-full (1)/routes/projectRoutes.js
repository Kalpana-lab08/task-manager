const r = require('express').Router();
const c = require('../controllers/projectController');
const auth = require('../middleware/authMiddleware');

r.use(auth);
r.post('/', c.createProject);
r.get('/', c.getProjects);
r.get('/:id', c.getProjectById);
r.put('/:id', c.updateProject);
r.delete('/:id', c.deleteProject);
r.get('/:id/tasks', c.getProjectTasks);

module.exports = r;
