# Deploying swmc to CloudHost. See docs/deploy.md.
#
# Topology is deploy/topology.yaml (ui webserver + api function). The SPA
# bundle and the function source are files, uploaded separately — hostctl apply
# does not carry them on the remote path.

SERVICE ?= 00000000-0000-4000-8000-000000000001
URL     ?= https://swmc.example.com
API     ?= 00000000-0000-4000-8000-000000000002

export HOST_SERVICE     = $(SERVICE)
export HOST_URL         = $(URL)
export HOST_API_SERVICE = $(API)

.PHONY: test plan apply infra deploy publish deploy-api sleep wake status logs logs-api

test:
	npm run typecheck
	npm run lint
	npm test
	npm run test:server

plan:
	hostctl plan -f deploy/topology.yaml --env swmc

apply:
	hostctl apply -f deploy/topology.yaml --env swmc --auto-approve --wait

# Apply, then the sleep/wake/env fields the manifest cannot express.
infra:
	./scripts/infra.sh

# Build, upload, prune the previous build's assets, then fetch the site the way
# a visitor would. That last part is the only step that proves anything: an
# upload returning 200 says a file reached /data, not that a browser gets it.
deploy:
	./scripts/deploy.sh

publish:
	./scripts/deploy.sh --skip-build

deploy-api:
	./scripts/deploy-api.sh

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
