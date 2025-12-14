import type Adapter from 'Adapter.js'
import Connectable, {
  type ConnectableEvents,
  type ConnectableOptions,
  type Connection,
  type EventListener,
} from './Connectable.js'

type ServerEvents = ConnectableEvents

interface ServerOptions extends ConnectableOptions {
  adapters: Adapter[]
}

class Server<
  TOptions extends ServerOptions = ServerOptions,
  TEvents extends ServerEvents = ServerEvents,
> extends Connectable<TOptions, TEvents> {
  constructor(options: TOptions) {
    if (!Array.isArray(options?.adapters) || options.adapters.length < 1) {
      throw new Error('The "adapters" field of server options must include at least one adapter')
    }
    super(options)
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
