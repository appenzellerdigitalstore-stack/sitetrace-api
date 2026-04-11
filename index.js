process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 almacenamiento simple en memoria (rate limit)
const requestCounts = {};

app.use(cors());
app.use(express.json());

app.post('/analyze', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // 🔒 RATE LIMIT
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  requestCounts[ip] = (requestCounts[ip] || 0) + 1;

  if (requestCounts[ip] > 5) {
    return res.json({
      status: "error",
      message: "Free limit reached. Upgrade for unlimited access."
    });
  }

  try {
    const startTime = Date.now();

    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = response.data.toString();
    const responseTime = Date.now() - startTime;

    // 🔍 extracción
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const metaMatch = html.match(/<meta name="description" content="(.*?)"/i);
    const h1Matches = html.match(/<h1/g);
    const imgMatches = html.match(/<img/g);
    const altMatches = html.match(/alt="/g);

    const title = titleMatch ? titleMatch[1] : "";
    const metaDescription = metaMatch ? metaMatch[1] : "";
    const h1Count = h1Matches ? h1Matches.length : 0;
    const imgCount = imgMatches ? imgMatches.length : 0;
    const altCount = altMatches ? altMatches.length : 0;

    // 🧠 SEO SCORE
    let score = 0;

    if (title.length > 10) score += 20;
    if (metaDescription.length > 50) score += 20;
    if (h1Count >= 1) score += 20;
    if (imgCount > 0 && altCount / imgCount > 0.5) score += 20;
    if (responseTime < 1000) score += 20;

    res.json({
      status: 'success',
      response_time: responseTime + "ms",
      title: title || "No title",
      meta_description: metaDescription || "No description",
      h1_count: h1Count,
      images: imgCount,
      images_with_alt: altCount,
      seo_score: score
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