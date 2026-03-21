# Deployment Guide for TableSnap

## Prerequisites

- Supabase project (already configured)
- Node.js 18+ installed
- Git repository (optional, for version control)

## Database Setup

The database is already configured with all necessary tables and functions. The schema includes:

- ✅ `users` - User profiles with role management
- ✅ `table_snapshots` - Extracted tables with metadata
- ✅ `user_analytics` - Personal usage statistics
- ✅ `global_analytics` - Platform-wide analytics
- ✅ `reminders` - User reminder configurations

All tables have Row Level Security (RLS) enabled for security.

## Environment Variables

Your `.env` file should contain:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

## Deployment Options

### Option 1: Vercel (Recommended for Frontend)

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Deploy**
   ```bash
   vercel
   ```

3. **Set Environment Variables in Vercel Dashboard**
   - Go to your project settings
   - Add `VITE_SUPABASE_URL`
   - Add `VITE_SUPABASE_ANON_KEY`

4. **Deploy to Production**
   ```bash
   vercel --prod
   ```

### Option 2: Netlify

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Build the Project**
   ```bash
   npm run build
   ```

3. **Deploy**
   ```bash
   netlify deploy --prod --dir=dist
   ```

4. **Set Environment Variables**
   - Go to Site settings → Environment variables
   - Add `VITE_SUPABASE_URL`
   - Add `VITE_SUPABASE_ANON_KEY`

### Option 3: Railway (Full Stack)

1. **Create Railway Account**
   - Visit [railway.app](https://railway.app)

2. **New Project**
   - Select "Deploy from GitHub repo"
   - Or use Railway CLI

3. **Configure**
   - Railway auto-detects Vite projects
   - Add environment variables in dashboard

4. **Deploy**
   - Railway automatically deploys on git push

### Option 4: Static Hosting (GitHub Pages, Cloudflare Pages, etc.)

1. **Build the Project**
   ```bash
   npm run build
   ```

2. **Deploy `dist` folder**
   - Upload to your static hosting service
   - Configure build command: `npm run build`
   - Configure publish directory: `dist`

## Post-Deployment Setup

### 1. Test Authentication
- Visit your deployed URL
- Create a test account
- Verify login works

### 2. Create Super Admin
```sql
-- In Supabase SQL Editor
SELECT promote_to_super_admin('admin@example.com');
```

### 3. Test OCR Upload
- Upload a test table image
- Verify OCR extraction works
- Check auto-tagging

### 4. Verify Analytics
- Create a few test tables
- Check user analytics dashboard
- If super admin, check global analytics

## Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] RLS policies active
- [ ] Authentication working
- [ ] OCR extraction functional
- [ ] Analytics charts displaying
- [ ] CSV export working
- [ ] Reminders configuration available
- [ ] Super admin access tested
- [ ] Mobile responsive design verified

## Performance Optimization

### Code Splitting (Optional)

To reduce initial bundle size, add to `vite.config.ts`:

```typescript
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['chart.js', 'react-chartjs-2'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
```

### Image Optimization

For better OCR performance:
- Implement image compression before upload
- Add client-side image resizing
- Set max file size limits

### Caching

Configure caching headers:
```
Cache-Control: public, max-age=31536000, immutable
```

## Monitoring

### Supabase Dashboard
Monitor:
- Database usage
- API requests
- Authentication events
- Storage usage

### Application Metrics
Track:
- User signups
- Tables created
- OCR success rate
- Average confidence scores

## Backup Strategy

### Database Backups
Supabase automatically backs up your database:
- Point-in-time recovery available
- Automated daily backups
- Manual backup option in dashboard

### Export User Data
Regular exports recommended:
```sql
-- Export all data
COPY (
  SELECT
    u.email,
    COUNT(ts.id) as total_tables,
    SUM(ts.row_count) as total_rows
  FROM users u
  LEFT JOIN table_snapshots ts ON u.id = ts.user_id
  GROUP BY u.id, u.email
) TO '/tmp/user_stats.csv' WITH CSV HEADER;
```

## Security Best Practices

1. **Keep Dependencies Updated**
   ```bash
   npm audit
   npm update
   ```

2. **Environment Variables**
   - Never commit `.env` to git
   - Use different keys for dev/prod
   - Rotate keys periodically

3. **RLS Policies**
   - Review policies regularly
   - Test with different user roles
   - Ensure no data leaks

4. **Authentication**
   - Enable email confirmation (optional)
   - Implement rate limiting
   - Use strong password requirements

## Troubleshooting

### Build Fails
```bash
# Clear cache and rebuild
rm -rf node_modules
rm package-lock.json
npm install
npm run build
```

### Database Connection Issues
- Verify Supabase URL and key
- Check RLS policies
- Ensure tables exist

### OCR Not Working
- Verify edge functions are deployed
- Check image upload limits
- Review browser console for errors

### Analytics Not Updating
- Check trigger functions
- Verify analytics tables exist
- Review SQL logs in Supabase

## Scaling Considerations

### Database
- Index optimization for large datasets
- Partitioning for table_snapshots (by date)
- Archive old data periodically

### Frontend
- Implement pagination for table lists
- Lazy load analytics charts
- Add infinite scroll

### Storage
- Implement CDN for images
- Compress images before storage
- Set up automatic cleanup

## Support

For deployment issues:
1. Check Supabase logs
2. Review browser console
3. Verify environment variables
4. Test database connectivity

## Rollback Procedure

If deployment fails:

1. **Revert Code**
   ```bash
   git revert HEAD
   git push
   ```

2. **Restore Database** (if needed)
   - Use Supabase dashboard
   - Point-in-time recovery
   - Restore from backup

3. **Clear Cache**
   - CDN cache
   - Browser cache
   - Service worker cache

---

Your TableSnap application is now ready for production deployment! 🚀
