PORT=5001
DOCKER_TAG=powerflex_api
PYFILES = *.py tests/*.py

install-dev:
	pipenv install -r requirements.txt
	pipenv install -r requirements_dev.txt
	echo Activate virtualenv with:
	echo pipenv shell --fancy

test:
	python -m doctest -v $(PYFILES)
	nose2 --output-buffer --pretty-assert --log-capture --with-coverage --coverage .

security-scan:
	bandit -r . -lll  # Show 3 lines of context
	safety check

format:
	autopep8 --in-place --aggressive --aggressive $(PYFILES)
	isort $(PYFILES)

up:
	docker-compose -f docker-compose.yml up -d --build

down:
	docker-compose -f docker-compose.yml down

down-rm:
	docker-compose -f docker-compose.yml down --rmi all

downup:
	make down && make up

docker-build:
	docker build -t $(DOCKER_TAG) .

docker-run:
	# TODO run container built by docker-compose
	docker run -d -it -p $(PORT):$(PORT) $(DOCKER_TAG)

docker-run-shell:
	# TODO run container built by docker-compose
	docker run -it $(DOCKER_TAG) -p $(PORT):$(PORT) /bin/sh

