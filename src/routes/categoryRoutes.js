const express = require("express");
const router = express.Router();
const {
    createCategory,
    getCategories,
    getCategoryBySlug,
    updateCategory,
    deleteCategory,
} = require("../controllers/categoryController");

const { protect, admin } = require("../middlewares/authMiddleware");

// Admin Only
router.post("/", protect, admin, createCategory);
router.put("/:id", protect, admin, updateCategory);
router.delete("/:id", protect, admin, deleteCategory);

// Public
router.get("/", getCategories);
router.get("/:slug", getCategoryBySlug);

module.exports = router;