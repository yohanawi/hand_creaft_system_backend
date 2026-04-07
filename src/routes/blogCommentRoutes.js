const express = require("express");

const router = express.Router({ mergeParams: true });

const {
    getBlogComments,
    createBlogComment,
    toggleLikeBlogComment,
    deleteBlogComment,
} = require("../controllers/blogCommentController");

const { protect } = require("../middlewares/authMiddleware");

// Public
router.get("/", getBlogComments);

// Authenticated
router.post("/", protect, createBlogComment);
router.post("/:commentId/like", protect, toggleLikeBlogComment);
router.delete("/:commentId", protect, deleteBlogComment);

module.exports = router;
