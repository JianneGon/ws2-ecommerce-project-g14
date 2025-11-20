// routes/cart.js
const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { ObjectId } = require("mongodb");
const { isAuthenticated } = require("../middlewares/auth");

// Helper: initialize empty cart in session
function initCart(req) {
  if (!req.session.cart) {
    req.session.cart = {
      items: [],       // [{ productId, name, brand, price, imageUrl, quantity, subtotal }]
      totalQty: 0,
      totalAmount: 0,
    };
  }
}

// Helper: recalc totals
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

// =======================
// GET /cart  – view cart
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
// POST /cart/add – add item
// =======================
router.post("/add", async (req, res) => {
  try {
    initCart(req);

    const { productId, quantity } = req.body;
    const qty = Math.max(1, parseInt(quantity) || 1);

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    // Support lookup by productId or _id
    let product = await productsCol.findOne({ productId });
    if (!product && ObjectId.isValid(productId)) {
      product = await productsCol.findOne({ _id: new ObjectId(productId) });
    }

    if (!product) {
      return res.status(404).render("error", {
        title: "Product Not Found",
        message: "The product you are trying to add does not exist.",
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

    const cart = req.session.cart;
    let existing = cart.items.find((item) => item.productId === product.productId);

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
        subtotal: 0,
      });
    }

    recalcCart(cart);

    // After adding to cart, go to cart page
    res.redirect("/cart");
  } catch (err) {
    console.error("Error adding to cart:", err);
    res.render("error", {
      title: "Cart Error",
      message: "Something went wrong while adding item to cart.",
      backLink: "/products",
      backText: "Back to Products",
    });
  }
});

// =======================
// POST /cart/update – change qty
// =======================
router.post("/update", async (req, res) => {
  try {
    initCart(req);
    const { productId, quantity } = req.body;
    const qty = parseInt(quantity);

    if (isNaN(qty) || qty < 1) {
      // treat as remove
      req.session.cart.items = req.session.cart.items.filter(
        (item) => item.productId !== productId
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
        (it) => it.productId === productId
      );
      if (item) {
        item.quantity = Math.min(qty, maxStock);
      }
    }

    recalcCart(req.session.cart);
    res.redirect("/cart");
  } catch (err) {
    console.error("Error updating cart:", err);
    res.render("error", {
      title: "Cart Error",
      message: "Something went wrong while updating the cart.",
      backLink: "/cart",
      backText: "Back to Cart",
    });
  }
});

// =======================
// POST /cart/remove – remove item
// =======================
router.post("/remove", (req, res) => {
  initCart(req);
  const { productId } = req.body;

  req.session.cart.items = req.session.cart.items.filter(
    (item) => item.productId !== productId
  );
  recalcCart(req.session.cart);
  res.redirect("/cart");
});

// =======================
// POST /cart/clear – remove all
// =======================
router.post("/clear", (req, res) => {
  req.session.cart = {
    items: [],
    totalQty: 0,
    totalAmount: 0,
  };
  res.redirect("/cart");
});

// =======================
// GET /cart/checkout – show checkout form
// =======================
router.get("/checkout", isAuthenticated, (req, res) => {
  initCart(req);

  if (!req.session.cart.items.length) {
    return res.render("error", {
      title: "Empty Cart",
      message: "Your cart is empty. Add items before checking out.",
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
// POST /cart/checkout – place order
// =======================
router.post("/checkout", isAuthenticated, async (req, res) => {
  try {
    initCart(req);
    const cart = req.session.cart;

    if (!cart.items.length) {
      return res.render("error", {
        title: "Empty Cart",
        message: "Your cart is empty. Add items before checking out.",
        backLink: "/products",
        backText: "Shop Products",
      });
    }

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");
    const ordersCol = db.collection("orders");

    // Re-check stock before finalizing
    for (const item of cart.items) {
      const product = await productsCol.findOne({ productId: item.productId });
      if (!product || product.stock < item.quantity) {
        return res.render("error", {
          title: "Stock Issue",
          message: `Sorry, "${item.name}" does not have enough stock available.`,
          backLink: "/cart",
          backText: "Back to Cart",
        });
      }
    }

    const { fullName, addressLine1, addressLine2, city, region, postalCode, phone } = req.body;

    const orderId = uuidv4();
    const now = new Date();
    const user = req.session.user;

    const order = {
      orderId,
      userId: user.userId,
      email: user.email,
      items: cart.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        brand: item.brand,
        price: item.price,
        quantity: item.quantity,
        subtotal: item.subtotal,
      })),
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
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    // Insert order
    await ordersCol.insertOne(order);

    // Decrease stock for each item
    for (const item of cart.items) {
      await productsCol.updateOne(
        { productId: item.productId },
        { $inc: { stock: -item.quantity } }
      );
    }

    // Clear cart
    req.session.cart = {
      items: [],
      totalQty: 0,
      totalAmount: 0,
    };

    return res.render("success", {
      title: "Order Placed",
      message: `Your order <strong>${orderId}</strong> has been placed successfully.`,
      backLink: "/orders",
      backText: "View My Orders",
    });
  } catch (err) {
    console.error("Error during checkout:", err);
    res.render("error", {
      title: "Checkout Error",
      message: "Something went wrong while placing your order.",
      backLink: "/cart",
      backText: "Back to Cart",
    });
  }
});

module.exports = router;
