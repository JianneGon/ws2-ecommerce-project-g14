// routes/admin.js
const express = require("express");
const router = express.Router();
const { isAdmin } = require("../middlewares/auth");

// ===============================
// ADMIN DASHBOARD
// ===============================
router.get("/dashboard", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);

    const productsCol = db.collection("products");
    const usersCol = db.collection("users");
    const ordersCol = db.collection("orders");

    // ===============================
    // QUICK STATS
    // ===============================
    const totalProducts = await productsCol.countDocuments();

    const totalUsers = await usersCol.countDocuments({
      role: "customer"
    });

    const totalOrders = await ordersCol.countDocuments();

    const completedOrders = await ordersCol.find({
      status: "completed"
    }).toArray();

    const totalRevenue = completedOrders.reduce(
      (sum, order) => sum + (order.totalAmount || 0),
      0
    );

    // ===============================
    // CUSTOMER METRICS — NEW
    // ===============================
    const totalActiveCustomers = await usersCol.countDocuments({
      role: "customer",
      accountStatus: "active"
    });

    const totalBannedCustomers = await usersCol.countDocuments({
      role: "customer",
      accountStatus: "banned"
    });

    const totalVerifiedCustomers = await usersCol.countDocuments({
      role: "customer",
      isEmailVerified: true
    });

    const totalUnverifiedCustomers = await usersCol.countDocuments({
      role: "customer",
      isEmailVerified: false
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newCustomers30Days = await usersCol.countDocuments({
      role: "customer",
      createdAt: { $gte: thirtyDaysAgo }
    });

    // ===============================
    // RECENT ORDERS (LAST 5)
    // ===============================
    const recentOrders = await ordersCol
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    // ===============================
    // REVENUE — LAST 7 DAYS
    // ===============================
    const last7Days = [];
    const revenue7Days = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);

      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

      const label = `${d.getMonth() + 1}/${d.getDate()}`;

      const dayOrders = await ordersCol.find({
        status: "completed",
        createdAt: { $gte: start, $lte: end }
      }).toArray();

      const revenue = dayOrders.reduce(
        (sum, o) => sum + (o.totalAmount || 0),
        0
      );

      last7Days.push(label);
      revenue7Days.push(revenue);
    }

    // ===============================
    // MONTHLY REVENUE — LAST 12 MONTHS
    // ===============================
    const monthLabels = [];
    const monthlyRevenue = [];

    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);

      const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59);

      const label = monthDate.toLocaleString("default", { month: "short" });

      const monthOrders = await ordersCol.find({
        status: "completed",
        createdAt: { $gte: start, $lte: end }
      }).toArray();

      const revenue = monthOrders.reduce(
        (sum, o) => sum + (o.totalAmount || 0),
        0
      );

      monthLabels.push(label);
      monthlyRevenue.push(revenue);
    }

    // ===============================
    // ORDER STATUS DISTRIBUTION
    // ===============================
    const statuses = ["to_pay", "to_ship", "to_receive", "completed", "refund", "cancelled"];
    const statusCounts = {};

    for (const s of statuses) {
      statusCounts[s] = await ordersCol.countDocuments({ status: s });
    }

    // ===============================
    // TOP SELLING PRODUCTS
    // ===============================
    const allCompletedOrders2 = await ordersCol.find({ status: "completed" }).toArray();

    const productMap = new Map();

    allCompletedOrders2.forEach(order => {
      order.items.forEach(item => {
        const id = item.productId;

        if (!productMap.has(id)) {
          productMap.set(id, {
            productId: id,
            name: item.name,
            totalQty: 0,
            totalRevenue: 0
          });
        }

        const entry = productMap.get(id);

        entry.totalQty += item.quantity;
        entry.totalRevenue += (item.subtotal || item.price * item.quantity);
      });
    });

    let topProducts = Array.from(productMap.values());
    topProducts.sort((a, b) => b.totalQty - a.totalQty);
    topProducts = topProducts.slice(0, 5);

    // ===============================
    // RENDER DASHBOARD
    // ===============================
    res.render("admin/dashboard", {
      title: "Admin Dashboard",
      admin: req.session.user,

      totalProducts,
      totalUsers,
      totalOrders,
      totalRevenue,

      // NEW CUSTOMER METRICS
      totalActiveCustomers,
      totalBannedCustomers,
      totalVerifiedCustomers,
      totalUnverifiedCustomers,
      newCustomers30Days,

      recentOrders,
      last7Days,
      revenue7Days,
      monthLabels,
      monthlyRevenue,
      statusCounts,
      topProducts
    });

  } catch (err) {
    console.error("Admin Dashboard Error:", err);
    res.render("error", {
      title: "Dashboard Error",
      message: "Something went wrong loading admin dashboard.",
      backLink: "/",
      backText: "Back to Home"
    });
  }
});

module.exports = router;
