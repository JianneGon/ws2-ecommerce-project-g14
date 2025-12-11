// middlewares/auth.js

function isAuthenticated(req, res, next) {
  if (!req.session.user) {
    return res.status(403).render("error", {
      title: "Access Denied",
      message: "You must be logged in to access this page.",
      backLink: "/users/login",
      backText: "Back to Login",
    });
  }
  next();
}

function isAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(403).render("error", {
      title: "Access Denied",
      message: "You must be logged in to access admin pages.",
      backLink: "/users/login",
      backText: "Back to Login",
    });
  }

  if (req.session.user.role !== "admin") {
    return res.status(403).render("error", {
      title: "Access Denied",
      message: "Admins only can access this page.",
      backLink: "/",
      backText: "Back to Home",
    });
  }

  next();
}

// NEW: Prevent admin from accessing customer-only routes
function blockAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === "admin") {
    return res.redirect("/users/dashboard");   // or "/admin/orders"
  }
  next();
}

module.exports = { 
  isAuthenticated, 
  isAdmin, 
  blockAdmin 
};
