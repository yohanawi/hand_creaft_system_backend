# AI Product Identification

## Overview

This workspace implements AI-powered product identification for the handcrafted jewelry catalog across three projects:

- `ai-service`: Flask + TensorFlow service that extracts 1280-dimensional MobileNetV2 embeddings.
- `backend`: Express API that manages indexing, health aggregation, and cosine-similarity search.
- `frontend`: Expo / React Native UI for customer-facing visual search and admin indexing operations.

Visual search works in four stages:

1. The frontend uploads a user image to `POST /api/ai-search/search`.
2. The backend forwards the image to the Python AI service for embedding extraction.
3. The backend compares the query embedding against indexed product embeddings using cosine similarity.
4. The frontend renders the top 12 matches with wishlist, cart, and product-detail navigation.

## Backend API

### `GET /api/ai-search/health`

Public health endpoint combining Python-service health with catalog readiness metrics.

Response fields:

- `healthy`: whether the AI service responded successfully.
- `ready`: whether at least one product is indexed.
- `serviceUrl`: configured AI service base URL.
- `model`: AI model label.
- `feature_vector_size`: embedding dimensionality.
- `catalog`: `{ total, indexed, pending, productsWithImages, productsMissingImages, percentComplete, ready }`

Example response:

```json
{
  "healthy": true,
  "ready": true,
  "serviceUrl": "http://localhost:5001",
  "status": "healthy",
  "model": "MobileNetV2 (Transfer Learning)",
  "feature_vector_size": 1280,
  "catalog": {
    "total": 42,
    "indexed": 30,
    "pending": 12,
    "productsWithImages": 36,
    "productsMissingImages": 6,
    "percentComplete": 71,
    "ready": true
  }
}
```

### `POST /api/ai-search/search`

Public visual-search endpoint.

Request:

- `Content-Type: multipart/form-data`
- file field: `image`

Behavior:

- returns `400` for invalid image payloads coming from the AI service.
- returns `503` with health context when the AI service is unavailable.
- filters candidates to active, non-archived, freshly indexed products only.
- ranks by cosine similarity descending.
- applies a minimum similarity threshold of `0.18`.
- breaks ties by in-stock status, then `isFeatured`.
- returns at most 12 matches.

Example success response:

```json
{
  "message": "Found 6 similar product(s).",
  "results": [
    {
      "product": {
        "_id": "681c9275c4c7d0f0fdb6c001",
        "name": "Moonstone Halo Ring",
        "slug": "moonstone-halo-ring",
        "price": 149,
        "salePrice": 129,
        "currency": "USD",
        "thumbnailImage": "uploads/moonstone-ring.jpg",
        "images": ["uploads/moonstone-ring.jpg"],
        "material": "Sterling Silver",
        "availabilityStatus": "in_stock",
        "quantity": 7,
        "isFeatured": true,
        "sku": "RING-001",
        "averageRating": 4.8,
        "reviewCount": 24
      },
      "score": 0.84
    }
  ],
  "total": 6
}
```

### `GET /api/ai-search/index-status`

Admin-only indexing status endpoint.

Response fields:

- `total`, `indexed`, `pending`
- `productsWithImages`, `productsMissingImages`
- `percentComplete`, `ready`
- `aiService`
- `samplePending` with up to 8 products

### `POST /api/ai-search/index/:id`

Admin-only single-product indexing endpoint.

Rules:

- only indexes active, non-archived products.
- uses `thumbnailImage` first, then the first item in `images`.
- rejects products with no image.
- stores `features`, `featuresIndexed`, and `featuresImageSignature`.

### `POST /api/ai-search/index-all`

Admin-only bulk-indexing endpoint.

Behavior:

- processes active, non-archived products sequentially.
- skips products with fresh embeddings.
- clears stale index data for products that no longer have images.
- continues on failure and caps `errors` to 20 entries.

## AI Service API

### `GET /`

Basic service heartbeat.

### `POST /extract`

Extracts a normalized embedding from an uploaded image.

Request rules:

- multipart field name must be `image`
- max payload size defaults to `8388608` bytes
- invalid files return `400`
- extractor failures return `500`

Success response:

```json
{
  "success": true,
  "features": [0.0012, -0.0081],
  "feature_size": 1280,
  "normalized": true,
  "model": "MobileNetV2"
}
```

### `POST /extract-url`

Extracts an embedding from a remote image URL.

Request body:

```json
{
  "url": "https://example.com/image.jpg"
}
```

Rules:

- uses a 20-second timeout by default.
- rejects non-image content types.
- rejects images larger than the configured max size.
- uses the same preprocessing pipeline as `/extract`.

### `GET /health`

Detailed monitoring endpoint.

Example response:

```json
{
  "status": "healthy",
  "service": "AI Feature Extraction Service",
  "model": "MobileNetV2 (Transfer Learning)",
  "endpoints": ["/extract", "/extract-url", "/health"],
  "feature_vector_size": 1280,
  "normalized_embeddings": true,
  "max_image_bytes": 8388608,
  "model_loaded": true,
  "version": "2.0.0"
}
```

## Preprocessing and Indexing Rules

- EXIF orientation is corrected with `ImageOps.exif_transpose`.
- RGBA / LA images are composited onto a white background.
- all images are converted to RGB.
- images are resized to `224x224` with centered `ImageOps.fit(..., LANCZOS)`.
- MobileNetV2 preprocessing scales the input before inference.
- output embeddings are L2-normalized.
- product embeddings are considered fresh only when:
  - `featuresIndexed === true`
  - `features.length > 0`
  - `featuresImageSignature` matches the current primary image
- when `thumbnailImage` or `images` changes, the backend clears stale features and queues a background reindex.

## Configuration

### Backend

- `AI_SERVICE_URL` default: `http://localhost:5001`

### AI service

- `PORT` default: `5001`
- `AI_SERVICE_MAX_IMAGE_BYTES` default: `8388608`
- `AI_SERVICE_URL_TIMEOUT_SECONDS` default: `20`
- `AI_SERVICE_PRELOAD_MODEL` default: `1`

### Frontend

- `EXPO_PUBLIC_API_URL` optional override for backend origin

## Local Development

### 1. Start the AI service

```powershell
cd ai-service
pip install -r requirements.txt
python app.py
```

### 2. Start the backend

```powershell
cd backend
npm install
npm start
```

### 3. Start the frontend

```powershell
cd frontend
npm install
npx expo start
```

### 4. Validate the AI stack

```powershell
cd ai-service
python -m unittest tests.test_app
```

```powershell
cd backend
npm run test:ai
```

## Production Notes

- keep `AI_SERVICE_PRELOAD_MODEL=1` unless startup memory pressure requires lazy loading.
- run the Flask service behind a process manager or container supervisor.
- keep backend and AI service on low-latency network paths; visual search waits on both.
- prefer local product image paths under `uploads/` when possible to avoid remote download latency.

## Troubleshooting

### AI service offline

- confirm the Python service is running on port `5001`.
- check `GET /health` on the AI service directly.
- verify `AI_SERVICE_URL` in the backend environment.

### Indexing says pending forever

- confirm products are `active` and not archived.
- ensure each product has `thumbnailImage` or a first `images[]` entry.
- check whether the referenced local file exists under `backend/uploads`.
- run `POST /api/ai-search/index-all` from the admin screen or API.

### Visual search returns no matches

- verify at least one product is indexed.
- confirm the uploaded image is a supported image file and under the size limit.
- use a clearer product-focused image with less background clutter.

### Memory or startup issues in ai-service

- keep model preload enabled only when the host has enough RAM.
- scale the AI service separately from the Node.js backend.

## Monitoring

- customer-facing AI status is shown on the `/ai-search` screen.
- admin indexing operations are available on `/admin/ai-search`.
- use `GET /api/ai-search/health` for combined health + catalog metrics.
- use `GET /api/ai-search/index-status` for admin readiness and pending-sample inspection.

## Performance Notes

- backend candidate loading uses lean queries for catalog stats and index-status samples.
- the `features` field is hidden by default with `select: false` and only requested explicitly for similarity operations.
- frontend search state uses deferred values and memoized result derivation to limit re-render cost.
- bulk indexing processes products sequentially to avoid overloading the Python model process.
