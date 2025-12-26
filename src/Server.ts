import type Adapter from 'Adapter.js'
import Connectable, {
  type ConnectableEvents,
  type ConnectableOptions,
  type Connection,
  type EventListener,
} from './Connectable.js'
import type { Events, Info } from './events.js'

type ServerEvents = ConnectableEvents

interface Handlers {
  ping(text?: string): string | undefined | Promise<string | undefined>
  describe(): Info | Promise<Info>
}

interface ServerOptions extends ConnectableOptions {
  adapters: Adapter[]
  handlers?: Partial<Handlers>
}

class Server<
  TOptions extends ServerOptions = ServerOptions,
  TEvents extends ServerEvents = ServerEvents,
> extends Connectable<TOptions, TEvents> {
  protected handlers: Partial<Handlers> = {
    ping: (text) => text,
  }

  constructor(options: TOptions) {
    if (!Array.isArray(options?.adapters) || options.adapters.length < 1) {
      throw new Error('The "adapters" field of server options must include at least one adapter')
    }
    super(options)

    if (options.handlers) {
      this.handlers = { ...this.handlers, ...options.handlers }
    }

    this.on('event', async (e, connection) => {
      this.handleEvent(e, connection)
    })
  }

  protected async handleEvent(event: TEvents['event'][0], connection: Connection) {
    const type = event.header.type

    if (type === 'ping') {
      const data = (event as Events['ping'] | undefined)?.data
      const text = await this.handlers.ping?.(data?.text)
      const response: Events['pong'] = {
        header: { type: 'pong' },
        data: { text },
      }
      connection.send(response)
      return
    }

    if (type === 'describe') {
      const info = await this.handlers.describe?.()
      const response: Events['info'] = {
        header: { type: 'info' },
        data: info || {},
      }
      connection.send(response)
      return
    }
  }

  protected async _start() {
    const promises = this.options.adapters.map(async (adapter) => {
      adapter.pipe(this as Connectable)
      await adapter.start()
    })
    await Promise.all(promises)
  }

  protected async _stop() {
    const promises = this.options.adapters.map(async (adapter) => {
      adapter.unpipe(this as Connectable)
      await adapter.stop()
    })
    await Promise.all(promises)
  }
}

export default Server
export type { Connection, EventListener, ServerEvents, ServerOptions }
