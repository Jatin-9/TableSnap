# Getting Started with TableSnap

## Quick Start Guide

### Step 1: Create Your Account
1. Navigate to the application
2. Click "Sign Up" on the login page
3. Enter your email and password
4. You'll be automatically logged in and redirected to the upload page

### Step 2: Upload Your First Table
1. On the home page, click to upload an image
2. Select an image containing a table (any language supported)
3. Click "Extract Table Data"
4. Review the extracted data:
   - Check the OCR confidence score
   - View the auto-detected tags
   - Preview the table data
5. Click "Save to My Tables"

### Step 3: Manage Your Tables
1. Navigate to "My Tables" in the sidebar
2. Use filters to find specific tables:
   - All
   - Languages
   - Expenses
   - Shopping
   - Recipes
   - Inventory
   - Fitness
   - Dated Records
3. Actions available for each table:
   - 👁️ View - See full table in modal
   - 📥 Export CSV - Download as CSV file
   - 🗑️ Delete - Remove table

### Step 4: View Your Analytics
1. Click "My Analytics" in the sidebar
2. View your personal statistics:
   - Total tables created
   - Total rows processed
   - Unique tags used
3. Explore charts:
   - Tables created over last 30 days (Line chart)
   - Rows added by day (Bar chart)
   - Tables by tag distribution (Pie chart)
4. Export your analytics as CSV

### Step 5: Set Up Reminders (Optional)
1. Navigate to "Reminders" in the sidebar
2. Click "Add Reminder"
3. Configure:
   - Frequency: Daily or Weekly
   - Delivery: Email or Notification
4. Enable/disable reminders as needed

### Step 6: Customize Settings
1. Go to "Settings" in the sidebar
2. Toggle preferences:
   - Auto-tag tables
   - Email notifications
   - Show confidence scores
3. Click "Save Preferences"

## Super Admin Access

### Promoting a User to Super Admin

To access the Super Admin dashboard, you need to promote a user:

1. Sign up for an account through the UI
2. Open Supabase SQL Editor
3. Run this query:

```sql
SELECT promote_to_super_admin('your-email@example.com');
```

Or manually:

```sql
UPDATE users
SET role = 'super_admin'
WHERE email = 'your-email@example.com';
```

### Super Admin Features

Once promoted, you'll see:
- Crown icon in the sidebar
- "Super Admin" navigation option
- Access to platform-wide analytics:
  - Total users, tables, and rows
  - Active users today
  - Platform growth charts
  - User adoption trends
  - Top content types globally
  - Export all platform data

## Smart Auto-Tagging Examples

The system automatically detects and tags your content:

### Languages
Upload tables with:
- Japanese characters (犬, 猫, 本)
- Chinese characters
- Korean characters
→ Tagged as "Languages"

### Expenses
Upload tables with:
- Currency symbols (€, $, ¥, £)
- Keywords: price, cost, total, amount
→ Tagged as "Expenses"

### Inventory
Upload tables with:
- Keywords: qty, quantity, stock, inventory
→ Tagged as "Inventory"

### Shopping
Upload tables with:
- Clothing items: shirt, pants, dress, shoes
→ Tagged as "Shopping"

### Recipes
Upload tables with:
- Food keywords: recipe, ingredients, meal, cooking
→ Tagged as "Recipes"

### Fitness
Upload tables with:
- Health metrics: weight, calories, exercise
→ Tagged as "Fitness"

### Dated Records
Upload tables with:
- Date patterns: MM/DD/YYYY, DD-MM-YYYY
→ Tagged as "Dated Records"

## Tips for Best Results

### OCR Quality
- Use clear, well-lit images
- Ensure text is readable
- Avoid blurry or low-resolution images
- Tables should be clearly visible

### Supported Table Formats
- Any language (multilingual support)
- 2-20 columns automatically detected
- Headers can be auto-detected or manually edited
- Rows are parsed line by line

### Data Organization
- Use tags to organize your tables
- Filter by multiple tags simultaneously
- Use the search bar to find specific tables
- Export important tables as CSV backups

### Analytics Usage
- Check your analytics weekly to track usage
- Export analytics data for external analysis
- Monitor your productivity trends
- See which content types you work with most

## Keyboard Shortcuts

- Search tables: Click search bar in sidebar
- Quick filter: Click any tag in tag cloud
- Navigate: Use sidebar menu items

## Troubleshooting

### OCR Not Working
- Ensure image contains a clear table
- Check image file size (max 10MB)
- Try a higher quality image

### Tags Not Appearing
- Auto-tagging is intelligent but may miss edge cases
- You can manually add custom tags
- Check settings to ensure auto-tag is enabled

### Can't See Super Admin Dashboard
- Verify you've been promoted to super_admin role
- Check database: `SELECT role FROM users WHERE email = 'your-email';`
- Sign out and sign back in after promotion

### Analytics Not Showing Data
- Upload at least one table first
- Analytics update automatically when tables are created
- Check date ranges on charts

## Support

For issues or questions:
1. Check the README.md file
2. Review database migrations
3. Check Supabase logs
4. Verify authentication status

## Next Steps

- Upload multiple tables to see analytics in action
- Set up daily reminders for flashcard-style learning
- Explore different content types
- If you're a super admin, check platform-wide trends

---

Happy organizing with TableSnap! 📊
