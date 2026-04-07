const mongoose = require("mongoose");

const stripHtmlToText = (html) => {
    if (!html) return "";
    return String(html)
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};

const calculateReadingTime = (html) => {
    const text = stripHtmlToText(html);
    if (!text) return { minutes: 0, text: "0 min read" };
    const words = text.split(" ").filter(Boolean).length;
    const minutes = Math.max(1, Math.ceil(words / 200));
    return { minutes, text: `${minutes} min read` };
};

const blogSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },

        slug: {
            type: String,
            unique: true,
        },

        category: {
            type: String,
            trim: true,
            default: "",
        },

        description: {
            type: String, // CKEditor HTML content
            required: true,
        },

        image: {
            type: String,
        },

        views: {
            type: Number,
            default: 0,
            min: 0,
        },

        readingTimeMinutes: {
            type: Number,
            default: 0,
            min: 0,
        },

        readingTimeText: {
            type: String,
            default: "0 min read",
            trim: true,
        },

        is_popular: {
            type: Boolean,
            default: false,
        },

        author: {
            name: { type: String, required: true },
            profile_image: { type: String },
        },

        tags: [
            {
                type: String,
            },
        ],

        published_date: {
            type: Date,
            default: Date.now,
        },

        status: {
            type: String,
            enum: ["draft", "published"],
            default: "published",
        },
    },
    { timestamps: true }
);

blogSchema.pre("save", function () {
    if (this.isModified("description") || this.isNew) {
        const { minutes, text } = calculateReadingTime(this.description);
        this.readingTimeMinutes = minutes;
        this.readingTimeText = text;
    }
});

module.exports = mongoose.model("Blog", blogSchema);