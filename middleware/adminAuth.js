// Authorization middleware: must run AFTER the auth middleware.
// Only users whose JWT contains role "admin" may continue.
export default function adminAuth(req, res, next) {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ message: "Admin access only" });
  }
}
