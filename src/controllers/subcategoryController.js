const Subcategory = require("../models/Subcategory");
const Category = require("../models/Category");
const Product = require('../models/Product');
const slugify = require("slugify");
const { logAdminActivity } = require('../utils/activityLogger');

const normalizeSubcategoryName = (value) => String(value || '').trim();

const ensureUniqueSubcategoryName = async (name, categoryId, excludeId = null) => {
    const normalizedName = normalizeSubcategoryName(name);
    if (!normalizedName || !categoryId) {
        return null;
    }

    return Subcategory.findOne({
        category: categoryId,
        name: { $regex: `^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select('_id');
};

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

        const duplicate = await ensureUniqueSubcategoryName(name, category);
        if (duplicate) {
            return res.status(400).json({ message: 'Subcategory name already exists in this category' });
        }

        const subcategory = await Subcategory.create({
            name: normalizeSubcategoryName(name),
            description,
            category,
            image: req.file?.path || image || null,
        });

        await logAdminActivity({
            req,
            action: 'create',
            resourceType: 'subcategory',
            resourceId: subcategory._id,
            resourceName: subcategory.name,
            before: null,
            after: subcategory,
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
        const before = subcategory.toObject();

        const { name, description, category, isFeatured, status, image } = req.body;

        if (typeof name === "string" && name.trim()) {
            const duplicate = await ensureUniqueSubcategoryName(name, category || subcategory.category, subcategory._id);
            if (duplicate) {
                return res.status(400).json({ message: 'Subcategory name already exists in this category' });
            }

            subcategory.name = normalizeSubcategoryName(name);
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

        await logAdminActivity({
            req,
            action: 'update',
            resourceType: 'subcategory',
            resourceId: updated._id,
            resourceName: updated.name,
            before,
            after: updated,
        });

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
        const subcategory = await Subcategory.findById(req.params.id);
        if (!subcategory) {
            return res.status(404).json({ message: "Subcategory not found" });
        }

        const linkedProducts = await Product.countDocuments({ subcategory: subcategory._id });
        if (linkedProducts > 0) {
            return res.status(400).json({ message: 'Cannot delete a subcategory that still has associated products' });
        }

        const deleted = await Subcategory.findByIdAndDelete(subcategory._id);

        await logAdminActivity({
            req,
            action: 'delete',
            resourceType: 'subcategory',
            resourceId: deleted._id,
            resourceName: deleted.name,
            before: deleted,
            after: null,
        });

        return res.json({ message: "Subcategory deleted" });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
