const express = require('express');
const cors = require('cors');
const { lookupDIN } = require('./dinLookup');

const app = express();

// Allow all origins
app.use(cors());

app.use(express.json());

app.post('/lookup-din', async (req, res) => {
  const { din } = req.body;
  if (!din) return res.status(400).json({ error: 'DIN is required' });

  try {
    const data = await lookupDIN(din);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DIN lookup server running on port ${PORT}`));