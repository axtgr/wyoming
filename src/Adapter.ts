import Connectable, {
  type ConnectableEvents,
  type ConnectableOptions,
  type Connection,
  type EventListener,
} from './Connectable.js'

type AdapterEvents = ConnectableEvents

type AdapterOptions = ConnectableOptions

abstract class Adapter<
  TOptions extends AdapterOptions = AdapterOptions,
  TEvents extends AdapterEvents = AdapterEvents,
> extends Connectable<TOptions, TEvents> {}

export default Adapter
export type { Connection, EventListener, AdapterEvents, AdapterOptions }
