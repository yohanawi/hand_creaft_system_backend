const mongoose = require("mongoose");
const Blog = require("../models/Blog");
const BlogComment = require("../models/BlogComment");

// GET comments for a blog (Public)
exports.getBlogComments = async (req, res) => {
    try {
        const { blogId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(blogId)) {
            return res.status(400).json({ message: "Invalid blog id" });
        }

        const comments = await BlogComment.find({ blog: blogId })
            .populate("user", "name email")
            .sort({ createdAt: -1 });

        return res.json(comments);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// CREATE comment (Authenticated user)
exports.createBlogComment = async (req, res) => {
    try {
        const { blogId } = req.params;
        const body = req.body || {};
        const { comment } = body;

        if (!mongoose.Types.ObjectId.isValid(blogId)) {
            return res.status(400).json({ message: "Invalid blog id" });
        }

        const blog = await Blog.findById(blogId);
        if (!blog) {
            return res.status(404).json({ message: "Blog not found" });
        }

        if (!comment || !String(comment).trim()) {
            return res.status(400).json({ message: "Comment is required" });
        }

        const created = await BlogComment.create({
            blog: blogId,
            user: req.user._id,
            comment: String(comment).trim(),
            likes: [],
        });

        const populated = await BlogComment.findById(created._id).populate(
            "user",
            "name email"
        );

        return res.status(201).json(populated);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// TOGGLE LIKE on a comment (Authenticated user)
exports.toggleLikeBlogComment = async (req, res) => {
    try {
        const { commentId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(commentId)) {
            return res.status(400).json({ message: "Invalid comment id" });
        }

        const comment = await BlogComment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }

        const userId = String(req.user._id);
        const existingIndex = comment.likes.findIndex((id) => String(id) === userId);

        if (existingIndex >= 0) {
            comment.likes.splice(existingIndex, 1);
        } else {
            comment.likes.push(req.user._id);
        }

        await comment.save();

        return res.json({
            message: "OK",
            liked: existingIndex < 0,
            likesCount: comment.likes.length,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// DELETE comment (Owner or Admin)
exports.deleteBlogComment = async (req, res) => {
    try {
        const { commentId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(commentId)) {
            return res.status(400).json({ message: "Invalid comment id" });
        }

        const comment = await BlogComment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }

        const isOwner = String(comment.user) === String(req.user._id);
        const isAdmin = req.user.role === "admin";

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: "Not allowed" });
        }

        await BlogComment.findByIdAndDelete(commentId);
        return res.json({ message: "Comment deleted" });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
