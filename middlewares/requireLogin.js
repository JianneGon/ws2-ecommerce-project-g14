// middlewares/requireLogin.js
function requireLogin(req, res, next) {
  if (!req.session.user) {
    // same behavior as isAuthenticated
    return res.redirect("/users/login?message=timeout");
  }
  next();
}

module.exports = requireLogin;
