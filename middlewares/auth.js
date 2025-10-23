// middlewares/auth.js
function isAuthenticated(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/users/login?message=timeout");
  }
  next();
}

function isAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).render("error", {
      title: "Access Denied",
      message: "Admins only can access this page.",
      backLink: "/users/login",
      backText: "Back to Login",
    });
  }
  next();
}

module.exports = { isAuthenticated, isAdmin };
