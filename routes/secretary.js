const express = require('express');
const router = express.Router();
const pool = require('../db'); // adjust path if necessary

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(403).send('Unauthorized');
    if (req.session.user.role !== role) return res.status(403).send('Unauthorized');
    next();
  };
}


// Schedule page (default)
router.get('/schedule', requireRole('SECRETARY'), async (req, res) => {
    const appointments = await pool.query(
    `SELECT a.id, a.start_at, a.end_at, a.status, a.notes,
            p.full_name AS patient_name, d.full_name AS doctor_name
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors d ON a.doctor_id = d.id
     ORDER BY a.start_at`
);
    res.render('secretary/schedule', { user: req.session.user, appointments: appointments.rows });
});

// Profile page
router.get('/profile', requireRole('SECRETARY'), (req, res) => {
    res.render('secretary/profile', { user: req.session.user });
});

module.exports = router;