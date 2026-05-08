const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(process.cwd(), "uploads");
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const safeExt = path.extname(file.originalname || "");
        cb(null, Date.now() + safeExt);
    },
});

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        if (!allowedMimeTypes.has(String(file.mimetype || '').toLowerCase())) {
            cb(new Error('Only JPEG, PNG, and WebP images are supported'));
            return;
        }

        cb(null, true);
    },
});

module.exports = upload;