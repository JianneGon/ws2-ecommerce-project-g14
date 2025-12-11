// routes/users.js
// =======================
// USERS ROUTES (HYBRID VERSION: ADMIN + USER SELF-EDIT)
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
// HELPER — FIND USER BY userId OR _id
// ======================================================
async function findUserById(db, id) {
  const usersCollection = db.collection("users");
  const oid = ObjectId.isValid(id) ? new ObjectId(id) : null;

  return await usersCollection.findOne({
    $or: [{ userId: String(id) }, ...(oid ? [{ _id: oid }] : [])],
  });
}

// Small helper to escape regex for login email search
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ======================================================
// REGISTER PAGE
// ======================================================
router.get("/register", (req, res) => {
  res.render("register", { title: "Register" });
});

// ======================================================
// REGISTER SUBMIT
// ======================================================
router.post("/register", async (req, res) => {
  try {
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

    const { firstName, lastName, email: rawEmail, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.render("error", {
        title: "Registration Error",
        message: "Passwords do not match.",
        backLink: "/users/register",
        backText: "Try Again",
      });
    }

    const email = (rawEmail || "").trim();
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCol = db.collection("users");

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
      cart: { items: [], totalQty: 0, totalAmount: 0 },
    };

    await usersCol.insertOne(newUser);

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
// VERIFY EMAIL
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
        backText: "Go to Login",
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
        $unset: { verificationToken: "", tokenExpiry: "" },
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
      backText: "Back to Login",
    });
  }
});

// ======================================================
// LOGIN PAGE
// ======================================================
router.get("/login", (req, res) => {
  let message = null;
  if (req.query.message === "logout") message = "You have been logged out.";
  if (req.query.message === "timeout") message = "Your session expired.";

  res.render("login", { title: "Login", message });
});

// ======================================================
// LOGIN SUBMIT (WITH CART RESTORE)
// ======================================================
router.post("/login", async (req, res) => {
  try {
    const token = req.body["cf-turnstile-response"];
    const result = await verifyTurnstile(token, req.ip);

    if (!result.success) {
      return res.render("error", {
        title: "Verification Failed",
        message: "Human verification failed.",
        backLink: "/users/login",
        backText: "Try Again",
      });
    }

    const rawEmail = (req.body.email || "").trim();

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCol = db.collection("users");

    const user = await usersCol.findOne({
      email: { $regex: `^${escapeRegex(rawEmail)}$`, $options: "i" },
    });

    if (!user) {
      return res.render("error", {
        title: "Login Error",
        message: "User not found.",
        backLink: "/users/login",
        backText: "Try Again",
      });
    }

    if (!user.isEmailVerified) {
      return res.render("error", {
        title: "Login Error",
        message: "Please verify your email before logging in.",
        backLink: "/users/login",
        backText: "Try Again",
      });
    }

    if (user.accountStatus !== "active") {
      return res.render("error", {
        title: "Login Error",
        message: "Account is inactive or banned.",
        backLink: "/users/login",
        backText: "Try Again",
      });
    }

    const valid = await bcrypt.compare(req.body.password, user.passwordHash);
    if (!valid) {
      return res.render("error", {
        title: "Login Error",
        message: "Invalid password.",
        backLink: "/users/login",
        backText: "Try Again",
      });
    }

    // ---------------------------
    // SET USER SESSION
    // ---------------------------
    req.session.user = {
      userId: user.userId,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      accountStatus: user.accountStatus,
      address: user.address || "",
      contactNumber: user.contactNumber || ""
    };

    // ---------------------------
    // RESTORE CART FROM DATABASE
    // ---------------------------
    req.session.cart = user.cart
      ? user.cart
      : { items: [], totalQty: 0, totalAmount: 0 };

    // ---------------------------
    // REDIRECT
    // ---------------------------
    if (user.role === "admin") return res.redirect("/admin/dashboard");
    return res.redirect("/users/dashboard");
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
//    USER DASHBOARD PAGE
// ======================================================
router.get("/dashboard", isAuthenticated, async (req, res) => {
  if (req.session.user.role === "admin") {
    return res.redirect("/admin/dashboard");
  }

  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");
    const userId = req.session.user.userId;

    // ============================
    // ORDER SUMMARY COUNTS
    // ============================
    const totalOrders = await ordersCol.countDocuments({ userId });
    const toPayOrders = await ordersCol.countDocuments({ userId, status: "to_pay" });
    const toShipOrders = await ordersCol.countDocuments({ userId, status: "to_ship" });
    const toReceiveOrders = await ordersCol.countDocuments({ userId, status: "to_receive" });
    const completedOrders = await ordersCol.countDocuments({ userId, status: "completed" });
    const refundOrders = await ordersCol.countDocuments({ userId, status: "refund" });
    const cancelledOrders = await ordersCol.countDocuments({ userId, status: "cancelled" });

    // ============================
    // RECENT ORDERS (limit 3)
    // ============================
    let recentOrders = await ordersCol
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(3)
      .toArray();

    recentOrders = recentOrders.map(order => ({
      ...order,
      totalQty: order.items.reduce((sum, item) => sum + item.quantity, 0)
    }));

    // ============================
    // RENDER PAGE
    // ============================
    res.render("dashboard", {
      title: "User Dashboard",
      user: req.session.user,

      // summary counts
      totalOrders,
      toPayOrders,
      toShipOrders,
      toReceiveOrders,
      completedOrders,
      refundOrders,
      cancelledOrders,

      // preview list
      recentOrders
    });

  } catch (err) {
    console.error("Dashboard error:", err);
    res.render("error", {
      title: "Dashboard Error",
      message: "Something went wrong.",
      backLink: "/users/login",
      backText: "Back to Login",
    });
  }
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

    const users = await usersCol
      .find(filter)
      .project({ passwordHash: 0 })
      .sort({ createdAt: -1 })
      .toArray();

    res.render("users-list", {
      title: "User List",
      users,
      q,
      role,
      total: users.length,
      admin: req.session.user,
    });
  } catch (err) {
    console.error("List error:", err);
    res.render("error", {
      title: "User List Error",
      message: "Something went wrong.",
      backLink: "/users/dashboard",
      backText: "Back to Dashboard",
    });
  }
});

// ======================================================
// USER PROFILE (Self Only)
// ======================================================
router.get("/profile", isAuthenticated, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCol = db.collection("users");

    const user = await usersCol.findOne({ userId: req.session.user.userId });

    if (!user) {
      return res.render("error", {
        title: "User Not Found",
        message: "Unable to load profile data.",
        backLink: "/users/dashboard",
        backText: "Back",
      });
    }

    res.render("profile", { title: "My Profile", user });
  } catch (err) {
    console.error("Profile error:", err);
    res.render("error", {
      title: "Profile Error",
      message: "Something went wrong.",
      backLink: "/users/dashboard",
      backText: "Back",
    });
  }
});

// ======================================================
// EDIT USER — SELF ONLY
// ======================================================
router.get("/edit/:id", isAuthenticated, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const target = await findUserById(db, req.params.id);

    if (!target) {
      return res.render("error", {
        title: "User Not Found",
        message: "The user you are trying to edit does not exist.",
        backLink: "/users/dashboard",
        backText: "Back",
      });
    }

    const loggedIn = req.session.user;
    const isSelf = loggedIn.userId === target.userId;

    if (!isSelf) {
      return res.render("error", {
        title: "Access Denied",
        message: "Admins cannot edit user profiles.",
        backLink: "/users/dashboard",
        backText: "Back",
      });
    }

    const updated = req.query.updated;
    res.render("edit-user", {
      title: "Edit Profile",
      user: target,
      loggedInUser: loggedIn,
      updated,
    });
  } catch (err) {
    console.error("Edit GET error:", err);
    res.render("error", {
      title: "Edit User Error",
      message: "Something went wrong.",
      backLink: "/users/dashboard",
      backText: "Back",
    });
  }
});

// ======================================================
// UPDATE USER — SELF ONLY (NOW UPDATES FIRST + LAST NAME)
// ======================================================
router.post("/edit/:id", isAuthenticated, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCol = db.collection("users");

    const target = await findUserById(db, req.params.id);

    if (!target) {
      return res.render("error", {
        title: "User Not Found",
        message: "The user you are trying to edit does not exist.",
        backLink: "/users/dashboard",
        backText: "Back",
      });
    }

    const loggedIn = req.session.user;
    const isSelf = loggedIn.userId === target.userId;

    if (!isSelf) {
      return res.render("error", {
        title: "Access Denied",
        message: "You cannot update another user's profile.",
        backLink: "/users/dashboard",
        backText: "Back",
      });
    }

    const {
      firstName,
      lastName,
      address,
      contactNumber,
      newPassword
    } = req.body;

    // ==============================
    // CONTACT NUMBER NORMALIZATION
    // ==============================
    let finalContact = "";

    if (contactNumber && contactNumber.trim() !== "") {
      const digits = contactNumber.replace(/\D/g, "");

      if (digits.length === 10) {
        finalContact = "+63" + digits;
      } else if (digits.length === 11 && digits.startsWith("0")) {
        finalContact = "+63" + digits.slice(1);
      } else if (digits.length === 12 && digits.startsWith("63")) {
        finalContact = "+63" + digits.slice(2);
      } else if (digits.length === 13 && digits.startsWith("639")) {
        finalContact = "+63" + digits.slice(-10);
      } else {
        return res.render("error", {
          title: "Invalid Contact Number",
          message:
            "Please enter a valid PH mobile number (e.g. 09123456789 or 9123456789 or +639123456789).",
          backLink: "/users/edit/" + target.userId,
          backText: "Back",
        });
      }
    }

    // Build update document — NOW including name updates
    const updateDoc = {
      firstName: firstName || target.firstName,
      lastName: lastName || target.lastName,
      address: address || "",
      contactNumber: finalContact,
      updatedAt: new Date(),
    };

    if (newPassword && newPassword.trim().length > 0) {
      updateDoc.passwordHash = await bcrypt.hash(newPassword.trim(), saltRounds);
    }

    await usersCol.updateOne({ _id: target._id }, { $set: updateDoc });

    // Update session immediately so UI reflects changes
    req.session.user.firstName = updateDoc.firstName;
    req.session.user.lastName = updateDoc.lastName;
    req.session.user.address = updateDoc.address;
    req.session.user.contactNumber = updateDoc.contactNumber;

    res.redirect("/users/edit/" + target.userId + "?updated=1");
  } catch (err) {
    console.error("Edit POST error:", err);
    res.render("error", {
      title: "Update User Error",
      message: "Something went wrong while updating the user.",
      backLink: "/users/dashboard",
      backText: "Back",
    });
  }
});

// ======================================================
// DISABLED DELETE ROUTE (SAFETY)
// ======================================================
router.post("/delete/:id", isAdmin, (req, res) => {
  return res.render("error", {
    title: "Action Disabled",
    message: "Deleting user accounts is not allowed.",
    backLink: "/users/list",
    backText: "Back",
  });
});

// ======================================================
// BAN USER
// ======================================================
router.post("/ban/:id", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCol = db.collection("users");

    const target = await findUserById(db, req.params.id);

    if (!target) return res.redirect("/users/list");

    if (target.role === "admin" || target.userId === req.session.user.userId) {
      return res.render("error", {
        title: "Not Allowed",
        message: "You cannot ban this account.",
        backLink: "/users/list",
        backText: "Back",
      });
    }

    await usersCol.updateOne(
      { _id: target._id },
      { $set: { accountStatus: "banned" } }
    );

    res.redirect("/users/list");
  } catch (err) {
    console.error("Ban user error:", err);
    res.redirect("/users/list");
  }
});

// ======================================================
// ACTIVATE USER
// ======================================================
router.post("/activate/:id", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCol = db.collection("users");

    const target = await findUserById(db, req.params.id);

    if (!target) return res.redirect("/users/list");

    await usersCol.updateOne(
      { _id: target._id },
      { $set: { accountStatus: "active" } }
    );

    res.redirect("/users/list");
  } catch (err) {
    console.error("Activate user error:", err);
    res.redirect("/users/list");
  }
});

// ======================================================
// EXPORT ROUTER
// ======================================================
module.exports = router;
