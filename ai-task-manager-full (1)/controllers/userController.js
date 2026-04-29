const User = require('../models/User');

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({}, 'username email role');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Unable to load users.' });
  }
};
