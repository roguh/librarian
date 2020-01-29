const NATS = require('nats')
const express = require('express')
const app = express()
const port = 8888

const fs = require('fs')
const running_in_docker = () => {
  let exists = true
  fs.statSync('/.dockerenv', (err, stat) => {
    if (err.code == "ENOENT") {
      exists = false
    }
  })
  return exists
}

NATS_ADDR = running_in_docker() ? 'nats' : 'localhost'
const nc = NATS.connect({url: `nats://${NATS_ADDR}:4222`})

app.get('/', (req, res) => res.send('Hello, World!'))

app.get('/ping-nats', (req, res) => {
  nc.publish('urls', 'test')
  res.send('sent message to NATS subject "urls"')
})

app.listen(port, () => console.log(`Example app listening on port ${port}!`))

