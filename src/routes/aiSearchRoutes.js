const express = require("express");
const router = express.Router();

const {
    searchByImage,
    getAiHealth,
    indexProduct,
    indexAllProducts,
    getIndexStatus,
} = require("../controllers/aiSearchController");

const { protect, admin } = require("../middlewares/authMiddleware");
const upload = require("../middlewares/upload");

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/health', getAiHealth);
// POST /api/ai-search/search  — upload image, get similar products
router.post("/search", upload.single("image"), searchByImage);

// ── Admin only ────────────────────────────────────────────────────────────────
// GET  /api/ai-search/index-status        — how many products are indexed
router.get("/index-status", protect, admin, getIndexStatus);

// POST /api/ai-search/index/:id           — index a single product by ID
router.post("/index/:id", protect, admin, indexProduct);

// POST /api/ai-search/index-all           — bulk index every product
router.post("/index-all", protect, admin, indexAllProducts);

module.exports = router;
