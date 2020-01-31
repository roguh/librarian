#!/usr/bin/env python3
import asyncio
import json
import os
import signal
import warnings
from pathlib import Path

import aiohttp
import asyncpg
from dotenv import load_dotenv
from nats.aio.client import Client as NATS
from nats.aio.errors import ErrConnectionClosed, ErrNoServers, ErrTimeout
from newspaper import Article


def running_in_docker():
    return Path('/.dockerenv').exists()

load_dotenv(dotenv_path=Path('../postgres_dev.env'))

NATS_ADDR = 'nats' if running_in_docker() else 'localhost'
PG_USER = os.getenv('POSTGRES_USER')
PG_PWD = os.getenv('POSTGRES_PASSWORD')
PG_DB = os.getenv('POSTGRES_DB')
PG_ADDR = 'postgres' if running_in_docker() else 'localhost'
PG_CONNECTION = f'postgresql://{PG_USER}:{PG_PWD}@{PG_ADDR}/{PG_DB}'


async def run(loop):
    conn = await asyncpg.connect(PG_CONNECTION)
    print('Connected to Postgres')

    nc = NATS()
    await nc.connect(f'nats://{NATS_ADDR}:4222', loop=loop)

    session = aiohttp.ClientSession()

    async def urls_handler(msg):
        # Download and place in html column of Content table
        data = json.loads(msg.data.decode())
        print(f'Received a message subject="{msg.subject}" ({msg.reply}): {data}')
        url = data['url']
        print('Processing', url)
        async with session.get(url) as resp:
            html = await resp.text()
        print('Downloaded HTML', len(html), 'bytes')
        await conn.execute('INSERT INTO "Contents" (url, html) VALUES $1, $2', url, html)
        print('added to db')
        article = Article(url)
        article.download(input_html=html)
        article.parse()
        article.nlp() # keywords, summary
        article_attrs = 'title meta_lang meta_description top_image images authors text'.split()
        print('CONTENT:', article['title'], article['authors'], article['meta_description'], article['text'][:128])
        print('Inserting content into database')
        q = f'INSERT INTO "Contents" (url, html, {", ".join(article_attrs)}) ' + \
            f'VALUES ($1), ($2) {", ".join("(${})".format(i + 3) for i in range(len(article_attrs)))}'
        print(q)
        await conn.execute(q, url, html, *[article[a] for a in article_attrs])
        print('inserted')

    # Subscribe to a subject. Create queues.
    # https://docs.nats.io/developing-with-nats/receiving/queues
    urls_queue = await nc.subscribe('urls', queue='scrapers', cb=urls_handler)
    queues = [urls_queue]

    print(f'Subscribed to {len(queues)} NATS subject(s)')

    async def stop():
        print('Shutting down')
        await asyncio.sleep(0.1)
        loop.stop()

    def signal_handler():
        print('Disconnecting from postgres and aiohttp')
        loop.create_task(session.close())
        loop.create_task(conn.close())
        if not nc.is_closed:
            print('Disconnecting from NATS')
            for queue in queues:
                loop.create_task(nc.unsubscribe(queue))
            loop.create_task(nc.close())
        loop.create_task(stop())

    for sig in ('SIGINT', 'SIGTERM'):
        loop.add_signal_handler(getattr(signal, sig), signal_handler)

    u = await conn.fetch("SELECT * FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema = 'public'")
    print(u)

    u = await conn.fetch('SELECT * FROM "Users"')
    print(u)



if __name__ == '__main__':
    warnings.simplefilter('always', ResourceWarning)
    loop = asyncio.get_event_loop()
    loop.set_debug(True)
    loop.create_task(run(loop))
    loop.run_forever()
    loop.close()
