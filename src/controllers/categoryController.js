const Category = require("../models/Category");
const Product = require("../models/Product");
const Subcategory = require("../models/Subcategory");
const slugify = require("slugify");
const { logAdminActivity } = require('../utils/activityLogger');

const normalizeCategoryName = (value) => String(value || '').trim();

const attachCategoryCounts = async (categories) => {
    const categoryIds = categories.map((category) => category._id);

    if (categoryIds.length === 0) {
        return [];
    }

    const [productCounts, subcategoryCounts] = await Promise.all([
        Product.aggregate([
            {
                $match: {
                    category: { $in: categoryIds },
                    status: "active",
                },
            },
            {
                $group: {
                    _id: "$category",
                    count: { $sum: 1 },
                },
            },
        ]),
        Subcategory.aggregate([
            {
                $match: {
                    category: { $in: categoryIds },
                    status: "active",
                },
            },
            {
                $group: {
                    _id: "$category",
                    count: { $sum: 1 },
                },
            },
        ]),
    ]);

    const productCountMap = new Map(
        productCounts.map((entry) => [String(entry._id), entry.count])
    );
    const subcategoryCountMap = new Map(
        subcategoryCounts.map((entry) => [String(entry._id), entry.count])
    );

    return categories.map((category) => ({
        ...category.toObject(),
        productCount: productCountMap.get(String(category._id)) || 0,
        subcategoryCount: subcategoryCountMap.get(String(category._id)) || 0,
    }));
};

exports.getCategoryMenuTree = async (req, res) => {
    try {
        const categories = await Category.find({
            parent: null,
            status: 'active',
        })
            .select('_id name slug description image isFeatured displayOrder createdAt')
            .sort({ displayOrder: 1, createdAt: 1 })
            .lean();

        const categoryIds = categories.map((category) => category._id);
        const subcategories = categoryIds.length
            ? await Subcategory.find({
                category: { $in: categoryIds },
                status: 'active',
            })
                .select('_id name slug description image category isFeatured createdAt')
                .sort({ isFeatured: -1, createdAt: 1, name: 1 })
                .lean()
            : [];

        const subcategoriesByCategoryId = new Map();

        for (const subcategory of subcategories) {
            const categoryId = String(subcategory.category);
            const existing = subcategoriesByCategoryId.get(categoryId) || [];
            existing.push({
                _id: subcategory._id,
                name: subcategory.name,
                slug: subcategory.slug,
                description: subcategory.description || '',
                image: subcategory.image || null,
                isFeatured: Boolean(subcategory.isFeatured),
            });
            subcategoriesByCategoryId.set(categoryId, existing);
        }

        const menuTree = categories.map((category) => ({
            _id: category._id,
            name: category.name,
            slug: category.slug,
            description: category.description || '',
            image: category.image || null,
            isFeatured: Boolean(category.isFeatured),
            subcategoryCount: (subcategoriesByCategoryId.get(String(category._id)) || []).length,
            subcategories: subcategoriesByCategoryId.get(String(category._id)) || [],
        }));

        return res.json(menuTree);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// CREATE
exports.createCategory = async (req, res) => {
    try {
        const { name, description, parent, image } = req.body;
        const normalizedName = normalizeCategoryName(name);

        if (!normalizedName) {
            return res.status(400).json({ message: "Name is required" });
        }

        const existing = await Category.findOne({ name: { $regex: `^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }).select('_id');
        if (existing) {
            return res.status(400).json({ message: 'Category name already exists' });
        }

        const highestOrder = await Category.findOne().sort({ displayOrder: -1, createdAt: -1 }).select('displayOrder');

        const category = await Category.create({
            name: normalizedName,
            description,
            parent: parent || null,
            image: req.file?.path || image || null,
            displayOrder: Number(highestOrder?.displayOrder || 0) + 1,
        });

        await logAdminActivity({
            req,
            action: 'create',
            resourceType: 'category',
            resourceId: category._id,
            resourceName: category.name,
            before: null,
            after: category,
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
            .sort({ displayOrder: 1, createdAt: 1 });

        const categoriesWithCounts = await attachCategoryCounts(categories);

        res.json(categoriesWithCounts);
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

        const [categoryWithCounts] = await attachCategoryCounts([category]);

        res.json(categoryWithCounts);
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
        const before = category.toObject();

        const { name, description, parent, isFeatured, status, image } = req.body;

        if (typeof name === "string" && name.trim()) {
            const normalizedName = normalizeCategoryName(name);
            const existing = await Category.findOne({
                _id: { $ne: category._id },
                name: { $regex: `^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
            }).select('_id');
            if (existing) {
                return res.status(400).json({ message: 'Category name already exists' });
            }

            category.name = normalizedName;
            category.slug = slugify(normalizedName, { lower: true });
        }
        if (typeof description !== "undefined") category.description = description;
        if (typeof parent !== "undefined") {
            if (parent && String(parent) === String(category._id)) {
                return res.status(400).json({ message: 'Category cannot be its own parent' });
            }
            category.parent = parent || null;
        }
        if (typeof isFeatured !== "undefined") category.isFeatured = isFeatured;
        if (typeof status !== "undefined") category.status = status;
        if (typeof image !== "undefined") category.image = image;

        const updated = await category.save();

        await logAdminActivity({
            req,
            action: 'update',
            resourceType: 'category',
            resourceId: updated._id,
            resourceName: updated.name,
            before,
            after: updated,
        });

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
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        const [linkedProducts, linkedSubcategories] = await Promise.all([
            Product.countDocuments({ category: category._id }),
            Subcategory.countDocuments({ category: category._id }),
        ]);

        if (linkedProducts > 0 || linkedSubcategories > 0) {
            return res.status(400).json({
                message: `Cannot delete category while ${linkedProducts} product(s) and ${linkedSubcategories} subcategory(s) are still linked`,
            });
        }

        const deleted = await Category.findByIdAndDelete(category._id);

        await logAdminActivity({
            req,
            action: 'delete',
            resourceType: 'category',
            resourceId: deleted._id,
            resourceName: deleted.name,
            before: deleted,
            after: null,
        });

        res.json({ message: "Category deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.reorderCategories = async (req, res) => {
    try {
        const ids = Array.isArray(req.body.ids)
            ? req.body.ids.map((id) => String(id || '').trim()).filter(Boolean)
            : [];

        if (ids.length === 0) {
            return res.status(400).json({ message: 'ids must be a non-empty array' });
        }

        const categories = await Category.find({ _id: { $in: ids } }).select('_id name displayOrder');
        if (categories.length !== ids.length) {
            return res.status(400).json({ message: 'One or more categories were not found' });
        }

        const before = categories
            .sort((left, right) => left.displayOrder - right.displayOrder)
            .map((category) => ({ _id: category._id, name: category.name, displayOrder: category.displayOrder }));

        await Promise.all(ids.map((id, index) => Category.findByIdAndUpdate(id, { $set: { displayOrder: index + 1 } })));

        const updatedCategories = await Category.find({ _id: { $in: ids } }).select('_id name displayOrder').sort({ displayOrder: 1 });

        await logAdminActivity({
            req,
            action: 'update',
            resourceType: 'category',
            resourceName: 'Category display order',
            before,
            after: updatedCategories,
        });

        return res.json({
            message: 'Category order updated',
            categories: updatedCategories,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};