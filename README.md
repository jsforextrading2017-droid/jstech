<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/52ca69e7-3cac-4acf-a71b-86733cdfcebe

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `DATABASE_URL` in [.env.local](.env.local) if you want PostgreSQL persistence
3. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
4. Run the app:
   `npm run dev`

## Deploy on Railway

1. Create a new Railway project from this repository.
2. Add these environment variables in Railway:
   - `DATABASE_URL` for PostgreSQL persistence
   - `OPENAI_API_KEY` as an optional fallback if no database key is saved
   - `GEMINI_API_KEY` if you want Gemini fallback
3. Use the default build command:
   - `npm run build`
4. Use the start command:
   - `npm start`
5. Railway will provide `PORT` automatically, and the server reads it at runtime.

## Facebook Story Publishing

To prepare the app for Facebook Page story publishing, add these server-side environment variables:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_PAGE_ID`
- `META_PAGE_ACCESS_TOKEN`

Important:
- Keep `META_APP_SECRET` and `META_PAGE_ACCESS_TOKEN` on the server only.
- A Page access token is what actually publishes content to the Facebook Page.
- The app secret is used for OAuth/app verification flows, not for frontend code.

## OpenAI Key Storage

The OpenAI key saved in the admin panel is stored in PostgreSQL under the `app_settings` table.
If `OPENAI_API_KEY` is also set on Railway, the database value takes priority.

## Admin Access

- Visit `/admin` to open the admin login page.
- Default credentials: `admin` / `admin123`
- After logging in, you can change the password from the admin settings page.
