const Category = require("../models/Category");
const slugify = require("slugify");

// CREATE
exports.createCategory = async (req, res) => {
    try {
        const { name, description, parent, image } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ message: "Name is required" });
        }

        const category = await Category.create({
            name,
            description,
            parent: parent || null,
            image: req.file?.path || image || null,
        });

        res.status(201).json(category);
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(400).json({ message: "Category slug already exists" });
        }
        res.status(500).json({ message: error.message });
    }
};

// GET ALL
exports.getCategories = async (req, res) => {
    try {
        const categories = await Category.find()
            .populate("parent")
            .sort({ createdAt: -1 });

        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET SINGLE
exports.getCategoryBySlug = async (req, res) => {
    try {
        const category = await Category.findOne({ slug: req.params.slug })
            .populate("parent");

        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.json(category);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// UPDATE
exports.updateCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        const { name, description, parent, isFeatured, status, image } = req.body;

        if (typeof name === "string" && name.trim()) {
            category.name = name;
            category.slug = slugify(name, { lower: true });
        }
        if (typeof description !== "undefined") category.description = description;
        if (typeof parent !== "undefined") category.parent = parent || null;
        if (typeof isFeatured !== "undefined") category.isFeatured = isFeatured;
        if (typeof status !== "undefined") category.status = status;
        if (typeof image !== "undefined") category.image = image;

        const updated = await category.save();

        res.json(updated);
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(400).json({ message: "Category slug already exists" });
        }
        res.status(500).json({ message: error.message });
    }
};

// DELETE
exports.deleteCategory = async (req, res) => {
    try {
        const deleted = await Category.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ message: "Category not found" });
        }
        res.json({ message: "Category deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};