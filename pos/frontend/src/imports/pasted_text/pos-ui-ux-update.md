UPDATE THE EXISTING RESTAURANT POS SYSTEM UI/UX PROTOTYPE WITH THESE CORRECTED REQUIREMENTS:

Remove all incorrect or unnecessary features that were added without being requested. Remove the Order Queue feature completely. The system should focus only on the Restaurant POS flow, with clear database connection and connected processes.

━━━━━━━━━━━━━━━━━━━━
DATABASE INTEGRATION
━━━━━━━━━━━━━━━━━━━━

Integrate the POS system with a database. All processes must be connected to database records.

Use these database tables or equivalent:

* users
* customers
* menu_items
* ingredients
* menu_item_ingredients
* tables
* orders
* order_items
* order_item_customizations
* payments
* discounts
* receipts
* refunds
* reports

The system should save and retrieve:

* User login records
* Customer information
* Customer order history
* Menu items
* Product descriptions
* Product prices
* Ingredients
* Table status
* Orders
* Dine-in and takeout order items
* Ingredient customizations
* Payments
* Discounts
* Receipts
* Refund records
* Sales reports

All buttons and pages must be connected to the correct process and database action.

━━━━━━━━━━━━━━━━━━━━
CREATE ORDER PAGE
━━━━━━━━━━━━━━━━━━━━

The Create Order page should have:

* Customer Name input
* Dining Option selector
* Menu search bar
* Category filter
* Product list
* Cart section
* Dine-In order list
* Takeout order list

The menu cards should only show:

* Product picture
* Product name
* Short description
* Price

Do not add unnecessary information on the menu card.

━━━━━━━━━━━━━━━━━━━━
DINING OPTION
━━━━━━━━━━━━━━━━━━━━

The dining option should first show:
“Select Dining Option”

Options:

* Dine-In
* Takeout

Do not automatically show dine-in features.

If Dine-In is selected:

* Show “Select Available Table” button
* Show “Add Takeout Order” button
* Show separate Dine-In order list and Takeout order list

If Takeout is selected:

* Show Takeout order list only
* Show search bar for menu/product search

━━━━━━━━━━━━━━━━━━━━
TABLE MANAGEMENT
━━━━━━━━━━━━━━━━━━━━

For Dine-In:

* Cashier must select an available table.
* Selected table becomes Occupied after order confirmation.
* After dine-in payment is completed, the table automatically becomes Available again.

No Order Queue feature.

━━━━━━━━━━━━━━━━━━━━
ORDER VALIDATION
━━━━━━━━━━━━━━━━━━━━

The Preview Order button should be disabled or not highlighted if required information is incomplete.

Required before preview:

* Customer name
* Dining option
* Table number if Dine-In
* At least one item in the cart/order list

If information is incomplete, show validation messages:

* Please enter customer name.
* Please select dining option.
* Please select table for dine-in order.
* Please add at least one item.

The Preview Order button only becomes active when all required order information is complete.

━━━━━━━━━━━━━━━━━━━━
PRODUCT ORDER DETAILS
━━━━━━━━━━━━━━━━━━━━

When an item is added to the cart, show complete order details:

* Product name
* Quantity
* Price
* Order type: Dine-In or Takeout
* Notes
* Ingredient customization button
* Remove item button

Cashier can edit quantity using plus and minus buttons.

━━━━━━━━━━━━━━━━━━━━
DISH CUSTOMIZATION
━━━━━━━━━━━━━━━━━━━━

Each dish should have a “Customize” or “Modify Ingredients” button.

When clicked, show ingredient customization modal.

The modal should display:

* Ingredient name
* Default quantity
* Unit of measurement

Example:

* Sauce: 30 ml
* Cheese: 20 g
* Meat: 100 g
* Onion: 10 g

Cashier can modify the ingredient quantity based on the customer request.

Examples:

* Sauce: change from 30 ml to 15 ml
* Cheese: change from 20 g to 0 g
* Meat: change from 100 g to 150 g

These ingredient modifications must affect the inventory deduction.

━━━━━━━━━━━━━━━━━━━━
ORDER PREVIEW
━━━━━━━━━━━━━━━━━━━━

When Preview Order is clicked, show complete order preview.

Order preview should display:

* Order number
* Customer name
* Dining option
* Table number if Dine-In
* Dine-In order list
* Takeout order list
* Product name
* Quantity
* Price
* Ingredient modifications
* Notes
* Subtotal
* Service fee
* Tax
* Discount
* Total amount

Order computation should be:

* Subtotal
* Service Fee: 1%
* Tax: 12%
* Discount
* Total Amount

Buttons:

* Back to Edit
* Confirm Order

━━━━━━━━━━━━━━━━━━━━
SERVICE FEE, TAX, AND DISCOUNT
━━━━━━━━━━━━━━━━━━━━

At the bottom of the cart and order preview, display in this order:

1. Subtotal
2. Service Fee 1%
3. Tax 12%
4. Discount
5. Total Amount

Discount should be added using an “Edit” button, not a dropdown.

When cashier clicks Edit beside Discount, show discount options:

* Senior Citizen Discount — 20%
* PWD Discount — 20%
* Promo Discount
* Custom Discount

For Custom Discount:

* Show input field where cashier can enter discount percentage.

Usual restaurant discount process:

* Select discount type
* Enter customer discount ID number if applicable
* Validate discount eligibility
* Apply discount
* Save discount record in the database

For Senior Citizen or PWD:

* Require ID number
* Apply 20% discount
* Save discount type and ID reference

━━━━━━━━━━━━━━━━━━━━
ORDER SUCCESS POPUP
━━━━━━━━━━━━━━━━━━━━

After confirming an order, show popup:

“Order Successfully Created”

Display:

* Order number
* Customer name
* Table number if Dine-In
* Order type
* Total amount
* Payment status
* Order status

For Dine-In:

* Payment status should be Pending
* The cashier returns to the order page/dashboard
* Customer pays later after eating
* Table remains Occupied until payment is completed

For Takeout:

* Proceed to payment immediately

━━━━━━━━━━━━━━━━━━━━
ORDER LIST
━━━━━━━━━━━━━━━━━━━━

Order List should have search and filtering.

Filters:

* All Orders
* Dine-In
* Takeout
* Pending Payment
* Paid
* Completed
* Refunded
* Date filter

Order List should show:

* Order number
* Customer name
* Order type
* Table number
* Total amount
* Payment status
* Order status
* Date and time

Actions:

* View Details
* Process Payment
* Refund

For Dine-In orders:

* Cashier searches the order in Order List after customer finishes eating.
* Cashier clicks Process Payment.

━━━━━━━━━━━━━━━━━━━━
PAYMENT PROCESS
━━━━━━━━━━━━━━━━━━━━

When Process Payment is clicked, show Payment Summary.

Payment Summary should display:

* Order number
* Customer name
* Order type
* Table number if Dine-In
* Ordered items
* Subtotal
* Service fee 1%
* Tax 12%
* Discount
* Total amount due

Add input:

* Amount Received

System automatically computes:

* Change

Buttons:

* Confirm Payment
* Cancel

After Confirm Payment:
Show popup:

* Payment Successful
* Total Amount Due
* Amount Received
* Change
* Print Receipt button

For Dine-In:

* After successful payment, table automatically becomes Available.

━━━━━━━━━━━━━━━━━━━━
RECEIPT
━━━━━━━━━━━━━━━━━━━━

Receipt should look like a real store receipt.

Use:

* Narrow thermal receipt layout
* White background
* Monospaced font
* Centered restaurant name
* Clean itemized list

Receipt should include:

* Restaurant name
* Address
* Receipt number
* Date and time
* Cashier name
* Customer name
* Order number
* Order type
* Table number if Dine-In
* Items ordered
* Quantity
* Price
* Subtotal
* Service fee 1%
* Tax 12%
* Discount
* Total amount
* Amount received
* Change
* Thank you message

Buttons:

* Print Receipt
* Back to Order List

━━━━━━━━━━━━━━━━━━━━
REPORTS PAGE
━━━━━━━━━━━━━━━━━━━━

Since Top Orders already appear on the Dashboard, do not repeat Top Orders in Reports.

Reports page should focus on detailed sales reports.

Reports should include:

* Sales overview
* Daily sales
* Weekly sales
* Monthly sales
* Dine-In sales
* Takeout sales
* Tax summary
* Service fee summary
* Discount summary
* Refund summary
* Payment method summary
* Detailed transaction records

Reports page must have:

* Search
* Date filter
* Payment status filter
* Order type filter
* Export PDF button
* Print Report button

━━━━━━━━━━━━━━━━━━━━
FILTERING REQUIREMENT
━━━━━━━━━━━━━━━━━━━━

Add filtering and search to all list-based pages.

Pages with filters:

* Menu list
* Order List
* Payment records
* Refund records
* Reports
* Customer history
* Table records

Filters may include:

* Search keyword
* Date
* Order type
* Payment status
* Order status
* Category
* Table number

━━━━━━━━━━━━━━━━━━━━
IMPORTANT RULES
━━━━━━━━━━━━━━━━━━━━

* Remove Order Queue.
* Do not add unrelated features.
* Make all processes connected.
* Make all buttons functional in the prototype flow.
* Make database connections clear.
* Keep the system focused on Restaurant POS only.
* Inventory is connected only through ingredient deduction.
* Use realistic POS layout.
* Keep the design clean, professional, and easy to understand.