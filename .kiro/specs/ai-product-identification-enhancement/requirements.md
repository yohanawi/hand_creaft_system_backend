# Requirements Document

## Introduction

This document specifies the requirements for enhancing the AI Product Identification module in a Handcrafted Jewelry E-commerce system. The enhancement builds upon an existing implementation that uses MobileNetV2 for visual product search, improving integration robustness, error handling, performance, accuracy, and user experience across the Python AI service, Node.js backend, and React Native frontend.

## Glossary

- **AI_Service**: Python Flask service running on port 5001 that extracts 1280-dimensional feature vectors from product images using MobileNetV2
- **Backend**: Node.js/Express server that manages product catalog, coordinates AI indexing, and handles visual search requests
- **Frontend**: React Native (Expo) mobile application that provides the user interface for AI-powered visual search
- **Feature_Vector**: 1280-dimensional L2-normalized embedding extracted from product images by MobileNetV2
- **Product_Index**: MongoDB collection of products with extracted feature vectors ready for similarity matching
- **Visual_Search**: Process of finding visually similar products by comparing feature vectors using cosine similarity
- **Indexing**: Process of extracting and storing feature vectors for products in the catalog
- **Health_Check**: Diagnostic endpoint that reports service availability and readiness status
- **Cosine_Similarity**: Mathematical measure (0 to 1) of similarity between two feature vectors
- **Image_Preprocessing**: EXIF-aware transformation, alpha-channel handling, and 224x224 cropping applied before feature extraction
- **Batch_Processing**: Indexing multiple products in a single operation with progress tracking
- **Auto_Indexing**: Automatic feature extraction triggered when product images are added or modified
- **Service_Unavailability**: State where AI_Service cannot be reached or returns errors
- **Indexing_Failure**: Condition where feature extraction fails for a specific product
- **Stale_Features**: Feature vectors that no longer match the current product image signature

## Requirements

### Requirement 1: AI Service Health Monitoring

**User Story:** As a system administrator, I want real-time health monitoring of the AI service, so that I can quickly identify and resolve service availability issues.

#### Acceptance Criteria

1. THE AI_Service SHALL expose a /health endpoint that returns service status, model information, and feature vector dimensions
2. WHEN the /health endpoint is queried, THE AI_Service SHALL respond within 2 seconds
3. THE Backend SHALL query AI_Service health status and return combined health metrics including catalog indexing statistics
4. WHEN AI_Service is unreachable, THE Backend SHALL return a health response indicating service unavailability with error details
5. THE Frontend SHALL display AI service status including model name, indexed product count, and indexing coverage percentage
6. THE Frontend SHALL provide a manual refresh button for updating AI service health status
7. WHEN health status indicates service unavailability, THE Frontend SHALL display a warning message with troubleshooting guidance

### Requirement 2: Robust Feature Extraction

**User Story:** As a developer, I want reliable feature extraction from product images, so that the system handles various image formats and quality levels without failures.

#### Acceptance Criteria

1. WHEN an image is uploaded to /extract endpoint, THE AI_Service SHALL validate the image size does not exceed 8MB
2. IF an image exceeds the maximum size, THEN THE AI_Service SHALL return a 400 error with a descriptive message
3. THE AI_Service SHALL handle EXIF orientation metadata and automatically rotate images to correct orientation
4. WHEN an image contains an alpha channel (RGBA or LA), THE AI_Service SHALL composite it onto a white background before processing
5. THE AI_Service SHALL resize and crop images to 224x224 pixels using LANCZOS resampling
6. THE AI_Service SHALL apply MobileNetV2 preprocessing to normalized images before feature extraction
7. THE AI_Service SHALL extract 1280-dimensional feature vectors and apply L2 normalization
8. IF feature extraction produces a zero-length vector, THEN THE AI_Service SHALL return a 500 error with a descriptive message
9. WHEN feature extraction succeeds, THE AI_Service SHALL return features array, feature size, normalization status, and model name

### Requirement 3: URL-Based Feature Extraction

**User Story:** As a backend developer, I want to extract features from image URLs, so that I can index products with remote images without downloading them first.

#### Acceptance Criteria

1. THE AI_Service SHALL expose a /extract-url endpoint that accepts JSON payloads with a url field
2. WHEN a URL is provided, THE AI_Service SHALL download the image with a 20-second timeout
3. IF the URL returns a non-image content type, THEN THE AI_Service SHALL return a 400 error with the received content type
4. IF the URL request times out or fails, THEN THE AI_Service SHALL return a 400 error with connection details
5. WHEN URL download succeeds, THE AI_Service SHALL extract features using the same process as uploaded images
6. THE Backend SHALL attempt local file extraction before falling back to URL-based extraction for remote images

### Requirement 4: Product Indexing Management

**User Story:** As a system administrator, I want to index product images for visual search, so that customers can find visually similar products.

#### Acceptance Criteria

1. THE Backend SHALL provide an endpoint to index a single product by ID
2. WHEN a product is indexed, THE Backend SHALL extract features from the product's thumbnail image or first image in the images array
3. IF a product has no images, THEN THE Backend SHALL return a 400 error and skip indexing
4. THE Backend SHALL store extracted features in the Product_Index with featuresIndexed flag set to true
5. THE Backend SHALL store an image signature (featuresImageSignature) to detect when images change
6. WHEN a product's image changes, THE Backend SHALL clear existing features and set featuresIndexed to false
7. THE Backend SHALL provide an endpoint to bulk-index all active products with images
8. WHEN bulk indexing is requested, THE Backend SHALL process products sequentially and return counts for indexed, skipped, and failed products
9. THE Backend SHALL skip products that already have fresh features matching the current image signature
10. IF indexing fails for a product, THEN THE Backend SHALL log the error and continue processing remaining products

### Requirement 5: Automatic Index Maintenance

**User Story:** As a product manager, I want product indexes to update automatically when images change, so that visual search results remain accurate without manual intervention.

#### Acceptance Criteria

1. WHEN a product's thumbnailImage field is modified, THE Backend SHALL clear existing features and mark the product for re-indexing
2. WHEN a product's images array is modified, THE Backend SHALL clear existing features and mark the product for re-indexing
3. THE Backend SHALL queue automatic re-indexing in the background after image changes
4. IF automatic re-indexing fails, THEN THE Backend SHALL log the error without blocking the product save operation
5. THE Backend SHALL detect stale features by comparing featuresImageSignature with the current image signature
6. WHEN stale features are detected during search, THE Backend SHALL exclude the product from results

### Requirement 6: Visual Similarity Search

**User Story:** As a customer, I want to upload a photo and find visually similar jewelry products, so that I can discover items matching my style preferences.

#### Acceptance Criteria

1. THE Frontend SHALL provide an image upload interface with gallery and camera options
2. WHEN a user uploads an image, THE Frontend SHALL send it to the Backend visual search endpoint as multipart/form-data
3. THE Backend SHALL extract features from the uploaded image using AI_Service
4. IF AI_Service is unavailable, THEN THE Backend SHALL return a 503 error with service status information
5. THE Backend SHALL load all indexed products with features from Product_Index
6. THE Backend SHALL calculate cosine similarity between the query features and each product's features
7. THE Backend SHALL filter products with similarity scores below a minimum threshold of 0.18
8. THE Backend SHALL rank products by similarity score in descending order
9. WHEN multiple products have identical scores, THE Backend SHALL prioritize in-stock products over out-of-stock products
10. WHEN multiple products have identical scores and stock status, THE Backend SHALL prioritize featured products
11. THE Backend SHALL return the top 12 visually similar products with their similarity scores
12. THE Frontend SHALL display visual matches with similarity percentages and match quality labels
13. THE Frontend SHALL display search completion time to provide performance feedback

### Requirement 7: Indexing Status Reporting

**User Story:** As a system administrator, I want to view indexing progress and statistics, so that I can monitor catalog readiness for visual search.

#### Acceptance Criteria

1. THE Backend SHALL provide an endpoint that returns indexing statistics
2. THE Backend SHALL calculate total active products, indexed products, and pending products
3. THE Backend SHALL calculate the count of products with images and products missing images
4. THE Backend SHALL calculate indexing completion percentage as (indexed / total) \* 100
5. THE Backend SHALL determine readiness status as true when at least one product is indexed
6. THE Backend SHALL include AI_Service health status in the indexing status response
7. THE Backend SHALL return a sample of up to 8 pending products with their IDs, names, SKUs, and images
8. THE Frontend SHALL display indexing statistics including total, indexed, pending, and completion percentage
9. THE Frontend SHALL display a visual indicator (color-coded) for indexing readiness status

### Requirement 8: Error Handling and Recovery

**User Story:** As a user, I want clear error messages and recovery guidance when visual search fails, so that I understand what went wrong and how to proceed.

#### Acceptance Criteria

1. WHEN AI_Service is unreachable, THE Frontend SHALL display a warning message indicating the service is offline
2. THE Frontend SHALL provide troubleshooting guidance suggesting to check if the Python service is running on port 5001
3. WHEN no products are indexed, THE Backend SHALL return a message indicating indexing is required
4. THE Frontend SHALL display an informational message when catalog indexing is incomplete
5. WHEN image upload fails validation, THE Frontend SHALL display the specific validation error from AI_Service
6. WHEN feature extraction fails, THE Backend SHALL clean up temporary uploaded files before returning an error
7. IF visual search returns no matches, THEN THE Frontend SHALL display a message suggesting to try a different image or adjust filters
8. THE Frontend SHALL automatically refresh AI service health status after a visual search failure
9. WHEN indexing fails for a product, THE Backend SHALL include the product ID, name, and error message in the bulk indexing response
10. THE Backend SHALL limit error lists to 20 entries to prevent response payload bloat

### Requirement 9: Performance Optimization

**User Story:** As a developer, I want optimized visual search performance, so that users receive results quickly even with large product catalogs.

#### Acceptance Criteria

1. THE AI_Service SHALL preload the MobileNetV2 model on startup unless AI_SERVICE_PRELOAD_MODEL is set to false
2. THE Backend SHALL use MongoDB lean queries when loading products for similarity comparison
3. THE Backend SHALL exclude the features array from normal product queries using select: false in the schema
4. THE Backend SHALL only include features when explicitly requested with select('+features')
5. THE Backend SHALL populate only essential category and subcategory fields (name) during visual search
6. WHEN calculating similarity scores, THE Backend SHALL filter out products with zero or invalid similarity scores
7. THE Backend SHALL limit visual search results to a maximum of 12 products
8. THE Frontend SHALL use deferred values for search query state to prevent excessive re-renders
9. THE Frontend SHALL use React.useMemo for expensive computations like filtering and sorting
10. THE Frontend SHALL display loading indicators during feature extraction and similarity calculation

### Requirement 10: Image Quality and Preprocessing

**User Story:** As a system architect, I want consistent image preprocessing, so that feature extraction produces reliable and comparable embeddings.

#### Acceptance Criteria

1. THE AI_Service SHALL detect and apply EXIF orientation tags using ImageOps.exif_transpose
2. WHEN an image has RGBA or LA color mode, THE AI_Service SHALL create a white background and composite the image
3. THE AI_Service SHALL convert all images to RGB color mode before processing
4. THE AI_Service SHALL use ImageOps.fit with LANCZOS resampling to resize images to 224x224 pixels
5. THE AI_Service SHALL center-crop images at (0.5, 0.5) during the fit operation
6. THE AI_Service SHALL apply MobileNetV2-specific preprocessing (scaling to [-1, 1] range)
7. THE AI_Service SHALL expand image dimensions to create a batch of size 1 before model prediction
8. THE Backend SHALL resolve local file paths for images stored in the uploads directory
9. THE Backend SHALL support both absolute paths and relative paths starting with "uploads/"
10. THE Backend SHALL validate that local image files exist before attempting feature extraction

### Requirement 11: Catalog Integration

**User Story:** As a product manager, I want visual search to respect product status and availability, so that customers only see active and available products.

#### Acceptance Criteria

1. THE Backend SHALL only index products with status set to "active"
2. THE Backend SHALL exclude archived products (isArchived: true) from indexing
3. THE Backend SHALL only include active, non-archived products in visual search results
4. THE Backend SHALL filter products by featuresIndexed: true when loading candidates for similarity comparison
5. THE Backend SHALL verify feature freshness by comparing featuresImageSignature with current image signature
6. THE Backend SHALL serialize product results with essential fields: \_id, name, slug, description, price, salePrice, currency, thumbnailImage, images, category, subcategory, material, color, availabilityStatus, quantity, isFeatured, sku, tags, averageRating, reviewCount
7. THE Frontend SHALL display product availability status in visual search results
8. THE Frontend SHALL integrate visual search results with wishlist and cart functionality
9. THE Frontend SHALL provide quick view, add to cart, and toggle wishlist actions for each result
10. THE Frontend SHALL navigate to product detail pages when users tap on visual search results

### Requirement 12: Configuration and Environment

**User Story:** As a DevOps engineer, I want configurable service parameters, so that I can tune the system for different deployment environments.

#### Acceptance Criteria

1. THE AI_Service SHALL read the port number from the PORT environment variable with a default of 5001
2. THE AI_Service SHALL read maximum image size from AI_SERVICE_MAX_IMAGE_BYTES with a default of 8MB
3. THE AI_Service SHALL read URL download timeout from AI_SERVICE_URL_TIMEOUT_SECONDS with a default of 20 seconds
4. THE AI_Service SHALL read model preloading preference from AI_SERVICE_PRELOAD_MODEL with a default of true
5. THE Backend SHALL read AI service URL from AI_SERVICE_URL environment variable with a default of http://localhost:5001
6. THE Backend SHALL use a 60-second timeout for feature extraction requests to AI_Service
7. THE Backend SHALL use a 10-second timeout for health check requests to AI_Service
8. THE AI_Service SHALL enable CORS to allow cross-origin requests from the Frontend
9. THE AI_Service SHALL log feature extraction operations at INFO level
10. THE AI_Service SHALL log errors at ERROR level with descriptive messages

### Requirement 13: Frontend User Experience

**User Story:** As a customer, I want an intuitive and responsive visual search interface, so that I can easily find products matching my inspiration images.

#### Acceptance Criteria

1. THE Frontend SHALL request gallery permissions before allowing image uploads from the photo library
2. THE Frontend SHALL request camera permissions before allowing photo capture
3. IF permissions are denied, THEN THE Frontend SHALL display a toast message explaining why the permission is needed
4. THE Frontend SHALL display the selected image thumbnail with a clear button to remove it
5. THE Frontend SHALL show a loading indicator during image upload and feature extraction
6. THE Frontend SHALL display visual search results in a horizontal scrollable rail
7. THE Frontend SHALL show similarity scores as percentages with descriptive labels (e.g., "Excellent match", "Good match")
8. THE Frontend SHALL display the number of visual matches found in the results header
9. THE Frontend SHALL show search completion time in seconds
10. THE Frontend SHALL provide filter and sort controls that work alongside visual search results
11. THE Frontend SHALL display AI service status with color-coded indicators (green for ready, yellow for indexing, red for offline)
12. THE Frontend SHALL show indexing progress with metrics: indexed count, total count, and percentage complete

### Requirement 14: Testing and Validation

**User Story:** As a QA engineer, I want comprehensive test coverage for AI functionality, so that I can verify system reliability and catch regressions.

#### Acceptance Criteria

1. THE test suite SHALL include unit tests for cosine similarity calculation with known vector pairs
2. THE test suite SHALL include unit tests for image signature generation and comparison
3. THE test suite SHALL include integration tests for feature extraction from uploaded files
4. THE test suite SHALL include integration tests for feature extraction from URLs
5. THE test suite SHALL include integration tests for visual search with sample product images
6. THE test suite SHALL include tests for error handling when AI_Service is unavailable
7. THE test suite SHALL include tests for indexing products with missing images
8. THE test suite SHALL include tests for automatic index invalidation when images change
9. THE test suite SHALL include tests for bulk indexing with mixed success and failure cases
10. THE test suite SHALL include tests for health check endpoints returning correct status information

### Requirement 15: Documentation and Deployment

**User Story:** As a developer, I want clear documentation and deployment guides, so that I can set up and maintain the AI product identification system.

#### Acceptance Criteria

1. THE documentation SHALL include API endpoint specifications for all AI_Service endpoints
2. THE documentation SHALL include API endpoint specifications for all Backend AI search endpoints
3. THE documentation SHALL include environment variable configuration reference
4. THE documentation SHALL include deployment instructions for the Python AI_Service
5. THE documentation SHALL include instructions for installing Python dependencies from requirements.txt
6. THE documentation SHALL include instructions for running the AI_Service in development and production modes
7. THE documentation SHALL include troubleshooting guide for common issues (service unavailable, indexing failures, memory issues)
8. THE documentation SHALL include performance tuning recommendations for large catalogs
9. THE documentation SHALL include instructions for monitoring AI service health and indexing status
10. THE documentation SHALL include examples of visual search API requests and responses
