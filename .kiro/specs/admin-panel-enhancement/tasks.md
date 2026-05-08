# Implementation Plan: Admin Panel Enhancement

## Overview

This implementation plan breaks down the admin panel enhancement into discrete coding tasks. The enhancement includes auditing and fixing existing admin features, implementing comprehensive seller management functionality, and modernizing the UI/UX. Each task builds incrementally on previous work, with testing integrated throughout to ensure reliability.

The implementation follows a phased approach: foundation and infrastructure setup, fixing core admin functions, implementing seller management, UI/UX modernization, and advanced features. All tasks focus on code implementation, testing, and integration.

## Tasks

- [ ] 1. Set up testing infrastructure and foundational models
  - [ ] 1.1 Set up Jest testing framework and configure test environment
    - Install Jest, Supertest, and testing utilities
    - Create test database configuration
    - Set up test scripts in package.json
    - Create test helper utilities for authentication and database seeding
    - _Requirements: 28.1, 28.2_
  - [ ] 1.2 Create ActivityLog model and schema
    - Define ActivityLog schema with all required fields (user, action, resourceType, resourceId, changes, timestamp)
    - Add indexes for user, resourceType, action, and timestamp fields
    - Implement TTL index for 90-day automatic deletion
    - _Requirements: 22.1, 22.2, 22.6_
  - [ ] 1.3 Create SellerPayout model and schema
    - Define SellerPayout schema with seller reference, amount, status, orderLineItems, bankDetails
    - Add indexes for seller, status, and requestDate fields
    - Implement status enum validation (pending, approved, paid, rejected, cancelled)
    - _Requirements: 13.1, 13.2, 13.3_
  - [ ]\* 1.4 Write unit tests for ActivityLog and SellerPayout models
    - Test schema validation rules
    - Test index creation
    - Test TTL index functionality
    - Test enum validation
    - _Requirements: 28.1_

- [ ] 2. Implement activity logging service
  - [ ] 2.1 Create ActivityLogService class with logging methods
    - Implement logAction method to create activity log entries
    - Implement getActivityLogs method with filtering and pagination
    - Implement exportLogs method for CSV export
    - Extract IP address and user agent from request objects
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.7_
  - [ ] 2.2 Create activity logging middleware
    - Implement middleware to automatically log create, update, delete operations
    - Capture before and after values for update operations
    - Integrate with existing route handlers
    - _Requirements: 22.1, 22.5_
  - [ ]\* 2.3 Write integration tests for ActivityLogService
    - Test logging of various action types
    - Test filtering by user, action type, and date range
    - Test CSV export functionality
    - Test pagination
    - _Requirements: 28.2_

- [ ] 3. Fix user management functions
  - [ ] 3.1 Fix user list endpoint with pagination and search
    - Implement GET /api/admin/users with pagination support
    - Add search functionality for name and email (case-insensitive)
    - Exclude password field from response
    - Add response time optimization (< 2 seconds)
    - _Requirements: 2.1, 2.2, 2.6_
  - [ ] 3.2 Fix user update and delete endpoints
    - Implement PUT /api/admin/users/:id with validation
    - Implement DELETE /api/admin/users/:id with self-deletion prevention
    - Add email format validation
    - Integrate activity logging
    - _Requirements: 2.3, 2.4, 2.5, 2.7_
  - [ ] 3.3 Implement password reset functionality
    - Implement POST /api/admin/users/:id/reset-password
    - Hash new password with bcrypt before storage
    - Send notification email to user
    - _Requirements: 2.8_
  - [ ]\* 3.4 Write integration tests for user management endpoints
    - Test user list with pagination and search
    - Test user update with validation
    - Test self-deletion prevention
    - Test password reset
    - Test authentication and authorization
    - _Requirements: 28.2, 28.4_

- [ ] 4. Fix product management functions
  - [ ] 4.1 Fix product list endpoint with filtering
    - Implement GET /api/admin/products with pagination
    - Add filtering by status
    - Include category and seller information in response
    - Display inventory levels with low-stock warnings
    - _Requirements: 3.1, 3.2, 3.5_
  - [ ] 4.2 Fix product update and delete endpoints
    - Implement PUT /api/admin/products/:id with validation
    - Implement DELETE /api/admin/products/:id (archive instead of delete)
    - Add status change logic to hide/show products
    - Validate price values are non-negative
    - Integrate activity logging
    - _Requirements: 3.3, 3.4, 3.6, 3.7_
  - [ ]\* 4.3 Write integration tests for product management endpoints
    - Test product list with filtering
    - Test product update with validation
    - Test product archival
    - Test status changes
    - _Requirements: 28.2_

- [ ] 5. Fix order management functions
  - [ ] 5.1 Fix order list endpoint with filtering and statistics
    - Implement GET /api/admin/orders with pagination
    - Add filtering by payment status
    - Include customer and payment information
    - Calculate order statistics (total revenue, average order value)
    - _Requirements: 4.1, 4.2, 4.5_
  - [ ] 5.2 Fix order details and update endpoints
    - Implement GET /api/admin/orders/:id with complete order information
    - Implement PUT /api/admin/orders/:id/status with status transition validation
    - Add search by order number
    - Display fulfillment status for each line item
    - Integrate activity logging
    - _Requirements: 4.3, 4.4, 4.6, 4.7_
  - [ ]\* 5.3 Write integration tests for order management endpoints
    - Test order list with filtering
    - Test order statistics calculation
    - Test order status updates
    - Test order search
    - _Requirements: 28.2_

- [ ] 6. Fix category, coupon, and blog management
  - [ ] 6.1 Fix category and subcategory management endpoints
    - Implement CRUD operations for categories with unique name validation
    - Implement CRUD operations for subcategories with parent validation
    - Add deletion prevention for categories with associated products
    - Generate URL-safe slugs automatically
    - Integrate activity logging
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  - [ ] 6.2 Fix coupon management endpoints
    - Implement CRUD operations for coupons with unique code validation
    - Add expiration date validation (must be future date)
    - Validate discount percentage (0-100) and fixed amounts
    - Display coupon usage statistics
    - Support both percentage and fixed-amount discount types
    - Integrate activity logging
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_
  - [ ] 6.3 Fix blog management endpoints
    - Implement CRUD operations for blog posts with validation
    - Add publish/unpublish functionality with timestamp tracking
    - Generate SEO-friendly slugs from titles
    - Implement image upload with file type and size validation
    - Display blog statistics (views, comments)
    - Integrate activity logging
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_
  - [ ]\* 6.4 Write integration tests for category, coupon, and blog endpoints
    - Test category CRUD with validation
    - Test coupon CRUD with validation
    - Test blog CRUD with validation
    - Test slug generation
    - Test file upload validation
    - _Requirements: 28.2_

- [ ] 7. Fix support ticket and inventory management
  - [ ] 7.1 Fix support ticket management endpoints
    - Implement GET /api/admin/support-tickets with sorting by priority and date
    - Add filtering by status
    - Implement POST /api/admin/support-tickets/:id/reply with notifications
    - Implement PUT /api/admin/support-tickets/:id/status with validation
    - Add ticket assignment functionality
    - Display ticket statistics and conversation history
    - Integrate activity logging
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_
  - [ ] 7.2 Fix inventory management endpoints
    - Implement GET /api/admin/inventory/overview with total units and value
    - Implement GET /api/admin/inventory/movements with history
    - Implement POST /api/admin/inventory/restock with validation
    - Implement PUT /api/admin/inventory/adjust with negative prevention
    - Display low-stock and out-of-stock alerts
    - Auto-update product availability status
    - Integrate activity logging
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_
  - [ ]\* 7.3 Write integration tests for support and inventory endpoints
    - Test support ticket CRUD and filtering
    - Test ticket assignment and replies
    - Test inventory operations
    - Test stock level validations
    - _Requirements: 28.2_

- [ ] 8. Fix payment operations and implement analytics service
  - [ ] 8.1 Fix payment operations endpoints
    - Implement GET /api/admin/payments/overview with statistics by status
    - Display total revenue with payment method breakdown
    - Implement GET /api/admin/payments/:id with transaction details
    - Implement POST /api/admin/payments/:id/refund with validation
    - Display failed payment attempts with error details
    - Calculate platform commission and seller payouts
    - Format currency values with two decimal places
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
  - [ ] 8.2 Create AnalyticsService class
    - Implement getDashboardMetrics method for KPIs
    - Implement getSellerPerformance method with date range filtering
    - Implement getRevenueAnalytics method with trends
    - Implement getOrderAnalytics method with patterns
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_
  - [ ]\* 8.3 Write unit tests for AnalyticsService
    - Test dashboard metrics calculation
    - Test seller performance calculations
    - Test revenue analytics with date ranges
    - Test order analytics
    - Test edge cases (no data, single data point)
    - _Requirements: 28.1_

- [ ] 9. Checkpoint - Ensure all backend fixes pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement seller approval workflow
  - [ ] 10.1 Create seller application endpoints
    - Implement GET /api/admin/sellers/applications with pending applications list
    - Implement GET /api/admin/sellers/applications/:id with complete details
    - Implement POST /api/admin/sellers/applications/:id/approve to update status and grant permissions
    - Implement POST /api/admin/sellers/applications/:id/reject with rejection reason
    - Send email notifications on status changes
    - Integrate activity logging
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
  - [ ] 10.2 Add pending application count to dashboard
    - Update dashboard endpoint to include pending seller application count
    - _Requirements: 11.7_
  - [ ]\* 10.3 Write integration tests for seller approval workflow
    - Test application listing
    - Test approval process
    - Test rejection process
    - Test email notifications
    - Test authorization checks
    - _Requirements: 28.2, 28.4_

- [ ] 11. Implement seller profile management
  - [ ] 11.1 Create seller profile endpoints
    - Implement GET /api/admin/sellers with search and filtering
    - Implement GET /api/admin/sellers/:id with complete profile and performance metrics
    - Implement PUT /api/admin/sellers/:id with validation and shop slug regeneration
    - Implement POST /api/admin/sellers/:id/suspend to hide products
    - Implement POST /api/admin/sellers/:id/reactivate to restore visibility
    - Integrate activity logging
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
  - [ ]\* 11.2 Write integration tests for seller profile management
    - Test seller search and filtering
    - Test profile updates
    - Test suspension and reactivation
    - Test shop slug regeneration
    - _Requirements: 28.2_

- [ ] 12. Implement seller payout management
  - [ ] 12.1 Create payout management endpoints
    - Implement GET /api/admin/sellers/payouts with pending requests
    - Implement POST /api/admin/sellers/payouts/:id/approve to update status and record payment
    - Implement POST /api/admin/sellers/payouts/:id/reject with rejection reason
    - Calculate seller available balance from completed orders
    - Update order line items payout status when processed
    - Display payout history with transaction details
    - Add filtering by status
    - Integrate activity logging
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_
  - [ ]\* 12.2 Write integration tests for payout management
    - Test payout listing and filtering
    - Test payout approval process
    - Test payout rejection process
    - Test balance calculations
    - Test order line item updates
    - _Requirements: 28.2_

- [ ] 13. Implement seller performance tracking
  - [ ] 13.1 Add seller performance methods to AnalyticsService
    - Calculate gross sales per seller from completed orders
    - Calculate average order value per seller
    - Track product count and active product count
    - Calculate seller rating from product reviews
    - Track order fulfillment time per seller
    - Support time period filtering
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_
  - [ ] 13.2 Create seller analytics endpoint
    - Implement GET /api/admin/sellers/analytics with performance metrics
    - Support sorting by various criteria
    - Support date range filtering
    - _Requirements: 14.5, 14.7_
  - [ ]\* 13.3 Write unit tests for seller performance calculations
    - Test gross sales calculation
    - Test average order value calculation
    - Test product count tracking
    - Test rating calculation
    - Test fulfillment time tracking
    - _Requirements: 28.1_

- [ ] 14. Checkpoint - Ensure all seller management features pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Create modern dashboard UI components
  - [ ] 15.1 Create DashboardOverview component
    - Display key performance indicators (users, products, orders, revenue)
    - Add revenue and order trend charts
    - Display recent activity feed
    - Show alerts for low stock and pending applications
    - Implement responsive layout
    - Add loading indicators during data fetch
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_
  - [ ] 15.2 Create MetricCard reusable component
    - Display single metric with label and value
    - Support trend indicators (up/down arrows)
    - Add click-through navigation to detailed views
    - Apply modern styling with consistent branding
    - _Requirements: 15.1, 15.5_
  - [ ] 15.3 Create chart components (LineChart, PieChart, BarChart)
    - Implement LineChart for revenue trends
    - Implement PieChart for order status distribution
    - Implement BarChart for top products and sellers
    - Add interactive tooltips with exact values
    - Make charts responsive
    - _Requirements: 15.2, 17.1, 17.2, 17.3, 17.4, 17.5_
  - [ ]\* 15.4 Write component tests for dashboard UI
    - Test DashboardOverview rendering
    - Test MetricCard with various props
    - Test chart components with data
    - Test loading states
    - Test responsive behavior
    - _Requirements: 28.2_

- [ ] 16. Create navigation components
  - [ ] 16.1 Create Sidebar navigation component
    - Implement categorized menu sections
    - Add active section highlighting
    - Display notification badges for pending items
    - Implement collapsible behavior on mobile (< 768px)
    - Support keyboard navigation
    - _Requirements: 16.1, 16.2, 16.3, 16.6, 16.7_
  - [ ] 16.2 Create Header component
    - Add user profile dropdown
    - Add notification center with counter badge
    - Add quick search functionality
    - Add logout button
    - _Requirements: 25.4, 25.5_
  - [ ] 16.3 Create Breadcrumbs component
    - Display current location hierarchy
    - Make navigation path clickable
    - Auto-generate from route
    - _Requirements: 16.4_
  - [ ]\* 16.4 Write component tests for navigation
    - Test Sidebar rendering and interactions
    - Test Header functionality
    - Test Breadcrumbs generation
    - Test mobile responsiveness
    - _Requirements: 28.2_

- [ ] 17. Create data table components
  - [ ] 17.1 Create DataTable reusable component
    - Implement sortable column headers
    - Add pagination controls (20 rows per page)
    - Support row selection with checkboxes
    - Implement responsive card layout for mobile (< 768px)
    - Add action buttons for each row (edit, delete)
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.7_
  - [ ] 17.2 Create TableFilters component
    - Implement multi-criteria filtering
    - Add date range pickers
    - Add status dropdowns
    - Add clear all filters button
    - Display active filters with remove buttons
    - Update URL query parameters to preserve state
    - _Requirements: 20.1, 20.3, 20.4, 20.5, 20.6_
  - [ ] 17.3 Create BulkActions component
    - Support bulk status updates
    - Support bulk delete with confirmation dialog
    - Display progress indicators during operations
    - Show success/failure summary after completion
    - Add select all checkbox in header
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7_
  - [ ]\* 17.4 Write component tests for data tables
    - Test DataTable sorting and pagination
    - Test TableFilters functionality
    - Test BulkActions operations
    - Test row selection
    - Test responsive behavior
    - _Requirements: 28.2_

- [ ] 18. Create form components
  - [ ] 18.1 Create FormField reusable component
    - Support input types (text, number, email, date, select)
    - Implement inline validation with error messages
    - Add field-specific error display below fields
    - Highlight invalid fields with red borders
    - Ensure accessibility compliance
    - _Requirements: 19.1, 19.2, 19.5, 19.6_
  - [ ] 18.2 Create FormValidation utility
    - Implement client-side validation before submission
    - Validate required fields
    - Validate email format, phone format, URL format
    - Validate price ranges and date ranges
    - Display form-level error summary
    - Display success notifications after operations
    - _Requirements: 19.1, 19.2, 19.4_
  - [ ]\* 18.3 Write component tests for forms
    - Test FormField rendering and validation
    - Test FormValidation rules
    - Test error display
    - Test success notifications
    - _Requirements: 28.2, 28.3_

- [ ] 19. Create seller management UI components
  - [ ] 19.1 Create SellerApplicationList component
    - Display pending applications
    - Add quick approve/reject actions
    - Implement application detail modal
    - _Requirements: 11.2, 11.3, 11.4_
  - [ ] 19.2 Create SellerProfileView component
    - Display complete seller information
    - Add edit mode with validation
    - Show performance metrics visualization
    - Display product listing
    - _Requirements: 12.2, 12.3, 12.5_
  - [ ] 19.3 Create PayoutRequestList component
    - Display pending payout requests
    - Show seller balance calculation
    - Add approve/reject actions with reason input
    - Display payment history
    - _Requirements: 13.1, 13.2, 13.3, 13.6_
  - [ ]\* 19.4 Write component tests for seller management UI
    - Test SellerApplicationList rendering and actions
    - Test SellerProfileView functionality
    - Test PayoutRequestList operations
    - _Requirements: 28.2_

- [ ] 20. Implement search and export functionality
  - [ ] 20.1 Add search functionality to all data tables
    - Implement search inputs with 300ms debounce
    - Add real-time filtering as user types
    - Support search in user, product, order, and seller tables
    - _Requirements: 20.1, 20.2, 18.6, 27.6_
  - [ ] 20.2 Implement CSV export functionality
    - Add export buttons to all data tables
    - Include all visible columns in export
    - Apply current filters and search to exported data
    - Use UTF-8 encoding for international characters
    - Include column headers in first row
    - Support up to 10,000 rows per export
    - Trigger automatic file download
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7_
  - [ ]\* 20.3 Write integration tests for search and export
    - Test search functionality with various queries
    - Test CSV export with filters
    - Test export file format and encoding
    - _Requirements: 28.2_

- [ ] 21. Implement notifications and activity logs UI
  - [ ] 21.1 Create notification system
    - Implement real-time notifications for new orders, seller applications, and support tickets
    - Display notification counter badge in header
    - Create notification dropdown with recent notifications
    - Mark notifications as read when viewed
    - Auto-delete notifications after 7 days
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7_
  - [ ] 21.2 Create ActivityLogView component
    - Display activity logs in reverse chronological order
    - Add filtering by user, action type, and date range
    - Show before and after values for updates
    - Add CSV export functionality
    - _Requirements: 22.3, 22.4, 22.5, 22.7_
  - [ ]\* 21.3 Write component tests for notifications and activity logs
    - Test notification display and interactions
    - Test activity log filtering
    - Test activity log export
    - _Requirements: 28.2_

- [ ] 22. Implement role-based access control UI
  - [ ] 22.1 Create permission management components
    - Display only authorized menu items based on user role
    - Add permission checks before rendering sensitive actions
    - Create admin user management interface for super_admins
    - Display current user's role and permissions in profile
    - Prevent non-super_admins from modifying other admin accounts
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.7_
  - [ ]\* 22.2 Write integration tests for RBAC
    - Test permission-based menu rendering
    - Test access denial for unauthorized actions
    - Test admin user management
    - _Requirements: 28.4_

- [ ] 23. Implement mobile responsiveness and performance optimization
  - [ ] 23.1 Apply mobile-responsive design patterns
    - Adapt layouts for screens below 768px width
    - Use touch-friendly button sizes (44x44px minimum)
    - Stack form fields vertically on mobile
    - Hide non-essential table columns on mobile
    - Implement mobile-optimized navigation menu
    - Support swipe gestures for navigation
    - Test on iOS Safari and Android Chrome
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7_
  - [ ] 23.2 Implement performance optimizations
    - Add lazy loading for images in product and blog listings
    - Implement browser caching for frequently accessed data
    - Preserve scroll position when navigating back
    - Add loading skeletons during data fetch
    - Ensure dashboard loads within 2 seconds
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.7_
  - [ ]\* 23.3 Write performance tests
    - Test dashboard load time
    - Test API response times
    - Test pagination performance with large datasets
    - _Requirements: 28.6_

- [ ] 24. Implement error handling and validation
  - [ ] 24.1 Create error handling middleware
    - Implement centralized error handler for all API endpoints
    - Log error details with context (URL, method, user)
    - Return appropriate HTTP status codes (400, 401, 403, 404, 409, 500)
    - Send standardized error response format
    - _Requirements: 19.3_
  - [ ] 24.2 Add frontend error handling
    - Display user-friendly error messages
    - Provide retry options for network errors
    - Show field-specific validation errors
    - Display toast notifications for operation results
    - _Requirements: 19.3, 19.4, 19.7_
  - [ ]\* 24.3 Write error handling tests
    - Test various error scenarios (validation, auth, not found, conflict)
    - Test error message display
    - Test retry functionality
    - _Requirements: 28.5_

- [ ] 25. Final integration and wiring
  - [ ] 25.1 Wire all backend routes to controllers
    - Register all admin routes in Express app
    - Apply authentication and authorization middleware
    - Apply activity logging middleware
    - Apply error handling middleware
    - _Requirements: All backend requirements_
  - [ ] 25.2 Wire all frontend components to API endpoints
    - Connect all UI components to backend API
    - Implement API client with error handling
    - Add loading states for all async operations
    - Implement state management for shared data
    - _Requirements: All frontend requirements_
  - [ ] 25.3 Create API documentation
    - Document all API endpoints with request/response examples
    - Document authentication requirements
    - Document error codes and messages
    - _Requirements: All requirements_

- [ ] 26. Final checkpoint - Comprehensive testing and validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation and allow for user feedback
- Testing tasks are integrated throughout to catch errors early
- All tasks focus on code implementation that can be performed by a coding agent
- The implementation follows the phased approach outlined in the design document
- Backend tasks (1-14) should be completed before frontend tasks (15-24) for optimal workflow
- Mobile responsiveness and performance optimization are applied throughout the UI implementation

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "2.1"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["2.3", "3.1"] },
    { "id": 5, "tasks": ["3.2", "3.3", "4.1"] },
    { "id": 6, "tasks": ["3.4", "4.2", "5.1"] },
    { "id": 7, "tasks": ["4.3", "5.2", "6.1"] },
    { "id": 8, "tasks": ["5.3", "6.2", "6.3", "7.1"] },
    { "id": 9, "tasks": ["6.4", "7.2", "8.1"] },
    { "id": 10, "tasks": ["7.3", "8.2"] },
    { "id": 11, "tasks": ["8.3", "10.1"] },
    { "id": 12, "tasks": ["10.2", "10.3", "11.1"] },
    { "id": 13, "tasks": ["11.2", "12.1"] },
    { "id": 14, "tasks": ["12.2", "13.1"] },
    { "id": 15, "tasks": ["13.2"] },
    { "id": 16, "tasks": ["13.3", "15.1"] },
    { "id": 17, "tasks": ["15.2", "15.3"] },
    { "id": 18, "tasks": ["15.4", "16.1"] },
    { "id": 19, "tasks": ["16.2", "16.3"] },
    { "id": 20, "tasks": ["16.4", "17.1"] },
    { "id": 21, "tasks": ["17.2", "17.3"] },
    { "id": 22, "tasks": ["17.4", "18.1"] },
    { "id": 23, "tasks": ["18.2"] },
    { "id": 24, "tasks": ["18.3", "19.1"] },
    { "id": 25, "tasks": ["19.2", "19.3"] },
    { "id": 26, "tasks": ["19.4", "20.1"] },
    { "id": 27, "tasks": ["20.2"] },
    { "id": 28, "tasks": ["20.3", "21.1"] },
    { "id": 29, "tasks": ["21.2"] },
    { "id": 30, "tasks": ["21.3", "22.1"] },
    { "id": 31, "tasks": ["22.2", "23.1"] },
    { "id": 32, "tasks": ["23.2"] },
    { "id": 33, "tasks": ["23.3", "24.1"] },
    { "id": 34, "tasks": ["24.2"] },
    { "id": 35, "tasks": ["24.3", "25.1"] },
    { "id": 36, "tasks": ["25.2"] },
    { "id": 37, "tasks": ["25.3"] }
  ]
}
```
