console.log("products.js loaded");

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { ObjectId } = require("mongodb");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { isAdmin } = require("../middlewares/auth");

// =====================================================
// LESSON 22 — VALIDATION HELPER
// =====================================================
function validateProductInput(body) {
  const errors = [];

  const name = (body.name || "").trim();
  const description = (body.description || "").trim();
  const category = (body.category || "").trim();

  const priceRaw = (body.price || "").toString().trim();
  const price = Number(priceRaw);

  if (!name) errors.push("Product name is required.");
  else if (name.length < 2) errors.push("Product name must be at least 2 characters.");

  if (!description) errors.push("Description is required.");
  else if (description.length < 5) errors.push("Description must be at least 5 characters.");

  if (!priceRaw) errors.push("Price is required.");
  else if (Number.isNaN(price)) errors.push("Price must be a valid number.");
  else if (price <= 0) errors.push("Price must be greater than 0.");

  if (!category) errors.push("Category is required.");

  const formData = { name, description, price: priceRaw, category };

  return { errors, formData, priceNumber: price };
}

// =====================================================
// Ensure upload folder exists
// =====================================================
const uploadDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("📂 Created uploads folder:", uploadDir);
}

// =====================================================
// Multer Setup
// =====================================================
const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and WEBP files allowed"));
    }
    cb(null, true);
  },
});

// =====================================================
// BLOCK ADMIN FROM CUSTOMER PRODUCT PAGES
// =====================================================
router.use((req, res, next) => {
  if (req.session.user && req.session.user.role === "admin") {

    // Allow admin dashboard & admin product routes
    if (
      req.path.startsWith("/admin") ||
      req.path.startsWith("/add") ||
      req.path.startsWith("/edit") ||
      req.path.startsWith("/delete")
    ) {
      return next();
    }

    // Block admin from customer product listing & product details
    if (req.path === "/" || !req.path.startsWith("/admin")) {
      return res.redirect("/products/admin/products");
    }
  }

  next();
});

// =====================================================
// PUBLIC PRODUCT LIST (/products)
// =====================================================
router.get("/", async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    // ---------------------------------------------
    // Filter setup
    // ---------------------------------------------
    const filter = {};

    // Search by name
    const name = (req.query.name || "").trim();
    if (name) {
      filter.name = { $regex: name, $options: "i" };
    }

    // Filter by brand
    const brand = (req.query.brand || "").trim();
    if (brand) {
      filter.brand = { $regex: brand, $options: "i" };
    }

    // Filter by budget
    const budget = req.query.budget;
    if (budget) {
      const maxPrice = Number(budget);
      if (!Number.isNaN(maxPrice)) {
        filter.price = { $lte: maxPrice };
      }
    }

    // ---------------------------------------------
    // Sorting setup (⬅ FIX INCLUDED HERE)
    // ---------------------------------------------
    const sort = req.query.sort || "";  // ALWAYS defined

    let sortOption = {};                // ALWAYS defined
    if (sort === "price_asc") {
      sortOption = { price: 1 };
    } 
    else if (sort === "price_desc") {
      sortOption = { price: -1 };
    }

    // ---------------------------------------------
    // Fetch products
    // ---------------------------------------------
    const products = await productsCol
      .find(filter)
      .sort(sortOption)
      .toArray();

    // ---------------------------------------------
    // Render page
    // ---------------------------------------------
    res.render("products-list", {
      title: "Products",
      products,
      name,
      brand,
      budget,
      sort, // <-- EJS will never error now
      user: req.session.user
    });

  } catch (err) {
    console.error(err);
    res.render("error", { 
      title: "Error", 
      message: "Failed to load products." 
    });
  }
});
// =====================================================
// REAL-TIME AJAX PRODUCT SEARCH (Admin)
// /products/admin/search
// =====================================================
router.get("/admin/search", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    const searchName = (req.query.name || "").trim();
    const searchCategory = (req.query.category || "").trim();

    const query = {};

    if (searchName) {
      query.name = { $regex: searchName, $options: "i" }; 
    }

    if (searchCategory) {
      query.category = searchCategory;
    }

    const products = await productsCol
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, products });

  } catch (err) {
    console.error("Live search error:", err);
    res.json({ success: false, message: "Search failed." });
  }
});
// =====================================================
// ADMIN PRODUCT DASHBOARD — NEW (LESSON 22)
// /admin/products
// =====================================================
router.get("/admin/products", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    const searchName = (req.query.searchName || "").trim();
    const searchCategory = (req.query.searchCategory || "").trim();

    const query = {};

    if (searchName) {
      query.name = { $regex: searchName, $options: "i" };
    }

    if (searchCategory) {
      query.category = searchCategory;
    }

    const products = await productsCol.find(query).sort({ createdAt: -1 }).toArray();

    let message = null;

    if (req.query.success === "1") {
      if (req.query.action === "created")
        message = { type: "success", text: "Product created successfully." };
      else if (req.query.action === "updated")
        message = { type: "success", text: "Product updated successfully." };
      else if (req.query.action === "deleted")
        message = { type: "success", text: "Product deleted successfully." };
    }

    if (req.query.error === "cannot_delete_used") {
      message = {
        type: "error",
        text: "Cannot delete this product because it is already used in one or more orders."
      };
    }

    res.render("admin-products", {
      title: "Admin – Products",
      products,
      message,
      searchName,
      searchCategory,
      user: req.session.user
    });

  } catch (err) {
    console.error("Admin product dashboard error:", err);
    res.status(500).send("Error loading admin products.");
  }
});

// =====================================================
// ADD PRODUCT (Admin)
// /products/add
// =====================================================
router.get("/add", isAdmin, (req, res) => {
  res.render("add-product", {
    title: "Add Product",
    user: req.session.user,
    formData: null,
    errors: []
  });
});

router.post("/add", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { errors, formData, priceNumber } = validateProductInput(req.body);

    if (errors.length > 0) {
      return res.status(400).render("add-product", {
        title: "Add Product",
        errors,
        formData,
        user: req.session.user,
      });
    }

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    let formattedSizes = [];
    if (req.body.sizes) {
      formattedSizes = Object.values(req.body.sizes).map((s) => ({
        label: s.label,
        stock: Number(s.stock) || 0,
      }));
    }

    const totalStock = formattedSizes.reduce((sum, s) => sum + s.stock, 0);

    const newProduct = {
      productId: uuidv4(),
      name: formData.name,
      brand: (req.body.brand || "").trim(),
      category: formData.category,
      price: priceNumber,
      stock: totalStock,
      description: formData.description,
      imageUrl: req.file ? "/uploads/" + req.file.filename : "/images/placeholder-shoe.jpg",
      sizes: formattedSizes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await productsCol.insertOne(newProduct);

    res.redirect("/products/admin/products?success=1&action=created");
  } catch (err) {
    console.error("Add product error:", err);
    res.render("error", {
      title: "Add Product Error",
      message: err.message,
      backLink: "/products",
      backText: "Back to Products",
    });
  }
});

// =====================================================
// EDIT PRODUCT (Admin)
// /products/edit/:id
// =====================================================
router.get("/edit/:id", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    let product = await productsCol.findOne({ productId: req.params.id });
    if (!product && ObjectId.isValid(req.params.id)) {
      product = await productsCol.findOne({ _id: new ObjectId(req.params.id) });
    }

    if (!product) {
      return res.status(404).render("error", {
        title: "Product Not Found",
        message: "This product does not exist.",
        backLink: "/admin/products",
        backText: "Back to Admin Products",
      });
    }

    res.render("edit-product", {
      title: "Edit Product",
      product,
      user: req.session.user,
    });
  } catch (err) {
    res.render("error", {
      title: "Edit Error",
      message: "Failed to load product.",
      backLink: "/admin/products",
      backText: "Back to Admin Products",
    });
  }
});

// =====================================================
// UPDATE PRODUCT (Admin)
// /products/edit/:id
// =====================================================
router.post("/edit/:id", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    let product = await productsCol.findOne({ productId: req.params.id });
    if (!product && ObjectId.isValid(req.params.id)) {
      product = await productsCol.findOne({ _id: new ObjectId(req.params.id) });
    }

    if (!product) {
      return res.redirect("/admin/products?error=notfound");
    }

    const { errors, formData, priceNumber } = validateProductInput(req.body);

    if (errors.length > 0) {
      return res.status(400).render("edit-product", {
        title: "Edit Product",
        product,
        errors,
        formData,
        user: req.session.user,
      });
    }

    const updateData = {
      name: formData.name,
      brand: req.body.brand,
      category: formData.category,
      price: priceNumber,
      description: formData.description,
      updatedAt: new Date(),
    };

    let formattedSizes = [];
    if (req.body.sizes) {
      formattedSizes = Object.values(req.body.sizes).map((s) => ({
        label: s.label,
        stock: Number(s.stock) || 0,
      }));
    }

    updateData.sizes = formattedSizes;
    updateData.stock = formattedSizes.reduce((sum, s) => sum + s.stock, 0);

    if (req.file) {
      if (
        product.imageUrl &&
        product.imageUrl.startsWith("/uploads/") &&
        product.imageUrl !== "/images/placeholder-shoe.jpg"
      ) {
        const oldImagePath = path.join(__dirname, "..", "public", product.imageUrl);
        fs.unlink(oldImagePath, () => {});
      }
      updateData.imageUrl = "/uploads/" + req.file.filename;
    }

    await productsCol.updateOne({ _id: product._id }, { $set: updateData });

    res.redirect("/products/admin/products?success=1&action=updated");
  } catch (err) {
    console.error("Edit product error:", err);
    res.redirect("/products/admin/products?error=update_failed");
  }
});

// =====================================================
// DELETE PRODUCT (Admin)
// /products/delete/:id
// =====================================================
router.post("/delete/:id", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");
    const ordersCol = db.collection("orders");

    let product = await productsCol.findOne({ productId: req.params.id });
    if (!product && ObjectId.isValid(req.params.id)) {
      product = await productsCol.findOne({ _id: new ObjectId(req.params.id) });
    }

    if (!product) {
      return res.redirect("/products/admin/products?error=notfound");
    }

    const orderUsingProduct = await ordersCol.findOne({
      "items.productId": product.productId,
    });

    if (orderUsingProduct) {
      return res.redirect("/products/admin/products?error=cannot_delete_used");
    }

    if (
      product.imageUrl &&
      product.imageUrl.startsWith("/uploads/") &&
      product.imageUrl !== "/images/placeholder-shoe.jpg"
    ) {
      const imgPath = path.join(__dirname, "..", "public", product.imageUrl);
      fs.unlink(imgPath, () => {});
    }

    await productsCol.deleteOne({ _id: product._id });

    res.redirect("/products/admin/products?success=1&action=deleted");

  } catch (err) {
    console.error("Delete product error:", err);
    res.redirect("/products/admin/products?error=delete_failed");
  }
});

// =====================================================
// PUBLIC PRODUCT DETAIL (but admin is blocked above)
// =====================================================
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    if (!id || id.length < 6) return res.redirect("/products");

    let product = await productsCol.findOne({ productId: id });
    if (!product && ObjectId.isValid(id)) {
      product = await productsCol.findOne({ _id: new ObjectId(id) });
    }

    if (!product) {
      return res.render("error", {
        title: "Product Not Found",
        message: "This product does not exist.",
        backLink: "/products",
        backText: "Back to Products",
      });
    }

    if (!product.sizes || product.sizes.length === 0) {
      const defaultSizes = ["US 6", "US 6.5", "US 7", "US 7.5", "US 8", "US 8.5", "US 9"];
      product.sizes = defaultSizes.map((label) => ({
        label,
        stock: product.stock || 0,
      }));
    }

    let recommendations = await productsCol
      .find({
        brand: product.brand,
        productId: { $ne: product.productId },
      })
      .limit(4)
      .toArray();

    if (recommendations.length < 4) {
      const needed = 4 - recommendations.length;

      const randoms = await productsCol
        .aggregate([
          { $match: { productId: { $ne: product.productId } } },
          { $sample: { size: needed } },
        ])
        .toArray();

      recommendations = [...recommendations, ...randoms];
    }

    res.render("product-detail", {
      title: product.name,
      product,
      recommendations,
      user: req.session.user,
      shippingInfoDefault: req.app.locals.shippingInfoDefault,
      returnsInfoDefault: req.app.locals.returnsInfoDefault,
    });

  } catch (err) {
    console.error("Product detail error:", err);
    res.render("error", {
      title: "Product Error",
      message: "Failed to load product details.",
      backLink: "/products",
      backText: "Back to Products",
    });
  }
});

module.exports = router;
