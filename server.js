// =======================
// Import Dependencies
// =======================
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const path = require('path');

// Load .env except in production (Render uses its own env)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// =======================
// Create Express App
// =======================
const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// Middleware
// =======================

// Body parsers
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());     // required for checkout JSON

// Serve static files (CSS, images, uploads)
app.use('/public', express.static(path.join(__dirname, 'public')));

// EJS Layout Engine
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('layout', 'layouts/main');

// =======================
// Session Setup
// =======================
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  rolling: true, // extend session on activity
  cookie: {
    secure: false,                // set true only with HTTPS
    maxAge: 15 * 60 * 1000        // 15 minutes
  }
}));

// Make session user globally available in all EJS views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Debug (optional)
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("MONGO_URI:", process.env.MONGO_URI);

// =======================
// MongoDB Setup
// =======================
const client = new MongoClient(process.env.MONGO_URI);
app.locals.client = client;
app.locals.dbName = process.env.DB_NAME || "ecommerceDB";

// =======================
// Import Route Files
// =======================
const usersRoute = require('./routes/users');
const indexRoute = require('./routes/index');
const productsRoute = require('./routes/products');
const passwordRoute = require('./routes/password');
const storesRoute = require('./routes/stores');
const infoRoute = require('./routes/info');

const cartRoute = require('./routes/cart');
const ordersRoute = require('./routes/orders');
const adminOrdersRoute = require('./routes/adminOrders');

// =======================
// Mount Routes (ORDER MATTERS)
// =======================

// Specific routes FIRST
app.use('/stores', storesRoute);
app.use('/users', usersRoute);
app.use('/products', productsRoute);
app.use('/password', passwordRoute);
app.use('/cart', cartRoute);
app.use('/orders', ordersRoute);
app.use('/admin', adminOrdersRoute);

// General pages LAST
app.use('/', indexRoute);      // homepage, shop, etc.
app.use('/', infoRoute);       // about, contact, terms, privacy

// =======================
// Serve sitemap.xml
// =======================
app.get('/sitemap.xml', (req, res) => {
  res.sendFile(path.join(__dirname, 'sitemap.xml'));
});

// =======================
// 404 Handler
// =======================
app.use((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(404).render('404', {
    title: "Page Not Found",
    layout: false
  });
});

// =======================
// 500 Handler
// =======================
app.use((err, req, res, next) => {
  console.error("Server Error:", err.stack);

  if (res.headersSent) return next(err);

  res.status(500).render('500', {
    title: "Server Error",
    layout: false,
    req
  });
});

// =======================
// Start Server
// =======================
async function main() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB Atlas");

    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
      console.log("Closing MongoDB connection...");
      await client.close();
      process.exit(0);
    });

  } catch (err) {
    console.error("❌ MongoDB connection failed", err);
  }
}

main();
