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
// Multer Setup
// =======================
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

// =======================
// PRODUCT LIST (Public)
// =======================
router.get("/", async (req, res) => {
  try {
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    const filter = {};
    const options = {};

    if (req.query.brand) {
      filter.brand = { $regex: `^${req.query.brand}$`, $options: "i" };
    }

    if (req.query.budget) {
      const budget = Number(req.query.budget);
      if (!isNaN(budget)) filter.price = { $lte: budget };
    }

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
    const { name, brand, description, shippingInfo, returnsInfo } = req.body;

    const price = Math.max(0, parseFloat(req.body.price) || 0);

    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    // Build sizes from form (per-size stock)
    let formattedSizes = [];
    if (req.body.sizes) {
      formattedSizes = Object.values(req.body.sizes).map((s) => ({
        label: s.label,
        stock: Number(s.stock) || 0,
      }));
    }

    // Total stock = sum of per-size stock
    const totalStock = formattedSizes.reduce((sum, s) => sum + s.stock, 0);

    const newProduct = {
      productId: uuidv4(),
      name: name.trim(),
      brand: brand.trim(),
      price,
      stock: totalStock,
      description,
      imageUrl: req.file
        ? "/uploads/" + req.file.filename
        : "/images/placeholder-shoe.jpg",
      sizes: formattedSizes,
      shippingInfo:
        shippingInfo && shippingInfo.trim()
          ? shippingInfo.trim()
          : "Shipping usually takes 3–7 business days.",
      returnsInfo:
        returnsInfo && returnsInfo.trim()
          ? returnsInfo.trim()
          : "Returns accepted within 7 days.",
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

// =======================
// UPDATED POST EDIT (Option B)
// =======================
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

    // BASIC FIELDS
    const updateData = {
      name: req.body.name.trim(),
      brand: req.body.brand.trim(),
      price: Math.max(0, parseFloat(req.body.price) || 0),
      description: req.body.description,
      shippingInfo: req.body.shippingInfo || "",
      returnsInfo: req.body.returnsInfo || "",
      updatedAt: new Date(),
    };

    // SIZES (Option B)
    let formattedSizes = [];
    if (req.body.sizes) {
      formattedSizes = Object.values(req.body.sizes).map((s) => ({
        label: s.label,
        stock: Number(s.stock) || 0,
      }));
    }

    updateData.sizes = formattedSizes;
    updateData.stock = formattedSizes.reduce((sum, s) => sum + s.stock, 0);

    // IMAGE
    if (req.file) {
      if (
        product.imageUrl &&
        product.imageUrl.startsWith("/uploads/") &&
        product.imageUrl !== "/images/placeholder-shoe.jpg"
      ) {
        const oldImg = path.join(__dirname, "..", "public", product.imageUrl);
        fs.unlink(oldImg, () => {});
      }

      updateData.imageUrl = "/uploads/" + req.file.filename;
    }

    // SAVE
    await productsCol.updateOne({ _id: product._id }, { $set: updateData });

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
// UPDATED PRODUCT DETAIL WITH RECOMMENDATIONS
// =======================
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const db = req.app.locals.client.db(req.app.locals.dbName);
    const productsCol = db.collection("products");

    if (!id || id.length < 6) return res.redirect("/products");

    // 1️ Load the selected product
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

    // 2️ Ensure fallback sizes
    if (!product.sizes || product.sizes.length === 0) {
      const defaultSizes = [
        "US 6",
        "US 6.5",
        "US 7",
        "US 7.5",
        "US 8",
        "US 8.5",
        "US 9",
      ];

      product.sizes = defaultSizes.map((label) => ({
        label,
        stock: product.stock || 0,
      }));
    }

    // -------------------------------------------
    // ⭐ YOU MAY ALSO LIKE — BRAND BASED
    // -------------------------------------------

    // Step 1: Get 4 products with same brand except current product
    let recommendations = await productsCol
      .find({
        brand: product.brand,
        productId: { $ne: product.productId },
      })
      .limit(4)
      .toArray();

    // Step 2: If kulang ng 4 → random fallback
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

    // -------------------------------------------

    res.render("product-detail", {
      title: product.name,
      product,
      recommendations, // IMPORTANT
      user: req.session.user,
      shippingInfoDefault: req.app.locals.shippingInfoDefault,
      returnsInfoDefault: req.app.locals.returnsInfoDefault
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
