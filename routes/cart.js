const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { ObjectId } = require("mongodb");
const { isAuthenticated } = require("../middlewares/auth");

// =======================================
// MIDDLEWARE: Block Admin From Cart Pages
// =======================================
function blockAdmin(req, res, next) {
  if (req.session?.user?.role === "admin") {
    return res.redirect("/users/dashboard");
  }
  next();
}

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

async function persistCartToUser(req) {
  try {
    if (!req.session.user) return;

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const usersCol = db.collection("users");

    await usersCol.updateOne(
      { userId: req.session.user.userId },
      { $set: { cart: req.session.cart } }
    );
  } catch (err) {
    console.error("Error persisting cart:", err);
  }
}

// =======================
// GET /cart
// =======================
router.get("/", isAuthenticated, blockAdmin, (req, res) => {
  initCart(req);

  res.render("cart", {
    title: "Your Cart",
    cart: req.session.cart,
    user: req.session.user,
  });
});

// =======================
// POST /cart/add  (AJAX-friendly)
// =======================
router.post("/add", blockAdmin, async (req, res) => {
  const wantsJSON =
    req.headers.accept && req.headers.accept.includes("application/json");

  try {
    initCart(req);

    if (!req.body || Object.keys(req.body).length === 0) {
      if (wantsJSON) {
        return res
          .status(400)
          .json({ success: false, message: "Empty request body" });
      }
      return res.redirect("back");
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
      if (wantsJSON) {
        return res.json({ success: false, message: "Product not found." });
      }
      return res.status(404).render("error", {
        title: "Product Not Found",
        message: "Product not found.",
        backLink: "/products",
        backText: "Back",
      });
    }

    if (product.stock <= 0) {
      if (wantsJSON) {
        return res.json({
          success: false,
          message: "This product is out of stock.",
        });
      }
      return res.render("error", {
        title: "Out of Stock",
        message: "This product is out of stock.",
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

    if (wantsJSON) {
      return res.json({
        success: true,
        cartCount: cart.totalQty,
      });
    }

    const backUrl = req.get("referer") || `/products/${product.productId}`;
    return res.redirect(backUrl);
  } catch (err) {
    console.error("Error adding to cart:", err);

    if (wantsJSON) {
      return res.status(500).json({
        success: false,
        message: "Something went wrong while adding item to cart.",
      });
    }

    res.render("error", {
      title: "Cart Error",
      message: "Something went wrong while adding item to cart.",
      backLink: "/products",
      backText: "Back",
    });
  }
});

// =======================
// POST /cart/update
// =======================
router.post("/update", isAuthenticated, blockAdmin, async (req, res) => {
  const wantsJSON =
    req.headers.accept && req.headers.accept.includes("application/json");

  try {
    initCart(req);
    const { productId, quantity, size } = req.body;
    const qty = parseInt(quantity);
    const cart = req.session.cart;

    let item = cart.items.find(
      (it) => it.productId === productId && it.size === size
    );

    if (isNaN(qty) || qty < 1) {
      cart.items = cart.items.filter(
        (it) => !(it.productId === productId && it.size === size)
      );
      item = null;
    } else {
      const db = req.app.locals.client.db(req.app.locals.dbName);
      const productsCol = db.collection("products");

      let product = await productsCol.findOne({ productId });
      if (!product && ObjectId.isValid(productId)) {
        product = await productsCol.findOne({ _id: new ObjectId(productId) });
      }

      const maxStock = product ? product.stock : qty;

      if (item) {
        item.quantity = Math.min(qty, maxStock);
      }
    }

    recalcCart(cart);
    await persistCartToUser(req);

    if (wantsJSON) {
      return res.json({
        success: true,
        cartTotalQty: cart.totalQty,
        cartTotalAmount: cart.totalAmount,
        itemSubtotal: item ? item.subtotal : 0,
        itemRemoved: !item,
      });
    }

    res.redirect("/cart");
  } catch (err) {
    console.error("Error updating cart:", err);

    if (wantsJSON) {
      return res.status(500).json({
        success: false,
        message: "Something went wrong while updating the cart.",
      });
    }

    res.render("error", {
      title: "Cart Error",
      message: "Something went wrong while updating the cart.",
      backLink: "/cart",
      backText: "Back",
    });
  }
});

// =======================
// POST /cart/remove
// =======================
router.post("/remove", isAuthenticated, blockAdmin, async (req, res) => {
  const wantsJSON =
    req.headers.accept && req.headers.accept.includes("application/json");

  try {
    initCart(req);
    const { productId, size } = req.body;
    const cart = req.session.cart;

    const beforeLen = cart.items.length;

    cart.items = cart.items.filter(
      (it) => !(it.productId === productId && it.size === size)
    );

    recalcCart(cart);
    await persistCartToUser(req);

    const itemRemoved = cart.items.length < beforeLen;

    if (wantsJSON) {
      return res.json({
        success: itemRemoved,
        cartTotalQty: cart.totalQty,
        cartTotalAmount: cart.totalAmount,
        message: itemRemoved ? "Removed" : "Item not found in cart.",
      });
    }

    res.redirect("/cart");
  } catch (err) {
    console.error("Error removing from cart:", err);

    if (wantsJSON) {
      return res.status(500).json({
        success: false,
        message: "Something went wrong while removing the item.",
      });
    }

    res.render("error", {
      title: "Cart Error",
      message: "Something went wrong while removing the item.",
      backLink: "/cart",
      backText: "Back",
    });
  }
});

// =======================
// POST /cart/clear
// =======================
router.post("/clear", isAuthenticated, blockAdmin, async (req, res) => {
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
// GET /cart/checkout
// =======================
router.get("/checkout", isAuthenticated, blockAdmin, (req, res) => {
  initCart(req);

  let cart = req.session.cart;

  const selected = req.query.selected
    ? req.query.selected.split(",")
    : null;

  if (!cart.items.length) {
    return res.render("error", {
      title: "Empty Cart",
      message: "Your cart is empty.",
      backLink: "/products",
      backText: "Shop Products",
    });
  }

  if (!selected) {
    return res.render("checkout", {
      title: "Checkout",
      cart: cart,
      user: req.session.user,
    });
  }

  const filteredItems = cart.items.filter((item) =>
    selected.includes(`${item.productId}_${item.size}`)
  );

  if (!filteredItems.length) {
    return res.render("error", {
      title: "No Items Selected",
      message: "Please select at least one item to checkout.",
      backLink: "/cart",
      backText: "Back to Cart",
    });
  }

  const filteredCart = {
    items: filteredItems,
    totalQty: filteredItems.reduce((t, i) => t + i.quantity, 0),
    totalAmount: filteredItems.reduce((t, i) => t + i.subtotal, 0),
  };

  res.render("checkout", {
    title: "Checkout",
    cart: filteredCart,
    user: req.session.user,
  });
});

// =======================
// POST /cart/checkout  (UPDATED FOR OPTION A)
// =======================
router.post("/checkout", isAuthenticated, blockAdmin, async (req, res) => {
  try {
    initCart(req);

    const allItems = req.session.cart.items;

    const selected = req.body.selectedItems
      ? req.body.selectedItems.split(",")
      : null;

    let itemsToProcess = allItems;

    if (selected) {
      itemsToProcess = allItems.filter((item) =>
        selected.includes(`${item.productId}_${item.size}`)
      );
    }

    if (!itemsToProcess.length) {
      return res.render("error", {
        title: "No Items Selected",
        message: "Please select at least one item to checkout.",
        backLink: "/cart",
        backText: "Back to Cart",
      });
    }

    const tempCart = {
      items: itemsToProcess,
      totalQty: itemsToProcess.reduce((t, i) => t + i.quantity, 0),
      totalAmount: itemsToProcess.reduce((t, i) => t + i.subtotal, 0),
    };

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");
    const ordersCol = db.collection("orders");

    for (const item of tempCart.items) {
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

    const paymentMethod = (req.body.paymentMethod || "cod").toLowerCase();
    const gcashNumber = (req.body.gcashNumber || "").trim();

    const orderId = uuidv4();
    const now = new Date();
    const user = req.session.user;

    // =====================================================
    // PAYMENT LOGIC (CARD + GCASH = PAID)
    // =====================================================

let orderStatus = "to_pay";      // default
let paymentStatus = "unpaid";    // default
let paidAt = null;

// CARD PAYMENT → auto-paid (demo setup)
if (paymentMethod === "card") {
  orderStatus = "to_ship";
  paymentStatus = "paid";
  paidAt = new Date();
}

// GCASH → SHOULD NOT BE PAID YET
else if (paymentMethod === "gcash") {
  orderStatus = "to_pay";        // waiting for phone payment
  paymentStatus = "pending";     // NOT PAID YET
  paidAt = null;
}

// COD → cash on delivery
else if (paymentMethod === "cod") {
  orderStatus = "to_ship";
  paymentStatus = "unpaid";
}

    const order = {
      orderId,
      userId: user.userId,
      email: user.email,
      items: tempCart.items,
      totalQty: tempCart.totalQty,
      totalAmount: tempCart.totalAmount,
      shipping: {
        fullName,
        addressLine1,
        addressLine2,
        city,
        region,
        postalCode,
        phone,
      },

      // UPDATED VALUES
      status: orderStatus,
      paymentMethod,
      paymentStatus,
      paidAt,
      gcashNumber: paymentMethod === "gcash" ? gcashNumber : null,

      createdAt: now,
      updatedAt: now,
    };

    await ordersCol.insertOne(order);

    for (const item of tempCart.items) {
      await productsCol.updateOne(
        { productId: item.productId },
        { $inc: { stock: -item.quantity } }
      );
    }

    const selectedKeys = selected || tempCart.items.map(
      (i) => `${i.productId}_${i.size}`
    );

    req.session.cart.items = allItems.filter(
      (i) => !selectedKeys.includes(`${i.productId}_${i.size}`)
    );

    recalcCart(req.session.cart);
    await persistCartToUser(req);

    if (paymentMethod === "gcash") {
      return res.redirect(`/orders/pay/${orderId}`);
    }

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
