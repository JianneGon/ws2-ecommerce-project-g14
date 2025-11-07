const express = require('express');
const router = express.Router();
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// =======================
// Home Page (with New Arrivals + Trending)
// =======================
router.get('/', async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCollection = db.collection('products');

    // Fetch up to 20 latest products (New Arrivals)
    const newArrivals = await productsCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    // Fetch up to 20 random products (Trending)
    const trending = await productsCollection
      .aggregate([{ $sample: { size: 20 } }])
      .toArray();

    // Render homepage with both product groups
    res.render('index', {
      title: "Home Page",
      user: req.session ? req.session.user : null,
      newArrivals,
      trending
    });
  } catch (err) {
    console.error("❌ Error loading homepage:", err);
    res.render("error", {
      title: "Homepage Error",
      message: "Something went wrong while loading the homepage.",
      backLink: "/",
      backText: "Back to Home"
    });
  }
});

// =======================
// About Page (GET)
// =======================
router.get('/about', (req, res) => {
  res.render('about', {
    title: "About",
    name: "Commonwealth", // 
    description: "We are an authentic sneaker reseller based in Manila",
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

    // Send email via Resend
    await resend.emails.send({
      from: "onboarding@resend.dev",            // Verified sender domain
      to: process.env.CONTACT_TO_EMAIL,         // Gmail recipient
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
