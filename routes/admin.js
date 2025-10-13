const express = require('express');
const router = express.Router();
const pool = require('../db'); // adjust path if necessary

router.get('/', (req, res) => {
  res.send('admin dashboard page');
});
router.get('/profile', (req, res) => {
  res.send('admin profile page');
});


module.exports = router