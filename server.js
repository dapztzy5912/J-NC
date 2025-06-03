const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to handle MediaFire downloads
app.get('/api/download', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    if (!url.includes('mediafire.com')) {
      return res.status(400).json({ error: 'URL must be from MediaFire' });
    }

    // Fetch file info from MediaFire API
    const apiUrl = `https://api.vreden.web.id/api/mediafiredl?url=${encodeURIComponent(url)}`;
    const apiResponse = await axios.get(apiUrl);
    
    if (!apiResponse.data.result || apiResponse.data.result.length === 0) {
      return res.status(404).json({ error: 'File not found on MediaFire' });
    }

    const fileData = apiResponse.data.result[0];
    const fileName = decodeURIComponent(fileData.nama || 'file.zip');
    
    // Get file size
    const headResponse = await axios.head(fileData.link);
    const fileSize = headResponse.headers['content-length'] || 0;

    // Format file size
    const formatSize = (bytes) => {
      if (bytes === 0) return '0 B';
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    };

    res.json({
      success: true,
      fileName,
      fileSize: formatSize(fileSize),
      downloadUrl: fileData.link
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Failed to process download request' });
  }
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
