# Everything CI runs. The Go tests need Postgres: `docker compose up -d db`.
.PHONY: test db

test:
	npm run typecheck
	npm run lint
	npm test
	DATABASE_URL=$${DATABASE_URL:-postgres://swmc:swmc@127.0.0.1:5432/swmc?sslmode=disable} npm run test:server

db:
	docker compose up -d db
