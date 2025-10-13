const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const dayjs = require("dayjs");
const isoWeek = require("dayjs/plugin/isoWeek");
dayjs.extend(isoWeek);

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

// Helper: get current doctor ID
async function getDoctorId(userId) {
  const res = await pool.query("SELECT id FROM doctors WHERE user_id=$1", [userId]);
  if (res.rows.length === 0) throw new Error("Doctor profile not found");
  return res.rows[0].id;
}

// --- 1️⃣ Doctor Schedule ---
router.get("/schedule", requireDoctor, async (req, res) => {
  try {
    const doctorId = await getDoctorId(req.session.user.id);

    // determine which week to show
    const selectedDate = req.query.week ? dayjs(req.query.week) : dayjs();
    const weekStart = selectedDate.startOf("week").toDate();
    const weekEnd = selectedDate.endOf("week").toDate();

    const appointments = await pool.query(
      `SELECT a.id, a.start_at, a.end_at, a.status, a.notes,
              p.full_name AS patient_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       WHERE a.doctor_id = $1
         AND a.start_at BETWEEN $2 AND $3
       ORDER BY a.start_at ASC`,
      [doctorId, weekStart, weekEnd]
    );

    // format each appointment for the view
    const formattedAppointments = appointments.rows.map((a) => {
      const start = dayjs(a.start_at);
      const end = dayjs(a.end_at);
      return {
        ...a,
        date: start.format("YYYY-MM-DD (ddd)"),
        time: `${start.format("HH:mm")} - ${end.format("HH:mm")}`,
      };
    });

    res.render("doctor/schedule", {
      appointments: formattedAppointments,
      currentWeek: selectedDate.startOf("week").format("YYYY-MM-DD"),
      nextWeek: selectedDate.add(1, "week").startOf("week").format("YYYY-MM-DD"),
      prevWeek: selectedDate.subtract(1, "week").startOf("week").format("YYYY-MM-DD"),
    });
  } catch (err) {
    console.error("Error fetching schedule:", err);
    res.status(500).send("Error fetching schedule");
  }
});

// --- 2️⃣ Add Appointment ---
router.get("/schedule/new", requireDoctor, async (req, res) => {
  try {
    const doctorId = await getDoctorId(req.session.user.id);
    const patients = await pool.query(
      "SELECT id, full_name FROM patients WHERE doctor_id = $1",
      [doctorId]
    );

    res.render("doctor/new_appointment", { patients: patients.rows });
  } catch (err) {
    console.error("Error rendering new appointment form:", err);
    res.status(500).send("Error loading appointment form");
  }
});

router.post("/schedule/new", requireDoctor, async (req, res) => {
  try {
    const { patient_id, start_at, end_at, notes } = req.body;
    const doctorId = await getDoctorId(req.session.user.id);

    await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, start_at, end_at, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [patient_id, doctorId, start_at, end_at, notes]
    );

    res.redirect("/doctor/schedule");
  } catch (err) {
    console.error("Error adding appointment:", err);
    res.status(500).send("Failed to add appointment");
  }
});

// --- 3️⃣ Edit Appointment ---
router.get("/schedule/:id/edit", requireDoctor, async (req, res) => {
  try {
    const doctorId = await getDoctorId(req.session.user.id);
    const appointmentId = req.params.id;

    const appointmentRes = await pool.query(
      `SELECT a.*, p.full_name AS patient_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       WHERE a.id = $1 AND a.doctor_id = $2`,
      [appointmentId, doctorId]
    );

    if (appointmentRes.rows.length === 0)
      return res.status(404).send("Appointment not found");

    const appointment = appointmentRes.rows[0];
    res.render("doctor/edit_appointment", { appointment });
  } catch (err) {
    console.error("Error loading edit form:", err);
    res.status(500).send("Error loading edit form");
  }
});

router.post("/schedule/:id/edit", requireDoctor, async (req, res) => {
  try {
    const { start_at, end_at, notes, status } = req.body;
    const appointmentId = req.params.id;
    const doctorId = await getDoctorId(req.session.user.id);

    await pool.query(
      `UPDATE appointments
       SET start_at=$1, end_at=$2, notes=$3, status=$4
       WHERE id=$5 AND doctor_id=$6`,
      [start_at, end_at, notes, status || "Scheduled", appointmentId, doctorId]
    );

    res.redirect("/doctor/schedule");
  } catch (err) {
    console.error("Error updating appointment:", err);
    res.status(500).send("Failed to update appointment");
  }
});

// --- 4️⃣ Delete Appointment ---
router.post("/schedule/:id/delete", requireDoctor, async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const doctorId = await getDoctorId(req.session.user.id);

    await pool.query(`DELETE FROM appointments WHERE id=$1 AND doctor_id=$2`, [
      appointmentId,
      doctorId,
    ]);

    res.redirect("/doctor/schedule");
  } catch (err) {
    console.error("Error deleting appointment:", err);
    res.status(500).send("Failed to delete appointment");
  }
});

// --- 5️⃣ Patients List ---
router.get("/patients", requireDoctor, async (req, res) => {
  try {
    const doctorId = await getDoctorId(req.session.user.id);
    const patients = await pool.query(
      `SELECT id, full_name, phone, date_of_birth
       FROM patients WHERE doctor_id=$1 ORDER BY full_name ASC`,
      [doctorId]
    );
    res.render("doctor/patients", { patients: patients.rows });
  } catch (err) {
    console.error("Error fetching patients:", err);
    res.status(500).send("Error loading patients");
  }
});

// --- 6️⃣ Add New Patient ---
router.get("/patients/new", requireDoctor, (req, res) => {
  res.render("doctor/new_patient");
});

router.post("/patients/new", requireDoctor, async (req, res) => {
  try {
    const { full_name, username, email, chief_complaint, phone, emergency_contact_name, emergency_contact_phone } = req.body;

    const userRes = await pool.query(
      `INSERT INTO users (username, email, role)
       VALUES ($1, $2, 'PATIENT') RETURNING id`,
      [username, email]
    );
    const userId = userRes.rows[0].id;

    const doctorId = await getDoctorId(req.session.user.id);

    await pool.query(
      `INSERT INTO patients (user_id, doctor_id, full_name, chief_complaint, phone, emergency_contact_name, emergency_contact_phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, doctorId, full_name, chief_complaint, phone, emergency_contact_name, emergency_contact_phone]
    );

    res.redirect("/doctor/patients");
  } catch (err) {
    console.error("Error adding new patient:", err);
    res.status(500).send("Failed to create patient");
  }
});

// --- 7️⃣ Patient Details + Records ---
router.get("/patients/:id", requireDoctor, async (req, res) => {
  const patientId = req.params.id;
  try {
    const patientRes = await pool.query(
      `SELECT id, full_name, phone, diagnosis, emergency_contact_name, emergency_contact_phone
       FROM patients WHERE id=$1`,
      [patientId]
    );
    if (patientRes.rows.length === 0) return res.status(404).send("Patient not found");
    const patient = patientRes.rows[0];

    const recordsRes = await pool.query(
      `SELECT mr.id AS record_id, mr.chief_complaint, mr.diagnosis, mr.therapy_notes,
              array_agg(m.name) FILTER (WHERE m.id IS NOT NULL) AS medications
       FROM medical_records mr
       LEFT JOIN prescriptions pr ON pr.record_id = mr.id
       LEFT JOIN medications m ON m.id = pr.medication_id
       WHERE mr.patient_id=$1
       GROUP BY mr.id
       ORDER BY mr.record_date DESC`,
      [patientId]
    );

    const medsRes = await pool.query(`SELECT id, name FROM medications ORDER BY name ASC`);

    res.render("doctor/patient_detail", {
      patient,
      medicalRecords: recordsRes.rows,
      medications: medsRes.rows,
    });
  } catch (err) {
    console.error("Error fetching patient details:", err);
    res.status(500).send("Server error fetching patient details");
  }
});

// --- 8️⃣ Add Record ---
router.get("/patients/:id/records/new", requireDoctor, async (req, res) => {
  try {
    const patientId = req.params.id;
    const patientRes = await pool.query(`SELECT id, full_name FROM patients WHERE id=$1`, [patientId]);
    if (patientRes.rows.length === 0) return res.status(404).send("Patient not found");

    const medsRes = await pool.query(`SELECT id, name FROM medications ORDER BY name ASC`);

    res.render("doctor/add_record", { patient: patientRes.rows[0], medications: medsRes.rows });
  } catch (err) {
    console.error("Error loading add record form:", err);
    res.status(500).send("Error loading add record form");
  }
});

router.post("/patients/:id/records/new", requireDoctor, async (req, res) => {
  try {
    const patientId = req.params.id;
    const {
      chief_complaint,
      diagnosis,
      therapy_notes,
      medication_ids,
      new_medication_name,
      new_medication_dosage,
      new_medication_frequency,
    } = req.body;

    const doctorId = await getDoctorId(req.session.user.id);

    const recordRes = await pool.query(
      `INSERT INTO medical_records (patient_id, doctor_id, chief_complaint, diagnosis, therapy_notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [patientId, doctorId, chief_complaint, diagnosis, therapy_notes]
    );

    const recordId = recordRes.rows[0].id;

    if (medication_ids) {
      const medsArray = Array.isArray(medication_ids) ? medication_ids : [medication_ids];
      for (const medId of medsArray) {
        await pool.query(`INSERT INTO prescriptions (record_id, medication_id) VALUES ($1, $2)`, [recordId, medId]);
      }
    }

    if (new_medication_name && new_medication_name.trim() !== "") {
      const newMedRes = await pool.query(`INSERT INTO medications (name) VALUES ($1) RETURNING id`, [
        new_medication_name.trim(),
      ]);
      const newMedId = newMedRes.rows[0].id;

      await pool.query(
        `INSERT INTO prescriptions (record_id, medication_id, dosage, frequency)
         VALUES ($1, $2, $3, $4)`,
        [recordId, newMedId, new_medication_dosage?.trim() || null, new_medication_frequency?.trim() || null]
      );
    }

    res.redirect(`/doctor/patients/${patientId}`);
  } catch (err) {
    console.error("Error adding medical record:", err);
    res.status(500).send("Failed to add medical record");
  }
});

// --- 9️⃣ Doctor Profile ---
router.get("/profile", requireDoctor, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.full_name, u.email, d.phone
       FROM doctors d
       JOIN users u ON u.id=d.user_id
       WHERE u.id=$1`,
      [req.session.user.id]
    );
    if (result.rows.length === 0) return res.status(404).send("Doctor not found");
    res.render("doctor/profile", { doctor: result.rows[0] });
  } catch (err) {
    console.error("Error fetching doctor profile:", err);
    res.status(500).send("Server error fetching profile");
  }
});

// --- 🔟 Logout ---
router.get("/logout", requireDoctor, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).send("Could not log out.");
    }
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

module.exports = router;
