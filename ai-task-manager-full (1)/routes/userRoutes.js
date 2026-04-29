const r = require('express').Router();
const auth = require('../middleware/authMiddleware');
const c = require('../controllers/userController');

r.use(auth);
r.get('/', c.getUsers);

module.exports = r;
