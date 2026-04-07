const express = require("express");
const router = express.Router();

const {
    createSubcategory,
    getSubcategories,
    getSubcategoryBySlug,
    updateSubcategory,
    deleteSubcategory,
} = require("../controllers/subcategoryController");

const { protect, admin } = require("../middlewares/authMiddleware");

// Admin only
router.post("/", protect, admin, createSubcategory);
router.put("/:id", protect, admin, updateSubcategory);
router.delete("/:id", protect, admin, deleteSubcategory);

// Public
router.get("/", getSubcategories);
router.get("/:slug", getSubcategoryBySlug);

module.exports = router;
