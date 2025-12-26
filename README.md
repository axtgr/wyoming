<br>

<h1 align="center">wyoming</h1>

<p align="center">
  <strong>Wyoming Protocol Server & Client</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/wyoming"><img src="https://img.shields.io/npm/v/wyoming" alt="npm package"></a>
  &nbsp;
  <a href="https://www.buymeacoffee.com/axtgr"><img src="https://img.shields.io/badge/%F0%9F%8D%BA-Buy%20me%20a%20beer-red?style=flat" alt="Buy me a beer"></a>
</p>

<br>

A Node/Bun implementation of a server and client for <a href="https://github.com/OHF-Voice/wyoming">Wyoming Protocol</a>. Unfinished as the protocol turned out to be a mess and isn't worth implementing.

## Quickstart

```
npm install wyoming
```

```
import { Server } from 'wyoming'
import { TcpServerAdapter } from 'wyoming/tcp'

const server = new Server({
  adapters: [new TcpServerAdapter({ port: 9999 })],
})

server.on('event', (event, connection) => {
  if (event.header.type === 'ping') {
    connection.send({
      header: {
        type: 'pong'
      },
      data: {
        text: event.data?.text || 'pong'
      }
    })
    return
  }
})

await server.start()
```
