const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "postgres",
  password: "1337",
  port: 5432,
});

// Middleware to check doctor session
function requireDoctor(req, res, next) {
  if (!req.session.user || req.session.user.role !== "DOCTOR") {
    return res.status(401).send("Unauthorized");
  }
  next();
}

// --- 1️⃣ DISPLAY DOCTOR SCHEDULE ---
router.get("/schedule", requireDoctor, async (req, res) => {
  try {
    const doctorUserId = req.session.user.id;
    const doctor = await pool.query(
      "SELECT id FROM doctors WHERE user_id = $1",
      [doctorUserId]
    );

    if (doctor.rows.length === 0) {
      return res.status(404).send("Doctor profile not found");
    }

    const doctorId = doctor.rows[0].id;

    const appointments = await pool.query(
      `SELECT a.id, a.start_at, a.end_at, a.status,
              p.full_name AS patient_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       WHERE a.doctor_id = $1
       ORDER BY a.start_at ASC`,
      [doctorId]
    );

    res.render("doctor/schedule", { appointments: appointments.rows });
  } catch (err) {
    console.error("❌ Error fetching schedule:", err);
    res.status(500).send("Error fetching schedule");
  }
});

// --- 2️⃣ ADD NEW APPOINTMENT FORM ---
router.get("/schedule/new", requireDoctor, async (req, res) => {
  try {
    const doctorUserId = req.session.user.id;
    const doctor = await pool.query(
      "SELECT id FROM doctors WHERE user_id = $1",
      [doctorUserId]
    );

    const patients = await pool.query(
      "SELECT id, full_name FROM patients WHERE doctor_id = $1",
      [doctor.rows[0].id]
    );

    res.render("doctor/new_appointment", { patients: patients.rows });
  } catch (err) {
    console.error("❌ Error rendering new appointment form:", err);
    res.status(500).send("Error loading appointment form");
  }
});
router.get('/patients/new', (req, res) => {
  res.render('doctor/new_patient');
});

router.post('/patients/new', async (req, res) => {
  const { full_name, username, chief_complaint, phone, emergency_contact_name, emergency_contact_phone } = req.body;

  const newUser = await pool.query(
    `INSERT INTO users (username, role) VALUES ($1, 'PATIENT') RETURNING id`,
    [username]
  );

  const userId = newUser.rows[0].id;

  await pool.query(
    `INSERT INTO patients (user_id, full_name, chief_complaint, phone, emergency_contact_name, emergency_contact_phone)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, full_name, chief_complaint, phone, emergency_contact_name, emergency_contact_phone]
  );

  res.redirect('/doctor/patients');
});

// ✅ This must come AFTER /patients/new
// GET /doctor/patients/:id
router.get('/patients/:id', requireRole('DOCTOR'), async (req, res) => {
  const patientId = req.params.id;

  try {
    // 1️⃣ Fetch patient info
    const patientRes = await pool.query(
      `SELECT p.id, p.full_name, p.phone, p.emergencycontactname, p.emergencycontactphone, p.diagnosis
       FROM patients p
       WHERE p.id = $1`,
      [patientId]
    );
    if (patientRes.rows.length === 0) return res.status(404).send('Patient not found');
    const patient = patientRes.rows[0];

    // 2️⃣ Fetch patient's medical records and their prescriptions
    const recordsRes = await pool.query(
      `SELECT mr.id AS record_id, mr.chief_complaint, mr.diagnosis, mr.therapy_notes,
              array_agg(m.name) AS medications
       FROM medical_records mr
       LEFT JOIN prescriptions pr ON pr.record_id = mr.id
       LEFT JOIN medications m ON m.id = pr.medication_id
       WHERE mr.patient_id = $1
       GROUP BY mr.id
       ORDER BY mr.record_date DESC`,
      [patientId]
    );

    // 3️⃣ Fetch all available medications for dropdown
    const medsRes = await pool.query(
      `SELECT id, name FROM medications ORDER BY name`
    );

    res.render('doctor/patient_detail', {
      patient,
      medicalRecords: recordsRes.rows,
      medications: medsRes.rows
    });

  } catch (err) {
    console.error("Error fetching patient details:", err);
    res.status(500).send("Server error");
  }
});
// --- 3️⃣ POST NEW APPOINTMENT ---
router.post("/schedule/new", requireDoctor, async (req, res) => {
  const { patient_id, start_at, end_at, notes } = req.body;
  try {
    const doctorUserId = req.session.user.id;
    const doctor = await pool.query(
      "SELECT id FROM doctors WHERE user_id = $1",
      [doctorUserId]
    );

    await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, start_at, end_at, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [patient_id, doctor.rows[0].id, start_at, end_at, notes]
    );

    res.redirect("/doctor/schedule");
  } catch (err) {
    console.error("❌ Error adding appointment:", err);
    res.status(500).send("Failed to add appointment");
  }
});

// --- 4️⃣ DISPLAY PATIENTS ---
router.get("/patients", requireDoctor, async (req, res) => {
  try {
    const doctorUserId = req.session.user.id;
    const doctor = await pool.query(
      "SELECT id FROM doctors WHERE user_id = $1",
      [doctorUserId]
    );

    const patients = await pool.query(
      `SELECT id, full_name, date_of_birth, phone
       FROM patients WHERE doctor_id = $1`,
      [doctor.rows[0].id]
    );

    res.render("doctor/patients", { patients: patients.rows });
  } catch (err) {
    console.error("❌ Error fetching patients:", err);
    res.status(500).send("Error loading patients");
  }
});

// --- 5️⃣ DISPLAY MEDICATIONS ---
router.get("/medications", requireDoctor, async (req, res) => {
  try {
    const doctorUserId = req.session.user.id;
    const doctor = await pool.query(
      "SELECT id FROM doctors WHERE user_id = $1",
      [doctorUserId]
    );

    const meds = await pool.query(
      `SELECT p.full_name, pr.medication_name, pr.dosage, pr.frequency
       FROM medical_records mr
       JOIN prescriptions pr ON pr.record_id = mr.id
       JOIN patients p ON p.id = mr.patient_id
       WHERE mr.doctor_id = $1`,
      [doctor.rows[0].id]
    );

    res.render("doctor/medications", { medications: meds.rows });
  } catch (err) {
    console.error("❌ Error fetching medications:", err);
    res.status(500).send("Error loading medications");
  }
});

// --- 6️⃣ ADD NEW MEDICATION FORM ---
router.get("/medications/new", requireDoctor, async (req, res) => {
  try {
    const doctorUserId = req.session.user.id;
    const doctor = await pool.query(
      "SELECT id FROM doctors WHERE user_id = $1",
      [doctorUserId]
    );

    const patients = await pool.query(
      "SELECT id, full_name FROM patients WHERE doctor_id = $1",
      [doctor.rows[0].id]
    );

    res.render("doctor/new_medication", { patients: patients.rows });
  } catch (err) {
    console.error("❌ Error rendering medication form:", err);
    res.status(500).send("Error loading medication form");
  }
});

// --- 7️⃣ POST NEW MEDICATION ---
router.post("/medications/new", requireDoctor, async (req, res) => {
  const { patient_id, medication_name, dosage, frequency, instructions } = req.body;

  try {
    // We first need a medical record to attach prescription
    const doctorUserId = req.session.user.id;
    const doctor = await pool.query(
      "SELECT id FROM doctors WHERE user_id = $1",
      [doctorUserId]
    );

    const newRecord = await pool.query(
      `INSERT INTO medical_records (patient_id, doctor_id)
       VALUES ($1, $2)
       RETURNING id`,
      [patient_id, doctor.rows[0].id]
    );

    await pool.query(
      `INSERT INTO prescriptions (record_id, medication_name, dosage, frequency, instructions)
       VALUES ($1, $2, $3, $4, $5)`,
      [newRecord.rows[0].id, medication_name, dosage, frequency, instructions]
    );

    res.redirect("/doctor/medications");
  } catch (err) {
    console.error("❌ Error adding medication:", err);
    res.status(500).send("Failed to add medication");
  }
});

// --- 8️⃣ DISPLAY MEDICAL RECORDS ---
router.get("/medical-records", requireDoctor, async (req, res) => {
  try {
    const doctorUserId = req.session.user.id;
    const doctor = await pool.query(
      "SELECT id FROM doctors WHERE user_id = $1",
      [doctorUserId]
    );

    const records = await pool.query(
      `SELECT mr.id, mr.record_date, p.full_name AS patient_name, mr.diagnosis, mr.therapy_notes
       FROM medical_records mr
       JOIN patients p ON p.id = mr.patient_id
       WHERE mr.doctor_id = $1
       ORDER BY mr.record_date DESC`,
      [doctor.rows[0].id]
    );

    res.render("doctor/medical_records", { records: records.rows });
  } catch (err) {
    console.error("❌ Error fetching medical records:", err);
    res.status(500).send("Error loading medical records");
  }
});

// --- 9️⃣ PROFILE PAGE ---
router.get("/profile", requireDoctor, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.full_name, u.email, d.phone
       FROM doctors d
       JOIN users u ON u.id = d.user_id
       WHERE u.id = $1`,
      [req.session.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Doctor not found");
    }

    const doctor = result.rows[0];
    res.render("doctor/profile", { doctor }); // ✅ doctor is now passed
  } catch (err) {
    console.error("Error fetching doctor profile:", err);
    res.status(500).send("Server error.");
  }
});
// View patient details
router.get('/patients/:id', async (req, res) => {
  const { id } = req.params;

  const patientRes = await pool.query(
    `SELECT * FROM patients WHERE id=$1`,
    [id]
  );
  const patient = patientRes.rows[0];

  const recordsRes = await pool.query(
    `SELECT mr.*, m.name AS prescription_name
     FROM medical_records mr
     LEFT JOIN medications m ON mr.prescription_id = m.id
     WHERE mr.patient_id=$1
     ORDER BY mr.created_at DESC`,
    [id]
  );

  res.render('doctor/patient_details', { patient, records: recordsRes.rows });
});

// Add medical record (GET)
router.get('/patients/:id/records/new', async (req, res) => {
  const { id } = req.params;
  const patientRes = await pool.query('SELECT * FROM patients WHERE id=$1', [id]);
  const prescriptionsRes = await pool.query('SELECT id, name, dosage FROM medications');

  res.render('doctor/add_record', { patient: patientRes.rows[0], prescriptions: prescriptionsRes.rows });
});

// Add medical record (POST)
router.post('/patients/:id/records/new', async (req, res) => {
  const { id } = req.params;
  const { chief_complaint, diagnosis, notes, prescription_id } = req.body;

  await pool.query(
    `INSERT INTO medical_records (patient_id, doctor_id, chief_complaint, diagnosis, notes, prescription_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, req.session.user.doctor_id, chief_complaint, diagnosis, notes, prescription_id || null]
  );

  res.redirect(`/doctor/patients/${id}`);
});

// Add new patient (GET)
router.get('/patients/new', (req, res) => {
  res.render('doctor/new_patient');
});

// Add new patient (POST)
router.post('/patients/new', async (req, res) => {
  const { full_name, username, chief_complaint, phone, emergency_contact_name, emergency_contact_phone } = req.body;

  // Create new user (without password yet)
  const newUser = await pool.query(
    `INSERT INTO users (username, role) VALUES ($1, 'PATIENT') RETURNING id`,
    [username]
  );

  const userId = newUser.rows[0].id;

  // Create patient entry
  await pool.query(
    `INSERT INTO patients (user_id, full_name, chief_complaint, phone, emergency_contact_name, emergency_contact_phone)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, full_name, chief_complaint, phone, emergency_contact_name, emergency_contact_phone]
  );

  res.redirect('/doctor/patients');
});
// Doctor Logout
router.get("/doctor/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).send("Could not log out.");
    }
    res.clearCookie("connect.sid"); // clear session cookie
    res.redirect("/"); // back to landing page
  });
});


module.exports = router;
