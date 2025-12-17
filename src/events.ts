// For reference, see https://github.com/OHF-Voice/wyoming.
// The description there is incomplete and somewhat incorrect though.

interface Attribution {
  name: string
  url: string
}

interface Artifact {
  name: string
  attribution: Attribution
  installed: boolean
  description?: string
  version?: string
}

interface AsrModel extends Artifact {
  languages: string[]
}

interface AsrProgram extends Artifact {
  models: AsrModel[]
  supports_transcript_streaming?: boolean
}

interface TtsVoiceSpeaker {
  name: string
}

interface TtsVoice extends Artifact {
  languages: string[]
  speakers?: TtsVoiceSpeaker[]
}

interface TtsProgram extends Artifact {
  voices: TtsVoice[]
  supports_synthesize_streaming?: boolean
}

interface HandleModel extends Artifact {
  languages: string[]
}

interface HandleProgram extends Artifact {
  models: HandleModel[]
  supports_handled_streaming?: boolean
}

interface WakeModel extends Artifact {
  languages: string[]
  phrase?: string
}

interface WakeProgram extends Artifact {
  models: WakeModel[]
}

interface IntentModel extends Artifact {
  languages: string[]
}

interface IntentProgram extends Artifact {
  models: IntentModel[]
}

interface Satellite extends Artifact {
  area?: string
  has_vad?: boolean
  active_wake_words?: string[]
  max_active_wake_words?: number
  supports_trigger?: boolean
}

interface AudioFormat {
  rate: number
  width: number
  channels: number
}

interface MicProgram extends Artifact {
  mic_format: AudioFormat
}

interface SndProgram extends Artifact {
  snd_format: AudioFormat
}

interface Info {
  asr?: AsrProgram[]
  tts?: TtsProgram[]
  handle?: HandleProgram[]
  intent?: IntentProgram[]
  wake?: WakeProgram[]
  mic?: MicProgram[]
  snd?: SndProgram[]
  satellite?: Satellite
}

interface SynthesizeVoice {
  name?: string
  language?: string
  speaker?: string
}

type EventBody<
  TData extends object | undefined = undefined,
  TPayload extends Buffer | undefined = undefined,
> = (undefined extends TData
  ? {
      data?: TData
    }
  : {
      data: TData
    }) &
  (undefined extends TPayload
    ? {
        payload?: TPayload
      }
    : {
        payload: TPayload
      })

type EventBodies = {
  // Audio - Send raw audio and indicate begin/end of audio streams
  'audio-chunk': EventBody<{ timestamp?: number } & AudioFormat, Buffer>
  'audio-start': EventBody<{ timestamp?: number } & AudioFormat>
  'audio-stop': EventBody<{ timestamp?: number }>

  // Info - Describe available services
  describe: EventBody
  info: EventBody<Info>

  // Speech Recognition - Transcribe audio into text
  /** Request to transcribe an audio stream */
  transcribe: EventBody<{
    name?: string
    language?: string
    context?: object
  }>
  /** Response with transcription */
  transcript: EventBody<{
    text: string
    language?: string
    context?: object
  }>
  'transcript-start': EventBody<{
    context?: object
  }>
  'transcript-chunk': EventBody<{
    text: string
  }>
  'transcript-stop': EventBody

  // Text to Speech - Synthesize audio from text
  synthesize: EventBody<{
    text: string
    voice?: SynthesizeVoice
    context?: object
  }>
  'synthesize-start': EventBody<{
    voice?: SynthesizeVoice
    context?: object
  }>
  'synthesize-chunk': EventBody<{
    text: string
  }>
  'synthesize-stop': EventBody
  'synthesize-stopped': EventBody

  // Wake Word - Detect wake words in an audio stream
  detect: EventBody<{
    names?: string[]
    context?: object
  }>
  detection: EventBody<{
    name?: string
    timestamp?: number
    speaker?: string
    context?: object
  }>
  'not-detected': EventBody<{
    context?: object
  }>

  // Voice Activity Detection - Detects speech and silence in an audio stream
  'voice-started': EventBody<{
    timestamp?: number
  }>
  'voice-stopped': EventBody<{
    timestamp?: number
  }>

  // Intent Recognition
  recognize: EventBody<{
    text: string
    context?: object
  }>
  intent: EventBody<{
    name: string
    entities: { name: string; value?: unknown }[]
    text?: string
    context?: object
  }>
  'not-recognized': EventBody<{
    text?: string
    context?: object
  }>

  // Intent Handling - Handle structured intents or text directly
  handled: EventBody<{
    text?: string
    context?: object
  }>
  'not-handled': EventBody<{
    text?: string
    context?: object
  }>
  'handled-start': EventBody<{
    context?: object
  }>
  'handled-chunk': EventBody<{
    text: string
  }>
  'handled-stop': EventBody

  // Audio Output - Play audio stream
  played: EventBody

  // Voice Satellite
  'run-satellite': EventBody
  'pause-satellite': EventBody
  'satellite-connected': EventBody
  'satellite-disconnected': EventBody
  'streaming-started': EventBody
  'streaming-stopped': EventBody
  /** Pipelines are run on the server, but can be triggered remotely from the server as well */
  'run-pipeline': EventBody<{
    start_stage: string
    end_stage: string
    /** From client only */
    wake_word_name?: string
    /** From server only */
    wake_word_names?: string[]
    /** From server only */
    announce_text?: string
    /** Only used for always-on streaming satellites */
    restart_on_end?: boolean
  }>

  // Timers
  'timer-started': EventBody<{
    id: string
    total_seconds: number
    name?: string
    start_hours?: number
    start_minutes?: number
    start_seconds?: number
    command?: string
    text: string
    language?: string
  }>
  'timer-updated': EventBody<{
    id: string
    is_active: boolean
    total_seconds: number
  }>
  'timer-cancelled': EventBody<{
    id: string
  }>
  'timer-finished': EventBody<{
    id: string
  }>

  // Misc
  ping: EventBody<{
    text?: string
  }>
  pong: EventBody<{
    text?: string
  }>
}

type EventHeader<TType extends keyof EventBodies = keyof EventBodies> = {
  type: TType
  version?: string
  data_length?: number
  payload_length?: number
}

type Events = {
  [K in keyof EventBodies]: EventBodies[K] & {
    header: EventHeader<K>
  }
}

type Event<TType extends keyof EventBodies = keyof EventBodies> = Events[TType]

export type { EventBody, EventHeader, Events, Event }
