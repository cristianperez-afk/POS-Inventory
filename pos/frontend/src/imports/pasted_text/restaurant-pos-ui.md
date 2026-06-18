Generate a modern and professional Restaurant POS System UI prototype based on the flowchart. The system should have clear page structure, user-friendly navigation, and consistent colors. Use a clean dashboard-style layout with sidebar navigation, cards, tables, buttons, icons, and status indicators.

Create the following pages:

1. LOGIN PAGE

* Display system logo and title: Restaurant POS System
* Input fields for username and password
* Login button
* Error message for invalid account
* After successful login, redirect user based on role:

  * Admin → Admin Dashboard
  * Staff/Cashier → POS Dashboard

2. ADMIN DASHBOARD PAGE
   Purpose: User Management only.
   Include:

* Sidebar with User Management and Logout
* User table with columns: User ID, Name, Username, Role, Status, Action
* Add User button
* Edit User button
* Delete User button
* View User button
* Form/modal for adding and editing user
* Confirmation modal before deleting user

3. STAFF / CASHIER POS DASHBOARD
   Purpose: Main page for cashier.
   Include:

* Sidebar navigation:

  * Dashboard
  * Create Order
  * Order List
  * Reports
  * Logout
* Summary cards:

  * Total Sales
  * Total Orders
  * Top Orders
  * Queue Status
* Recent orders table
* Button for Create New Order

4. CREATE ORDER PAGE
   Process:

* Cashier enters customer name first
* System checks customer order history
* If customer has previous orders, show recommended products
* If no history, show normal menu
  Include:
* Customer name input
* Recommendation section
* Menu categories: Main Course, Appetizers, Drinks, Desserts, Others
* Product cards with image, name, price, and Add button
* Cart panel on the right side

5. ORDER CUSTOMIZATION PAGE / CART PANEL
   Allow cashier to:

* Change product quantity
* Add notes/comments
* Remove ingredients
* Add extra ingredients
* Remove items
* Mark item as Dine-In or Takeout
* Show subtotal and total
  Include:
* Ingredient customization section
* Inventory connection indicator: “Ingredients will be checked and deducted from inventory”
* Preview Order button
* Confirm Order button

6. DINE-IN TABLE MANAGEMENT PAGE
   Purpose: For dine-in orders.
   Include:

* Table layout/grid
* Table status colors:

  * Green = Available
  * Red = Occupied
  * Yellow = Reserved/Waiting
* Select table button
* Assign table button
* Automatically set selected table as occupied
* If no table is available, show Add to Queue button

7. QUEUE MANAGEMENT SECTION
   Purpose: For customers waiting for tables.
   Include:

* Waiting list table with queue number, customer name, number of guests, status, and assigned table
* Auto-monitoring message: “System will notify cashier once a table becomes available”
* Option to switch customer to Takeout
* When a table becomes available, cashier can assign the table

8. KITCHEN QUEUE PAGE
   Purpose: Display orders sent to kitchen.
   Include:

* Order ticket cards
* Customer name
* Order type: Dine-In or Takeout
* Table number if dine-in
* Ordered items
* Quantity
* Ingredient customization notes
* Order status:

  * Pending
  * Preparing
  * Ready
  * Served
* Buttons to update order status

9. PAYMENT PAGE
   Purpose: Process payment after order.
   Include:

* Order summary
* Customer name
* Order type
* Table number if dine-in
* Total amount
* Payment timing options:

  * Pay Now
  * Pay Later
* Payment method:

  * Cash
  * Card
  * E-Wallet
* Payment successful or retry payment message
* Generate Receipt button
* After successful payment, automatically update dine-in table status to Available

10. RECEIPT PAGE
    Include:

* Restaurant name
* Receipt number
* Date and time
* Customer name
* Ordered items
* Quantity
* Price
* Total amount
* Payment method
* Print Receipt button
* Back to Dashboard button

11. ORDER LIST / PREVIOUS ORDERS PAGE
    Purpose: Staff can view current and previous orders.
    Include:

* Search and filter options
* Order table with columns:

  * Order ID
  * Customer Name
  * Order Type
  * Table Number
  * Total Amount
  * Payment Status
  * Order Status
  * Date
  * Actions
* Actions:

  * View Order Details
  * Refund Order

12. REFUND PAGE / MODAL
    Keep this simple.
    Include:

* View selected paid order
* Refund reason input
* Validate refund button
* Approve/Process refund button
* Save refund record
* Return to Order List
* Show message: “Only paid orders can be refunded.”

13. REPORTS PAGE
    Purpose: Store sales and order analytics.
    Include:

* Daily sales report
* Monthly sales report
* Top selling products
* Dine-in sales
* Takeout sales
* Refund report
* Payment summary
* Charts and tables
* Date filter
* Export/Print report button

Design style:

* Modern restaurant POS dashboard
* Clean white background
* Rounded cards and buttons
* Color-coded status badges
* Easy-to-read labels
* Professional layout suitable for capstone/thesis presentation
* Use icons for orders, tables, kitchen, reports, payment, and users
* Make all connections and processes understandable through page layout
