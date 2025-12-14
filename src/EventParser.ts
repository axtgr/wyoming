import type { Event, EventHeader } from './events.js'

const NEWLINE = '\n'.charCodeAt(0)
const UTF8_ENCODER = new TextEncoder()
const UTF8_DECODER = new TextDecoder()

/**
 * Wyoming Protocol event parser.
 * Handles JSONL + PCM audio format.
 */
class EventParser {
  private buffer: Buffer = Buffer.alloc(0)
  private currentEvent: Partial<Event<any>> = {}
  private state: 'header' | 'data' | 'payload' = 'header'
  private expectedDataLength = 0
  private expectedPayloadLength = 0
  private dataBuffer: Buffer = Buffer.alloc(0)
  private payloadBuffer: Buffer = Buffer.alloc(0)

  /**
   * Parses incoming data and yields complete events
   */
  public *parse(chunk: Buffer): Generator<Event, void, unknown> {
    this.buffer = Buffer.concat([this.buffer, chunk])

    while (true) {
      if (this.state === 'header') {
        const newlineIndex = this.buffer.indexOf(NEWLINE)
        if (newlineIndex === -1) {
          // Need more data
          break
        }

        // Parse JSON header
        const headerBytes = this.buffer.subarray(0, newlineIndex)
        const headerJson = UTF8_DECODER.decode(headerBytes)
        const header: EventHeader = JSON.parse(headerJson)

        this.currentEvent = { header }
        this.expectedDataLength = header.data_length ?? 0
        this.expectedPayloadLength = header.payload_length ?? 0

        // Remove header from buffer
        this.buffer = this.buffer.subarray(newlineIndex + 1)

        if (this.expectedDataLength > 0) {
          this.state = 'data'
          this.dataBuffer = Buffer.alloc(0)
        } else if (this.expectedPayloadLength > 0) {
          this.state = 'payload'
          this.payloadBuffer = Buffer.alloc(0)
        } else {
          // No data or payload, event is complete
          yield this.currentEvent as Event
          this.currentEvent = {}
          this.state = 'header'
        }
      } else if (this.state === 'data') {
        const needed = this.expectedDataLength - this.dataBuffer.length
        const available = this.buffer.length

        if (available < needed) {
          // Need more data
          this.dataBuffer = Buffer.concat([this.dataBuffer, this.buffer])
          this.buffer = Buffer.alloc(0)
          break
        }

        // We have enough data
        const dataBytes = this.buffer.subarray(0, needed)
        this.dataBuffer = Buffer.concat([this.dataBuffer, dataBytes])
        this.buffer = this.buffer.subarray(needed)

        const data = UTF8_DECODER.decode(this.dataBuffer)
        this.currentEvent['data'] = JSON.parse(data)

        if (this.expectedPayloadLength > 0) {
          this.state = 'payload'
          this.payloadBuffer = Buffer.alloc(0)
        } else {
          // No payload, event is complete
          yield this.currentEvent as Event
          this.currentEvent = {}
          this.state = 'header'
        }
      } else if (this.state === 'payload') {
        const needed = this.expectedPayloadLength - this.payloadBuffer.length
        const available = this.buffer.length

        if (available < needed) {
          // Need more data
          this.payloadBuffer = Buffer.concat([this.payloadBuffer, this.buffer])
          this.buffer = Buffer.alloc(0)
          break
        }

        // We have enough payload
        const payloadBytes = this.buffer.subarray(0, needed)
        this.payloadBuffer = Buffer.concat([this.payloadBuffer, payloadBytes])
        this.buffer = this.buffer.subarray(needed)

        this.currentEvent['payload'] = this.payloadBuffer

        // Event is complete
        yield this.currentEvent as Event
        this.currentEvent = {}
        this.state = 'header'
      }
    }
  }

  /**
   * Serializes a message to Wyoming Protocol format
   */
  public serialize(event: Event): Buffer {
    const { header, data, payload } = event

    if (!header || typeof header !== 'object') {
      throw new Error('The "header" field of an Event must be a JSON-serializable object')
    }

    if (data !== undefined && typeof data !== 'object') {
      throw new Error('The "data" field of an Event must be a JSON-serializable object')
    }

    if (payload !== undefined && !(data instanceof Buffer)) {
      throw new Error('The "payload" field of an Event must be a Buffer')
    }

    const buffers: Buffer[] = []

    if (data) {
      const dataJson = JSON.stringify(data)
      const dataBytes = UTF8_ENCODER.encode(dataJson)
      header.data_length = dataBytes.length
      buffers.push(Buffer.from(dataBytes))
    }

    if (payload) {
      header.payload_length = (payload as Buffer).length
      buffers.push(payload as Buffer)
    }

    const headerJson = JSON.stringify(header)
    const headerBytes = Buffer.from(UTF8_ENCODER.encode(`${headerJson}\n`))

    buffers.unshift(headerBytes)

    return Buffer.concat(buffers)
  }

  /**
   * Resets parser state
   */
  public reset() {
    this.buffer = Buffer.alloc(0)
    this.currentEvent = {}
    this.state = 'header'
    this.expectedDataLength = 0
    this.expectedPayloadLength = 0
    this.dataBuffer = Buffer.alloc(0)
    this.payloadBuffer = Buffer.alloc(0)
  }
}

export default EventParser
