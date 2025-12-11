// routes/orders.js
// =======================================================================
// FINAL VERSION — Includes status filtering, totalQty calculation,
// and fake GCash payment flow with LAN + Render auto-detect
// =======================================================================

const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");
const { v4: uuidv4 } = require("uuid");
const QRCode = require("qrcode");

// Import middlewares
const { isAuthenticated, blockAdmin } = require("../middlewares/auth");

// Helper: Find product by productId or _id
async function findProduct(db, productId) {
  const productsCol = db.collection("products");

  let product = await productsCol.findOne({ productId });
  if (!product && ObjectId.isValid(productId)) {
    product = await productsCol.findOne({ _id: new ObjectId(productId) });
  }
  return product;
}

// =======================================================================
// GET /orders/checkout — Checkout Page
// =======================================================================
router.get("/checkout", isAuthenticated, blockAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productId = (req.query.productId || "").trim();
    const selectedSize = (req.query.size || "").trim();
    let qty = parseInt(req.query.qty, 10) || 1;

    if (!productId) {
      return res.render("error", {
        title: "Checkout Error",
        message: "Missing product information.",
        backLink: "/products",
        backText: "Back to Products",
      });
    }

    const product = await findProduct(db, productId);
    if (!product) {
      return res.render("error", {
        title: "Checkout Error",
        message: "Product not found.",
        backLink: "/products",
        backText: "Back to Products",
      });
    }

    if (product.stock <= 0) {
      return res.render("error", {
        title: "Out of Stock",
        message: "This product is out of stock.",
        backLink: `/products/${product.productId}`,
        backText: "Back to Product",
      });
    }

    let maxAvailable = product.stock;
    let sizeEntry = null;

    if (product.sizes && product.sizes.length && selectedSize) {
      sizeEntry = product.sizes.find((s) => s.label === selectedSize);
      if (!sizeEntry || sizeEntry.stock <= 0) {
        return res.render("error", {
          title: "Out of Stock",
          message: "The selected size is out of stock.",
          backLink: `/products/${product.productId}`,
          backText: "Back to Product",
        });
      }
      maxAvailable = sizeEntry.stock;
    }

    qty = Math.min(Math.max(qty, 1), maxAvailable);
    const totalAmount = product.price * qty;

    res.render("checkout", {
      title: "Checkout",
      product,
      quantity: qty,
      totalAmount,
      user: req.session.user,
      selectedSize: selectedSize || null,
    });
  } catch (err) {
    console.error("Checkout Page Error:", err);
    res.render("error", {
      title: "Checkout Error",
      message: "Something went wrong.",
      backLink: "/products",
      backText: "Back to Products",
    });
  }
});

// =======================================================================
// POST /orders/checkout — Place Single-Item Order
// =======================================================================
router.post("/checkout", isAuthenticated, blockAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");
    const ordersCol = db.collection("orders");

    const user = req.session.user;

    const productId = (req.body.productId || "").trim();
    const selectedSize = (req.body.size || "").trim();
    let qty = parseInt(req.body.quantity, 10) || 1;

    const {
      fullName,
      addressLine1,
      addressLine2,
      city,
      region,
      postalCode,
      phone,
    } = req.body;

    const paymentMethod = (req.body.paymentMethod || "cod").toLowerCase();
    const gcashNumber = (req.body.gcashNumber || "").trim();

    if (!productId) {
      return res.render("error", {
        title: "Checkout Error",
        message: "Missing product information.",
        backLink: "/products",
        backText: "Back to Products",
      });
    }

    const product = await findProduct(db, productId);
    if (!product) {
      return res.render("error", {
        title: "Checkout Error",
        message: "Product not found.",
        backLink: "/products",
        backText: "Back to Products",
      });
    }

    if (product.stock <= 0) {
      return res.render("error", {
        title: "Out of Stock",
        message: "This product is out of stock.",
        backLink: `/products/${product.productId}`,
        backText: "Back to Product",
      });
    }

    let maxAvailable = product.stock;
    let sizeEntry = null;

    if (product.sizes && product.sizes.length && selectedSize) {
      sizeEntry = product.sizes.find((s) => s.label === selectedSize);
      if (!sizeEntry || sizeEntry.stock <= 0) {
        return res.render("error", {
          title: "Out of Stock",
          message: "Selected size is out of stock.",
          backLink: `/products/${product.productId}`,
          backText: "Back to Product",
        });
      }
      maxAvailable = sizeEntry.stock;
    }

    qty = Math.min(Math.max(qty, 1), maxAvailable);

    const subtotal = product.price * qty;
    const totalAmount = subtotal;

    const orderDoc = {
      orderId: uuidv4(),
      userId: user.userId,
      email: user.email,
      items: [
        {
          productId: product.productId,
          name: product.name,
          brand: product.brand || null,
          price: product.price,
          quantity: qty,
          subtotal,
          size: selectedSize || null,
        },
      ],
      totalAmount,
      status: "to_pay",
      paymentMethod,
      paymentStatus: paymentMethod === "gcash" ? "pending" : "cod",
      paidAt: null,
      gcashNumber: paymentMethod === "gcash" ? gcashNumber : null,
      shipping: {
        fullName,
        addressLine1,
        addressLine2,
        city,
        region,
        postalCode,
        phone,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await ordersCol.insertOne(orderDoc);

    if (product.sizes && selectedSize) {
      const newSizes = product.sizes.map((s) =>
        s.label === selectedSize ? { ...s, stock: Math.max(s.stock - qty, 0) } : s
      );

      const newTotalStock = newSizes.reduce((sum, s) => sum + (s.stock || 0), 0);

      await productsCol.updateOne(
        { productId: product.productId },
        { $set: { sizes: newSizes, stock: newTotalStock } }
      );
    } else {
      await productsCol.updateOne(
        { productId: product.productId },
        { $inc: { stock: -qty } }
      );
    }

    if (paymentMethod === "gcash") {
      return res.redirect(`/orders/pay/${orderDoc.orderId}`);
    }

    res.render("success", {
      title: "Order Placed",
      message: `Order <strong>${orderDoc.orderId}</strong> placed successfully.`,
      backLink: "/orders",
      backText: "View My Orders",
    });
  } catch (err) {
    console.error("Checkout Error:", err);
    res.render("error", {
      title: "Checkout Error",
      message: "Something went wrong.",
      backLink: "/products",
      backText: "Back to Products",
    });
  }
});

// =======================================================================
// GET /orders — ORDER LIST WITH FILTERING
// =======================================================================
router.get("/", isAuthenticated, blockAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");

    const userId = req.session.user.userId;
    const selectedStatus = req.query.status;

    let filter = { userId };

    if (selectedStatus && selectedStatus !== "all") {
      filter.status = selectedStatus;
    }

    let orders = await ordersCol.find(filter).sort({ createdAt: -1 }).toArray();

    orders.forEach((order) => {
      order.totalQty = order.items.reduce(
        (sum, item) => sum + item.quantity,
        0
      );
    });

    res.render("orders-list", {
      title: "My Orders",
      orders,
      user: req.session.user,
      selectedStatus: selectedStatus || "all",
    });
  } catch (err) {
    console.error("Orders Fetch Error:", err);
    res.render("error", {
      title: "Orders Error",
      message: "Something went wrong while fetching your orders.",
      backLink: "/users/dashboard",
      backText: "Back to Dashboard",
    });
  }
});

// =======================================================================
// FAKE GCash PAYMENT FLOW
// =======================================================================

// Desktop QR page: GET /orders/pay/:orderId
router.get(
  "/pay/:orderId",
  isAuthenticated,
  blockAdmin,
  async (req, res) => {
    try {
      const db = req.app.locals.client.db(req.app.locals.dbName);
      const ordersCol = db.collection("orders");

      const order = await ordersCol.findOne({
        orderId: req.params.orderId,
        userId: req.session.user.userId,
      });

      if (!order || order.paymentMethod !== "gcash") {
        return res.status(404).render("error", {
          title: "Payment Error",
          message: "Payment session not found.",
          backLink: "/orders",
          backText: "Back to Orders",
        });
      }

      // Detect LAN or Render URL
      let baseUrl;

      if (process.env.RENDER_EXTERNAL_URL) {
        baseUrl = process.env.RENDER_EXTERNAL_URL;
      } else {
        const LAN_IP = "192.168.100.16";
        const PORT = process.env.PORT || 3000;
        baseUrl = `http://${LAN_IP}:${PORT}`;
      }

      const mobileUrl = `${baseUrl}/orders/pay/mobile/${order.orderId}`;
      const qrDataUrl = await QRCode.toDataURL(mobileUrl);

      res.render("fakepay-desktop", {
        title: "Pay with GCash",
        order,
        qrDataUrl,
        mobileUrl,
        user: req.session.user,
      });
    } catch (err) {
      console.error("FakePay desktop error:", err);
      res.status(500).render("error", {
        title: "Payment Error",
        message: "Something went wrong while preparing the payment.",
        backLink: "/orders",
        backText: "Back to Orders",
      });
    }
  }
);

// =======================================================================
// POLLING FIX — GET /orders/pay/status/:orderId
// =======================================================================
router.get(
  "/pay/status/:orderId",
  isAuthenticated,
  blockAdmin,
  async (req, res) => {
    try {
      const db = req.app.locals.client.db(req.app.locals.dbName);
      const ordersCol = db.collection("orders");

      // IMPORTANT FIX — remove userId filter
      const order = await ordersCol.findOne({
        orderId: req.params.orderId,
      });

      if (!order) {
        return res
          .status(404)
          .json({ paid: false, error: "Not found" });
      }

      const isPaid = order.paymentStatus === "paid";

      res.json({
        paid: isPaid,
        redirectUrl: isPaid
          ? `/orders/pay/success/${order.orderId}`
          : null,
      });
    } catch (err) {
      console.error("FakePay status error:", err);
      res
        .status(500)
        .json({ paid: false, error: "Server error" });
    }
  }
);

// =======================================================================
// Mobile fake GCash page: GET /orders/pay/mobile/:orderId
// =======================================================================
router.get("/pay/mobile/:orderId", async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");

    const order = await ordersCol.findOne({
      orderId: req.params.orderId,
    });

    if (!order || order.paymentMethod !== "gcash") {
      return res.status(404).render("error", {
        title: "Payment Error",
        message: "Payment session not found.",
        backLink: "/",
        backText: "Back to Home",
      });
    }

    // Disable layout so phone view has no header/footer
    res.render("fakepay-mobile", {
      layout: false,
      title: "GCash Payment",
      order,
    });
  } catch (err) {
    console.error("FakePay mobile error:", err);
    res.status(500).render("error", {
      title: "Payment Error",
      message: "Something went wrong.",
      backLink: "/",
      backText: "Back to Home",
    });
  }
});

// =======================================================================
// Mobile “Pay Now” action
// =======================================================================
router.post("/pay/mobile/:orderId/confirm", async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");

    const order = await ordersCol.findOne({
      orderId: req.params.orderId,
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.paymentStatus === "paid") {
      return res.json({ success: true, alreadyPaid: true });
    }

    await ordersCol.updateOne(
      { orderId: order.orderId },
      {
        $set: {
          paymentStatus: "paid",
          status: "to_ship",
          paidAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("FakePay confirm error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
});

// =======================================================================
// NEW SUCCESS PAGE — AFTER PAYMENT
// =======================================================================
router.get(
  "/pay/success/:orderId",
  isAuthenticated,
  blockAdmin,
  async (req, res) => {
    try {
      const db = req.app.locals.client.db(req.app.locals.dbName);
      const ordersCol = db.collection("orders");

      const order = await ordersCol.findOne({
        orderId: req.params.orderId,
        userId: req.session.user.userId,
      });

      if (!order) {
        return res.status(404).render("error", {
          title: "Order Not Found",
          message: "We could not find this order.",
          backLink: "/orders",
          backText: "Back to Orders",
        });
      }

      res.render("payment-success", {
        layout: false,
        order
      });

    } catch (err) {
      console.error("Payment success page error:", err);
      res.render("error", {
        title: "Error",
        message:
          "Something went wrong showing your payment confirmation.",
        backLink: "/orders",
        backText: "Back to Orders",
      });
    }
  }
);

// =======================================================================
// GET /orders/:orderId — Order Details Page
// =======================================================================
router.get(
  "/:orderId",
  isAuthenticated,
  blockAdmin,
  async (req, res) => {
    try {
      const db = req.app.locals.client.db(req.app.locals.dbName);
      const ordersCol = db.collection("orders");

      const order = await ordersCol.findOne({
        orderId: req.params.orderId,
        userId: req.session.user.userId,
      });

      if (!order) {
        return res.status(404).render("error", {
          title: "Order Not Found",
          message: "We could not find that order.",
          backLink: "/orders",
          backText: "Back to Orders",
        });
      }

      res.render("order-detail", {
        title: `Order ${order.orderId}`,
        order,
        user: req.session.user,
      });
    } catch (err) {
      console.error("Order Detail Error:", err);
      res.render("error", {
        title: "Order Error",
        message: "Something went wrong.",
        backLink: "/orders",
        backText: "Back to Orders",
      });
    }
  }
);

module.exports = router;
