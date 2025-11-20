// =======================
// USERS ROUTES (FULLY FIXED & OPTIMIZED)
// =======================

const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const express = require("express");
const router = express.Router();

const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const { ObjectId } = require("mongodb");

const { isAuthenticated, isAdmin } = require("../middlewares/auth");
const verifyTurnstile = require("../utils/turnstileVerify");

const saltRounds = 12;

// ======================================================
// HELPER — FIND USER BY EITHER userId OR _id
// ======================================================
async function findUserById(db, id) {
  const usersCollection = db.collection("users");
  const oid = ObjectId.isValid(id) ? new ObjectId(id) : null;

  return await usersCollection.findOne({
    $or: [
      { userId: String(id) },
      ...(oid ? [{ _id: oid }] : []),
    ],
  });
}

// ======================================================
// REGISTER — SHOW PAGE
// ======================================================
router.get("/register", (req, res) => {
  res.render("register", { title: "Register" });
});

// ======================================================
// REGISTER — SUBMIT
// ======================================================
router.post("/register", async (req, res) => {
  try {
    // 💠 CAPTCHA
    const token = req.body["cf-turnstile-response"];
    const result = await verifyTurnstile(token, req.ip);

    if (!result.success) {
      return res.render("error", {
        title: "Verification Failed",
        message: "Human verification failed.",
        backLink: "/users/register",
        backText: "Try Again",
      });
    }

    const {
      firstName,
      lastName,
      email,
      password,
      confirmPassword
    } = req.body;

    // 💠 Password confirm
    if (password !== confirmPassword) {
      return res.render("error", {
        title: "Registration Error",
        message: "Passwords do not match.",
        backLink: "/users/register",
        backText: "Try Again"
      });
    }

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCol = db.collection("users");

    // 💠 Check duplicate email
    const exist = await usersCol.findOne({ email });
    if (exist) {
      return res.render("error", {
        title: "Registration Error",
        message: "Email already in use.",
        backLink: "/users/register",
        backText: "Try Again",
      });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const verificationToken = uuidv4();

    const newUser = {
      userId: uuidv4(),
      firstName,
      lastName,
      email,
      passwordHash: hashedPassword,
      role: "customer",
      accountStatus: "active",
      isEmailVerified: false,
      verificationToken,
      tokenExpiry: new Date(Date.now() + 3600000),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await usersCol.insertOne(newUser);

    // 💠 SEND EMAIL
    const baseUrl = process.env.BASE_URL || "http://localhost:3000";
    const verifyUrl = `${baseUrl}/users/verify/${verificationToken}`;

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: email,
      subject: "Verify your account",
      html: `
        <h2>Welcome, ${firstName}!</h2>
        <p>Click below to verify your email:</p>
        <a href="${verifyUrl}">${verifyUrl}</a>
      `,
    });

    res.render("success", {
      title: "Registered Successfully",
      message: `A verification link has been sent to <strong>${email}</strong>.`,
      backLink: "/users/login",
      backText: "Go to Login",
    });

  } catch (err) {
    console.error("Register error:", err);
    res.render("error", {
      title: "Registration Error",
      message: "Something went wrong.",
      backLink: "/users/register",
      backText: "Try Again",
    });
  }
});

// ======================================================
// EMAIL VERIFICATION
// ======================================================
router.get("/verify/:token", async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCol = db.collection("users");

    const user = await usersCol.findOne({ verificationToken: req.params.token });
    if (!user) {
      return res.render("error", {
        title: "Invalid Link",
        message: "This verification link is invalid.",
        backLink: "/users/login",
        backText: "Go to Login"
      });
    }

    if (user.tokenExpiry < new Date()) {
      return res.render("error", {
        title: "Expired Link",
        message: "This verification link has expired.",
        backLink: "/users/login",
        backText: "Go to Login",
      });
    }

    await usersCol.updateOne(
      { verificationToken: req.params.token },
      {
        $set: { isEmailVerified: true },
        $unset: { verificationToken: "", tokenExpiry: "" }
      }
    );

    res.render("success", {
      title: "Email Verified",
      message: "Your email has been successfully verified.",
      backLink: "/users/login",
      backText: "Login Now",
    });

  } catch (err) {
    console.error("Verify error:", err);
    res.render("error", {
      title: "Verification Error",
      message: "Something went wrong.",
      backLink: "/users/login",
      backText: "Back to Login"
    });
  }
});

// ======================================================
// LOGIN
// ======================================================
router.get("/login", (req, res) => {
  let message = null;
  if (req.query.message === "logout") message = "You have been logged out.";
  if (req.query.message === "timeout") message = "Your session expired.";

  res.render("login", { title: "Login", message });
});

router.post("/login", async (req, res) => {
  try {
    // 💠 CAPTCHA
    const token = req.body["cf-turnstile-response"];
    const result = await verifyTurnstile(token, req.ip);

    if (!result.success) {
      return res.render("error", { 
        title: "Verification Failed",
        message: "Human verification failed.",
        backLink: "/users/login",
        backText: "Try Again"
      });
    }

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCol = db.collection("users");

    const user = await usersCol.findOne({ email: req.body.email });

    if (!user)
      return res.render("error", {
        title: "Login Error",
        message: "User not found.",
        backLink: "/users/login",
        backText: "Try Again",
      });

    if (!user.isEmailVerified)
      return res.render("error", {
        title: "Login Error",
        message: "Please verify your email before logging in.",
        backLink: "/users/login",
        backText: "Try Again",
      });

    if (user.accountStatus !== "active")
      return res.render("error", {
        title: "Login Error",
        message: "Account is inactive.",
        backLink: "/users/login",
        backText: "Try Again",
      });

    const valid = await bcrypt.compare(req.body.password, user.passwordHash);
    if (!valid)
      return res.render("error", {
        title: "Login Error",
        message: "Invalid password.",
        backLink: "/users/login",
        backText: "Try Again",
      });

    req.session.user = {
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified
    };

    res.redirect("/users/dashboard");

  } catch (err) {
    console.error("Login error:", err);
    res.render("error", {
      title: "Login Error",
      message: "Something went wrong.",
      backLink: "/users/login",
      backText: "Try Again",
    });
  }
});

// ======================================================
// DASHBOARD
// ======================================================
router.get("/dashboard", isAuthenticated, (req, res) => {
  res.render("dashboard", {
    title: "User Dashboard",
    user: req.session.user
  });
});

// ======================================================
// LOGOUT
// ======================================================
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/users/login?message=logout");
  });
});

// ======================================================
// ADMIN — USER LIST
// ======================================================
router.get("/list", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCol = db.collection("users");

    const q = (req.query.q || "").trim();
    const role = (req.query.role || "all").toLowerCase();

    const filter = {};

    if (q) {
      filter.$or = [
        { email: { $regex: q, $options: "i" } },
        { firstName: { $regex: q, $options: "i" } },
        { lastName: { $regex: q, $options: "i" } },
        { role: { $regex: q, $options: "i" } },
      ];
    }

    if (role !== "all") filter.role = role;

    const users = await usersCol.find(filter).project({
      passwordHash: 0
    }).sort({ createdAt: -1 }).toArray();

    res.render("users-list", {
      title: "User List",
      users,
      q,
      role,
      total: users.length
    });

  } catch (err) {
    console.error("List error:", err);
    res.render("error", {
      title: "User List Error",
      message: "Something went wrong.",
      backLink: "/users/dashboard",
      backText: "Back to Dashboard"
    });
  }
});

// ======================================================
// EXPORT ROUTER
// ======================================================
module.exports = router;
