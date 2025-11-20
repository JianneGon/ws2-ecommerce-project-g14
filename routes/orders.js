// routes/orders.js
const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");
const { v4: uuidv4 } = require("uuid");
const requireLogin = require("../middlewares/requireLogin");

// Helper function to load product by productId or _id
async function findProduct(db, productId) {
  const productsCol = db.collection("products");

  let product = await productsCol.findOne({ productId });
  if (!product && ObjectId.isValid(productId)) {
    product = await productsCol.findOne({ _id: new ObjectId(productId) });
  }
  return product;
}

// =====================================================================
// GET /orders/checkout - Checkout page for a single product
// =====================================================================
router.get("/checkout", requireLogin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productId = (req.query.productId || "").trim();
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
        message: "This product is currently out of stock.",
        backLink: `/products/${product.productId}`,
        backText: "Back to Product",
      });
    }

    qty = Math.min(Math.max(qty, 1), product.stock);

    const totalAmount = product.price * qty;

    res.render("checkout", {
      title: "Checkout",
      product,
      quantity: qty,
      totalAmount,
      user: req.session.user,
    });
  } catch (err) {
    console.error("Error loading checkout page:", err);
    res.render("error", {
      title: "Checkout Error",
      message: "Something went wrong while loading checkout.",
      backLink: "/products",
      backText: "Back to Products",
    });
  }
});

// =====================================================================
// POST /orders/checkout - Finalize order (single product)
// =====================================================================
router.post("/checkout", requireLogin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");
    const ordersCol = db.collection("orders");

    const user = req.session.user;

    const productId = (req.body.productId || "").trim();
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
        message: "This product is currently out of stock.",
        backLink: `/products/${product.productId}`,
        backText: "Back to Product",
      });
    }

    qty = Math.min(Math.max(qty, 1), product.stock);

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
        },
      ],
      totalAmount,
      orderStatus: "to_pay", // FIXED!
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

    // Decrease stock
    await productsCol.updateOne(
      { productId: product.productId },
      { $inc: { stock: -qty } }
    );

    res.render("success", {
      title: "Order Placed",
      message: `Your order <strong>${orderDoc.orderId}</strong> has been placed successfully.`,
      backLink: "/orders",
      backText: "View My Orders",
    });
  } catch (err) {
    console.error("Error during checkout:", err);
    res.render("error", {
      title: "Checkout Error",
      message: "Something went wrong while placing your order.",
      backLink: "/products",
      backText: "Back to Products",
    });
  }
});

// =====================================================================
// GET /orders - Customer order list
// =====================================================================
router.get("/", requireLogin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const ordersCol = db.collection("orders");

    const orders = await ordersCol
      .find({ userId: req.session.user.userId })
      .sort({ createdAt: -1 })
      .toArray();

    res.render("orders-list", {
      title: "My Orders",
      orders,
      user: req.session.user,
    });
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.render("error", {
      title: "Orders Error",
      message: "Something went wrong while fetching your orders.",
      backLink: "/users/dashboard",
      backText: "Back to Dashboard",
    });
  }
});

// =====================================================================
// GET /orders/:orderId - Customer order details
// =====================================================================
router.get("/:orderId", requireLogin, async (req, res) => {
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
    console.error("Error fetching order detail:", err);
    res.render("error", {
      title: "Order Error",
      message: "Something went wrong while loading order details.",
      backLink: "/orders",
      backText: "Back to Orders",
    });
  }});

module.exports = router;
