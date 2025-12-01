// routes/adminReports.js
console.log("adminReports.js loaded");

const express = require("express");
const router = express.Router();
const { isAdmin } = require("../middlewares/auth");

// ===============================
//   ADMIN SALES OVERVIEW PAGE
// ===============================
router.get("/reports/sales", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");

    let { startDate, endDate, status } = req.query;

    const filters = {
      startDate: startDate || "",
      endDate: endDate || "",
      status: status || "all",
    };

    const matchQuery = {};

    // Status filter (NEW + OLD schema)
    if (status && status !== "all") {
      matchQuery.$or = [
        { status: status },
        { "shipping.status": status }
      ];
    }

    // Date filter
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);

      if (endDate) {
        let e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        matchQuery.createdAt.$lte = e;
      }
    }

    // Daily aggregation
    const aggregation = [
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }},
          totalSales: { $sum: "$totalAmount" },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const dailySales = await ordersCol.aggregate(aggregation).toArray();

    // Summary
    let totalSales = 0;
    let totalOrders = 0;

    dailySales.forEach(d => {
      totalSales += d.totalSales;
      totalOrders += d.orderCount;
    });

    const summary = {
      totalSales,
      totalOrders,
      averageOrderValue: totalOrders > 0 ? totalSales / totalOrders : 0
    };

    const labels = dailySales.map(d => d._id);
    const salesData = dailySales.map(d => d.totalSales);

    res.render("admin-reports-sales", {
      title: "Admin – Sales Overview",
      filters,
      dailySales,
      summary,
      labels,
      salesData,
      user: req.session.user
    });

  } catch (err) {
    console.error("Sales report error:", err);
    res.status(500).send("Sales report failed.");
  }
});


// ===============================
// DAILY SALES EXPORT (XLSX)
// Lesson 24 – Part 3
// ===============================
router.get("/reports/sales/export/daily", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");
    const ExcelJS = require("exceljs");

    let { startDate, endDate, status } = req.query;

    const matchQuery = {};

    if (status && status !== "all") {
      matchQuery.$or = [
        { status: status },
        { "shipping.status": status }
      ];
    }

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);

      if (endDate) {
        let e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        matchQuery.createdAt.$lte = e;
      }
    }

    const pipeline = [
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }},
          totalSales: { $sum: "$totalAmount" },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const dailySales = await ordersCol.aggregate(pipeline).toArray();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Daily Sales");

    sheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Total Sales", key: "totalSales", width: 20 },
      { header: "Number of Orders", key: "orderCount", width: 20 }
    ];

    dailySales.forEach(row => {
      sheet.addRow({
        date: row._id,
        totalSales: row.totalSales,
        orderCount: row.orderCount
      });
    });

    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
    });

    res.setHeader("Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition",
      "attachment; filename=daily_sales_report.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Daily XLSX Error:", err);
    res.status(500).send("Failed to export daily sales report.");
  }
});


// ===============================
// MONTHLY SALES EXPORT (XLSX)
// Lesson 24 – Part 6
// ===============================
router.get("/reports/sales/export/monthly", isAdmin, async (req, res) => {
  try {
    const ExcelJS = require("exceljs");
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");

    let { startDate, endDate, status } = req.query;

    const matchQuery = {};

    if (status && status !== "all") {
      matchQuery.status = status;
    }

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchQuery.createdAt.$lte = end;
      }
    }

    const pipeline = [
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" }},
          totalSales: { $sum: "$totalAmount" },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const monthlySales = await ordersCol.aggregate(pipeline).toArray();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Monthly Sales");

    sheet.columns = [
      { header: "Month", key: "month", width: 15 },
      { header: "Total Sales", key: "totalSales", width: 20 },
      { header: "Number of Orders", key: "orderCount", width: 20 }
    ];

    monthlySales.forEach(row => {
      sheet.addRow({
        month: row._id,
        totalSales: row.totalSales,
        orderCount: row.orderCount
      });
    });

    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=monthly_sales_report.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("MONTHLY XLSX Error:", err);
    res.status(500).send("Failed to export monthly sales report.");
  }
});


// ===============================
// DETAILED ORDERS EXPORT (XLSX)
// Lesson 24 – Part 4
// ===============================
router.get("/reports/sales/export/orders", isAdmin, async (req, res) => {
  try {
    const ExcelJS = require("exceljs");
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");

    let { startDate, endDate, status } = req.query;

    const matchQuery = {};

    if (status && status !== "all") {
      matchQuery.$or = [
        { status: status },
        { "shipping.status": status }
      ];
    }

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);

      if (endDate) {
        let e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        matchQuery.createdAt.$lte = e;
      }
    }

    const orders = await ordersCol
      .find(matchQuery)
      .sort({ createdAt: 1 })
      .toArray();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Detailed Orders");

    sheet.columns = [
      { header: "Order ID", key: "orderId", width: 40 },
      { header: "Date", key: "date", width: 22 },
      { header: "User Email", key: "email", width: 30 },
      { header: "Status", key: "status", width: 15 },
      { header: "Total Amount", key: "totalAmount", width: 20 }
    ];

    orders.forEach(o => {
      sheet.addRow({
        orderId: o.orderId,
        date: o.createdAt.toISOString().replace("T", " ").split(".")[0],
        email: o.email || o.userEmail || "Unknown",
        status: (o.status || o.shipping?.status || "unknown")
          .replace(/_/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase()),
        totalAmount: o.totalAmount
      });
    });

    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=detailed_orders_report.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Orders XLSX Error:", err);
    res.status(500).send("Failed to export detailed orders report.");
  }
});


// ===============================
// CSV EXPORT (LEGACY)
// MUST BE LAST
// ===============================
router.get("/reports/sales/export", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");

    let { startDate, endDate, status } = req.query;

    const matchQuery = {};

    if (status && status !== "all") {
      matchQuery.status = status;
    }

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);

      if (endDate) {
        let e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        matchQuery.createdAt.$lte = e;
      }
    }

    const orders = await ordersCol
      .find(matchQuery)
      .sort({ createdAt: 1 })
      .toArray();

    let csv = "Date,Total Sales,Number of Orders\n";

    const grouped = {};

    orders.forEach(order => {
      const date = order.createdAt.toISOString().split("T")[0];
      if (!grouped[date]) grouped[date] = { total: 0, count: 0 };

      grouped[date].total += Number(order.totalAmount);
      grouped[date].count += 1;
    });

    Object.keys(grouped).forEach(date => {
      csv += `${date},${grouped[date].total},${grouped[date].count}\n`;
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=sales-report.csv"
    );

    return res.send(csv);

  } catch (err) {
    console.error("CSV Export Error:", err);
    res.status(500).send("Failed to export CSV.");
  }
});

module.exports = router;
