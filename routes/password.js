// routes/password.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Resend } = require('resend');
const bcrypt = require('bcrypt');
const verifyTurnstile = require('../utils/turnstileVerify'); // ✅ Lesson 16: server-side verify
const saltRounds = 12;

const resend = new Resend(process.env.RESEND_API_KEY);

// =======================
// Forgot Password
// =======================

// Show forgot password form
router.get('/forgot', (req, res) => {
  res.render('forgot-password', { title: 'Forgot Password' });
});

// Handle forgot password submission (send reset link)
router.post('/forgot', async (req, res) => {
  try {
    // ✅ 1) Verify Turnstile first (Lesson 16)
    const tokenTs = req.body['cf-turnstile-response'];
    const tsResult = await verifyTurnstile(tokenTs, req.ip);
    if (!tsResult.success) {
      return res.render('error', {
        title: 'Verification Failed',
        message: 'Human verification failed. Please try again.',
        backLink: '/password/forgot',
        backText: 'Back',
      });
    }

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCollection = db.collection('users');

    const email = (req.body.email || '').trim().toLowerCase();
    const user = await usersCollection.findOne({ email });

    // We always show a generic success message to avoid email enumeration.
    // If user exists, generate token and send an actual email.
    if (user) {
      const resetToken = uuidv4();
      const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await usersCollection.updateOne(
        { _id: user._id },
        { $set: { resetToken, resetExpiry, updatedAt: new Date() } }
      );

      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const resetUrl = `${baseUrl}/password/reset/${resetToken}`;

      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL,
          to: user.email,
          subject: 'Password Reset Request',
          html: `
            <h2>Password Reset</h2>
            <p>Click the link below to reset your password (valid for 1 hour):</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
          `,
        });
      } catch (mailErr) {
        // Log but don't reveal to user to prevent leakage
        console.error('Resend mail error:', mailErr);
      }
    }

    return res.render('success', {
      title: 'Email Sent',
      message:
        'If an account with that email exists, a reset link has been sent.',
      backLink: '/users/login',
      backText: 'Back to Login',
    });
  } catch (err) {
    console.error('Error in password reset (forgot):', err);
    return res.render('error', {
      title: 'Reset Error',
      message: 'Something went wrong while requesting a reset link.',
      backLink: '/password/forgot',
      backText: 'Back',
    });
  }
});

// =======================
// Reset Password (set new)
// =======================

// Show reset password form
router.get('/reset/:token', (req, res) => {
  res.render('reset-password', { title: 'Reset Password', token: req.params.token });
});

// Handle reset password submission
router.post('/reset/:token', async (req, res) => {
  try {
    // ✅ Verify Turnstile again (you added the widget on this page)
    const tokenTs = req.body['cf-turnstile-response'];
    const tsResult = await verifyTurnstile(tokenTs, req.ip);
    if (!tsResult.success) {
      return res.render('error', {
        title: 'Verification Failed',
        message: 'Human verification failed. Please try again.',
        backLink: `/password/reset/${req.params.token}`,
        backText: 'Back',
      });
    }

    const { password, confirm } = req.body;

    // Minimal server-side checks (extra safety)
    if (!password || password !== confirm) {
      return res.render('error', {
        title: 'Reset Error',
        message: 'Passwords do not match.',
        backLink: `/password/reset/${req.params.token}`,
        backText: 'Back',
      });
    }
    if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password) ||
      !/[!@#$%^&*(),.?":{}|<>]/.test(password)
    ) {
      return res.render('error', {
        title: 'Reset Error',
        message: 'Password does not meet the required complexity.',
        backLink: `/password/reset/${req.params.token}`,
        backText: 'Back',
      });
    }

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCollection = db.collection('users');

    // Validate token + expiry
    const user = await usersCollection.findOne({
      resetToken: req.params.token,
      resetExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.render('error', {
        title: 'Reset Error',
        message: 'Reset link is invalid or has expired.',
        backLink: '/password/forgot',
        backText: 'Back',
      });
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: { passwordHash: hashedPassword, updatedAt: new Date() },
        $unset: { resetToken: '', resetExpiry: '' },
      }
    );

    return res.render('success', {
      title: 'Password Updated',
      message: 'Your password has been reset successfully.',
      backLink: '/users/login',
      backText: 'Back to Login',
    });
  } catch (err) {
    console.error('Error resetting password:', err);
    return res.render('error', {
      title: 'Reset Error',
      message: 'Something went wrong while resetting your password.',
      backLink: '/password/forgot',
      backText: 'Back',
    });
  }
});

module.exports = router;
