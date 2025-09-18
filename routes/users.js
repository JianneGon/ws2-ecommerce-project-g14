const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const { ObjectId } = require("mongodb");
const { isAuthenticated, isAdmin } = require("../middlewares/auth");
const saltRounds = 12;

// =======================
// Registration
// =======================
router.get("/register", (req, res) => {
  res.render("register", { title: "Register" });
});

router.post("/register", async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCollection = db.collection("users");

    const existingUser = await usersCollection.findOne({ email: req.body.email });
    if (existingUser) {
      return res.render("error", {
        title: "Registration Error",
        message: "User already exists with this email.",
        backLink: "/users/register",
        backText: "Back to Register",
      });
    }

    const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);
    const currentDate = new Date();
    const token = uuidv4();

    const newUser = {
      userId: uuidv4(),
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      passwordHash: hashedPassword,
      role: "customer",
      accountStatus: "active",
      isEmailVerified: false,
      verificationToken: token,
      tokenExpiry: new Date(Date.now() + 3600000), // 1 hour expiry
      createdAt: currentDate,
      updatedAt: currentDate,
    };

    await usersCollection.insertOne(newUser);

    const baseUrl = process.env.BASE_URL || "http://localhost:3000";
    const verificationUrl = `${baseUrl}/users/verify/${token}`;

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: newUser.email,
      subject: "Verify your account",
      html: `
        <h2>Welcome, ${newUser.firstName}!</h2>
        <p>Thank you for registering. Please verify your email by clicking the link below:</p>
        <a href="${verificationUrl}">${verificationUrl}</a>
      `,
    });

    res.render("success", {
      title: "Registration Successful",
      message: `User <strong>${newUser.firstName} ${newUser.lastName}</strong> has been registered.<br>
                <strong>User ID:</strong> ${newUser.userId}<br><br>
                A verification email has been sent to <strong>${newUser.email}</strong>. Please check your inbox.`,
      backLink: "/users/login",
      backText: "Back to Login",
    });
  } catch (err) {
    console.error("Error saving user:", err);
    res.render("error", {
      title: "Registration Error",
      message: "Something went wrong during registration.",
      backLink: "/users/register",
      backText: "Back to Register",
    });
  }
});

// =======================
// Email Verification
// =======================
router.get("/verify/:token", async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCollection = db.collection("users");

    const user = await usersCollection.findOne({ verificationToken: req.params.token });
    if (!user) {
      return res.render("error", {
        title: "Verification Error",
        message: "Invalid or expired verification link.",
        backLink: "/users/register",
        backText: "Back to Register",
      });
    }

    if (user.tokenExpiry < new Date()) {
      return res.render("error", {
        title: "Verification Error",
        message: "Verification link has expired. Please register again.",
        backLink: "/users/register",
        backText: "Back to Register",
      });
    }

    await usersCollection.updateOne(
      { verificationToken: req.params.token },
      { $set: { isEmailVerified: true }, $unset: { verificationToken: "", tokenExpiry: "" } }
    );

    res.render("success", {
      title: "Email Verified",
      message: "Your account has been verified successfully.",
      backLink: "/users/login",
      backText: "Proceed to Login",
    });
  } catch (err) {
    console.error("Error verifying user:", err);
    res.render("error", {
      title: "Verification Error",
      message: "Something went wrong during verification.",
      backLink: "/users/register",
      backText: "Back to Register",
    });
  }
});

// =======================
// Login
// =======================
router.get("/login", (req, res) => {
  res.render("login", { title: "Login" });
});

router.post("/login", async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCollection = db.collection("users");

    const user = await usersCollection.findOne({ email: req.body.email });
    if (!user) {
      return res.render("error", { 
        title: "Login Error", 
        message: "User not found.",
        backLink: "/users/login",
        backText: "Back to Login"
      });
    }
    if (user.accountStatus !== "active") {
      return res.render("error", { 
        title: "Login Error", 
        message: "Account is not active.",
        backLink: "/users/login",
        backText: "Back to Login"
      });
    }
    if (!user.isEmailVerified) {
      return res.render("error", { 
        title: "Login Error", 
        message: "Please verify your email before logging in.",
        backLink: "/users/login",
        backText: "Back to Login"
      });
    }

    const isPasswordValid = await bcrypt.compare(req.body.password, user.passwordHash || "");
    if (!isPasswordValid) {
      return res.render("error", { 
        title: "Login Error", 
        message: "Invalid password.",
        backLink: "/users/login",
        backText: "Back to Login"
      });
    }

    req.session.user = {
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    };

    res.redirect("/users/dashboard");
  } catch (err) {
    console.error("Error during login:", err);
    res.render("error", {
      title: "Login Error",
      message: "Something went wrong during login.",
      backLink: "/users/login",
      backText: "Back to Login"
    });
  }
});

// =======================
// Dashboard + Logout
// =======================
router.get("/dashboard", isAuthenticated, (req, res) => {
  res.render("dashboard", { title: "User Dashboard", user: req.session.user });
});

router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.render("error", {
        title: "Logout Error",
        message: "Something went wrong during logout.",
        backLink: "/users/dashboard",
        backText: "Back to Dashboard"
      });
    }
    res.redirect("/users/login");
  });
});

// =======================
// Admin Dashboard
// =======================
router.get("/admin", isAdmin, async (req, res) => {
  const db = req.app.locals.client.db(req.app.locals.dbName);
  const users = await db.collection("users").find().toArray();
  res.render("admin", { title: "Admin Dashboard", users, currentUser: req.session.user });
});

// =======================
// User List (Admin Only)
// =======================
router.get("/list", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCollection = db.collection("users");

    const users = await usersCollection.find().toArray();
    res.render("users-list", { title: "Registered Users", users });
  } catch (err) {
    res.render("error", { 
      title: "User List Error", 
      message: "Something went wrong while fetching users.",
      backLink: "/users/dashboard",
      backText: "Back to Dashboard"
    });
  }
});

// =======================
// Helper to find user
// =======================
async function findUserById(db, id) {
  const usersCollection = db.collection("users");
  return await usersCollection.findOne({
    $or: [{ userId: id }, { _id: ObjectId.isValid(id) ? new ObjectId(id) : null }],
  });
}

// =======================
// Edit User (admins can edit anyone, customers can edit self)
// =======================
router.get("/edit/:id", isAuthenticated, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const user = await findUserById(db, req.params.id);

    if (!user) {
      return res.render("error", { 
        title: "Edit User Error", 
        message: "User not found.",
        backLink: "/users/dashboard",
        backText: "Back to Dashboard"
      });
    }

    // allow admin OR same user
    if (req.session.user.role !== "admin" && req.session.user.userId !== user.userId) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You can only edit your own profile.",
        backLink: "/users/dashboard",
        backText: "Back to Dashboard",
      });
    }

    res.render("edit-user", { title: "Edit User", user });
  } catch (err) {
    res.render("error", { 
      title: "Edit User Error", 
      message: "Something went wrong.",
      backLink: "/users/dashboard",
      backText: "Back to Dashboard"
    });
  }
});

router.post("/edit/:id", isAuthenticated, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const user = await findUserById(db, req.params.id);

    if (!user) {
      return res.render("error", { 
        title: "Update Error", 
        message: "User not found.",
        backLink: "/users/dashboard",
        backText: "Back to Dashboard"
      });
    }

    // allow admin OR same user
    if (req.session.user.role !== "admin" && req.session.user.userId !== user.userId) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You can only edit your own profile.",
        backLink: "/users/dashboard",
        backText: "Back to Dashboard",
      });
    }

    await db.collection("users").updateOne(
      { _id: user._id },
      {
        $set: {
          firstName: req.body.firstName,
          lastName: req.body.lastName,
          email: req.body.email,
          updatedAt: new Date(),
        },
      }
    );

    // always update session if editing own account (admin or customer)
    if (req.session.user.userId === user.userId) {
      req.session.user.firstName = req.body.firstName;
      req.session.user.lastName = req.body.lastName;
      req.session.user.email = req.body.email;
    }

    // redirect admin to user list, customer back to dashboard
    if (req.session.user.role === "admin") {
      res.redirect("/users/list");
    } else {
      res.redirect("/users/dashboard");
    }
  } catch (err) {
    res.render("error", { 
      title: "Update Error", 
      message: "Something went wrong while updating user.",
      backLink: "/users/dashboard",
      backText: "Back to Dashboard"
    });
  }
});

// =======================
// Delete User (Admin Only)
// =======================
router.post("/delete/:id", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const user = await findUserById(db, req.params.id);

    if (!user) {
      return res.render("error", { 
        title: "Delete Error", 
        message: "User not found.",
        backLink: "/users/list",
        backText: "Back to User List"
      });
    }

    await db.collection("users").deleteOne({ _id: user._id });
    res.redirect("/users/list");
  } catch (err) {
    res.render("error", { 
      title: "Delete Error", 
      message: "Something went wrong while deleting user.",
      backLink: "/users/list",
      backText: "Back to User List"
    });
  }
});

module.exports = router;
