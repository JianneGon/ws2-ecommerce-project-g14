// middlewares/requireLogin.js
module.exports = function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(403).render("error", {
      title: "Access Denied",
      message: "You must be logged in to access this page.",
      backLink: "/users/login",
      backText: "Back to Login",
    });
  }
  next();
};
