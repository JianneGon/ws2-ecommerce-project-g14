// =======================
// Import Dependencies
// =======================
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const expressLayouts = require('express-ejs-layouts');
const { MongoClient } = require('mongodb');
const path = require('path');

// Only load .env locally
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
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

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
  rolling: true,
  cookie: {
    secure: false,          // true only if HTTPS
    maxAge: 15 * 60 * 1000  // 15 minutes
  }
}));

// Make session user available to all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// =======================
// Debug Info
// =======================
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("MONGO_URI at runtime:", process.env.MONGO_URI);

// =======================
// MongoDB Setup
// =======================
const client = new MongoClient(process.env.MONGO_URI);
app.locals.client = client;
app.locals.dbName = process.env.DB_NAME || "ecommerceDB";

// =======================
// Routes
// =======================
const usersRoute = require('./routes/users');
const indexRoute = require('./routes/index');
const productsRoute = require('./routes/products');
const passwordRoute = require('./routes/password');
const storesRoute = require('./routes/stores');
const infoRouter = require('./routes/info');

// Order matters: more specific routes first
app.use('/stores', storesRoute);
app.use('/users', usersRoute);
app.use('/products', productsRoute);
app.use('/password', passwordRoute);
app.use('/', infoRouter);
app.use('/', indexRoute);

// =======================
// 404 Handler
// =======================
app.use((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(404).render('404', { title: "Page Not Found", layout: false });
});

// =======================
// 500 Handler
// =======================
app.use((err, req, res, next) => {
  console.error("Server Error:", err.stack);
  if (res.headersSent) return next(err);
  res.status(500).render('500', { title: "Server Error", layout: false, req });
});

// =======================
// Start Server
// =======================
async function main() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB Atlas");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
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
