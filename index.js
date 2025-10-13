const express = require('express');
const app = express();
const session = require('express-session');
const PORT = 3000;
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const pool = new Pool({
  user: "postgres",       // your PostgreSQL username
  host: "localhost",      // or your DB server
  database: "postgres",   // your database name
  password: "1337",   // your PostgreSQL password
  port: 5432              // default PostgreSQL port
});


const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'secret123',        // change to a secure secret
  resave: false,
  saveUninitialized: true
}));
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
  res.render('lander');
});
app.get('/login', (req, res) => {
  res.render('debuglogin', { message: 'failed to login' });
});
// Debug login page for testing roles
app.get('/debug-login', (req, res) => {
  res.render('debuglogin', { message: 'failed to login' });
});
app.post('/debug-login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Find user in DB
    const result = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (result.rows.length === 0) {
      return res.render('debuglogin', { message: 'Invalid username or password.' });
    }

    const user = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.render('debuglogin', { message: 'Invalid username or password.' });
    }

    // Store user in session
    req.session.user = { id: user.id, username: user.username, role: user.role };

    // Redirect based on role
    if (user.role === 'ADMIN') return res.redirect('/admin');
    if (user.role === 'PATIENT') return res.redirect('/patient/schedule');
    if (user.role === 'DOCTOR') return res.redirect('/doctor/schedule');
    if (user.role === 'SECRETARY') return res.redirect('/secretary/schedule');
    // Add more role types here if needed
    res.send(`Logged in as ${user.username} with unknown role: ${user.role}`);
  } catch (err) {
    console.error(err);
    res.send('Server error.');
  }
});

app.get('/register', (req, res) => {
  res.render('registerpage', { message: '' });
});
app.post("/register", async (req, res) => {
  const { username, email, full_name, password, role } = req.body;

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Step 1: Insert into users
    const userResult = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, role`,
      [username, email, hashedPassword, role]
    );

    const user = userResult.rows[0];

    // Step 2: Insert into role-specific profile table
    if (role === "PATIENT") {
      await pool.query(
        `INSERT INTO patients (user_id, full_name)
         VALUES ($1, $2)`,
        [user.id, full_name]
      );
    } else if (role === "DOCTOR") {
      await pool.query(
        `INSERT INTO doctors (user_id, full_name)
         VALUES ($1, $2)`,
        [user.id, full_name]
      );
    } else if (role === "SECRETARY") {
      await pool.query(
        `INSERT INTO secretaries (user_id, full_name)
         VALUES ($1, $2)`,
        [user.id, full_name]
      );
    }

    console.log(`✅ New ${role} registered:`, user.username);
    res.send("Registration successful! User saved in database.");
  } catch (err) {
    console.error("❌ Database error:", err.message);
    res.status(500).render("registerpage", { message: "Error saving user" });
  }
});
// In app.js (AFTER session middleware)
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).send("Could not log out.");
    }
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

const userRouter = require('./routes/user');
const adminRouter = require('./routes/admin');
const doctorRouter = require('./routes/doctor');
const patientRouter = require('./routes/patient');
const secretaryRouter = require('./routes/secretary');
app.use('/user', userRouter);
app.use('/admin', adminRouter);
app.use('/doctor', doctorRouter);
app.use('/patient', patientRouter);
app.use('/secretary', secretaryRouter);

app.listen(PORT, '192.168.1.20', () => {
  console.log(`Server running on http://192.168.1.20:${PORT}`);
});

