process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/analyze', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const startTime = Date.now();

    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = response.data.toString(); // FIX CLAVE
    console.log("TYPE:", typeof html);

    const responseTime = Date.now() - startTime;

    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const metaMatch = html.match(/<meta name="description" content="(.*?)"/i);
    const h1Matches = html.match(/<h1/g);

    const title = titleMatch ? titleMatch[1] : "No title found";
    const metaDescription = metaMatch ? metaMatch[1] : "No description found";
    const h1Count = h1Matches ? h1Matches.length : 0;

    res.json({
      status: 'success',
      response_time: responseTime + "ms",
      title,
      meta_description: metaDescription,
      h1_count: h1Count
    });

  } catch (error) {
    console.log("ERROR REAL:", error.message);

    res.json({
      status: 'error',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});