const express = require('express');
const router = express.Router();
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// =======================
// Home Page
// =======================
router.get('/', (req, res) => {
  res.render('index', {
    message: "Welcome!",
    title: "Home Page",
    user: req.session ? req.session.user : null
  });
});

// =======================
// Contact Page (GET)
// =======================
router.get('/contact', (req, res) => {
  res.render('contact', {
    title: "Contact",
    user: req.session ? req.session.user : null
  });
});

// =======================
// Contact Form Submission (POST)
// =======================
router.post('/contact', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    // send email via Resend
    await resend.emails.send({
      from: "onboarding@resend.dev",            // always use this or a verified domain
      to: process.env.CONTACT_TO_EMAIL,         // Gmail mo as recipient
      subject: `New Contact Message from ${name}`,
      html: `
        <h2>Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `
    });

    // Success page
    res.render("success", {
      title: "Message Sent",
      message: "Your message has been sent successfully. We'll get back to you shortly.",
      backLink: "/contact",
      backText: "Back to Contact"
    });

  } catch (err) {
    console.error("❌ Error sending contact message:", err);

    // Error page
    res.render("error", {
      title: "Contact Error",
      message: "Something went wrong while sending your message. Please try again later.",
      backLink: "/contact",
      backText: "Back to Contact"
    });
  }
});

// =======================
// Terms & Conditions Page
// =======================
router.get('/terms', (req, res) => {
  res.render('terms', {
    title: "Terms & Conditions",
    user: req.session ? req.session.user : null
  });
});

// =======================
// Privacy Policy Page
// =======================
router.get('/privacy', (req, res) => {
  res.render('privacy', {
    title: "Privacy Policy",
    user: req.session ? req.session.user : null
  });
});

module.exports = router;
