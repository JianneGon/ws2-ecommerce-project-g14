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
    const usersCol = db.collection("users");

    // Fetch all orders (newest first)
    const orders = await ordersCol
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    // Collect unique userIds
    const userIds = [...new Set(orders.map(o => o.userId))];

    // Fetch users
    const users = await usersCol
      .find({ userId: { $in: userIds } })
      .toArray();

    // Build map of userId -> email
    const userMap = {};
    users.forEach(u => {
      userMap[u.userId] = u.email;
    });

    // Attach user email to each order
    const result = orders.map(order => ({
      ...order,
      userEmail: userMap[order.userId] || order.email || "Unknown"
    }));

    res.render("admin-orders", {
      title: "Admin – All Orders",
      orders: result,
      currentUser: req.session.user,
    });

  } catch (err) {
    console.error("Error loading admin orders:", err);
    res.render("error", {
      title: "Orders Error",
      message: "Something went wrong while loading orders.",
      backLink: "/users/dashboard",
      backText: "Back to Dashboard",
    });
  }
});

// =======================
// GET /admin/orders/:orderId – single order details page
// =======================
router.get("/orders/:orderId", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");

    const order = await ordersCol.findOne({
      orderId: req.params.orderId
    });

    if (!order) {
      return res.status(404).render("error", {
        title: "Order Not Found",
        message: "This order does not exist.",
        backLink: "/admin/orders",
        backText: "Back to Orders",
      });
    }

    res.render("order-detail", {
      title: `Order ${order.orderId}`,
      order,
      currentUser: req.session.user,
      adminView: true,
    });

  } catch (err) {
    console.error("Order detail error:", err);
    res.render("error", {
      title: "Order Error",
      message: "Something went wrong while loading the order.",
      backLink: "/admin/orders",
      backText: "Back to Orders",
    });
  }
});

// =======================================================
// POST /admin/orders/update/:orderId – update order status
// =======================================================
router.post("/orders/update/:orderId", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");

    const newStatus = req.body.status;

    await ordersCol.updateOne(
      { orderId: req.params.orderId },
      {
        $set: {
          status: newStatus,
          updatedAt: new Date(),
        },
      }
    );

    res.redirect("/admin/orders?success=1");

  } catch (err) {
    console.error("Order status update error:", err);
    res.redirect("/admin/orders?error=1");
  }
});

module.exports = router;
