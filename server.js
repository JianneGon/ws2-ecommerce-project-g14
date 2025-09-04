// server.js
const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');

// Only load .env locally, not on Render
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
const PORT = process.env.PORT || 3000;

// Debug logs
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("MONGO_URI at runtime:", process.env.MONGO_URI);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(expressLayouts); 
app.set('layout', 'layouts/main');

app.use(express.static('public')); // serve CSS & JS files

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set true if HTTPS
}));

// Make session user available to all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Routes
const indexRoute = require('./routes/index');
const usersRoute = require('./routes/users');
app.use('/', indexRoute);
app.use('/users', usersRoute);

// MongoDB Setup
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

// Expose client & dbName to routes
app.locals.client = client;
app.locals.dbName = process.env.DB_NAME || "ecommerceDB";

async function main() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB Atlas");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ MongoDB connection failed", err);
  }
}
main();
