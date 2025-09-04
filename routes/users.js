const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const { ObjectId } = require("mongodb");
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
    if (existingUser) return res.send("User already exists with this email.");

    const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);
    const currentDate = new Date();

    const newUser = {
      userId: uuidv4(),
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      passwordHash: hashedPassword,
      role: "customer",
      accountStatus: "active",
      isEmailVerified: false,
      createdAt: currentDate,
      updatedAt: currentDate,
    };

    await usersCollection.insertOne(newUser);

    res.render("register-success", {
      title: "Registration Successful",
      user: newUser,
    });
  } catch (err) {
    console.error("Error saving user:", err);
    res.send("Something went wrong.");
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
    if (!user) return res.send("User not found.");
    if (user.accountStatus !== "active") return res.send("Account is not active.");

    const isPasswordValid = await bcrypt.compare(req.body.password, user.passwordHash);
    if (!isPasswordValid) return res.send("Invalid password.");

    req.session.user = {
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    };

    res.redirect("/users/dashboard");
  } catch (err) {
    console.error("Error during login:", err);
    res.send("Something went wrong.");
  }
});

// =======================
// Dashboard + Logout
// =======================
router.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/users/login");
  res.render("dashboard", { title: "User Dashboard", user: req.session.user });
});

router.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/users/login");
});

// =======================
// Admin Dashboard
// =======================
router.get("/admin", async (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).send("Access denied.");
  }

  const db = req.app.locals.client.db(req.app.locals.dbName);
  const users = await db.collection("users").find().toArray();

  res.render("admin", {
    title: "Admin Dashboard",
    users,
    currentUser: req.session.user,
  });
});

// =======================
// User CRUD
// =======================
router.get("/list", async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCollection = db.collection("users");

    const users = await usersCollection.find().toArray();
    res.render("users-list", { title: "Registered Users", users });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.send("Something went wrong.");
  }
});

// Helper function to find user by userId or _id
async function findUserById(db, id) {
  const usersCollection = db.collection("users");
  return await usersCollection.findOne({
    $or: [
      { userId: id },
      { _id: ObjectId.isValid(id) ? new ObjectId(id) : null }
    ]
  });
}

router.get("/edit/:id", async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const user = await findUserById(db, req.params.id);

    if (!user) return res.send("User not found.");
    res.render("edit-user", { title: "Edit User", user });
  } catch (err) {
    console.error("Error loading user:", err);
    res.send("Something went wrong.");
  }
});

router.post("/edit/:id", async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCollection = db.collection("users");

    const targetUser = await findUserById(db, req.params.id);
    if (!targetUser) return res.send("User not found.");

    await usersCollection.updateOne(
      { _id: targetUser._id },
      {
        $set: {
          firstName: req.body.firstName,
          lastName: req.body.lastName,
          email: req.body.email,
          updatedAt: new Date(),
        },
      }
    );

    const updatedUser = await findUserById(db, req.params.id);

    if (req.session.user && req.session.user.userId === updatedUser.userId) {
      req.session.user.firstName = updatedUser.firstName;
      req.session.user.lastName = updatedUser.lastName;
      req.session.user.email = updatedUser.email;
    }

    if (req.session.user && req.session.user.role === "admin" && req.session.user.userId !== updatedUser.userId) {
      return res.redirect("/users/admin");
    }

    res.redirect("/users/dashboard");
  } catch (err) {
    console.error("Error updating user:", err);
    res.send("Something went wrong.");
  }
});

router.post("/delete/:id", async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCollection = db.collection("users");

    const targetUser = await findUserById(db, req.params.id);
    if (!targetUser) return res.send("User not found.");

    const result = await usersCollection.deleteOne({ _id: targetUser._id });
    if (result.deletedCount === 0) return res.send("No user found to delete.");

    if (req.session.user && req.session.user.userId === targetUser.userId) {
      req.session.destroy();
      return res.redirect("/users/login");
    }

    if (req.session.user && req.session.user.role === "admin") {
      return res.redirect("/users/admin");
    }

    res.redirect("/users/list");
  } catch (err) {
  console.error(err);
  res.send(`<pre>${err.stack}</pre>`);
}

});

module.exports = router;
