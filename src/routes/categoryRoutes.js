const express = require("express");
const router = express.Router();
const {
    createCategory,
    getCategories,
    getCategoryMenuTree,
    getCategoryBySlug,
    reorderCategories,
    updateCategory,
    deleteCategory,
} = require("../controllers/categoryController");

const { protect, admin } = require("../middlewares/authMiddleware");

// Admin Only
router.post("/", protect, admin, createCategory);
router.put('/reorder', protect, admin, reorderCategories);
router.put("/:id", protect, admin, updateCategory);
router.delete("/:id", protect, admin, deleteCategory);

// Public
router.get("/", getCategories);
router.get("/menu-tree", getCategoryMenuTree);
router.get("/:slug", getCategoryBySlug);

module.exports = router;