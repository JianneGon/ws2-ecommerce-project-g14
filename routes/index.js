const express = require('express');
const router = express.Router();
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// =============================================
// MIDDLEWARE: Block Admin from Customer Pages
// =============================================
function blockAdmin(req, res, next) {
  if (req.session?.user?.role === "admin") {
    return res.redirect("/users/dashboard");
  }
  next();
}

// =======================
// Home Page (Customer Only)
// =======================
router.get('/', blockAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCollection = db.collection('products');

    const newArrivals = await productsCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    const trending = await productsCollection
      .aggregate([{ $sample: { size: 20 } }])
      .toArray();

    res.render('index', {
      title: "Home Page",
      user: req.session?.user || null,
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
// About Page (Customer Only)
// =======================
router.get('/about', blockAdmin, (req, res) => {
  res.render('about', {
    title: "About Us",
    name: "Commonwealth",
    description: "We are an authentic sneaker reseller based in Manila.",
    user: req.session?.user || null
  });
});

// =======================
// Contact Page (Customer Only)
// =======================
router.get('/contact', blockAdmin, (req, res) => {
  res.render('contact', {
    title: "Contact",
    user: req.session?.user || null
  });
});

// =======================
// Contact Form Submission (Customer Only)
// =======================
router.post('/contact', blockAdmin, async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: process.env.CONTACT_TO_EMAIL,
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

    res.render("success", {
      title: "Message Sent",
      message: "Your message has been sent successfully.",
      backLink: "/contact",
      backText: "Back to Contact"
    });

  } catch (err) {
    console.error("❌ Error sending contact message:", err);

    res.render("error", {
      title: "Contact Error",
      message: "Something went wrong while sending your message.",
      backLink: "/contact",
      backText: "Back to Contact"
    });
  }
});

// =======================
// Terms & Conditions Page (Customer Only)
// =======================
router.get('/terms', blockAdmin, (req, res) => {
  res.render('terms', {
    title: "Terms & Conditions",
    user: req.session?.user || null
  });
});

// =======================
// Privacy Policy Page (Customer Only)
// =======================
router.get('/privacy', blockAdmin, (req, res) => {
  res.render('privacy', {
    title: "Privacy Policy",
    user: req.session?.user || null
  });
});

module.exports = router;
