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

module.exports = router;
