import { createConnection, type Socket } from 'node:net'
import { default as Adapter, type AdapterOptions, type Connection } from './Adapter.js'
import EventParser from './EventParser.js'

interface TcpClientAdapterOptions extends AdapterOptions {
  port: number
  hostname?: string
}

class TcpClientAdapter extends Adapter<TcpClientAdapterOptions> {
  protected socket?: Socket
  protected parser = new EventParser()

  public start() {
    return new Promise<void>((resolve, reject) => {
      if (this.socket) return

      this.socket = createConnection(this.options.port, this.options.hostname, () => {
        this.handleConnection(this.socket!)
        resolve()
      })

      this.socket.on('error', (error) => {
        this.emit('error', [error])
        reject(error)
      })

      this.emit('start', [])
    })
  }

  public async stop() {
    if (!this.socket) return

    await this.socket.destroy()
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
      console.log('data', chunk.toString())
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

export default TcpClientAdapter
export type { TcpClientAdapterOptions as TcpServerAdapterOptions }
