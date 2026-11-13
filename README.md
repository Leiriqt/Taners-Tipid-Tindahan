# Tipid Tan

A responsive static storefront and Supabase-backed shopkeeper dashboard. The customer catalog reads only from the `public_products` database view; market and offer prices stay in the protected `products` table and are visible only to administrator accounts.

## What’s included

- Public catalog with search, category filters, stock status, product details and contact links.
- Authenticated product and category management, image uploads and separate market, offer and customer prices.
- Admin-only price comparisons and gross-margin calculations.
- Supabase SQL schema, row-level security, safe public catalog view, and Storage policies.
- No build step or server-side frontend required.

## Set up Supabase

1. Create a Supabase project.
2. Open **SQL Editor**, run all of [`supabase-schema.sql`](./supabase-schema.sql), and confirm it finishes successfully.
3. In **Authentication → Providers**, enable Email. Disable public sign-ups; create administrator accounts yourself from **Authentication → Users**.
4. Create the first admin user, then copy that user’s ID from the Users page and run this in the SQL Editor:

   ```sql
   insert into public.user_roles (user_id, role)
   values ('PASTE_AUTH_USER_UUID_HERE', 'admin');
   ```

   Never add a user-controlled admin-registration flow. To grant another administrator, create their Auth user and insert their UUID the same way. To revoke access, delete their row from `public.user_roles`.
5. In **Project Settings → API**, copy the Project URL and the **publishable** (or legacy `anon`) key. Put them into [`config.js`](./config.js):

   ```js
   window.APP_CONFIG = {
     SUPABASE_URL: "https://your-project.supabase.co",
     SUPABASE_ANON_KEY: "your-publishable-anon-key",
     SHOP_CONTACT_URL: "https://m.me/your-page"
   };
   ```

   The publishable/anon key is designed for browser use and is not an authorization secret; RLS is the security boundary. **Never put a service-role or secret key in this site.** Update the contact link to your business’s actual inquiry destination.
6. Add products by signing in at `/#admin`. Product photos are uploaded to the public `product-images` bucket; upload, update and delete operations still require an authorized admin session.

The supplied [`.env.example`](./.env.example) documents the same two public Supabase settings for deployments that later move to a bundler. This no-build static version reads `config.js` directly; Vercel does not automatically substitute `.env` values into a plain HTML file.

## Run locally

Serve this folder over HTTP (ES modules and auth redirects are more reliable than opening `index.html` directly). For example, with Python installed:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000`. Configure the local URL under **Authentication → URL Configuration** in Supabase if you use password recovery or redirect-based auth.

## Deploy to Vercel

1. Push this folder to a Git repository and import it in Vercel, or use `vercel` from this folder.
2. Select **Other** as the framework preset, leave the build command empty, and use `.` as the output directory.
3. Deploy the static files. Add no service-role key or private credentials to Vercel or the frontend.
4. Add the deployed site URL (and any preview URLs you use) to the Supabase **Authentication → URL Configuration → Redirect URLs** allowlist. Add the production domain as the Site URL.
5. Verify the production storefront and `/#admin` dashboard.

## Security notes and verification

- `products` has RLS enabled and grants row access only when `public.is_admin()` confirms the signed-in user’s role. Anonymous users and authenticated non-admins cannot read private prices or mutate products.
- The `public_products` view is an owner-rights view owned by `postgres`; it returns only product identity, display details, public price and a boolean availability flag. Do not add market/offer price columns to it. Direct table access remains RLS-protected.
- Categories are public display data. Only admins can change them. User role rows are readable only by the matching signed-in user; browser users cannot grant roles.
- The image bucket allows public image reads and limits writes/deletes to admins.
- The admin URL is only a navigation route. Supabase Auth, role verification and RLS enforce access; hiding the dashboard is not the security control.

Suggested checks after setup:

1. Open the storefront in a signed-out/private browser. It should list only published products and only their public price; the public view has no market- or offer-price columns.
2. Attempt `select * from products` using the anon key. It should return no product rows. Attempt insert/update/delete with an anon or non-admin session; each must be denied or affect zero rows.
3. Sign in as the provisioned admin at `/#admin`. Add a product with three deliberately different prices, then edit, publish, unpublish and delete it. Confirm the storefront immediately reflects published changes and never shows the internal prices.
4. Upload an image as an admin. Confirm the public storefront can display it, while an unauthenticated upload/delete request is rejected.
5. Check responsive layouts at mobile and desktop widths.
