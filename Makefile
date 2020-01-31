up:
	docker-compose up --build --remove-orphans

down:
	docker-compose down --remove-orphans

down-rm:
	docker-compose down --remove-orphans --rmi all

downup:
	make down && make up
