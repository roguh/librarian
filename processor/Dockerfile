FROM jfloff/alpine-python:3.8-slim

COPY requirements.txt requirements_dev.txt /
RUN cat /requirements_dev.txt >> requirements.txt

RUN /entrypoint.sh -b libffi-dev -b libxml2-dev -b libxml2 -b libxslt -b libxslt-dev -b jpeg-dev

WORKDIR /app

COPY . .

CMD ["python", "scrape_queue_worker.py"]
