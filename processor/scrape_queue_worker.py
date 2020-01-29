import asyncio
from pathlib import Path

from nats.aio.client import Client as NATS
from nats.aio.errors import ErrConnectionClosed, ErrNoServers, ErrTimeout


def running_in_docker():
    return Path('/.dockerenv').exists()

NATS_ADDR = 'nats' if running_in_docker() else 'localhost'


async def run(loop):
    nc = NATS()

    await nc.connect(f"nats://{NATS_ADDR}:4222", loop=loop)

    future = asyncio.Future()

    async def message_handler(msg):
        subject = msg.subject
        reply = msg.reply
        data = msg.data.decode()
        print("Received a message on '{subject} {reply}': {data}".format(
            subject=subject, reply=reply, data=data))

        nonlocal future
        future.set_result(msg)

    # Subscribe to a subject and a queue.
    # https://docs.nats.io/developing-with-nats/receiving/queues
    scrape_queue = await nc.subscribe("urls", queue="scrapers", cb=message_handler)

    print('waiting for message')
    msg = await asyncio.wait_for(future, timeout=100)

    # Remove interest in subscription.
    await nc.unsubscribe(scrape_queue)

    # Terminate connection to NATS.
    await nc.close()

if __name__ == '__main__':
    loop = asyncio.get_event_loop()
    loop.run_until_complete(run(loop))
    loop.close()
