# Deploying swmc to CloudHost. See docs/deploy.md.
#
# Topology is deploy/topology.yaml (ui, api, db). The SPA
# bundle and the function source are files, uploaded separately — hostctl apply
# does not carry them on the remote path.

SERVICE     ?= 00000000-0000-4000-8000-000000000001
URL         ?= https://swmc.example.com
API         ?= 00000000-0000-4000-8000-000000000002
API_URL     ?= https://api.swmc.example.com
OIDC_CLIENT ?= 00000000-0000-4000-8000-000000000003
OIDC_ISSUER ?= https://example.com

export HOST_SERVICE     = $(SERVICE)
export HOST_URL         = $(URL)
export HOST_API_SERVICE = $(API)

.PHONY: test plan apply infra deploy publish deploy-api oidc-client sleep wake status logs logs-api

test:
	npm run typecheck
	npm run lint
	npm test
	DATABASE_URL=$${DATABASE_URL:-postgres://swmc:swmc@127.0.0.1:5432/swmc?sslmode=disable} npm run test:server

plan:
	hostctl plan -f deploy/topology.yaml --env swmc

apply:
	hostctl apply -f deploy/topology.yaml --env swmc --auto-approve --wait

# Apply, then the sleep/wake/env fields the manifest cannot express.
infra:
	OIDC_CLIENT_ID=$(OIDC_CLIENT) OIDC_ISSUER=$(OIDC_ISSUER) ./scripts/infra.sh

# Build, upload, prune the previous build's assets, then fetch the site the way
# a visitor would. That last part is the only step that proves anything: an
# upload returning 200 says a file reached /data, not that a browser gets it.
deploy:
	VITE_API_BASE_URL=$(API_URL) VITE_OIDC_CLIENT_ID=$(OIDC_CLIENT) VITE_OIDC_ISSUER=$(OIDC_ISSUER) ./scripts/deploy.sh

publish:
	VITE_API_BASE_URL=$(API_URL) VITE_OIDC_CLIENT_ID=$(OIDC_CLIENT) VITE_OIDC_ISSUER=$(OIDC_ISSUER) ./scripts/deploy.sh --skip-build

deploy-api:
	./scripts/deploy-api.sh

# Public OIDC client for Sign in with CloudHost. Needs hostctl auth login.
oidc-client:
	./scripts/oidc-client.sh

# Sleep and wake by hand — for testing the cold path, not for operating it.
# Normally each deployment sleeps itself after 15 minutes idle and wakes on
# the next request; see docs/deploy.md. Both services, because a visitor who
# hits the SPA then saves will need the function awake too.
sleep:
	hostctl deploy sleep $(SERVICE)
	hostctl deploy sleep $(API)

wake:
	hostctl deploy wake $(SERVICE)
	hostctl deploy wake $(API)

status:
	hostctl deploy get $(SERVICE)
	hostctl deploy get $(API)

logs:
	hostctl deploy logs $(SERVICE) -f

logs-api:
	hostctl deploy logs $(API) -f
