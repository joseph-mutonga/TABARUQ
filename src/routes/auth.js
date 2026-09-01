const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken, isAdmin } = require('../middleware/auth');

router.post('/login', authController.login);
router.post('/register', verifyToken, isAdmin, authController.register);
router.get('/users', verifyToken, isAdmin, authController.getUsers);
router.patch('/users/:id/status', verifyToken, isAdmin, authController.toggleUserStatus);
router.delete('/users/:id', verifyToken, isAdmin, authController.deleteUser);

module.exports = router;
