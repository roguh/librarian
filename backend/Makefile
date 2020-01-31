PORT=5001
DOCKER_TAG=librarian_backend
JSFILES = *.js tests/*.js

install-dev:
	pnpm i

test:
	python -m doctest -v $(PYFILES)
	nose2 --output-buffer --pretty-assert --log-capture --with-coverage --coverage .

security-scan:
	bandit -r . -lll  # Show 3 lines of context
	safety check

format:
	autopep8 --in-place --aggressive --aggressive $(PYFILES)
	isort $(PYFILES)

docker-build:
	docker build -t $(DOCKER_TAG) .

docker-run:
	# TODO run container built by docker-compose
	docker run -it -p $(PORT):$(PORT) $(DOCKER_TAG)

docker-run-shell:
	# TODO run container built by docker-compose
	docker run -it $(DOCKER_TAG) -p $(PORT):$(PORT) /bin/sh

rebuild:
	docker-compose up --build --force-recreate --no-deps librarian_backend_1



