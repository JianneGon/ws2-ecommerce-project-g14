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

    const { firstName, lastName, email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.render("error", {
        title: "Registration Error",
        message: "Passwords do not match.",
        backLink: "/users/register",
        backText: "Try Again",
      });
    }

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
      // optional cart field will be added later when user uses cart
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

    // keep any pre-login guest cart in memory
    const existingSessionCart = req.session.cart || null;

    // set session user
    req.session.user = {
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      accountStatus: user.accountStatus,
    };

    // Decide which cart to use:
    // 1) If user already has a saved cart in DB, use that
    // 2) Else if a guest cart exists in session, save it to DB
    // 3) Else init an empty cart
    if (user.cart && user.cart.items && user.cart.items.length > 0) {
      req.session.cart = user.cart;
    } else if (
      existingSessionCart &&
      existingSessionCart.items &&
      existingSessionCart.items.length > 0
    ) {
      req.session.cart = existingSessionCart;

      await usersCol.updateOne(
        { _id: user._id },
        {
          $set: {
            cart: existingSessionCart,
          },
        }
      );
    } else {
      req.session.cart = {
        items: [],
        totalQty: 0,
        totalAmount: 0,
      };
    }

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
// DASHBOARD with ORDER COUNTS (Lesson 21 requirement)
// ======================================================
router.get("/dashboard", isAuthenticated, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");

    const userId = req.session.user.userId;

    // Count per status (based on YOUR MongoDB structure)
    const totalOrders = await ordersCol.countDocuments({ userId });
    const toPayOrders = await ordersCol.countDocuments({ userId, status: "to_pay" }); 
    const toShipOrders = await ordersCol.countDocuments({ userId, status: "to_ship" });
    const toReceiveOrders = await ordersCol.countDocuments({ userId, status: "to_receive" });
    const completedOrders = await ordersCol.countDocuments({ userId, status: "completed" });
    const refundOrders = await ordersCol.countDocuments({ userId, status: "refund" });
    const cancelledOrders = await ordersCol.countDocuments({ userId, status: "cancelled" });

    res.render("dashboard", {
      title: "User Dashboard",
      user: req.session.user,
      totalOrders,
      toPayOrders,
      toShipOrders,
      toReceiveOrders,
      completedOrders,
      refundOrders,
      cancelledOrders
    });

  } catch (err) {
    console.error("Dashboard error:", err);
    res.render("error", {
      title: "Dashboard Error",
      message: "Something went wrong while loading your dashboard.",
      backLink: "/users/login",
      backText: "Back to Login"
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
// ADMIN SHORTCUT
// ======================================================
router.get("/admin", isAdmin, (req, res) => {
  res.redirect("/users/list");
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
      .project({
        passwordHash: 0,
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.render("users-list", {
      title: "User List",
      users,
      q,
      role,
      total: users.length,
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
// =======================
// USER PROFILE (VIEW ONLY)
// =======================
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
        backText: "Back"
      });
    }

    res.render("profile", {
      title: "My Profile",
      user
    });

  } catch (err) {
    console.error("Profile error:", err);
    res.render("error", {
      title: "Profile Error",
      message: "Something went wrong.",
      backLink: "/users/dashboard",
      backText: "Back"
    });
  }
});

// ======================================================
// EDIT USER — BOTH ADMIN + NORMAL USER
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

    // ALLOW: Admin OR user editing themselves
    if (loggedIn.role !== "admin" && loggedIn.userId !== target.userId) {
      return res.render("error", {
        title: "Access Denied",
        message: "You are not allowed to edit this profile.",
        backLink: "/users/dashboard",
        backText: "Back",
      });
    }
    const updated = req.query.updated;
    res.render("edit-user", {
      title: loggedIn.role === "admin" ? "Edit User" : "Edit Profile",
      user: target,
      loggedInUser: loggedIn,
      updated
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
// UPDATE USER — BOTH ADMIN + NORMAL USER
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
    const isAdminUser = loggedIn.role === "admin";

    // ACCESS CONTROL
    if (!isAdminUser && !isSelf) {
      return res.render("error", {
        title: "Access Denied",
        message: "You cannot update another user's profile.",
        backLink: "/users/dashboard",
        backText: "Back",
      });
    }

    // Extract all fields including address + contactNumber
const {
  firstName,
  lastName,
  email,
  role,
  accountStatus,
  newPassword,
  address,
  contactNumber,
} = req.body;

// BASE FIELDS
const updateDoc = {
  firstName,
  lastName,
  email,
  address: address || "",
  contactNumber: contactNumber || "",
  updatedAt: new Date(),
};

    // ADMIN-ONLY FIELDS
    if (isAdminUser) {
      updateDoc.role = role;
      updateDoc.accountStatus = accountStatus;

      if (newPassword && newPassword.trim().length > 0) {
        updateDoc.passwordHash = await bcrypt.hash(
          newPassword.trim(),
          saltRounds
        );
      }
    }

    // USER EDITING OWN PROFILE: ignore admin-only fields
    await usersCol.updateOne(
      { _id: target._id },
      {
        $set: updateDoc,
      }
    );

    // If user edited own profile → update session
    if (isSelf) {
  req.session.user.firstName = firstName;
  req.session.user.lastName = lastName;
  req.session.user.email = email;
  req.session.user.address = address;
  req.session.user.contactNumber = contactNumber;
}


    res.redirect(isAdminUser ? "/users/list" : "/users/edit/" + target.userId + "?updated=1");
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
// ADMIN — DELETE USER
// ======================================================
router.post("/delete/:id", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCol = db.collection("users");

    const target = await findUserById(db, req.params.id);
    if (!target) {
      return res.render("error", {
        title: "User Not Found",
        message: "The user you are trying to delete does not exist.",
        backLink: "/users/list",
        backText: "Back",
      });
    }

    await usersCol.deleteOne({ _id: target._id });

    res.redirect("/users/list");
  } catch (err) {
    console.error("Delete user error:", err);
    res.render("error", {
      title: "Delete User Error",
      message: "Something went wrong while deleting the user.",
      backLink: "/users/list",
      backText: "Back",
    });
  }
});

// ======================================================
// EXPORT ROUTER
// ======================================================
module.exports = router;
