import type { Event } from './types.js'

interface Connection {
  send(event: Event): void
  close(): Promise<void>
}

interface AdapterEvents {
  start: []
  stop: []
  connect: [Connection]
  disconnect: [Connection]
  event: [Event, Connection]
  error: [unknown]
}

type AdapterEventType = keyof AdapterEvents

type EventListener<TEventType extends AdapterEventType = AdapterEventType> = (
  ...args: AdapterEvents[TEventType]
) => void

type AdapterOptions = object

abstract class Adapter<TOptions extends object> {
  protected connections = new Set<Connection>()
  protected options: TOptions
  protected listeners: { [K in AdapterEventType]?: Set<EventListener<K>> } = {}

  constructor(options: TOptions) {
    this.options = options
  }

  public abstract start(): Promise<void>
  public abstract stop(): Promise<void>

  public on<TEventType extends AdapterEventType>(
    type: TEventType,
    listener: EventListener<TEventType>,
  ) {
    ;(this.listeners[type] as any) ??= new Set<EventListener<TEventType>>()
    this.listeners[type]!.add(listener)
  }

  public off<TEventType extends AdapterEventType>(
    type: TEventType,
    listener: EventListener<TEventType>,
  ) {
    this.listeners[type]?.delete(listener)
  }

  protected emit<TEventType extends AdapterEventType>(
    type: TEventType,
    args: AdapterEvents[TEventType],
  ) {
    if (!this.listeners[type]) return

    for (const listener of this.listeners[type]) {
      listener(...args)
    }
  }
}

export default Adapter
export type { Connection, AdapterOptions }
