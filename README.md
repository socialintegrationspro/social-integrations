# Social Integrations

WordPress plugin that shares posts, pages, products and custom post types to social networks, with caption templates, a calendar and a share log.

## Develop

```bash
composer install
pnpm install
pnpm build        # → build/
pnpm dev          # Vite dev server on :5174 (a development environment loads it in wp-admin)
```

- PHP 7.4+, WordPress 6.3+.
- PHP source: `backend/` (PSR-4, namespace `SocialIntegrations\`).
- Admin app source: `frontend/admin/` (React + TypeScript, built with Vite).
- Extension points: `backend/Hooks.php`.

## License

GPL-2.0-or-later.
