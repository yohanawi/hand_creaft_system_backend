const Subcategory = require("../models/Subcategory");
const Category = require("../models/Category");
const slugify = require("slugify");

// CREATE (Admin)
exports.createSubcategory = async (req, res) => {
    try {
        const { name, description, category, image } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ message: "Name is required" });
        }

        if (!category) {
            return res.status(400).json({ message: "Category is required" });
        }

        const parentCategory = await Category.findById(category);
        if (!parentCategory) {
            return res.status(400).json({ message: "Parent category not found" });
        }

        const subcategory = await Subcategory.create({
            name,
            description,
            category,
            image: req.file?.path || image || null,
        });

        return res.status(201).json(subcategory);
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(400).json({ message: "Subcategory slug already exists" });
        }
        return res.status(500).json({ message: error.message });
    }
};

// GET ALL (Public)
// Optional: ?category=<categoryId>
exports.getSubcategories = async (req, res) => {
    try {
        const filter = {};
        if (req.query.category) {
            filter.category = req.query.category;
        }

        const subcategories = await Subcategory.find(filter)
            .populate("category")
            .sort({ createdAt: -1 });

        return res.json(subcategories);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// GET SINGLE by slug (Public)
exports.getSubcategoryBySlug = async (req, res) => {
    try {
        const subcategory = await Subcategory.findOne({ slug: req.params.slug }).populate(
            "category"
        );

        if (!subcategory) {
            return res.status(404).json({ message: "Subcategory not found" });
        }

        return res.json(subcategory);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// UPDATE (Admin)
exports.updateSubcategory = async (req, res) => {
    try {
        const subcategory = await Subcategory.findById(req.params.id);

        if (!subcategory) {
            return res.status(404).json({ message: "Subcategory not found" });
        }

        const { name, description, category, isFeatured, status, image } = req.body;

        if (typeof name === "string" && name.trim()) {
            subcategory.name = name;
            subcategory.slug = slugify(name, { lower: true });
        }

        if (typeof description !== "undefined") subcategory.description = description;

        if (typeof category !== "undefined") {
            if (!category) {
                return res.status(400).json({ message: "Category is required" });
            }
            const parentCategory = await Category.findById(category);
            if (!parentCategory) {
                return res.status(400).json({ message: "Parent category not found" });
            }
            subcategory.category = category;
        }

        if (typeof isFeatured !== "undefined") subcategory.isFeatured = isFeatured;
        if (typeof status !== "undefined") subcategory.status = status;
        if (typeof image !== "undefined") subcategory.image = image;

        const updated = await subcategory.save();
        return res.json(updated);
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(400).json({ message: "Subcategory slug already exists" });
        }
        return res.status(500).json({ message: error.message });
    }
};

// DELETE (Admin)
exports.deleteSubcategory = async (req, res) => {
    try {
        const deleted = await Subcategory.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ message: "Subcategory not found" });
        }
        return res.json({ message: "Subcategory deleted" });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
