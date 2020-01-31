up:
	docker-compose up --build --remove-orphans

down:
	docker-compose down --remove-orphans

down-rm:
	docker-compose down --remove-orphans --rmi all

down-rm:
	docker-compose -f docker-compose.yml down --rmi all

downup:
	make down && make up
