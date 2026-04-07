const Blog = require("../models/Blog");
const slugify = require("slugify");

const parseBoolean = (value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") return true;
        if (normalized === "false") return false;
    }
    return undefined;
};

const normalizeStringArray = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean);
    }

    if (typeof value === "string") {
        return value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    }

    return [];
};

/* ===============================
   CREATE BLOG
================================ */
exports.createBlog = async (req, res) => {
    try {
        const body = req.body || {};
        const {
            title,
            description,
            is_popular,
            author_name,
            author_profile_image,
            tags,
            status,
            category,
        } = body;

        if (!title || !title.trim()) {
            return res.status(400).json({ message: "Title is required" });
        }

        if (!description || !String(description).trim()) {
            return res.status(400).json({ message: "Description is required" });
        }

        if (!author_name || !author_name.trim()) {
            return res.status(400).json({ message: "Author name is required" });
        }

        const slug = slugify(title, { lower: true });

        const blog = new Blog({
            title,
            slug,
            description,
            is_popular: parseBoolean(is_popular) ?? false,
            image: req.file ? req.file.path : "",
            category: category || "",
            author: {
                name: author_name,
                profile_image: author_profile_image || "",
            },
            tags: normalizeStringArray(tags),
            status: status || undefined,
        });

        await blog.save();

        res.status(201).json({
            success: true,
            data: blog,
        });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(400).json({ message: "Blog slug already exists" });
        }
        res.status(500).json({ message: error.message });
    }
};

/* ===============================
   GET ALL BLOGS (Pagination + Search)
================================ */
exports.getBlogs = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, status, category } = req.query;

        const query = search
            ? { title: { $regex: search, $options: "i" } }
            : {};

        if (status) {
            query.status = status;
        }

        if (category) {
            query.category = category;
        }

        const blogs = await Blog.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await Blog.countDocuments(query);

        res.json({
            total,
            page: Number(page),
            pages: Math.ceil(total / limit),
            data: blogs,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/* ===============================
   GET SINGLE BLOG BY SLUG
================================ */
exports.getBlogBySlug = async (req, res) => {
    try {
        const blog = await Blog.findOneAndUpdate(
            { slug: req.params.slug },
            { $inc: { views: 1 } },
            { new: true }
        );

        if (!blog) return res.status(404).json({ message: "Blog not found" });

        res.json(blog);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/* ===============================
   UPDATE BLOG
================================ */
exports.updateBlog = async (req, res) => {
    try {
        const body = req.body || {};
        const blog = await Blog.findById(req.params.id);

        if (!blog) return res.status(404).json({ message: "Not found" });

        if (typeof body.title === "string" && body.title.trim()) {
            blog.title = body.title;
            blog.slug = slugify(body.title, { lower: true });
        }

        if (typeof body.description !== "undefined") {
            blog.description = body.description;
        }

        const isPopularParsed = parseBoolean(body.is_popular);
        if (typeof isPopularParsed !== "undefined") {
            blog.is_popular = isPopularParsed;
        }

        if (typeof body.tags !== "undefined") {
            blog.tags = normalizeStringArray(body.tags);
        }

        if (typeof body.author_name === "string" && body.author_name.trim()) {
            blog.author.name = body.author_name;
        }

        if (typeof body.author_profile_image !== "undefined") {
            blog.author.profile_image = body.author_profile_image;
        }

        if (typeof body.status !== "undefined") {
            blog.status = body.status;
        }

        if (typeof body.category !== "undefined") {
            blog.category = body.category;
        }

        if (req.file) {
            blog.image = req.file.path;
        }

        await blog.save();

        res.json({ success: true, data: blog });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(400).json({ message: "Blog slug already exists" });
        }
        res.status(500).json({ message: error.message });
    }
};

/* ===============================
   DELETE BLOG
================================ */
exports.deleteBlog = async (req, res) => {
    try {
        await Blog.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};