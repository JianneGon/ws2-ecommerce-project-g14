console.log("✅ products.js loaded");

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { ObjectId } = require("mongodb");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { isAdmin } = require("../middlewares/auth");

// =======================
// Ensure upload folder exists
// =======================
const uploadDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("📂 Created uploads folder:", uploadDir);
}

// =======================
// Multer Setup (with security)
// =======================
const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and WEBP files allowed"));
    }
    cb(null, true);
  },
});

// =======================
// PRODUCT LIST (Public)
// =======================
router.get("/", async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    const filter = {};
    const options = {};

    // Brand
    if (req.query.brand) {
      filter.brand = { $regex: `^${req.query.brand}$`, $options: "i" };
    }

    // Budget filter
    if (req.query.budget) {
      const budget = Number(req.query.budget);
      if (!isNaN(budget)) {
        filter.price = { $lte: budget };
      }
    }

    // Sorting
    if (req.query.sort === "latest") {
      options.sort = { createdAt: -1 };
    }

    const products = await productsCol.find(filter, options).toArray();

    res.render("products-list", {
      title: "Products",
      products,
      brand: req.query.brand || null,
      user: req.session.user,
    });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.render("error", {
      title: "Products Error",
      message: "Failed to fetch products.",
      backLink: "/",
      backText: "Back to Home",
    });
  }
});

// =======================
// ADD PRODUCT (Admin Only)
// =======================
router.get("/add", isAdmin, (req, res) => {
  res.render("add-product", {
    title: "Add Product",
    user: req.session.user,
  });
});

router.post("/add", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { name, brand, description } = req.body;

    const price = Math.max(0, parseFloat(req.body.price) || 0);
    const stock = Math.max(0, parseInt(req.body.stock) || 0);

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    const newProduct = {
      productId: uuidv4(),
      name: name.trim(),
      brand: brand.trim(),
      price,
      stock,
      description,
      imageUrl: req.file
        ? "/uploads/" + req.file.filename
        : "/images/placeholder-shoe.jpg",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await productsCol.insertOne(newProduct);

    res.render("success", {
      title: "Product Added",
      message: `${name} added successfully.`,
      backLink: "/products",
      backText: "Back to Products",
    });
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

// =======================
// EDIT PRODUCT (Admin Only)
// =======================
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
        backLink: "/products",
        backText: "Back to Products",
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
      backLink: "/products",
      backText: "Back to Products",
    });
  }
});

router.post("/edit/:id", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    let product = await productsCol.findOne({ productId: req.params.id });

    if (!product && ObjectId.isValid(req.params.id)) {
      product = await productsCol.findOne({ _id: new ObjectId(req.params.id) });
    }

    if (!product) {
      return res.render("error", {
        title: "Product Not Found",
        message: "Cannot edit missing product.",
        backLink: "/products",
        backText: "Back to Products",
      });
    }

    const updateData = {
      name: req.body.name.trim(),
      brand: req.body.brand.trim(),
      price: Math.max(0, parseFloat(req.body.price) || 0),
      stock: Math.max(0, parseInt(req.body.stock) || 0),
      description: req.body.description,
      updatedAt: new Date(),
    };

    // Handle image change
    if (req.file) {
      // Delete old image
      if (
        product.imageUrl.startsWith("/uploads/") &&
        product.imageUrl !== "/images/placeholder-shoe.jpg"
      ) {
        const oldImg = path.join(__dirname, "..", "public", product.imageUrl);
        fs.unlink(oldImg, () => {});
      }

      updateData.imageUrl = "/uploads/" + req.file.filename;
    }

    await productsCol.updateOne(
      { _id: product._id },
      { $set: updateData }
    );

    res.render("success", {
      title: "Product Updated",
      message: `${updateData.name} updated successfully.`,
      backLink: "/products",
      backText: "Back to Products",
    });
  } catch (err) {
    console.error("Edit product error:", err);
    res.render("error", {
      title: "Edit Product Error",
      message: "Failed to update product.",
      backLink: "/products",
      backText: "Back to Products",
    });
  }
});

// =======================
// DELETE PRODUCT
// =======================
router.post("/delete/:id", isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    let product = await productsCol.findOne({ productId: req.params.id });

    if (!product && ObjectId.isValid(req.params.id)) {
      product = await productsCol.findOne({ _id: new ObjectId(req.params.id) });
    }

    if (!product) {
      return res.render("error", {
        title: "Product Not Found",
        message: "Cannot delete missing product.",
        backLink: "/products",
        backText: "Back to Products",
      });
    }

    // Delete image
    if (
      product.imageUrl.startsWith("/uploads/") &&
      product.imageUrl !== "/images/placeholder-shoe.jpg"
    ) {
      const imgPath = path.join(__dirname, "..", "public", product.imageUrl);
      fs.unlink(imgPath, () => {});
    }

    await productsCol.deleteOne({ _id: product._id });

    res.render("success", {
      title: "Product Deleted",
      message: "Product deleted successfully.",
      backLink: "/products",
      backText: "Back to Products",
    });
  } catch (err) {
    console.error("Delete product error:", err);
    res.render("error", {
      title: "Delete Error",
      message: "Failed to delete product.",
      backLink: "/products",
      backText: "Back to Products",
    });
  }
});

// =======================
// PRODUCT DETAIL
// =======================
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    if (!id || id.length < 6) {
      return res.redirect("/products");
    }

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

    res.render("product-detail", {
      title: product.name,
      product,
      user: req.session.user,
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
