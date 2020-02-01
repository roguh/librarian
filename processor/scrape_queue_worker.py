#!/usr/bin/env python3
import asyncio
import copy
import datetime
import functools
import json
import logging
import os
import signal
import warnings
from pathlib import Path

import aiohttp
import asyncpg
import uvloop
from dotenv import load_dotenv
from nats.aio.client import Client as NATS
from nats.aio.errors import ErrConnectionClosed, ErrNoServers, ErrTimeout
from newspaper import Article

logging.basicConfig(format='%(levelname)s %(asctime)s: %(message)s',
                    datefmt='%m/%d/%Y %I:%M:%S %p %Z',
                    level=logging.INFO)
logger = logging.getLogger(__name__)
log = logger.info


def running_in_docker():
    return Path('/.dockerenv').exists()


load_dotenv(dotenv_path=Path('../postgres_dev.env'))

NATS_ADDR = 'nats' if running_in_docker() else 'localhost'
NATS_PORT = 4333
PG_USER = os.getenv('POSTGRES_USER')
PG_PWD = os.getenv('POSTGRES_PASSWORD')
PG_DB = os.getenv('POSTGRES_DB')
PG_ADDR = 'postgres' if running_in_docker() else 'localhost'
PG_CONNECTION = f'postgresql://{PG_USER}:{PG_PWD}@{PG_ADDR}/{PG_DB}'


async def stop(loop):
    log('Shutting down')
    await asyncio.sleep(0.1)
    loop.stop()


def exception_handler(loop, ctx):
    msg = "Exception in async task {}: {} {}".format(
        *[ctx.get(k, '?') for k in ['future', 'message', 'exception']])
    logging.error(msg)


def process_html(url, html):
    log(f'Processing {url}')
    article = Article(url, KEYWORD_COUNT=25)
    article.download(input_html=html)
    article.parse()
    article.authors = '; '.join(article.authors)
    log(f'Parsed {len(article.text)} bytes of natural text')
    article.nlp()
    keywords = copy.deepcopy(article.keywords)
    article.keywords = ', '.join(keywords)
    return article, keywords


async def urls_handler(conn, session, msg):
    # Download and place in html column of Content table
    data = json.loads(msg.data.decode())
    log(f'Received a message in {msg.subject} ({msg.reply}): {data}')
    url = data['url']
    try:
        # TODO only status code < 400
        async with session.get(url) as resp:
            html = await resp.text()
    except Exception as e:
        log(f'Invalid URL {url} {e}')
        return
    log(f'Downloaded {len(html)} bytes of HTML')
    article, keywords = await loop.run_in_executor(None, process_html, url, html)
    # TODO images
    attrs = 'title meta_lang meta_description top_image authors text keywords summary'.split()
    q = 'INSERT INTO "Contents"' + \
        f'(id, "createdAt", "updatedAt", url, html, {", ".join(attrs)}) ' + \
        'VALUES (DEFAULT, ' + \
        ", ".join("${}".format(i) for i in range(1, 5 + len(attrs))) + \
        ') RETURNING id;'
    log(q)
    now = datetime.datetime.now()
    r = await conn.fetchval(q, now, now, url, html,
                            *[getattr(article, a) or None for a in attrs])
    log(f'Inserted in database id={r}')
    return r


async def run(loop):
    conn = await asyncpg.connect(PG_CONNECTION)
    log('Connected to Postgres')

    session = aiohttp.ClientSession()

    nc = NATS()
    await nc.connect(f'nats://{NATS_ADDR}:{NATS_PORT}', loop=loop)

    # Subscribe to a subject. Create queues.
    # https://docs.nats.io/developing-with-nats/receiving/queues
    log('Connecting to NATS')
    urls_cb = functools.partial(urls_handler, conn, session)
    urls_queue = await nc.subscribe(
        'urls', queue='scrapers', cb=urls_cb,
        # This flag is needed to catch exceptions thrown in the callback.
        is_async=True)
    queues = [urls_queue]

    log(f'Subscribed to {len(queues)} NATS subject(s)')

    def signal_handler():
        log('Disconnecting from postgres and aiohttp')
        loop.create_task(session.close())
        loop.create_task(conn.close())
        if not nc.is_closed:
            log('Disconnecting from NATS')
            for queue in queues:
                loop.create_task(nc.unsubscribe(queue))
            loop.create_task(nc.close())
        loop.create_task(stop(loop))

    for sig in ('SIGINT', 'SIGTERM'):
        loop.add_signal_handler(getattr(signal, sig), signal_handler)


if __name__ == '__main__':
    # Use uvloop
    asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())

    warnings.simplefilter('always', ResourceWarning)
    logging.getLogger("asyncio").setLevel(logging.DEBUG)

    loop = asyncio.get_event_loop()
    loop.set_debug(True)
    loop.set_exception_handler(exception_handler)
    loop.create_task(run(loop))
    loop.run_forever()
