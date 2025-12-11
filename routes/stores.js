// routes/stores.js
const express = require('express');
const router = express.Router();

// =======================================
// MIDDLEWARE: Block Admin From Store Pages
// =======================================
function blockAdmin(req, res, next) {
  if (req.session?.user?.role === "admin") {
    return res.redirect("/users/dashboard");
  }
  next();
}

// ===============================
// Main grid (with store data)
// ===============================
router.get('/', blockAdmin, (req, res) => {
  const stores = {
    philippines: [
      {
        name: "Baguio",
        image: "/images/stores/baguio.jpg",
        url: "/stores/baguio"
      },
      {
        name: "Tagaytay",
        image: "/images/stores/tagaytay.jpg",
        url: "/stores/tagaytay"
      },
      {
        name: "BGC",
        image: "/images/stores/bgc.jpg",
        url: "/stores/bgc"
      }
    ],
    japan: [
      {
        name: "Shibuya, Tokyo",
        image: "/images/stores/tokyo.jpg",
        url: "/stores/tokyo"
      },
      {
        name: "Osaka",
        image: "/images/stores/osaka.jpg",
        url: "/stores/osaka"
      }
    ]
  };

  res.render('pages/stores', { title: "Store Locations", stores });
});

/* ===============================
   Individual Store Routes
=============================== */

// Baguio
router.get('/baguio', blockAdmin, (req, res) => {
  res.render('pages/store-details', {
    title: "Baguio Branch",
    store: {
      name: "Commonwealth Baguio",
      location: "Upper Session Road, Baguio City",
      image: "/images/stores/baguio.jpg",
      description:
        "A cool mountain outpost inspired by pine textures and clean concrete lines. Curated layers and trail-friendly pieces set the tone—calm, breathable, and made for the highlands.",
      gallery: [
        "/images/stores/baguio-1.jpg",
        "/images/stores/baguio-2.jpg"
      ]
    }
  });
});

// Tagaytay
router.get('/tagaytay', blockAdmin, (req, res) => {
  res.render('pages/store-details', {
    title: "Tagaytay Branch",
    store: {
      name: "Commonwealth Tagaytay",
      location: "Twin Lakes, Tagaytay–Nasugbu Highway, Tagaytay City",
      image: "/images/stores/tagaytay.jpg",
      description:
        "Open, airy, and drenched in natural light—this space blends garden tones with minimalist shelving. Weekend café energy meets refined streetwear selections.",
      gallery: [
        "/images/stores/tagaytay-1.jpg",
        "/images/stores/tagaytay-2.jpg"
      ]
    }
  });
});

// BGC
router.get('/bgc', blockAdmin, (req, res) => {
  res.render('pages/store-details', {
    title: "BGC Branch",
    store: {
      name: "Commonwealth BGC",
      location: "5th Avenue, Bonifacio Global City, Taguig",
      image: "/images/stores/bgc.jpg",
      description:
        "Sleek glass lines, industrial accents, and a focused showcase for limited releases. A modern gallery for everyday essentials and statement pairs.",
      gallery: [
        "/images/stores/bgc-1.jpg",
        "/images/stores/bgc-2.jpg"
      ]
    }
  });
});

// Tokyo (Shibuya)
router.get('/tokyo', blockAdmin, (req, res) => {
  res.render('pages/store-details', {
    title: "Shibuya, Tokyo Branch",
    store: {
      name: "Commonwealth Tokyo",
      location: "Shibuya District, Tokyo, Japan",
      image: "/images/stores/tokyo.jpg",
      description:
        "Compact, efficient, and detail-driven—neon cues meet subdued materials. A tight edit of collaborations and Japanese favorites lives here.",
      gallery: [
        "/images/stores/tokyo-1.jpg",
        "/images/stores/tokyo-2.jpg"
      ]
    }
  });
});

// Osaka
router.get('/osaka', blockAdmin, (req, res) => {
  res.render('pages/store-details', {
    title: "Osaka Branch",
    store: {
      name: "Commonwealth Osaka",
      location: "Dotonbori, Chuo Ward, Osaka, Japan",
      image: "/images/stores/osaka.jpg",
      description:
        "Playful energy and bold signage balanced by calm materials. A mix of heritage silhouettes and new-wave tech pieces anchors the space.",
      gallery: [
        "/images/stores/osaka-1.jpg",
        "/images/stores/osaka-2.jpg"
      ]
    }
  });
});

module.exports = router;
