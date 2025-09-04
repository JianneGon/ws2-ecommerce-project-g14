const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('index', {
    message: "Welcome!",
    title: "Home Page"
  });
});

module.exports = router;
