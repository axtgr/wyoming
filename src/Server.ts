import type Adapter from 'Adapter.js'
import Connectable, {
  type ConnectableEvents,
  type ConnectableOptions,
  type Connection,
  type EventListener,
} from './Connectable.js'
import type { AudioFormat, Event, Events, Info } from './events.js'

type ServerEvents = ConnectableEvents

interface AudioChunk extends AudioFormat {
  data: ArrayBuffer
}

interface Handlers {
  ping(text?: string): string | void | Promise<string | void>
  describe(): void | Info | Promise<Info>
  transcribe(
    audio: AudioChunk,
    parameters: Events['transcribe']['data'],
  ): void | Events['transcript']['data'] | Promise<void | Events['transcript']['data']>
  transcribeStream(
    audioStream: ReadableStream<AudioChunk>,
    parameters: Events['transcribe']['data'],
  ): void | AsyncIterable<Events['transcript']['data']>
}

type HandlersInit =
  | Partial<Handlers>
  | ((connection: Connection) => Partial<Handlers>)
  | ((connection: Connection) => Promise<Partial<Handlers>>)
  | { new (connection: Connection): Partial<Handlers> }

interface ServerOptions extends ConnectableOptions {
  adapters: Adapter[]
  handlers?: HandlersInit
}

function shimTranscribeStream(
  transcribe: (
    audio: AudioChunk,
    parameters: Events['transcribe']['data'],
  ) => void | Events['transcript']['data'] | Promise<void | Events['transcript']['data']>,
) {
  return async function* (
    stream: ReadableStream<AudioChunk>,
    parameters: Events['transcribe']['data'],
  ) {
    const audioBuffers: ArrayBuffer[] = []
    let totalLength = 0
    let aggregatedChunk: AudioChunk | undefined

    for await (const chunk of stream) {
      aggregatedChunk ??= {
        rate: chunk.rate,
        channels: chunk.channels,
        width: chunk.width,
      } as AudioChunk
      audioBuffers.push(chunk.data)
      totalLength += chunk.data.byteLength
    }

    if (!aggregatedChunk) return

    const aggregatedAudio = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of audioBuffers) {
      aggregatedAudio.set(new Uint8Array(chunk), offset)
      offset += chunk.byteLength
    }
    aggregatedChunk.data = aggregatedAudio.buffer

    const transcription = await transcribe(aggregatedChunk, parameters)

    if (transcription) {
      yield transcription
    }
  }
}

class ConnectionController {
  protected connection: Connection
  protected handlers: Partial<Handlers>
  protected transcriptionInputController?: ReadableStreamDefaultController<AudioChunk>
  protected info: Info = {}

  constructor(connection: Connection, handlersInit?: HandlersInit) {
    this.connection = connection
    this.handlers = this.constructHandlers(handlersInit)
  }

  protected constructHandlers(handlersInit?: HandlersInit) {
    let handlers: Partial<Handlers> = {}

    if (typeof handlersInit === 'function') {
      try {
        // @ts-expect-error TS(2351): This expression is not constructable. Not all constituent...
        handlers = { ...new handlersInit(this.connection) }
      } catch (_e) {
        // @ts-expect-error TS(2349): This expression is not callable. Not all constituents of ...
        handlers = { ...handlersInit(this.connection) }
      }
    }

    if (handlers.transcribe && !handlers.transcribeStream) {
      handlers.transcribeStream = shimTranscribeStream(handlers.transcribe)
    }

    return handlers
  }

  public stop() {
    this.stopTranscription()
  }

  protected stopTranscription() {
    if (this.transcriptionInputController?.desiredSize) {
      this.transcriptionInputController?.close()
      this.transcriptionInputController = undefined
    }
  }

  public handleEvent(event: Event) {
    const type = event.header.type

    if (type === 'ping') {
      this.onPing(event as Events['ping'])
      return
    }

    if (type === 'describe') {
      this.onDescribe(event as Events['describe'])
      return
    }

    if (type === 'transcribe') {
      this.onTranscribe(event as Events['transcribe'])
      return
    }

    if (type === 'audio-chunk') {
      this.onAudioChunk(event as Events['audio-chunk'])
      return
    }

    if (type === 'audio-stop') {
      this.onAudioStop(event as Events['audio-stop'])
      return
    }
  }

  protected async onPing(event: Events['ping']) {
    const data = (event as Events['ping'] | undefined)?.data
    const text = this.handlers.ping
      ? (await this.handlers.ping?.(data?.text)) || ''
      : event.data.text
    const response: Events['pong'] = {
      header: { type: 'pong' },
      data: { text },
    }
    this.connection.send(response)
  }

  protected async onDescribe(_event: Events['describe']) {
    this.info = (await this.handlers.describe?.()) || {}
    const response: Events['info'] = {
      header: { type: 'info' },
      data: this.info,
    }
    this.connection.send(response)
  }

  protected async onTranscribe(event: Events['transcribe']) {
    if (!this.handlers.transcribeStream) return

    const parameters = (event.data as Events['transcribe']['data']) || {}

    this.stopTranscription()

    const input = new ReadableStream({
      start: (controller) => {
        this.transcriptionInputController = controller
      },
    })
    const output = this.handlers.transcribeStream(input, parameters)

    if (!output) return

    const fullTranscript: Events['transcript']['data'] = { text: '' }
    let hasStarted = false

    for await (const chunk of output) {
      if (!hasStarted) {
        this.connection.send({
          header: { type: 'transcript-start' },
          data: { context: chunk.context },
        })
        hasStarted = true
      }
      fullTranscript.text += chunk.text
      fullTranscript.language = chunk.language
      fullTranscript.context = chunk.context
      this.connection.send({
        header: { type: 'transcript-chunk' },
        data: chunk,
      })
    }
    this.connection.send({
      header: { type: 'transcript' },
      data: fullTranscript,
    })
    this.connection.send({
      header: { type: 'transcript-stop' },
    })
  }

  protected async onAudioChunk(event: Events['audio-chunk']) {
    if (this.transcriptionInputController?.desiredSize) {
      this.transcriptionInputController.enqueue({ ...event.data, data: event.payload })
    }
  }

  protected async onAudioStop(_event: Events['audio-stop']) {
    this.stopTranscription()
  }
}

class Server<
  TOptions extends ServerOptions = ServerOptions,
  TEvents extends ServerEvents = ServerEvents,
> extends Connectable<TOptions, TEvents> {
  protected connectionControllers = new Map<Connection, ConnectionController>()

  constructor(options: TOptions) {
    if (!Array.isArray(options?.adapters) || options.adapters.length < 1) {
      throw new Error('The "adapters" field of server options must include at least one adapter')
    }
    super(options)

    this.on('connect', (connection) => {
      const controller = new ConnectionController(connection, options.handlers)
      this.connectionControllers.set(connection, controller)
    })

    this.on('disconnect', (connection) => {
      const controller = this.connectionControllers.get(connection)
      controller?.stop()
      this.connectionControllers.delete(connection)
    })

    this.on('event', async (e, connection) => {
      const controller = this.connectionControllers.get(connection)
      controller?.handleEvent(e)
    })
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
