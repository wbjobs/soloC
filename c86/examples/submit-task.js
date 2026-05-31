const { generateTestSignalWithRFI } = require('./test-data-generator');

async function submitTask(options = {}) {
  const samplingRate = 1000;
  const duration = 10;

  console.log('Generating test data with RFI interference...');
  const testSignal = generateTestSignalWithRFI(samplingRate, duration, {
    pulsarPeriod: 0.5,
    pulsarDM: 100,
    pulsarSNR: 8,
    rfiFrequencies: [50, 120, 250],
    rfiAmplitude: 15,
    addPulsar: true,
    ...options,
  });
  
  console.log(`Generated ${testSignal.data.length} samples`);
  console.log(`Injected RFI frequencies: ${testSignal.rfiFrequencies.join(', ')} Hz`);

  const payload = {
    data: testSignal.data,
    samplingRate: testSignal.samplingRate,
    startFrequency: 1000,
    endFrequency: 1500,
    dmMin: 0,
    dmMax: 200,
    sourceName: 'Test_Pulsar_With_RFI_001'
  };

  try {
    const response = await fetch('http://localhost:3000/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log('Task submitted successfully!');
    console.log('Task ID:', result.taskId);
    console.log('');
    console.log('=== Available Commands ===');
    console.log('');
    console.log('To check status:');
    console.log(`  curl http://localhost:3000/api/tasks/${result.taskId}`);
    console.log('');
    console.log('To get candidates:');
    console.log(`  curl http://localhost:3000/api/tasks/${result.taskId}/candidates`);
    console.log('');
    console.log('To get candidate pulse profile (ASCII plot):');
    console.log(`  curl -s http://localhost:3000/api/tasks/${result.taskId}/candidates/0/profile | jq -r '.asciiPlot'`);
    console.log('');
    console.log('To get pulsar database matches:');
    console.log(`  curl http://localhost:3000/api/tasks/${result.taskId}/candidates/0/matches`);
    console.log('');
    console.log('To get RFI information:');
    console.log(`  curl http://localhost:3000/api/tasks/${result.taskId}/rfi`);
    console.log('');
    console.log('To download candidates CSV:');
    console.log(`  curl -o candidates.csv http://localhost:3000/api/tasks/${result.taskId}/download/csv`);
    console.log('');
    console.log('To download RFI CSV:');
    console.log(`  curl -o rfi.csv http://localhost:3000/api/tasks/${result.taskId}/download/rfi/csv`);
    console.log('');
    console.log('To list all known pulsars in database:');
    console.log(`  curl http://localhost:3000/api/pulsars`);
  } catch (error) {
    console.error('Error submitting task:', error.message);
  }
}

if (require.main === module) {
  submitTask();
}

module.exports = { submitTask };

