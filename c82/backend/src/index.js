require('dotenv').config();
const express = require('express');
const cors = require('cors');
const scheduler = require('./services/scheduler');

const urlsRouter = require('./routes/urls');
const snapshotsRouter = require('./routes/snapshots');
const diffsRouter = require('./routes/diffs');
const webhooksRouter = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/urls', urlsRouter);
app.use('/api/snapshots', snapshotsRouter);
app.use('/api/diffs', diffsRouter);
app.use('/api/webhooks', webhooksRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  scheduler.start();
});
