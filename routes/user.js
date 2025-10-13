const express = require('express');
const router = express.Router();
const pool = require('../db'); // adjust path if necessary

router.get('/', (req, res) => {
  res.send('generic user page supposed to show all users in table');
});
router.get('/new', (req, res) => {
  res.send('generic user page supposed to show form to create a new user');
});


module.exports = router