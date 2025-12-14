import type { Event } from './events.js'

interface Connection {
  send(event: Event): void
  close(): Promise<void>
}

interface ConnectableEvents {
  start: []
  stop: []
  connect: [Connection]
  disconnect: [Connection]
  event: [Event, Connection]
  error: [unknown]
  [K: string]: unknown[]
}

type EventListener<TArgs extends unknown[] = unknown[]> = (...args: TArgs) => void

type ConnectableOptions = object

abstract class Connectable<
  TOptions extends ConnectableOptions = ConnectableOptions,
  TEvents extends ConnectableEvents = ConnectableEvents,
> {
  public status: 'starting' | 'started' | 'stopping' | 'stopped' = 'stopped'
  protected startPromise?: Promise<void>
  protected stopPromise?: Promise<void>
  protected connections = new Set<Connection>()
  protected options: TOptions
  protected listeners: { [K in keyof TEvents]?: Set<EventListener<TEvents[K]>> } = {}
  protected pipes = new Set<Connectable>()

  constructor(options: TOptions) {
    this.options = options
  }

  protected abstract _start(): Promise<void>
  protected abstract _stop(): Promise<void>

  /**
   * Starts this connectable if it's stopped
   */
  public async start() {
    if (this.status === 'started' || this.status === 'starting') {
      return this.startPromise
    }

    if (this.status !== 'stopped') {
      throw new Error('Unable to start while not fully stopped')
    }

    this.startPromise = new Promise((resolve, reject) => {
      this._start().then(
        () => {
          this.emit('start', [])
          resolve()
        },
        (e) => {
          this.emit('error', [e])
          reject(e)
        },
      )
    })
  }

  /**
   * Stops this connectable if it's started
   */
  public async stop() {
    if (this.status === 'stopped' || this.status === 'stopping') {
      return this.stopPromise
    }

    if (this.status !== 'started') {
      throw new Error('Unable to stop while not fully started')
    }

    this.stopPromise = new Promise((resolve, reject) => {
      this._stop().then(
        () => {
          this.emit('stop', [])
          resolve()
        },
        (e) => {
          this.emit('error', [e])
          reject(e)
        },
      )
    })
  }

  /**
   * Registers an event listener for an event type
   */
  public on<TEventType extends keyof TEvents>(
    type: TEventType,
    listener: EventListener<TEvents[TEventType]>,
  ) {
    ;(this.listeners[type] as any) ??= new Set<EventListener<TEvents[TEventType]>>()
    this.listeners[type]!.add(listener)
  }

  /**
   * Unregisters an event listener for an event type
   */
  public off<TEventType extends keyof TEvents>(
    type: TEventType,
    listener: EventListener<TEvents[TEventType]>,
  ) {
    this.listeners[type]?.delete(listener)
  }

  /**
   * Emits an event to the corresponding listeners and pipes (if the event type is pipeable)
   */
  protected emit<TEventType extends keyof TEvents>(type: TEventType, args: TEvents[TEventType]) {
    for (const listener of this.listeners[type] || []) {
      listener(...args)
    }

    // Start and stop belong to each connectable separately, so they aren't pipeable
    if (type !== 'start' && type !== 'stop') {
      for (const pipe of this.pipes) {
        pipe.emit(type as any, args)
      }
    }
  }

  /**
   * Registers a new pipe destination, so that all pipeable events from this connectable
   * will also be emitted to the destination
   */
  public pipe(destination: Connectable) {
    this.pipes.add(destination)
  }

  /**
   * Unregisters a pipe destination
   */
  public unpipe(destination: Connectable) {
    this.pipes.delete(destination)
  }
}

export default Connectable
export type { Connection, ConnectableEvents, EventListener, ConnectableOptions }
