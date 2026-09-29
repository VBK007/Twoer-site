import type { ClientCapabilitiesRequestDto } from '../api/types'

/**
 * What this browser can actually play, asked rather than assumed.
 *
 * The server decides direct-play versus transcode from this, so guessing here
 * is how a file ends up being re-encoded for no reason, or handed over raw to
 * something that cannot read it. `canPlayType` is the only honest source, and
 * its answer is one of "probably", "maybe" or "" — anything non-empty counts,
 * because "maybe" is the browser saying it will try, which is exactly what
 * direct play is.
 *
 * Deliberately narrower than the Android list. A browser genuinely cannot open
 * an MKV or play most HEVC, and claiming otherwise would produce a confident
 * "Direct play" badge followed by a black screen — the one failure the whole
 * plan card exists to prevent.
 */
const VIDEO_PROBES: [codec: string, mime: string][] = [
  ['h264', 'video/mp4; codecs="avc1.640028"'],
  ['hevc', 'video/mp4; codecs="hvc1.1.6.L93.B0"'],
  ['vp9', 'video/webm; codecs="vp9"'],
  ['av1', 'video/mp4; codecs="av01.0.05M.08"'],
]

const AUDIO_PROBES: [codec: string, mime: string][] = [
  ['aac', 'audio/mp4; codecs="mp4a.40.2"'],
  ['mp3', 'audio/mpeg'],
  ['opus', 'audio/webm; codecs="opus"'],
  ['vorbis', 'audio/webm; codecs="vorbis"'],
  ['flac', 'audio/flac'],
  ['ac3', 'audio/mp4; codecs="ac-3"'],
  ['eac3', 'audio/mp4; codecs="ec-3"'],
]

let cached: ClientCapabilitiesRequestDto | null = null

export function browserCapabilities(): ClientCapabilitiesRequestDto {
  if (cached) return cached

  const probe = document.createElement('video')
  const supports = ([codec, mime]: [string, string]) =>
    probe.canPlayType(mime) !== '' ? codec : null

  const videoCodecs = VIDEO_PROBES.map(supports).filter(Boolean) as string[]
  const audioCodecs = AUDIO_PROBES.map(supports).filter(Boolean) as string[]

  /*
   * Containers a browser will open directly.
   *
   * MKV is absent on purpose: no browser plays it, and it is the single most
   * common container in a home library — which is precisely why the honest
   * answer here matters. Note `canPlayType('video/x-matroska')` answers
   * "maybe" in Chromium and must not be believed; this list is asserted, not
   * probed, for that reason.
   *
   * The audio containers are here because leaving them out was a real bug: a
   * library of two thousand MP3s would have been told "this browser takes mp4
   * or webm", and every track would have been re-encoded to reach a browser
   * that plays MP3 natively.
   */
  const containers = ['mp4', 'webm', 'mp3', 'm4a', 'ogg', 'flac', 'wav']
  if (probe.canPlayType('video/quicktime') !== '') containers.push('mov')

  cached = {
    deviceName: 'Browser',
    videoCodecs,
    audioCodecs,
    containers,
    // Screen height in device pixels is the closest thing to "what is worth
    // sending"; a 4K stream to a 1080p laptop is bandwidth spent on nothing.
    maxHeight: Math.round(window.screen.height * (window.devicePixelRatio || 1)),
    maxBitrate: null,
    // Either natively (Safari) or through hls.js everywhere else.
    supportsHls: true,
  }
  return cached
}
