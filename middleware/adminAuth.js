// Authorization (RBAC) middleware: it answers "is this person ALLOWED?".
// It must run AFTER the auth middleware, because it reads req.user -
// the object that auth attached to the request.
//
// Flow:
//   auth      -> verifies the JWT and sets req.user
//   adminAuth -> checks req.user.role:
//                "admin"  -> next()  (continue to the route)
//                anything else -> 403 (forbidden, even if logged in)
export default function adminAuth(req, res, next) {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ message: "Admin access only" });
  }
}
