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

// Default schedule page
router.get('/schedule', requireRole('DOCTOR'), async (req, res) => {
    const doctorRes = await pool.query('SELECT id FROM doctors WHERE user_id=$1', [req.session.user.id]);
const doctorId = doctorRes.rows[0].id;

const appointments = await pool.query(
    `SELECT a.id, a.start_at, a.end_at, a.status, a.notes, p.full_name AS patient_name
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     WHERE a.doctor_id = $1
     ORDER BY a.start_at`,
    [doctorId]
);
    res.render('doctor/schedule', { user: req.session.user, appointments: appointments.rows });
});


// Medications page (add meds for patients)
router.get('/medications', requireRole('DOCTOR'), async (req, res) => {
    const patients = await pool.query('SELECT * FROM users WHERE role=$1', ['patient']);
    res.render('doctor/medications', { user: req.session.user, patients: patients.rows });
});

// Patients tab
router.get('/patients', requireRole('DOCTOR'), async (req, res) => {
    const patients = await pool.query('SELECT * FROM users WHERE role=$1', ['patient']);
    res.render('doctor/patients', { user: req.session.user, patients: patients.rows });
});

// Medical Records
router.get('/medical-records', requireRole('DOCTOR'), async (req, res) => {
    const patients = await pool.query('SELECT * FROM users WHERE role=$1', ['patient']);
    res.render('doctor/medical-records', { user: req.session.user, patients: patients.rows });
});

// Profile page
router.get('/profile', requireRole('DOCTOR'), (req, res) => {
    res.render('doctor/profile', { user: req.session.user });
});

module.exports = router;