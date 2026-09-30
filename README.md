# SOIT backend

## Configuration

Copy `.env.example` to `.env` and set the MongoDB URI, a private random `JWT_SECRET` of at least 32 bytes, an email provider, and the port. Never commit `.env` or production credentials. The service requires Node.js 20 or newer.

For Brevo, set `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, and a verified `BREVO_FROM_EMAIL`. For Gmail, set `EMAIL_PROVIDER=gmail`, `GMAIL_USER`, and `GMAIL_APP_PASSWORD`; Google requires 2-Step Verification to create an App Password. Never use your normal Google account password as `GMAIL_APP_PASSWORD`. For a branded mailbox on your own domain, set `EMAIL_PROVIDER=smtp` and provide the host's `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM_EMAIL` values. Set `SMTP_FROM_NAME` to `SOIT Infrastructure` or another desired sender name.

## First admin account

Set `ADMIN_EMAIL`, `ADMIN_USERNAME`, and a strong `ADMIN_PASSWORD` in the local environment or `.env`, then run `npm run admin:create` from this folder. The script creates an admin account when the email is unused. It promotes an existing user only when the supplied password matches that account. Remove the bootstrap values from the environment after setup.

The admin dashboard uses the normal `/api/login` endpoint and requires an account with the `admin` role. Contact messages, user records, admin statistics, and admin review operations require a valid admin bearer token.

## Run and verify

```sh
npm start
npm test
```

`GET /health` reports whether the process and MongoDB are ready. A `503` with `database: "disconnected"` means the server is running but MongoDB configuration or connectivity still needs attention.
The `email` field only reports that the selected provider's configuration values are present; it does not validate credentials or confirm a delivered message.

## Prepare the live deployment

The current frontend is hosted at GitHub Pages and calls the Render API configured in `frontend/config.js`. If the backend URL changes, update it in that one file. The password-reset link is built from `FRONTEND_URL`.

Before launch:

1. Create a hosted MongoDB Atlas cluster and database user. Set its connection string as `MONGODB_URI` in the backend host; a local `127.0.0.1` MongoDB address cannot be reached by Render.
2. Configure the backend host to use this folder as its root directory, run `npm install` for the build command, and `npm start` for the start command.
3. Set `NODE_ENV=production`, `MONGODB_URI`, a new private `JWT_SECRET` (at least 32 bytes), `FRONTEND_URL`, and `CORS_ORIGINS` in the backend host's environment settings. `CORS_ORIGINS` takes comma-separated origins only, with no path; the current GitHub Pages origin is `https://hamabenhalima.github.io`.
4. Configure one email provider's environment variables on the backend host. Never put database or email credentials in frontend files or commit `.env`.
5. Create the production admin account against the Atlas database with `npm run admin:create`, then remove the temporary `ADMIN_EMAIL` and `ADMIN_PASSWORD` values from the host environment.

The production host must receive its own environment values even when local development is fully configured. This keeps the deployment steps to connecting hosted services and setting their secrets, without editing application source at launch.
