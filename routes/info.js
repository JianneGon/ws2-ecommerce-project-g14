const express = require("express");
const router = express.Router();

/* ===========================
   STATIC INFO PAGES
=========================== */

// ABOUT US
router.get("/about", (req, res) => {
  res.render("pages/about", {
    title: "About Us",
    user: req.session.user,
  });
});

// CONTACT
router.get("/contact", (req, res) => {
  res.render("contact", {
    title: "Contact",
    user: req.session.user,
  });
});

// STORE LOCATIONS
router.get("/stores", (req, res) => {
  res.render("pages/stores", {
    title: "Store Locations",
    user: req.session.user,
  });
});

// TERMS & CONDITIONS
router.get("/terms", (req, res) => {
  res.render("terms", {
    title: "Terms & Conditions",
    user: req.session.user,
  });
});

// PRIVACY POLICY
router.get("/privacy", (req, res) => {
  res.render("privacy", {
    title: "Privacy Policy",
    user: req.session.user,
  });
});

// FREQUENTLY ASKED QUESTIONS
router.get("/faq", (req, res) => {
  res.render("pages/faq", {
    title: "FAQs",
    user: req.session.user,
  });
});

// SHIPPING INFO
router.get("/shipping", (req, res) => {
  res.render("pages/shipping", {
    title: "Shipping Information",
    user: req.session.user,
  });
});

// RETURNS & EXCHANGES
router.get("/returns", (req, res) => {
  res.render("pages/returns", {
    title: "Returns & Exchanges",
    user: req.session.user,
  });
});
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

// POST: Contact form submission
router.post("/contact", async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    const adminEmail = process.env.CONTACT_TO_EMAIL;

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: adminEmail,
      subject: `New Contact Message from ${name}`,
      html: `
        <h2>Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
        <p><strong>Message:</strong> ${message}</p>
      `,
    });

    res.redirect("/contact?success=1"); // shows success message
  } catch (err) {
    console.error("❌ Contact Send Error:", err);
    res.redirect("/contact?error=1");
  }
});

module.exports = router;
