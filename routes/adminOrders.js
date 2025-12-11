// routes/adminOrders.js
const express = require("express");
const router = express.Router();
const { isAdmin } = require("../middlewares/auth");

// =======================
// GET /admin/orders – list all orders
// =======================
router.get("/orders", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");
    const usersCol = db.collection("users");

    const orders = await ordersCol
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const userIds = [...new Set(orders.map(o => o.userId))];

    const users = await usersCol
      .find({ userId: { $in: userIds } })
      .toArray();

    const userMap = {};
    users.forEach(u => (userMap[u.userId] = u.email));

    const result = orders.map(o => ({
      ...o,
      userEmail: userMap[o.userId] || o.email || "Unknown"
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
// GET /admin/orders/:orderId – order details
// =======================
router.get("/orders/:orderId", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");

    const order = await ordersCol.findOne({ orderId: req.params.orderId });

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
      user: req.session.user,
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
// POST /admin/orders/update/:orderId – UPDATE ORDER STATUS
// OPTION A LOGIC: handles paid/unpaid properly
// =======================================================
router.post("/orders/update/:orderId", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");

    const newStatus = req.body.status;

    // Fetch current order
    const order = await ordersCol.findOne({ orderId: req.params.orderId });
    if (!order) return res.redirect("/admin/orders?error=1");

    let updatedFields = {
      status: newStatus,
      updatedAt: new Date(),
    };

    // ============================
    // PAYMENT LOGIC FOR ADMINS
    // ============================

    // If admin sets order to "paid"
    if (newStatus === "paid") {
      updatedFields.paymentStatus = "paid";
      updatedFields.paidAt = new Date();
    }

    // If admin sets order to cancelled/refund → unpaid
    if (["cancelled", "refund"].includes(newStatus)) {
      updatedFields.paymentStatus = "unpaid";
      updatedFields.paidAt = null;
    }

    // If admin moves a paid order to shipping stages
    if (["to_ship", "shipped", "to_receive", "completed"].includes(newStatus)) {
      // Keep payment status if already paid
      if (order.paymentStatus === "paid") {
        updatedFields.paymentStatus = "paid";
      }
    }

    await ordersCol.updateOne(
      { orderId: req.params.orderId },
      { $set: updatedFields }
    );

    return res.redirect(`/admin/orders/${req.params.orderId}?updated=1`);

  } catch (err) {
    console.error("Order status update error:", err);
    res.redirect("/admin/orders?error=1");
  }
});

module.exports = router;
