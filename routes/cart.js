// routes/cart.js
const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { ObjectId } = require("mongodb");
const { isAuthenticated } = require("../middlewares/auth");

// =======================
// Helpers
// =======================

function initCart(req) {
  if (!req.session.cart) {
    req.session.cart = {
      items: [],
      totalQty: 0,
      totalAmount: 0,
    };
  }
}

function recalcCart(cart) {
  let totalQty = 0;
  let totalAmount = 0;

  cart.items.forEach((item) => {
    item.subtotal = item.price * item.quantity;
    totalQty += item.quantity;
    totalAmount += item.subtotal;
  });

  cart.totalQty = totalQty;
  cart.totalAmount = totalAmount;
}

// Save current session cart to logged-in user's document
async function persistCartToUser(req) {
  try {
    if (!req.session.user) return; // guest cart only in session

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCol = db.collection("users");

    await usersCol.updateOne(
      { userId: req.session.user.userId },
      {
        $set: {
          cart: req.session.cart,
        },
      }
    );
  } catch (err) {
    console.error("Error persisting cart to user:", err);
  }
}

// =======================
// GET /cart
// =======================
router.get("/", (req, res) => {
  initCart(req);

  res.render("cart", {
    title: "Your Cart",
    cart: req.session.cart,
    user: req.session.user,
  });
});

// =======================
// POST /cart/add  (AJAX)
// =======================
router.post("/add", async (req, res) => {
  try {
    initCart(req);

    // Prevent undefined req.body coming from Turnstile/bots
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.json({ success: false, message: "Empty request body" });
    }

    const { productId, quantity, size } = req.body;
    const qty = Math.max(1, parseInt(quantity) || 1);

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    let product = await productsCol.findOne({ productId });

    if (!product && ObjectId.isValid(productId)) {
      product = await productsCol.findOne({ _id: new ObjectId(productId) });
    }

    if (!product) {
      const msg = "Product not found.";
      if (req.xhr) return res.json({ success: false, message: msg });

      return res.status(404).render("error", {
        title: "Product Not Found",
        message: msg,
        backLink: "/products",
        backText: "Back",
      });
    }

    if (product.stock <= 0) {
      const msg = "This product is out of stock.";

      if (req.xhr) return res.json({ success: false, message: msg });

      return res.render("error", {
        title: "Out of Stock",
        message: msg,
        backLink: `/products/${product.productId}`,
        backText: "Back",
      });
    }

    const cart = req.session.cart;

    let existing = cart.items.find(
      (it) => it.productId === product.productId && it.size === size
    );

    if (existing) {
      existing.quantity = Math.min(existing.quantity + qty, product.stock);
    } else {
      cart.items.push({
        productId: product.productId,
        name: product.name,
        brand: product.brand,
        price: product.price,
        imageUrl: product.imageUrl || "/images/placeholder-shoe.jpg",
        quantity: Math.min(qty, product.stock),
        size: size || null,
        subtotal: 0,
      });
    }

    recalcCart(cart);
    await persistCartToUser(req);

    // AJAX response
    if (req.xhr || (req.headers.accept && req.headers.accept.includes("application/json"))) {
      return res.json({
        success: true,
        cartCount: cart.totalQty,
      });
    }

    // Non-AJAX fallback
    const backUrl = req.get("referer") || `/products/${product.productId}`;
    return res.redirect(backUrl);
  } catch (err) {
    console.error("Error adding to cart:", err);

    if (req.xhr) return res.json({ success: false, message: "Server error" });

    res.render("error", {
      title: "Cart Error",
      message: "Something went wrong while adding item to cart.",
      backLink: "/products",
      backText: "Back",
    });
  }
});

// =======================
// Update Cart
// =======================
router.post("/update", async (req, res) => {
  try {
    initCart(req);
    const { productId, quantity, size } = req.body;
    const qty = parseInt(quantity);

    if (isNaN(qty) || qty < 1) {
      req.session.cart.items = req.session.cart.items.filter(
        (it) => !(it.productId === productId && it.size === size)
      );
    } else {
      const db = req.app.locals.client.db(req.app.locals.dbName);
      const productsCol = db.collection("products");

      let product = await productsCol.findOne({ productId });
      if (!product && ObjectId.isValid(productId)) {
        product = await productsCol.findOne({ _id: new ObjectId(productId) });
      }

      const maxStock = product ? product.stock : qty;

      const item = req.session.cart.items.find(
        (it) => it.productId === productId && it.size === size
      );

      if (item) {
        item.quantity = Math.min(qty, maxStock);
      }
    }

    recalcCart(req.session.cart);
    await persistCartToUser(req);

    res.redirect("/cart");
  } catch (err) {
    console.error("Error updating cart:", err);
    res.render("error", {
      title: "Cart Error",
      message: "Something went wrong while updating the cart.",
      backLink: "/cart",
      backText: "Back",
    });
  }
});

// =======================
// Remove item
// =======================
router.post("/remove", async (req, res) => {
  try {
    initCart(req);
    const { productId, size } = req.body;

    req.session.cart.items = req.session.cart.items.filter(
      (it) => !(it.productId === productId && it.size === size)
    );

    recalcCart(req.session.cart);
    await persistCartToUser(req);

    res.redirect("/cart");
  } catch (err) {
    console.error("Error removing from cart:", err);
    res.render("error", {
      title: "Cart Error",
      message: "Something went wrong while removing the item.",
      backLink: "/cart",
      backText: "Back",
    });
  }
});

// =======================
// Clear cart
// =======================
router.post("/clear", async (req, res) => {
  try {
    req.session.cart = {
      items: [],
      totalQty: 0,
      totalAmount: 0,
    };

    await persistCartToUser(req);

    res.redirect("/cart");
  } catch (err) {
    console.error("Error clearing cart:", err);
    res.render("error", {
      title: "Cart Error",
      message: "Something went wrong while clearing the cart.",
      backLink: "/cart",
      backText: "Back",
    });
  }
});

// =======================
// Checkout Page
// =======================
router.get("/checkout", isAuthenticated, (req, res) => {
  initCart(req);

  if (!req.session.cart.items.length) {
    return res.render("error", {
      title: "Empty Cart",
      message: "Your cart is empty.",
      backLink: "/products",
      backText: "Shop Products",
    });
  }

  res.render("checkout", {
    title: "Checkout",
    cart: req.session.cart,
    user: req.session.user,
  });
});

// =======================
// Finalize Checkout
// =======================
router.post("/checkout", isAuthenticated, async (req, res) => {
  try {
    initCart(req);

    const cart = req.session.cart;
    if (!cart.items.length) {
      return res.render("error", {
        title: "Empty Cart",
        message: "Your cart is empty.",
        backLink: "/products",
        backText: "Shop Products",
      });
    }

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");
    const ordersCol = db.collection("orders");

    for (const item of cart.items) {
      const product = await productsCol.findOne({ productId: item.productId });
      if (!product || product.stock < item.quantity) {
        return res.render("error", {
          title: "Stock Issue",
          message: `Not enough stock for: ${item.name}`,
          backLink: "/cart",
          backText: "Back to Cart",
        });
      }
    }

    const {
      fullName,
      addressLine1,
      addressLine2,
      city,
      region,
      postalCode,
      phone,
    } = req.body;

    const orderId = uuidv4();
    const now = new Date();
    const user = req.session.user;

    const order = {
      orderId,
      userId: user.userId,
      email: user.email,
      items: cart.items,
      totalQty: cart.totalQty,
      totalAmount: cart.totalAmount,
      shipping: {
        fullName,
        addressLine1,
        addressLine2,
        city,
        region,
        postalCode,
        phone,
      },
      status: "to_pay",
      createdAt: now,
      updatedAt: now,
    };

    await ordersCol.insertOne(order);

    for (const item of cart.items) {
      await productsCol.updateOne(
        { productId: item.productId },
        { $inc: { stock: -item.quantity } }
      );
    }

    // Clear cart in session + user
    req.session.cart = {
      items: [],
      totalQty: 0,
      totalAmount: 0,
    };
    await persistCartToUser(req);

    return res.render("success", {
      title: "Order Placed",
      message: `Your order <strong>${orderId}</strong> has been placed successfully.`,
      backLink: "/orders",
      backText: "View My Orders",
    });
  } catch (err) {
    console.error("Checkout error:", err);
    res.render("error", {
      title: "Checkout Error",
      message: "Something went wrong while placing your order.",
      backLink: "/cart",
      backText: "Back to Cart",
    });
  }
});

module.exports = router;
