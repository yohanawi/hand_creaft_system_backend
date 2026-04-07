const express = require("express");
const router = express.Router();
const blogController = require("../controllers/blogController");
const upload = require("../middlewares/upload");
const { protect, admin } = require("../middlewares/authMiddleware");

// Nested comments routes
router.use("/:blogId/comments", require("./blogCommentRoutes"));

router.post("/", protect, admin, upload.single("image"), blogController.createBlog);
router.get("/", blogController.getBlogs);
router.get("/:slug", blogController.getBlogBySlug);
router.put("/:id", protect, admin, upload.single("image"), blogController.updateBlog);
router.delete("/:id", protect, admin, blogController.deleteBlog);

module.exports = router;