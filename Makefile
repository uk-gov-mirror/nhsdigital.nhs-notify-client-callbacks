# This file is for you! Edit it to implement your own hooks (make targets) into
# the project as automated steps to be executed on locally and in the CD pipeline.

include scripts/init.mk

# ==============================================================================

# Example CI/CD targets are: dependencies, build, clean, etc.

dependencies: # Install dependencies needed to build and test the project @Pipeline
	pnpm install --frozen-lockfile

build: # Build the project artefact @Pipeline
	(cd docs && make build)

publish: # Publish the project artefact @Pipeline
	# TODO: Implement the artefact publishing step

deploy: # Deploy the project artefact to the target environment @Pipeline
	# TODO: Implement the artefact deployment step

test-regression: # Run regression tests from scripts/tests/regression @Testing
	make _test name="regression"

test-regression-local: # Run regression tests locally (requires ENVIRONMENT, AWS_PROFILE) @Testing
	make _test name="regression-local"

clean:: # Clean-up project resources (main) @Operations
	rm -f .version version.json
	rm -rf node_modules
	rm -rf lambdas/*/dist
	rm -rf lambdas/*/node_modules
	rm -rf coverage
	rm -rf lambdas/*/coverage
	(cd docs && make clean 2>/dev/null || true)

config:: _install-dependencies version # Configure development environment (main) @Configuration
	(cd docs && make install)

version:
	rm -f .version
	make version-create-effective-file dir=.
	echo "{ \"schemaVersion\": 1, \"label\": \"version\", \"message\": \"$$(head -n 1 .version 2> /dev/null || echo unknown)\", \"color\": \"orange\" }" > version.json
# ==============================================================================

${VERBOSE}.SILENT: \
	build \
	clean \
	config \
	dependencies \
	deploy \
