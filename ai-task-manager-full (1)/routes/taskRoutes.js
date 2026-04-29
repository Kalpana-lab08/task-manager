const r = require('express').Router();
const c = require('../controllers/taskController');
const auth = require('../middleware/authMiddleware');

r.use(auth);
r.post('/', c.createTask);
r.get('/', c.getTasks);
r.get('/:id', c.getTaskById);
r.put('/:id', c.updateTask);
r.delete('/:id', c.deleteTask);

module.exports = r;
