console.log("✅ products.js loaded");

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { ObjectId } = require("mongodb");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { isAdmin } = require("../middlewares/auth"); // ✅ middleware import

// =======================
// Ensure upload folder exists
// =======================
const uploadDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("📂 Created uploads folder:", uploadDir);
}

// =======================
// Multer Setup (no strict filter, accepts any file)
// =======================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // ✅ optional: 5MB max
});

// =======================
// List All Products + Filters + Sorting (public)
// =======================
router.get("/", async (req, res) => {
  try {
    console.log("\n=============================");
    console.log("📨 GET /products HIT");
    console.log("👉 Query received:", req.query);

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCollection = db.collection("products");

    const { sort, budget } = req.query;
    let filter = {};
    let options = {};

    // ===============================
    // BRAND FILTER (Homepage buttons)
    // ===============================
    if (req.query.brand) {
      filter.brand = { $regex: `^${req.query.brand}$`, $options: "i" };
      console.log("🟦 Applying brand filter:", filter.brand);
    }

    // ===============================
    // BUDGET FILTER (price <= X)
    // ===============================
    if (budget) {
      filter.price = { $lte: Number(budget) };
      console.log("💰 Applying budget filter:", filter.price);
    }

    // ===============================
    // SORTING
    // ===============================
    if (sort === "latest") {
      options.sort = { createdAt: -1 }; // newest first
      console.log("Applying sort: latest");
    }

    console.log("Final MongoDB Filter:", filter);
    console.log("Options:", options);

    const products = await productsCollection.find(filter, options).toArray();

    console.log("Products returned:", products.length);
    console.log("=============================\n");

    res.render("products-list", {
      title: "Products",
      products,
      brand: req.query.brand || null,   // 👈 added
      user: req.session.user,
    });

  } catch (err) {
    console.error("❌ Error fetching products:", err);
    res.render("error", {
      title: "Products Error",
      message: "Something went wrong while fetching products.",
      backLink: "/users/dashboard",
      backText: "Back to Dashboard",
    });
  }
});


// =======================
// Add Product (Admin only)
// =======================
router.get("/add", isAdmin, (req, res) => {
  res.render("add-product", {
    title: "Add Product",
    user: req.session.user,
  });
});

router.post("/add", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCollection = db.collection("products");

    const newProduct = {
      productId: uuidv4(),
      name: req.body.name,
      brand: req.body.brand,
      price: parseFloat(req.body.price) || 0,
      stock: parseInt(req.body.stock) || 0,
      description: req.body.description,
      imageUrl: req.file
        ? "/uploads/" + req.file.filename
        : "/images/placeholder-shoe.jpg",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await productsCollection.insertOne(newProduct);

    res.render("success", {
      title: "Product Added",
      message: `Product <strong>${newProduct.name}</strong> has been added successfully.`,
      backLink: "/products",
      backText: "Back to Products",
    });
  } catch (err) {
    console.error("Error adding product:", err);
    res.render("error", {
      title: "Add Product Error",
      message: "Something went wrong while adding product.",
      backLink: "/products",
      backText: "Back to Products",
    });
  }
});

// =======================
// Edit Product (Admin only)
// =======================
router.get("/edit/:id", isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCollection = db.collection("products");

    let product = await productsCollection.findOne({ productId: id });
    if (!product) {
      try {
        product = await productsCollection.findOne({ _id: new ObjectId(id) });
      } catch (err) {
        console.log("Not a valid ObjectId, skipping fallback");
      }
    }

    if (!product) {
      return res.status(404).render("error", {
        title: "Product Not Found",
        message: `No product found with id: ${id}`,
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
    console.error("Error fetching product for edit:", err);
    res.render("error", {
      title: "Edit Product Error",
      message: "Something went wrong while fetching product.",
      backLink: "/products",
      backText: "Back to Products",
    });
  }
});

router.post("/edit/:id", isAdmin, upload.single("image"), async (req, res) => {
  const { id } = req.params;
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCollection = db.collection("products");

    let product = await productsCollection.findOne({ productId: id });
    if (!product) {
      try {
        product = await productsCollection.findOne({ _id: new ObjectId(id) });
      } catch (err) {
        console.log("Not a valid ObjectId, skipping fallback");
      }
    }

    if (!product) {
      return res.status(404).render("error", {
        title: "Product Not Found",
        message: `No product found with id: ${id}`,
        backLink: "/products",
        backText: "Back to Products",
      });
    }

    const updatedProduct = {
      name: req.body.name,
      brand: req.body.brand,
      price: parseFloat(req.body.price) || 0,
      stock: parseInt(req.body.stock) || 0,
      description: req.body.description,
      updatedAt: new Date(),
    };

    if (req.file) {
      if (
        product.imageUrl &&
        product.imageUrl.startsWith("/uploads/") &&
        product.imageUrl !== "/images/placeholder-shoe.jpg"
      ) {
        const oldPath = path.join(
          __dirname,
          "..",
          "public",
          product.imageUrl.replace(/^\/+/, "")
        );
        fs.unlink(oldPath, (err) => {
          if (err) console.log("⚠️ Could not delete old image:", err);
          else console.log("🗑 Deleted old image:", oldPath);
        });
      }
      updatedProduct.imageUrl = "/uploads/" + req.file.filename;
    }

    await productsCollection.updateOne(
      { _id: product._id },
      { $set: updatedProduct }
    );

    res.render("success", {
      title: "Product Updated",
      message: `Product <strong>${req.body.name}</strong> has been updated successfully.`,
      backLink: "/products",
      backText: "Back to Products",
    });
  } catch (err) {
    console.error("Error updating product:", err);
    res.render("error", {
      title: "Edit Product Error",
      message: "Something went wrong while updating product.",
      backLink: "/products",
      backText: "Back to Products",
    });
  }
});

// =======================
// Delete Product (Admin only)
// =======================
router.post("/delete/:id", isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCollection = db.collection("products");

    let product = await productsCollection.findOne({ productId: id });
    if (!product) {
      try {
        product = await productsCollection.findOne({ _id: new ObjectId(id) });
      } catch (err) {
        console.log("Not a valid ObjectId");
      }
    }

    if (!product) {
      return res.status(404).render("error", {
        title: "Product Not Found",
        message: `No product found with id: ${id}`,
        backLink: "/products",
        backText: "Back to Products",
      });
    }

    if (
      product.imageUrl &&
      product.imageUrl.startsWith("/uploads/") &&
      product.imageUrl !== "/images/placeholder-shoe.jpg"
    ) {
      const imgPath = path.join(
        __dirname,
        "..",
        "public",
        product.imageUrl.replace(/^\/+/, "")
      );
      fs.unlink(imgPath, (err) => {
        if (err) console.log("⚠️ Could not delete image:", err);
        else console.log("🗑 Deleted product image:", imgPath);
      });
    }

    await productsCollection.deleteOne({ _id: product._id });

    res.render("success", {
      title: "Product Deleted",
      message: "Product has been deleted successfully.",
      backLink: "/products",
      backText: "Back to Products",
    });
  } catch (err) {
    console.error("Error deleting product:", err);
    res.render("error", {
      title: "Delete Product Error",
      message: "Something went wrong while deleting product.",
      backLink: "/products",
      backText: "Back to Products",
    });
  }
});

// =======================
// Product Detail Page (public)
// =======================
router.get("/:id", async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCollection = db.collection("products");

    let product = await productsCollection.findOne({ productId: req.params.id });
    if (!product) {
      try {
        product = await productsCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
      } catch (err) {
        console.log("Not a valid ObjectId, skipping fallback");
      }
    }

    if (!product) {
      return res.status(404).render("error", {
        title: "Product Not Found",
        message: "The product you are looking for does not exist.",
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
    console.error("Error fetching product details:", err);
    res.render("error", {
      title: "Product Error",
      message: "Something went wrong while loading product details.",
      backLink: "/products",
      backText: "Back to Products",
    });
  }
});

module.exports = router;
