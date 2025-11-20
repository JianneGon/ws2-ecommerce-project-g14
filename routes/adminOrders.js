// routes/adminOrders.js
const express = require("express");
const router = express.Router();
const { isAdmin } = require("../middlewares/auth");

// =======================
// GET /admin/orders – list all orders (admin only)
// =======================
router.get("/orders", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");

    const orders = await ordersCol
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.render("admin-orders", {
      title: "All Orders",
      orders,
      currentUser: req.session.user,
    });
  } catch (err) {
    console.error("Error fetching admin orders:", err);
    res.render("error", {
      title: "Orders Error",
      message: "Something went wrong while fetching orders.",
      backLink: "/users/dashboard",
      backText: "Back to Dashboard",
    });
  }
});

module.exports = router;
