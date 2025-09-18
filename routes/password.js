const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Resend } = require('resend');
const bcrypt = require('bcrypt');
const saltRounds = 12;

const resend = new Resend(process.env.RESEND_API_KEY);

// =======================
// Forgot Password 
// =======================

// Show forgot password form
router.get('/forgot', (req, res) => {
  res.render('forgot-password', { title: "Forgot Password" });
});

// Handle forgot password submission
router.post('/forgot', async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ email: req.body.email });
    if (!user) return res.send("No account found with this email.");

    // Generate token & expiry (1 hour)
    const token = uuidv4();
    const expiry = new Date(Date.now() + 3600000);

    await usersCollection.updateOne(
      { email: user.email },
      { $set: { resetToken: token, resetExpiry: expiry } }
    );

    // Build reset URL
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/password/reset/${token}`;

    // Send email
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <h2>Password Reset</h2>
        <p>Click below to reset your password:</p>
        <a href="${resetUrl}">${resetUrl}</a>
      `
    });

    res.send("If an account with that email exists, a reset link has been sent.");
  } catch (err) {
    console.error("Error in password reset:", err);
    res.send("Something went wrong.");
  }
});

// =======================
// Reset Password (Step 4-5)
// =======================

// Show reset password form
router.get('/reset/:token', (req, res) => {
  res.render('reset-password', { title: "Reset Password", token: req.params.token });
});

// Handle reset password submission
router.post('/reset/:token', async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCollection = db.collection('users');

    // Validate token + expiry
    const user = await usersCollection.findOne({
      resetToken: req.params.token,
      resetExpiry: { $gt: new Date() }
    });

    if (!user) return res.send("Reset link is invalid or has expired.");

    // Check password match
    if (req.body.password !== req.body.confirm) {
      return res.send("Passwords do not match.");
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);

    // Update password and clear reset token
    await usersCollection.updateOne(
      { email: user.email },
      {
        $set: { passwordHash: hashedPassword, updatedAt: new Date() },
        $unset: { resetToken: "", resetExpiry: "" }
      }
    );

    res.send("✅ Password has been reset. You can now log in with your new password.");
  } catch (err) {
    console.error("Error resetting password:", err);
    res.send("Something went wrong.");
  }
});

module.exports = router;
