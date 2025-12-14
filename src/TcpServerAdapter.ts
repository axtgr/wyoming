import { createServer, type Server, type Socket } from 'node:net'
import Adapter, { type AdapterOptions, type Connection } from './Adapter.js'
import EventParser from './EventParser.js'

interface TcpServerAdapterOptions extends AdapterOptions {
  port: number
  hostname?: string
}

class TcpServerAdapter extends Adapter<TcpServerAdapterOptions> {
  protected server?: Server

  public start() {
    return new Promise<void>((resolve, reject) => {
      if (this.server) return

      this.server = createServer((socket) => {
        this.handleConnection(socket)
      })

      this.server.on('error', (error) => {
        this.emit('error', [error])
        reject(error)
      })

      this.server.listen(this.options.port, this.options.hostname, () => {
        this.emit('start', [])
        resolve(undefined)
      })
    })
  }

  public async stop() {
    if (!this.server) return

    await this.server.close()
    this.emit('stop', [])
  }

  protected handleConnection(socket: Socket): void {
    const parser = new EventParser()
    const connection: Connection = {
      send: (event) => {
        const buffer = parser.serialize(event)
        socket.write(buffer)
      },
      close: async () => {
        socket.destroy()
      },
    }

    this.connections.add(connection)
    this.emit('connect', [connection])

    socket.on('data', (chunk: Buffer) => {
      try {
        for (const event of parser.parse(chunk)) {
          this.emit('event', [event, connection])
        }
      } catch (error) {
        this.emit('error', [error])
        socket.destroy()
      }
    })

    socket.on('error', (error) => {
      this.emit('error', [error])
    })

    socket.on('close', () => {
      this.connections.delete(connection)
      this.emit('disconnect', [connection])
    })

    socket.on('end', () => {
      this.connections.delete(connection)
      this.emit('disconnect', [connection])
    })
  }
}

export default TcpServerAdapter
export type { TcpServerAdapterOptions }
