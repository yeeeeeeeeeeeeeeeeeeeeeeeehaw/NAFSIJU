const express = require('express');
const router = express.Router();
const pool = require('../db'); // adjust path if necessary

// Middleware to enforce patient role
function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(403).send('Unauthorized');
    if (req.session.user.role !== role) return res.status(403).send('Unauthorized');
    next();
  };
}


// Schedule page (default)
router.get('/schedule', requireRole('PATIENT'), async (req, res) => {
  try {
    const patientRes = await pool.query(
      'SELECT id FROM patients WHERE user_id=$1',
      [req.session.user.id]
    );

    if (patientRes.rowCount === 0) {
      return res.status(404).send("Patient record not found.");
    }

    // Save to session for reuse
    req.session.patientId = patientRes.rows[0].id;

    const appointments = await pool.query(
      `SELECT a.id, a.start_at, a.end_at, a.status, a.notes, d.full_name AS doctor_name
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       WHERE a.patient_id = $1
       ORDER BY a.start_at`,
      [req.session.patientId]
    );

    res.render('patient/schedule', {
      user: req.session.user,
      appointments: appointments.rows
    });
  } catch (err) {
    console.error("Error loading patient schedule:", err);
    res.status(500).send("Server error loading schedule.");
  }
});


// Profile page
// GET /patient/profile
router.get("/profile", requireRole('PATIENT'), async (req, res) => {
  try {
    // Ensure patientId exists
    if (!req.session.patientId) {
      const patientRes = await pool.query(
        "SELECT id FROM patients WHERE user_id = $1",
        [req.session.user.id]
      );
      if (patientRes.rowCount > 0) {
        req.session.patientId = patientRes.rows[0].id;
      } else {
        return res.status(404).send("Patient record not found.");
      }
    }

    const result = await pool.query(
      "SELECT full_name, gender, phone, address, date_of_birth FROM patients WHERE id = $1",
      [req.session.patientId]
    );

    const patient = result.rows[0] || {
      full_name: "",
      gender: "",
      phone: "",
      address: "",
      date_of_birth: "",
    };

    res.render("patient/profile", { patient });
  } catch (err) {
    console.error("Error loading profile:", err);
    res.status(500).send("Server error loading profile");
  }
});
router.post("/profile", async (req, res) => {
  try {
    const { full_name, gender, phone, address, date_of_birth } = req.body;

    await pool.query(
      `UPDATE patients 
       SET full_name = $1, gender = $2, phone = $3, address = $4, date_of_birth = $5
       WHERE id = $6`,
      [full_name, gender, phone, address, date_of_birth, req.session.patientId]
    );

    res.redirect("/patient/profile");
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).send("Server error updating profile");
  }
});
// Medications page
router.get('/medications', requireRole('PATIENT'), async (req, res) => {
    const meds = await pool.query(
        'SELECT * FROM medications WHERE patient_id=$1',
        [req.session.user.id]
    );
    res.render('patient/medications', { user: req.session.user, medications: meds.rows });
});

module.exports = router;