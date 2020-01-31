DOCKER_TAG=librarian_processor
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

docker-build:
	docker build -t $(DOCKER_TAG) .

docker-run:
	# TODO run container built by docker-compose
	docker run -d -it $(DOCKER_TAG)

docker-run-shell:
	# TODO run container built by docker-compose
	docker run -it $(DOCKER_TAG) /bin/sh

rebuild:
	docker-compose up --build --force-recreate --no-deps processor



