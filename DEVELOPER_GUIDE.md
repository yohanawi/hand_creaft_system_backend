# Backend Developer Guide

> Handcrafted Jewelry E-Commerce Platform — Node.js/Express REST API

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Prerequisites](#prerequisites)
4. [Installation](#installation)
5. [Environment Configuration](#environment-configuration)
6. [Running the Project](#running-the-project)
7. [Database Seeding](#database-seeding)
8. [Project Structure](#project-structure)
9. [Architecture](#architecture)
10. [API Reference](#api-reference)
11. [Common Development Tasks](#common-development-tasks)
12. [Testing](#testing)
13. [Troubleshooting](#troubleshooting)

---

## Overview

The backend is a Node.js/Express REST API that powers the Handcrafted Jewelry E-Commerce Platform. It handles:

- **Authentication & Authorization** — JWT-based auth with role-based access control
- **Product Catalog** — Products, categories, subcategories with image uploads
- **Orders & Payments** — Full order lifecycle with PayHere payment gateway integration
- **Seller Management** — Seller onboarding, approval workflow, payouts
- **Admin Operations** — User management, inventory, activity logs, analytics
- **Blog & Content** — Blog posts with comments and likes
- **AI Image Search** — Delegates to the AI service for visual similarity search
- **Support Tickets** — Customer support ticket system
- **Email Notifications** — Transactional emails via Nodemailer

All data is stored in MongoDB via Mongoose.

---

## Tech Stack

| Technology   | Version | Purpose                        |
| ------------ | ------- | ------------------------------ |
| Node.js      | 18+     | Runtime                        |
| Express      | 5.x     | HTTP framework                 |
| MongoDB      | 6+      | Database                       |
| Mongoose     | 9.x     | ODM                            |
| jsonwebtoken | 9.x     | JWT auth                       |
| bcrypt       | 6.x     | Password hashing               |
| Multer       | 2.x     | File uploads                   |
| Helmet       | 8.x     | Security headers               |
| CORS         | 2.x     | Cross-origin requests          |
| Morgan       | 1.x     | HTTP request logging           |
| Nodemailer   | 8.x     | Email sending                  |
| Axios        | 1.x     | HTTP client (calls AI service) |
| Slugify      | 1.x     | URL slug generation            |
| Nodemon      | 3.x     | Dev auto-reload                |

---

## Prerequisites

- **Node.js** 18 or higher — [nodejs.org](https://nodejs.org)
- **npm** 9 or higher (comes with Node.js)
- **MongoDB Atlas** account — [mongodb.com/atlas](https://www.mongodb.com/atlas) — or a local MongoDB 6+ instance
- **Git**

---

## Installation

```bash
cd "d:\Final Projects\E-Commerce Platform\System\backend"
npm install
```

---

## Environment Configuration

Copy the example file and fill in your values:

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Then edit `.env`:

```dotenv
# Server
PORT=5000

# MongoDB (MongoDB Atlas or local)
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/<dbName>?retryWrites=true&w=majority

# Auth — use a long random string (32+ characters)
JWT_SECRET=replace-with-a-long-random-secret

# Frontend origin (used for CORS)
FRONTEND_URL=http://localhost:8081

# PayHere Payment Gateway
PAYHERE_SANDBOX=true
PAYHERE_MERCHANT_ID=your-payhere-merchant-id
PAYHERE_MERCHANT_SECRET=your-payhere-merchant-secret
PAYHERE_NOTIFY_URL=http://localhost:5000/api/payments/payhere/notify
PAYHERE_CURRENCY=LKR

# Email (optional — for password reset, order confirmations)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### Variable Reference

| Variable                  | Required     | Description                          |
| ------------------------- | ------------ | ------------------------------------ |
| `PORT`                    | No           | Server port. Defaults to `5000`      |
| `MONGO_URI`               | **Yes**      | MongoDB connection string            |
| `JWT_SECRET`              | **Yes**      | Secret for signing/verifying JWTs    |
| `FRONTEND_URL`            | No           | Frontend origin for CORS             |
| `PAYHERE_SANDBOX`         | No           | `true` for sandbox, `false` for live |
| `PAYHERE_MERCHANT_ID`     | For payments | PayHere merchant ID                  |
| `PAYHERE_MERCHANT_SECRET` | For payments | PayHere merchant secret              |
| `PAYHERE_NOTIFY_URL`      | For payments | Webhook URL for payment callbacks    |
| `PAYHERE_CURRENCY`        | No           | Currency code. Defaults to `LKR`     |
| `SMTP_HOST`               | For email    | SMTP server hostname                 |
| `SMTP_PORT`               | For email    | SMTP port                            |
| `SMTP_SECURE`             | For email    | `true` for TLS (port 465)            |
| `SMTP_USER`               | For email    | SMTP username                        |
| `SMTP_PASS`               | For email    | SMTP password or app password        |

---

## Running the Project

### Development (with auto-reload)

```bash
npm run dev
```

Nodemon watches for file changes and restarts automatically.

### Production

```bash
npm start
```

The server starts on `http://localhost:5000` (or the port set in `.env`).

You should see:

```
Server running on port 5000
MongoDB Connected: <cluster-host>
```

---

## Database Seeding

Run these scripts once to populate initial data. Make sure your `MONGO_URI` is set first.

```bash
# Seed the handcrafted jewelry product catalog
npm run seed:handcraft-catalog

# Seed test users (customer, seller, admin roles)
npm run seed:auth-users

# Bootstrap the admin user (creates one if none exists)
npm run admin:bootstrap
```

---

## Project Structure

```
backend/
├── server.js                    ← Entry point
├── package.json
├── .env                         ← Your environment variables (not committed)
├── .env.example                 ← Template for .env
├── uploads/                     ← Uploaded images (served at /uploads/*)
├── tests/
│   └── aiSearch.test.js         ← AI search integration test
└── src/
    ├── app.js                   ← Express app setup
    ├── config/
    │   └── db.js                ← Mongoose connection
    ├── controllers/             ← Business logic (one file per resource)
    │   ├── activityLogController.js
    │   ├── adminController.js
    │   ├── adminSellerController.js
    │   ├── aiSearchController.js
    │   ├── authController.js
    │   ├── blogCommentController.js
    │   ├── blogController.js
    │   ├── cartController.js
    │   ├── categoryController.js
    │   ├── couponController.js
    │   ├── inventoryController.js
    │   ├── orderController.js
    │   ├── paymentController.js
    │   ├── paymentOpsController.js
    │   ├── productController.js
    │   ├── reviewController.js
    │   ├── sellerController.js
    │   ├── subcategoryController.js
    │   ├── supportController.js
    │   └── wishlistController.js
    ├── middlewares/
    │   ├── authMiddleware.js    ← JWT guards
    │   └── upload.js            ← Multer config
    ├── models/                  ← Mongoose schemas
    │   ├── ActivityLog.js
    │   ├── Blog.js
    │   ├── BlogComment.js
    │   ├── Category.js
    │   ├── Coupon.js
    │   ├── Order.js
    │   ├── Product.js
    │   ├── Review.js
    │   ├── SellerPayout.js
    │   ├── StockMovement.js
    │   ├── Subcategory.js
    │   ├── SupportTicket.js
    │   └── User.js
    ├── routes/
    │   ├── index.js             ← Mounts all routes under /api
    │   ├── adminRoutes.js
    │   ├── aiSearchRoutes.js
    │   ├── authRoutes.js
    │   ├── blogCommentRoutes.js
    │   ├── blogRoutes.js
    │   ├── cartRoutes.js
    │   ├── categoryRoutes.js
    │   ├── couponRoutes.js
    │   ├── orderRoutes.js
    │   ├── paymentRoutes.js
    │   ├── productRoutes.js
    │   ├── sellerRoutes.js
    │   ├── subcategoryRoutes.js
    │   ├── supportRoutes.js
    │   └── wishlistRoutes.js
    └── utils/
        ├── activityLogger.js    ← Logs admin/seller actions
        ├── aiSearch.js          ← Calls the AI microservice
        ├── ensureAdminUser.js   ← Admin bootstrap utility
        ├── inventory.js         ← Stock movement helpers
        ├── seedAuthUsers.js     ← Test user seeder
        └── seedHandcraftCatalog.js ← Product catalog seeder
```

---

## Architecture

### Request Flow

```
HTTP Request
    │
    ▼
Express App (src/app.js)
    │  CORS, Helmet, Morgan, JSON parser, URL-encoded parser
    │
    ▼
Static Files: /uploads/* → uploads/ directory
    │
    ▼
Routes: /api/* → src/routes/index.js
    │
    ▼
Route Handler → Auth Middleware (if protected)
    │
    ▼
Controller → Model → MongoDB
    │
    ▼
JSON Response
```

### Authentication & Authorization

Authentication uses JWT Bearer tokens. The flow:

1. Client sends `POST /api/auth/login` with credentials
2. Server returns a signed JWT
3. Client includes `Authorization: Bearer <token>` on subsequent requests
4. `protect` middleware verifies the token and attaches `req.user`

**Available middleware guards:**

```js
const {
  protect,
  admin,
  seller,
  adminOrSeller,
  optionalProtect,
} = require("../middlewares/authMiddleware");

// Any authenticated user
router.get("/profile", protect, handler);

// Admin only
router.get("/admin/stats", protect, admin, handler);

// Seller only (also checks seller is not rejected/suspended)
router.get("/seller/products", protect, seller, handler);

// Admin or seller
router.get("/inventory", protect, adminOrSeller, handler);

// Optional auth (req.user is null if no token)
router.get("/products", optionalProtect, handler);
```

### User Roles

| Role     | Description                                                  |
| -------- | ------------------------------------------------------------ |
| `user`   | Regular customer — shopping, orders, wishlist, cart, support |
| `seller` | Merchant — own products, orders, inventory, payouts          |
| `admin`  | Full access to everything                                    |

**Seller approval workflow:**

```
inactive → pending → approved
                  ↘ rejected
approved → suspended
```

### Route Namespaces

All routes are mounted under `/api`:

| Namespace            | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `/api/auth`          | Registration, login, profile, addresses, password reset |
| `/api/products`      | Product CRUD, image upload, reviews                     |
| `/api/categories`    | Category management                                     |
| `/api/subcategories` | Subcategory management                                  |
| `/api/cart`          | Shopping cart                                           |
| `/api/wishlist`      | Wishlist                                                |
| `/api/orders`        | Order placement and tracking                            |
| `/api/payments`      | PayHere payment initiation and webhooks                 |
| `/api/coupons`       | Coupon validation                                       |
| `/api/blogs`         | Blog posts and comments                                 |
| `/api/ai-search`     | AI image search                                         |
| `/api/seller`        | Seller dashboard APIs                                   |
| `/api/admin`         | Admin panel APIs                                        |
| `/api/support`       | Support tickets                                         |

### Static File Serving

Uploaded images are stored in the `uploads/` directory at the project root and served at:

```
http://localhost:5000/uploads/<filename>
```

### AI Search Integration

The `src/utils/aiSearch.js` utility communicates with the Python AI service (default: `http://localhost:5001`):

- **Indexing a product:** Sends the product image URL to `POST /extract-url`, stores the returned 1280-dim feature vector in MongoDB
- **Searching by image:** Sends the uploaded image to `POST /extract`, computes cosine similarity against all indexed product vectors, returns ranked results

---

## Common Development Tasks

### Adding a New Resource

**1. Create the model** (`src/models/MyResource.js`):

```js
const mongoose = require("mongoose");

const myResourceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("MyResource", myResourceSchema);
```

**2. Create the controller** (`src/controllers/myResourceController.js`):

```js
const MyResource = require("../models/MyResource");

exports.getAll = async (req, res) => {
  try {
    const items = await MyResource.find();
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const item = await MyResource.create(req.body);
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
```

**3. Create the routes** (`src/routes/myResourceRoutes.js`):

```js
const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middlewares/authMiddleware");
const ctrl = require("../controllers/myResourceController");

router.get("/", ctrl.getAll);
router.post("/", protect, admin, ctrl.create);

module.exports = router;
```

**4. Register in the router** (`src/routes/index.js`):

```js
router.use("/my-resource", require("./myResourceRoutes"));
```

### Adding File Upload to a Route

```js
const upload = require("../middlewares/upload");

// Single file
router.post("/upload", protect, upload.single("image"), controller.upload);

// Multiple files (max 5)
router.post("/upload", protect, upload.array("images", 5), controller.upload);
```

Access the file in the controller via `req.file` (single) or `req.files` (multiple).

### Logging Admin Activity

```js
const { logActivity } = require("../utils/activityLogger");

// Inside a controller
await logActivity({
  userId: req.user._id,
  action: "UPDATE_PRODUCT",
  resourceType: "Product",
  resourceId: product._id,
  details: { name: product.name },
});
```

### Sending Email

```js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === "true",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

await transporter.sendMail({
  from: process.env.SMTP_USER,
  to: "customer@example.com",
  subject: "Order Confirmed",
  html: "<p>Your order has been placed.</p>",
});
```

---

## Testing

```bash
# Run the AI search integration test
npm run test:ai
```

This uses Node's built-in test runner (`node --test`).

---

## Troubleshooting

### `MongooseServerSelectionError` on startup

- Check your `MONGO_URI` in `.env`
- Make sure your current IP address is whitelisted in MongoDB Atlas (Network Access)
- Verify the database user credentials

### `JWT_SECRET` not set / token errors

- Always set `JWT_SECRET` in `.env`
- Use a long random string (32+ characters)
- Never commit `.env` to version control

### Port already in use

```bash
# Find what's using port 5000
netstat -ano | findstr :5000

# Kill the process (replace PID)
taskkill /PID <PID> /F
```

Or change `PORT` in `.env`.

### Uploads not serving (404 on `/uploads/*`)

- The `uploads/` directory must exist at the **project root** (same level as `server.js`), not inside `src/`
- Create it manually if missing: `mkdir uploads`

### PayHere notifications not received in development

- `PAYHERE_NOTIFY_URL` must be publicly accessible
- Use a tunnel like [ngrok](https://ngrok.com): `ngrok http 5000`
- Set `PAYHERE_NOTIFY_URL=https://<your-ngrok-url>/api/payments/payhere/notify`

### Nodemon not restarting on changes

- Make sure `nodemon` is installed: `npm install` (it's in devDependencies)
- Check that you're running `npm run dev`, not `npm start`

### `Cannot find module` errors

- Run `npm install` to ensure all dependencies are installed
- Check for typos in `require()` paths (Node.js is case-sensitive on Linux/macOS)
