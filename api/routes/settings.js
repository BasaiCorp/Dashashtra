const express = require('express');
const router = express.Router();
const { fetchAndSyncUserInfo, updateUserSettings } = require('../fetch_user_info');
const { authenticateUser } = require('../middleware/auth');

// Get user settings
router.get('/', authenticateUser, async (req, res) => {
    try {
        const result = await fetchAndSyncUserInfo(req.user.id, req.user.panelApiKey);
        if (!result.success) {
            return res.status(400).json(result);
        }
        res.json(result.data);
    } catch (error) {
        console.error('Error fetching user settings:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update profile settings
router.post('/profile', authenticateUser, async (req, res) => {
    try {
        const { username, email } = req.body;
        const result = await updateUserSettings(req.user.id, { username, email });
        if (!result.success) {
            return res.status(400).json(result);
        }
        res.json(result.data);
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update password
router.post('/password', authenticateUser, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await updateUserSettings(req.user.id, {
            currentPassword,
            newPassword
        });
        if (!result.success) {
            return res.status(400).json(result);
        }
        res.json(result.data);
    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update notification preferences
router.post('/notifications', authenticateUser, async (req, res) => {
    try {
        const { notificationPreferences } = req.body;
        const result = await updateUserSettings(req.user.id, { notificationPreferences });
        if (!result.success) {
            return res.status(400).json(result);
        }
        res.json(result.data);
    } catch (error) {
        console.error('Error updating notification preferences:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Toggle 2FA
router.post('/2fa', authenticateUser, async (req, res) => {
    try {
        const { enabled } = req.body;
        const result = await updateUserSettings(req.user.id, { twoFactorEnabled: enabled });
        if (!result.success) {
            return res.status(400).json(result);
        }
        res.json(result.data);
    } catch (error) {
        console.error('Error toggling 2FA:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router; 