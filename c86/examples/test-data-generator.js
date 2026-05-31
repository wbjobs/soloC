function generatePulsarSignal(samplingRate, duration, period, dm, snr) {
  const n = Math.floor(samplingRate * duration);
  const data = new Array(n);
  
  const noiseStd = 1.0;
  const signalAmplitude = snr * noiseStd;
  
  for (let i = 0; i < n; i++) {
    const noise = randn() * noiseStd;
    
    const phase = (i / (samplingRate * period)) % 1;
    const isPulse = phase < 0.05;
    
    const signal = isPulse ? signalAmplitude : 0;
    
    const freqChannel = Math.floor(Math.random() * 128);
    const delay = Math.floor(dm * (freqChannel / 128) * samplingRate * 0.001);
    const delayedIndex = (i + delay) % n;
    
    data[delayedIndex] = noise + signal;
  }
  
  return data;
}

function addRFIInterference(data, samplingRate, rfiFrequencies, rfiAmplitude) {
  const n = data.length;
  const result = [...data];
  
  rfiFrequencies.forEach(freq => {
    const omega = 2 * Math.PI * freq / samplingRate;
    for (let i = 0; i < n; i++) {
      result[i] += rfiAmplitude * Math.cos(omega * i);
    }
  });
  
  return result;
}

function generateTestSignalWithRFI(samplingRate, duration, options = {}) {
  const {
    pulsarPeriod = 0.5,
    pulsarDM = 100,
    pulsarSNR = 8,
    rfiFrequencies = [50, 120, 250],
    rfiAmplitude = 15,
    addPulsar = true,
  } = options;
  
  let data;
  
  if (addPulsar) {
    data = generatePulsarSignal(samplingRate, duration, pulsarPeriod, pulsarDM, pulsarSNR);
  } else {
    const n = Math.floor(samplingRate * duration);
    data = new Array(n);
    for (let i = 0; i < n; i++) {
      data[i] = randn();
    }
  }
  
  if (rfiFrequencies.length > 0) {
    data = addRFIInterference(data, samplingRate, rfiFrequencies, rfiAmplitude);
  }
  
  return {
    data,
    samplingRate,
    rfiFrequencies,
    rfiAmplitude,
    hasPulsar: addPulsar,
  };
}

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

module.exports = { 
  generatePulsarSignal, 
  addRFIInterference, 
  generateTestSignalWithRFI 
};
