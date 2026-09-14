// One utterance: speech followed by silence. Nothing is sent until recording finishes.
export function recordTurn(stream, context, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return resolve(null);
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) return reject(new Error('Voice recording is not supported in this browser. You can type below.'));
    stream.getAudioTracks().forEach(track => { track.enabled = true; });
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const recorder = new MediaRecorder(stream, { mimeType });
    const samples = new Float32Array(analyser.fftSize);
    const chunks = [];
    let timer, voiced = 0, silenceSince = 0, finished = false;
    const started = Date.now();
    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      source.disconnect();
      stream.getAudioTracks().forEach(track => { track.enabled = false; });
      if (recorder.state !== 'inactive') recorder.stop();
    };
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      signal.removeEventListener('abort', finish);
      const blob = new Blob(chunks, { type: mimeType });
      resolve(!signal.aborted && voiced >= 180 && blob.size > 500 ? blob : null);
    };
    recorder.onerror = () => { finish(); reject(new Error('Recording failed. Please try again or type your question.')); };
    signal.addEventListener('abort', finish, { once: true });
    recorder.start(250);
    timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((total, value) => total + value * value, 0) / samples.length);
      const now = Date.now();
      if (rms > 0.014) { voiced += 60; silenceSince = 0; }
      else if (voiced >= 180) {
        if (!silenceSince) silenceSince = now;
        if (now - silenceSince > 1400) finish();
      }
      if (now - started > 30000 || (!voiced && now - started > 10000)) finish();
    }, 60);
  });
}