let context: AudioContext | undefined

export function placementSound() {
  try {
    context ??= new AudioContext()
    void context.resume().catch(() => undefined)
    const now = context.currentTime
    const note = context.createOscillator()
    const level = context.createGain()
    note.type = 'triangle'
    note.frequency.setValueAtTime(210, now)
    note.frequency.exponentialRampToValueAtTime(83, now + 0.105)
    level.gain.setValueAtTime(0.12, now)
    level.gain.exponentialRampToValueAtTime(0.001, now + 0.16)
    note.connect(level).connect(context.destination)
    note.start(now)
    note.stop(now + 0.17)
  } catch {
    // Audio is optional. Placement feedback is also visible.
  }
}

const voices = {
  soft: { frequency: 520, q: 0.8, level: 0.16 },
  stone: { frequency: 1650, q: 2.2, level: 0.13 },
  wood: { frequency: 820, q: 3.5, level: 0.15 },
  leaves: { frequency: 3200, q: 0.6, level: 0.09 },
  water: { frequency: 650, q: 0.5, level: 0.16 },
}

/** A short filtered noise burst: duller for soil, sharper for stone. */
export function blockSound(kind: keyof typeof voices, action: 'hit' | 'break' | 'place' | 'step') {
  try {
    context ??= new AudioContext()
    void context.resume().catch(() => undefined)
    const now = context.currentTime
    const length = action === 'break' ? 0.2 : action === 'place' ? 0.11 : action === 'step' ? 0.045 : 0.06
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * length), context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length) ** 2
    const source = context.createBufferSource()
    source.buffer = buffer
    const filter = context.createBiquadFilter()
    const voice = voices[kind]
    filter.type = 'bandpass'
    // Steps are lower and softer, with a little variation so a walk does not sound like a metronome.
    filter.frequency.value = voice.frequency * (action === 'place' ? 0.7 : action === 'step' ? 0.55 + Math.random() * 0.2 : 1)
    filter.Q.value = voice.q
    const level = context.createGain()
    level.gain.value = voice.level * (action === 'hit' ? 0.6 : action === 'step' ? 0.4 : 1)
    source.connect(filter).connect(level).connect(context.destination)
    source.start(now)
  } catch {
    // Audio is optional.
  }
}
