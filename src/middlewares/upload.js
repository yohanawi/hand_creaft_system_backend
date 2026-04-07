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

const upload = multer({ storage });

module.exports = upload;