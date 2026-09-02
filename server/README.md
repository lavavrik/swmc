# Cloud library (Go API + Postgres)

The cloud library keeps the microcontrollers of each user. Users sign in with
an OIDC issuer. The API examines each RS256 access token with the JWKS of the
issuer. Sign-in with email and password is also available, for local
`go run` and for tests. The library keeps each microcontroller as an XML row
in Postgres, not as a file.

The package has two entry points, `Init` and `Handle`. A serverless functions
host loads these entry points. `cmd/dev` puts them in a `net/http` server for
local use.

## Use the cloud library locally

By default, `npm run dev` saves to IndexedDB. To use the cloud library, do
these steps:

1. Start Postgres. You can use the `db` service in `docker-compose.yml` or a
   different Postgres server:

   ```bash
   docker compose up -d db
   ```

2. Start the API:

   ```bash
   cd server
   DATABASE_URL=postgres://swmc:swmc@127.0.0.1:5432/swmc?sslmode=disable \
     ALLOWED_ORIGIN=http://localhost:5173 \
     go run ./cmd/dev
   ```

3. In a different terminal, start the editor with the API address:

   ```bash
   VITE_API_BASE_URL=http://localhost:8080 npm run dev
   ```

4. In the status bar, click **Sign in** or **Create account**. Use an email
   and a password.

If you set `VITE_OIDC_ISSUER` and `VITE_OIDC_CLIENT_ID` for the build, the
editor uses that issuer for sign-in.

## Endpoints

| Method | Path                         | Auth             | Body               | Response                                           |
| ------ | ---------------------------- | ---------------- | ------------------ | -------------------------------------------------- |
| GET    | /                            | —                | —                  | `{service:"swmc-library"}`                         |
| POST   | /auth/register               | —                | `{email,password}` | user + session cookie                              |
| POST   | /auth/login                  | —                | `{email,password}` | user + session cookie                              |
| POST   | /auth/logout                 | cookie           | —                  | 204                                                |
| GET    | /auth/me                     | cookie or Bearer | —                  | `{id,email}`                                       |
| GET    | /microcontrollers            | cookie           | —                  | `[{id,name,description,updatedAt,componentCount}]` |
| GET    | /microcontrollers/:id        | cookie           | —                  | XML                                                |
| PUT    | /microcontrollers/:id        | cookie           | XML                | summary                                            |
| DELETE | /microcontrollers/:id        | cookie           | —                  | 204                                                |
| GET    | /microcontrollers/:id/recipe | any              | —                  | summary + `recipe`, 404 if there is no recipe      |
| GET    | /tokens                      | cookie or OIDC   | —                  | `[{id,name,prefix,createdAt,lastUsedAt}]`          |
| POST   | /tokens                      | cookie or OIDC   | `{name}`           | the token, with its secret `token` (one time only) |
| DELETE | /tokens/:id                  | cookie or OIDC   | —                  | 204                                                |

`PUT /microcontrollers/:id` also accepts JSON, `{xml, recipe}`. The MCP server
uses this form to save the recipe together with the XML. When the editor saves
only the XML, the API keeps the recipe and marks it as stale. Each summary
contains `hasRecipe` and `recipeStale`.

The IDs are the same slugs that the editor uses (`projectId`). A slug contains
lowercase letters, digits and hyphens. Its maximum length is 64 characters.
Each account has its own set of IDs.

The library routes accept one of these two credentials:

- the session cookie of the API
- `Authorization: Bearer` with an OIDC access token. The `aud` claim must be
  the public client ID of the SPA. The `iss` claim must be `OIDC_ISSUER`.

The SPA and the API can be on different hosts. Thus, a hosted editor uses
Bearer tokens.

Agents send `Authorization: Bearer swmc_…`. This is a personal access token.
The user makes it in the editor (account → Agent access). The API keeps only
the SHA-256 hash of the token. A token operates on all library routes. It
cannot list, make or revoke tokens. For more data, refer to
[docs/agents.md](../docs/agents.md).

## Configuration

| Variable            | Function                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | The Postgres connection string. This variable is mandatory.                                                                     |
| `ALLOWED_ORIGIN`    | The origin of the editor, for CORS.                                                                                             |
| `OIDC_ISSUER`       | The OIDC issuer URL. With `OIDC_CLIENT_ID`, it turns on Bearer sign-in.                                                         |
| `OIDC_CLIENT_ID`    | The public client ID of the SPA (the token audience).                                                                           |
| `OIDC_EMAIL_DOMAIN` | The domain for accounts that have no email from the issuer (`<sub>@<domain>`). The default is `oidc.` + the host of the issuer. |
| `PORT`              | For `cmd/dev` only. The default is 8080.                                                                                        |

## Register the OIDC client

Register the SPA with your issuer as a **public** OIDC client. Use the
authorization code flow with PKCE. Set the redirect URI to the origin of the
editor. The issuer compares the URI exactly, so include the trailing slash.
For example: `http://localhost:5173/`.

## Build settings for the SPA

The SPA reads these variables at build time:

- `VITE_API_BASE_URL`
- `VITE_OIDC_ISSUER`
- `VITE_OIDC_CLIENT_ID`
- `VITE_OIDC_NAME` (optional). The sign-in button then shows
  "Sign in with <name>".

`SWMC_HOSTED_EDITOR` and `SWMC_HOSTED_API` set the default addresses in the
MCP server file that users download.
